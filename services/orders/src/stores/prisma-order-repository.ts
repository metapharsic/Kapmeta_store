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
    return { priceMinor: row.price, taxRatePercent: Number(row.taxRate) };
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
      map.set(row.id, row.price);
    }

    return map;
  }
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async nextOrderNumber(outletId: string): Promise<string> {
    // UTC date key — matches how the rest of the codebase timestamps rows;
    // outlet-timezone day boundaries (Outlet.dayStartTime) aren't wired
    // through here yet. Atomic upsert-increment via ON CONFLICT so two
    // concurrent checkouts on the same outlet/day can never get the same
    // number or skip one.
    const dateKey = new Date().toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ last_number: number }[]>`
      INSERT INTO order_sequences (outlet_id, date_key, last_number, updated_at)
      VALUES (${outletId}, ${dateKey}, 1, now())
      ON CONFLICT (outlet_id, date_key)
      DO UPDATE SET last_number = order_sequences.last_number + 1, updated_at = now()
      RETURNING last_number
    `;
    const seq = rows[0].last_number;
    return `${dateKey.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; status: OrderStatus } | null> {
    const row = await this.prisma.order.findUnique({ where: { idempotencyKey } });
    if (!row) {
      return null;
    }
    return { id: row.id, status: row.status as OrderStatus };
  }

  async createOrder(
    id: string,
    input: CreateOrderInput,
    priced: PricedOrder,
    orderNumber: string
  ): Promise<{ id: string; status: OrderStatus }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id,
          outletId: input.outletId,
          terminalNumber: input.terminalNumber,
          orderNumber,
          status: "PLACED",
          orderType: input.orderType,
          subtotal: priced.subtotalMinor,
          taxTotal: priced.taxTotalMinor,
          grandTotal: priced.grandTotalMinor,
          idempotencyKey: input.idempotencyKey,
          customerId: input.customerId,
          diningTableId: input.diningTableId,
          waiterId: input.waiterId,
        },
      });

      if (input.diningTableId) {
        await tx.diningTable.update({
          where: { id: input.diningTableId },
          data: { status: "OCCUPIED" },
        });
      }

      // Each order item is created individually (rather than via
      // createMany) so its OrderItemModifier child rows can be nested off
      // the generated id, capturing the exact modifier prices already
      // resolved during pricing (no re-query, so charged and recorded
      // prices can never drift apart).
      for (const line of priced.lines) {
        await tx.orderItem.create({
          data: {
            outletId: input.outletId,
            orderId: id,
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
      }

      await tx.orderStatusHistory.create({
        data: {
          outletId: input.outletId,
          orderId: id,
          status: "PLACED",
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
          status: newStatus,
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
      where.status = filter.status;
    }
    if (filter.orderType) {
      where.orderType = filter.orderType;
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
        channelOrderMapping: {
          select: {
            externalOrderId: true,
            partnerStatedTotal: true,
            computedTotal: true,
            channelAccount: { select: { channel: true } },
          },
        },
        customer: { select: { firstName: true, lastName: true } },
        waiter: { select: { firstName: true, lastName: true } },
        payments: { where: { status: "CAPTURED" }, select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      grandTotalMinor: row.grandTotal,
      taxTotalMinor: row.taxTotal,
      discountTotalMinor: row.discountTotal,
      createdAt: row.createdAt,
      itemCount: row._count.orderItems,
      diningTableId: row.diningTableId,
      channel: row.channelOrderMapping?.channelAccount.channel ?? null,
      externalOrderId: row.channelOrderMapping?.externalOrderId ?? null,
      priceMismatch: row.channelOrderMapping
        ? row.channelOrderMapping.partnerStatedTotal !== row.channelOrderMapping.computedTotal
        : false,
      customerName: row.customer ? `${row.customer.firstName} ${row.customer.lastName}`.trim() : null,
      waiterName: row.waiter ? `${row.waiter.firstName} ${row.waiter.lastName}`.trim() : null,
      paymentMethod: row.payments[0]?.method ?? null,
    }));
  }

  async getOrderDetail(outletId: string, orderId: string): Promise<OrderDetail | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, outletId },
      include: {
        orderItems: {
          include: {
            menuItem: { select: { name: true } },
            modifiers: true,
          },
        },
        payments: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        channelOrderMapping: {
          select: { externalOrderId: true, partnerStatedTotal: true, computedTotal: true, channelAccount: { select: { channel: true } } },
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
      channel: row.channelOrderMapping?.channelAccount.channel ?? null,
      externalOrderId: row.channelOrderMapping?.externalOrderId ?? null,
      priceMismatch: row.channelOrderMapping
        ? row.channelOrderMapping.partnerStatedTotal !== row.channelOrderMapping.computedTotal
        : false,
      grandTotalMinor: row.grandTotal,
      subtotalMinor: row.subtotal,
      taxTotalMinor: row.taxTotal,
      discountTotalMinor: row.discountTotal,
      terminalNumber: row.terminalNumber,
      diningTableId: row.diningTableId,
      customerId: row.customerId,
      customerName: null,
      waiterName: null,
      paymentMethod: row.payments.find((p) => p.status === "CAPTURED")?.method ?? null,
      createdAt: row.createdAt,
      itemCount: row.orderItems.length,
      items: row.orderItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItem.name,
        quantity: item.quantity,
        unitPriceMinor: item.unitPrice,
        subtotalMinor: item.subtotal,
        notes: item.notes,
        isVoided: item.isVoided,
        course: item.course,
        seatNumber: item.seatNumber,
        modifiers: item.modifiers.map((modifier) => ({
          modifierOptionId: modifier.modifierOptionId,
          priceMinor: modifier.price,
        })),
      })),
      payments: row.payments.map((payment) => ({
        id: payment.id,
        amountMinor: payment.amount,
        method: payment.method,
        status: payment.status,
        transactionId: payment.transactionId,
        createdAt: payment.createdAt,
      })),
      statusHistory: row.statusHistory.map((history) => ({
        status: history.status as OrderStatus,
        notes: history.notes,
        createdAt: history.createdAt,
        createdBy: history.createdBy,
      })),
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
      const payment = await tx.payment.create({
        data: {
          outletId,
          orderId,
          amount: amountMinor,
          method,
          status: "CAPTURED",
          seatNumber,
        },
      });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: payment.id,
        afterState: { orderId, amountMinor: amountMinor.toString(), method, seatNumber },
      });

      return { id: payment.id, amountMinor: payment.amount, method: payment.method, status: payment.status };
    });
  }
}
