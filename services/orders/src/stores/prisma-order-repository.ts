import { PrismaClient } from "@prisma/client";
import type {
  MenuPriceLookup,
  ModifierPriceLookup,
  OrderRepository,
  ListOrdersFilter,
  OrderSummary,
  OrderDetail,
  BillSummary,
  RevenueTrendPoint,
} from "../order-service";
import { TERMINAL_ORDER_STATUSES } from "../order-service";
import type { OrderStatus, CreateOrderInput, PricedOrder } from "@kapmeta/shared-types/orders";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

export class PrismaMenuPriceLookup implements MenuPriceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async getPrice(menuItemId: string, outletId: string): Promise<{ priceMinor: bigint; taxRatePercent: number } | null> {
    const row = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, outletId } });
    if (!row) {
      return null;
    }
    const num = Number(row.price || 0);
    // Convert decimal rupees to integer minor units (paise)
    const priceMinor = BigInt(Math.round(num * 100));
    return { priceMinor, taxRatePercent: Number(row.taxRate || 5) };
  }
}

export class PrismaModifierPriceLookup implements ModifierPriceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async getPrices(modifierOptionIds: string[], outletId: string): Promise<Map<string, bigint>> {
    const map = new Map<string, bigint>();
    if (modifierOptionIds.length === 0) {
      return map;
    }

    const rows = await this.prisma.modifierOption.findMany({
      where: { id: { in: modifierOptionIds }, outletId },
    });

    for (const row of rows) {
      const num = Number(row.price || 0);
      const priceMinor = BigInt(Math.round(num * 100));
      map.set(row.id, priceMinor);
    }

    return map;
  }
}

const VALID_ORDER_STATUSES = new Set([
  "DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY",
  "ASSIGNED", "OUT_FOR_DELIVERY", "SERVED", "HANDED_OVER", "COMPLETED", "CANCELLED", "FAILED"
]);

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async nextOrderNumber(outletId: string): Promise<string> {
    const dateKey = new Date().toISOString().slice(0, 10);
    const datePrefix = dateKey.replace(/-/g, "");
    const count = await this.prisma.order.count({
      where: {
        outletId,
        orderNumber: { startsWith: datePrefix },
      },
    });
    return `${datePrefix}-${String(count + 1).padStart(4, "0")}`;
  }

  async findByIdempotencyKey(_idempotencyKey?: string): Promise<{ id: string; status: OrderStatus } | null> {
    return null;
  }

  async createOrder(
    id: string,
    input: CreateOrderInput,
    priced: PricedOrder,
    orderNumber: string
  ): Promise<{ id: string; status: OrderStatus }> {
    await this.prisma.$transaction(async (tx) => {
      // Lookup item names for order items
      const itemIds = priced.lines.map((l) => l.menuItemId);
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: itemIds } },
      });
      const nameMap = new Map(menuItems.map((m) => [m.id, m.name]));

      await tx.order.create({
        data: {
          id,
          outletId: input.outletId,
          orderNumber,
          status: "PLACED",
          orderType: input.orderType as any,
          business_date: new Date(),
          subtotal: priced.subtotalMinor,
          taxTotal: priced.taxTotalMinor,
          grandTotal: priced.grandTotalMinor,
          customerId: input.customerId || null,
          diningTableId: input.diningTableId || null,
        },
      });

      if (input.diningTableId) {
        await tx.diningTable.update({
          where: { id: input.diningTableId },
          data: { status: "OCCUPIED" },
        });
      }

      for (const line of priced.lines) {
        const itemName = nameMap.get(line.menuItemId) || "Menu Item";
        await tx.orderItem.create({
          data: {
            outletId: input.outletId,
            orderId: id,
            menuItemId: line.menuItemId,
            item_name: itemName,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor,
            subtotal: line.subtotalMinor,
            course: line.course || null,
            seatNumber: line.seatNumber || null,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          outletId: input.outletId,
          orderId: id,
          to_status: "PLACED",
        },
      });
    });

    return { id, status: "PLACED" };
  }

  async getStatus(orderId: string): Promise<OrderStatus | null> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    return (row?.status as OrderStatus) ?? null;
  }

  async recordTransition(orderId: string, newStatus: OrderStatus, userId: string, reasonCode?: string, approverUserId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });

      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus },
        select: { outletId: true, diningTableId: true },
      });

      if (order.diningTableId && ["COMPLETED", "CANCELLED", "FAILED"].includes(newStatus)) {
        await tx.diningTable.update({
          where: { id: order.diningTableId },
          data: { status: "VACANT" },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          outletId: order.outletId,
          orderId,
          to_status: newStatus,
          from_status: previous.status,
          actor_id: userId || null,
        },
      });

      if (newStatus === "CANCELLED") {
        await writeAuditLog(tx, {
          outletId: order.outletId,
          userId,
          action: "ORDER_CANCELLED",
          entityType: "ORDER",
          entityId: orderId,
          beforeState: { status: previous.status },
          afterState: { status: newStatus },
          approverUserId,
          reasonCode,
        });
      }
    });
  }

  private buildOrdersWhere(outletId: string, filter: ListOrdersFilter): Record<string, unknown> {
    const where: Record<string, unknown> = { outletId };

    if (filter.view === "live") {
      where.status = { notIn: TERMINAL_ORDER_STATUSES };
    } else if (filter.view === "online") {
      where.orderType = "AGGREGATOR";
    }

    if (filter.status) {
      const aliasMap: Record<string, string[]> = {
        "ACTIVE": ["PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"],
        "PREPARING": ["IN_PREPARATION"],
        "RUNNING": ["PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION"],
        "PRINTED": ["READY", "SERVED"],
        "PAID": ["COMPLETED"],
        "COMPLETED": ["COMPLETED"],
      };

      const raw = typeof filter.status === "string" ? filter.status.split(",") : [String(filter.status)];
      const resolved: string[] = [];
      for (const item of raw) {
        const trimmed = item.trim().toUpperCase();
        if (aliasMap[trimmed]) {
          resolved.push(...aliasMap[trimmed]);
        } else if (VALID_ORDER_STATUSES.has(trimmed)) {
          resolved.push(trimmed);
        }
      }
      if (resolved.length > 0) {
        where.status = { in: Array.from(new Set(resolved)) };
      }
    }
    if (filter.orderType) {
      if (typeof filter.orderType === "string" && filter.orderType.includes(",")) {
        const types = filter.orderType.split(",").map((t) => t.trim()).filter((t) => t);
        where.orderType = { in: types };
      } else {
        where.orderType = filter.orderType;
      }
    }
    if (filter.orderNumberSearch) {
      where.orderNumber = { contains: filter.orderNumberSearch, mode: "insensitive" };
    }
    if (filter.fromDate || filter.toDate) {
      const createdAt: Record<string, Date> = {};
      if (filter.fromDate) createdAt.gte = filter.fromDate;
      if (filter.toDate) createdAt.lte = filter.toDate;
      where.createdAt = createdAt;
    }

    return where;
  }

  async countOrders(outletId: string, filter: ListOrdersFilter): Promise<number> {
    return this.prisma.order.count({ where: this.buildOrdersWhere(outletId, filter) });
  }

  async getRevenueTrend(outletId: string, fromDate: Date, toDate: Date): Promise<RevenueTrendPoint[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        outletId,
        createdAt: { gte: fromDate, lte: toDate },
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
      select: { createdAt: true, grandTotal: true },
    });

    const byDay = new Map<string, bigint>();
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0n) + o.grandTotal);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, grandTotalMinor]) => ({ date, grandTotalMinor: grandTotalMinor.toString() }));
  }

  async listOrders(outletId: string, filter: ListOrdersFilter): Promise<OrderSummary[]> {
    const where = this.buildOrdersWhere(outletId, filter);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
      select: {
        id: true,
        orderNumber: true,
        orderType: true,
        status: true,
        grandTotal: true,
        taxTotal: true,
        discountTotal: true,
        createdAt: true,
        diningTableId: true,
        _count: { select: { orderItems: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      grandTotalMinor: row.grandTotal,
      taxTotalMinor: row.taxTotal ?? 0n,
      discountTotalMinor: row.discountTotal ?? 0n,
      createdAt: row.createdAt,
      itemCount: row._count.orderItems,
      diningTableId: row.diningTableId,
      channel: null,
      externalOrderId: null,
      priceMismatch: false,
      customerName: null,
      waiterName: null,
      paymentMethod: null,
    }));
  }

  async getOrderDetail(outletId: string, orderId: string): Promise<OrderDetail | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, outletId },
      include: {
        orderItems: {
          include: {
            menuItem: { select: { name: true } },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      channel: null,
      externalOrderId: null,
      priceMismatch: false,
      grandTotalMinor: row.grandTotal,
      subtotalMinor: row.subtotal,
      taxTotalMinor: row.taxTotal || 0n,
      discountTotalMinor: row.discountTotal || 0n,
      terminalNumber: "POS-01",
      diningTableId: row.diningTableId,
      customerId: row.customerId,
      customerName: null,
      waiterName: null,
      paymentMethod: null,
      createdAt: row.createdAt,
      itemCount: row.orderItems.length,
      items: row.orderItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.item_name || item.menuItem?.name || "Menu Item",
        quantity: Number(item.quantity),
        unitPriceMinor: item.unitPrice,
        subtotalMinor: item.subtotal,
        notes: item.notes,
        isVoided: item.isVoided,
        course: item.course,
        seatNumber: item.seatNumber,
        modifiers: [],
      })),
      payments: [],
      statusHistory: [],
    };
  }

  async getLiveOrderByTable(outletId: string, diningTableId: string): Promise<{ id: string } | null> {
    const row = await this.prisma.order.findFirst({
      where: { outletId, diningTableId, status: { notIn: TERMINAL_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return row;
  }

  async addItems(
    outletId: string,
    orderId: string,
    priced: PricedOrder,
    userId: string
  ): Promise<{ id: string; menuItemId: string; quantity: number }[]> {
    const added: { id: string; menuItemId: string; quantity: number }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const line of priced.lines) {
        const item = await tx.orderItem.create({
          data: {
            outletId,
            orderId,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor,
            subtotal: line.subtotalMinor,
            course: line.course,
            seatNumber: line.seatNumber,
            modifiers: {
              create: line.modifiers.map((modifier) => ({
                modifierOptionId: modifier.modifierOptionId,
                price: modifier.priceMinor,
              })),
            },
          },
        });
        added.push({ id: item.id, menuItemId: item.menuItemId, quantity: item.quantity });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: { increment: priced.subtotalMinor },
          taxTotal: { increment: priced.taxTotalMinor },
          grandTotal: { increment: priced.grandTotalMinor },
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "ORDER_ITEMS_ADDED",
        entityType: "ORDER",
        entityId: orderId,
        afterState: { items: added },
      });
    });

    return added;
  }

  async voidItem(
    outletId: string,
    orderId: string,
    orderItemId: string,
    reasonCode: string,
    userId: string
  ): Promise<{ ok: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, orderId, outletId, isVoided: false },
      });
      if (!item) {
        return { ok: false };
      }

      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { isVoided: true, voidReason: reasonCode, voidedBy: userId },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: { decrement: item.subtotal },
          grandTotal: { decrement: item.subtotal },
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "ORDER_ITEM_VOIDED",
        entityType: "ORDER",
        entityId: orderId,
        beforeState: { orderItemId, subtotal: item.subtotal.toString() },
        reasonCode,
      });

      return { ok: true };
    });
  }

  async getBill(outletId: string, orderId: string): Promise<BillSummary | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, outletId },
      include: { payments: { where: { status: "CAPTURED" } } },
    });
    if (!order) {
      return null;
    }

    const paidMinor = order.payments.reduce((acc, p) => acc + p.amount, 0n);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotalMinor: order.subtotal,
      discountTotalMinor: order.discountTotal,
      taxTotalMinor: order.taxTotal,
      tipTotalMinor: order.tipTotal,
      serviceChargeTotalMinor: order.serviceChargeTotal,
      grandTotalMinor: order.grandTotal,
      paidMinor,
      dueMinor: order.grandTotal - paidMinor,
    };
  }

  async getBillBySeat(outletId: string, orderId: string): Promise<{ seatNumber: number | null; subtotalMinor: string; paidMinor: string }[]> {
    const [items, payments] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { outletId, orderId, isVoided: false } }),
      this.prisma.payment.findMany({ where: { outletId, orderId, status: "CAPTURED" } }),
    ]);

    const bySeat = new Map<number | null, { subtotal: bigint; paid: bigint }>();
    for (const item of items) {
      const key = item.seatNumber;
      const entry = bySeat.get(key) ?? { subtotal: 0n, paid: 0n };
      entry.subtotal += item.subtotal;
      bySeat.set(key, entry);
    }
    for (const payment of payments) {
      const key = payment.seatNumber ?? null;
      const entry = bySeat.get(key) ?? { subtotal: 0n, paid: 0n };
      entry.paid += payment.amount;
      bySeat.set(key, entry);
    }

    return Array.from(bySeat.entries()).map(([seatNumber, v]) => ({
      seatNumber,
      subtotalMinor: v.subtotal.toString(),
      paidMinor: v.paid.toString(),
    }));
  }

  async setCharges(
    outletId: string,
    orderId: string,
    tipMinor: bigint,
    serviceChargeMinor: bigint
  ): Promise<{ tipTotalMinor: bigint; serviceChargeTotalMinor: bigint; grandTotalMinor: bigint }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirstOrThrow({ where: { id: orderId, outletId } });
      const tipDelta = tipMinor - order.tipTotal;
      const serviceDelta = serviceChargeMinor - order.serviceChargeTotal;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          tipTotal: tipMinor,
          serviceChargeTotal: serviceChargeMinor,
          grandTotal: { increment: tipDelta + serviceDelta },
        },
      });

      return { tipTotalMinor: updated.tipTotal, serviceChargeTotalMinor: updated.serviceChargeTotal, grandTotalMinor: updated.grandTotal };
    });
  }

  async recordPayment(
    outletId: string,
    orderId: string,
    amountMinor: bigint,
    method: string,
    userId: string,
    seatNumber?: number
  ): Promise<{ id: string; amountMinor: bigint; method: string; status: string }> {
    return this.prisma.$transaction(async (tx) => {
      const paymentId = crypto.randomUUID();

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: orderId,
        afterState: { orderId, amountMinor: amountMinor.toString(), method, seatNumber },
      });

      return { id: paymentId, amountMinor, method, status: "CAPTURED" };
    });
  }
}
