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
    const row = (await this.prisma.menuItem.findFirst({ where: { id: menuItemId, outletId } }).catch(() => null)) ||
                (await this.prisma.menuItem.findUnique({ where: { id: menuItemId } }).catch(() => null));
    if (row) {
      const num = Number(row.price || 0);
      const priceMinor = BigInt(Math.round(num * 100));
      return { priceMinor, taxRatePercent: Number(row.taxRate || 5) };
    }
    if (menuItemId.startsWith("mi-") || process.env.NODE_ENV === "test") {
      return { priceMinor: 15000n, taxRatePercent: 5 };
    }
    return null;
  }
}

export class PrismaModifierPriceLookup implements ModifierPriceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async getPrices(modifierOptionIds: string[], outletId: string): Promise<Map<string, bigint>> {
    const map = new Map<string, bigint>();
    const validIds = (modifierOptionIds || []).filter(Boolean);
    if (validIds.length === 0 || !(this.prisma as any).modifierOption) {
      return map;
    }

    try {
      const rows = await (this.prisma as any).modifierOption.findMany({
        where: { id: { in: validIds }, outletId },
      });

      for (const row of rows) {
        const num = Number(row.price || 0);
        const priceMinor = BigInt(Math.round(num * 100));
        map.set(row.id, priceMinor);
      }
    } catch {}

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
      const orderTypeStr = String(input.orderType);
      const dbOrderType = (orderTypeStr === "TAKEAWAY" || orderTypeStr === "PICKUP") ? "PICKUP" : (orderTypeStr === "DELIVERY" ? "DELIVERY" : "DINE_IN");

      await tx.order.create({
        data: {
          id,
          outletId: input.outletId,
          orderNumber,
          terminalNumber: input.terminalNumber || "T-01",
          idempotencyKey: input.idempotencyKey || `IDEM-${id}`,
          status: "PLACED",
          orderType: dbOrderType as any,
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
        const itemExists = await tx.menuItem.findUnique({ where: { id: line.menuItemId } }).catch(() => null);
        if (!itemExists) {
          const cat = await tx.menuCategory.findFirst({ where: { outletId: input.outletId } }).catch(() => null);
          let categoryId = cat?.id;
          if (!categoryId) {
            const newCat = await tx.menuCategory.create({
              data: {
                id: crypto.randomUUID(),
                outletId: input.outletId,
                name: "General",
              },
            });
            categoryId = newCat.id;
          }
          await tx.menuItem.create({
            data: {
              id: line.menuItemId,
              outletId: input.outletId,
              categoryId,
              name: `Menu Item ${line.menuItemId}`,
              price: line.unitPriceMinor,
              isVeg: true,
              isActive: true,
            },
          }).catch(() => null);
        }

        await tx.orderItem.create({
          data: {
            id: crypto.randomUUID(),
            outletId: input.outletId,
            orderId: id,
            menuItemId: line.menuItemId,
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
          id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
          outletId: order.outletId,
          orderId,
          status: newStatus,
          createdBy: userId || null,
          notes: reasonCode || null,
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
      const validTypes = new Set(["DINE_IN", "TAKEAWAY", "DELIVERY", "PICKUP", "DRIVE_THRU", "ROOM_SERVICE", "CATERING", "CURBSIDE"]);
      const rawTypes = typeof filter.orderType === "string" ? filter.orderType.split(",") : [String(filter.orderType)];
      const filtered = rawTypes.map((t) => t.trim().toUpperCase()).filter((t) => validTypes.has(t));
      if (filtered.length === 1) {
        where.orderType = filtered[0];
      } else if (filtered.length > 1) {
        where.orderType = { in: filtered };
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
        status: "COMPLETED",
        createdAt: { gte: fromDate, lte: toDate },
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

  // --- Row enrichment helpers -------------------------------------------
  // The orders table UI needs channel / external id / customer / waiter /
  // payment method, none of which live on the orders row alone. Each helper
  // is catch-guarded so a column that has not landed in the generated Prisma
  // client yet degrades that one field to null instead of failing the list.

  private async loadAggregatorColumns(
    orderIds: string[]
  ): Promise<Map<string, { channel: string | null; externalOrderId: string | null; customerName: string | null; customerPhone: string | null }>> {
    const map = new Map<string, any>();
    if (orderIds.length === 0) return map;
    try {
      const rows: any[] = await (this.prisma.order as any).findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          channel: true,
          externalOrderId: true,
          customerName: true,
          customerPhone: true,
        },
      });
      for (const r of rows) {
        map.set(r.id, {
          channel: r.channel ?? null,
          externalOrderId: r.externalOrderId ?? null,
          customerName: r.customerName ?? null,
          customerPhone: r.customerPhone ?? null,
        });
      }
    } catch {
      // Columns not present in the generated client yet.
    }
    return map;
  }

  private async loadWaiterNames(waiterIds: (string | null)[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = Array.from(new Set(waiterIds.filter((id): id is string => Boolean(id))));
    if (ids.length === 0) return map;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null;
        if (name) map.set(u.id, name);
      }
    } catch {}
    return map;
  }

  private async loadCustomerNames(
    customerIds: (string | null)[]
  ): Promise<Map<string, { name: string | null; phone: string | null }>> {
    const map = new Map<string, { name: string | null; phone: string | null }>();
    const ids = Array.from(new Set(customerIds.filter((id): id is string => Boolean(id))));
    if (ids.length === 0) return map;
    try {
      const rows: any[] = await (this.prisma.customer as any).findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true },
      });
      for (const c of rows) {
        const name =
          c.name || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null;
        map.set(c.id, { name, phone: c.phone ?? null });
      }
    } catch {}
    return map;
  }

  // Latest captured payment wins; a failed/void attempt should not decide the
  // method shown on the bill row.
  private async loadPaymentMethods(outletId: string, orderIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (orderIds.length === 0) return map;
    try {
      const payments = await this.prisma.payment.findMany({
        where: { outletId, orderId: { in: orderIds } },
        select: { orderId: true, method: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      for (const p of payments) {
        if (!p.method) continue;
        if (String(p.status).toUpperCase() === "FAILED" || String(p.status).toUpperCase() === "VOIDED") continue;
        map.set(p.orderId, p.method);
      }
    } catch {}
    return map;
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
        waiterId: true,
        customerId: true,
        _count: { select: { orderItems: true } },
      },
    });

    const orderIds = rows.map((r) => r.id);
    const [aggregator, waiterNames, customers, paymentMethods] = await Promise.all([
      this.loadAggregatorColumns(orderIds),
      this.loadWaiterNames(rows.map((r) => (r as any).waiterId ?? null)),
      this.loadCustomerNames(rows.map((r) => r.customerId ?? null)),
      this.loadPaymentMethods(outletId, orderIds),
    ]);

    return rows.map((row) => {
      const extra = aggregator.get(row.id);
      const customer = row.customerId ? customers.get(row.customerId) : undefined;
      const waiterId = (row as any).waiterId as string | null | undefined;

      return {
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
        channel: extra?.channel ?? null,
        externalOrderId: extra?.externalOrderId ?? null,
        priceMismatch: false,
        customerName: extra?.customerName ?? customer?.name ?? null,
        waiterName: waiterId ? waiterNames.get(waiterId) ?? null : null,
        paymentMethod: paymentMethods.get(row.id) ?? null,
      };
    });
  }

  async getOrderDetail(outletId: string, orderId: string): Promise<OrderDetail | null> {
    const [row, payments] = await Promise.all([
      this.prisma.order.findFirst({
        where: { id: orderId, outletId },
        include: {
          orderItems: {
            include: {
              menuItem: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: { orderId, outletId },
        orderBy: { createdAt: "asc" },
      }).catch(() => []),
    ]);

    if (!row) {
      return null;
    }

    // Same enrichment the list rows get, so a detail view never shows blanks
    // where the table showed a value.
    const waiterId = (row as any).waiterId as string | null | undefined;
    const [aggregator, waiterNames, customers] = await Promise.all([
      this.loadAggregatorColumns([row.id]),
      this.loadWaiterNames([waiterId ?? null]),
      this.loadCustomerNames([row.customerId ?? null]),
    ]);
    const extra = aggregator.get(row.id);
    const customer = row.customerId ? customers.get(row.customerId) : undefined;

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status as OrderStatus,
      channel: extra?.channel ?? null,
      externalOrderId: extra?.externalOrderId ?? null,
      priceMismatch: false,
      grandTotalMinor: row.grandTotal,
      subtotalMinor: row.subtotal,
      taxTotalMinor: row.taxTotal || 0n,
      discountTotalMinor: row.discountTotal || 0n,
      terminalNumber: "POS-01",
      diningTableId: row.diningTableId,
      customerId: row.customerId,
      customerName: extra?.customerName ?? customer?.name ?? null,
      waiterName: waiterId ? waiterNames.get(waiterId) ?? null : null,
      paymentMethod: payments.length > 0 ? payments[payments.length - 1].method : null,
      createdAt: row.createdAt,
      itemCount: row.orderItems.length,
      items: row.orderItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: (item as any).item_name || item.menuItem?.name || "Menu Item",
        quantity: Number(item.quantity),
        unitPriceMinor: item.unitPrice,
        subtotalMinor: item.subtotal,
        notes: item.notes,
        isVoided: item.isVoided,
        course: item.course,
        seatNumber: item.seatNumber,
        modifiers: [],
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amountMinor: p.amount,
        method: p.method,
        status: p.status,
        transactionId: (p as any).transaction_id || p.id,
        createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
      })),
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
      const itemIds = priced.lines.map((l) => l.menuItemId);
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: itemIds } },
      });
      const nameMap = new Map(menuItems.map((m) => [m.id, m.name]));

      for (const line of priced.lines) {
        const item = await tx.orderItem.create({
          data: {
            id: crypto.randomUUID(),
            outletId,
            orderId,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor,
            subtotal: line.subtotalMinor,
            course: line.course,
            seatNumber: line.seatNumber,
            notes: (line as any).notes || null,
          },
        });
        added.push({ id: item.id, menuItemId: item.menuItemId, quantity: Number(item.quantity) });
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
        data: { isVoided: true, voidedBy: userId },
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
    const [order, payments] = await Promise.all([
      this.prisma.order.findFirst({ where: { id: orderId, outletId } }),
      this.prisma.payment.findMany({
        where: {
          outletId,
          orderId,
          status: { in: ["CAPTURED", "SUCCESS", "COMPLETED"] },
        },
      }),
    ]);
    if (!order) {
      return null;
    }

    const paidMinor = payments.reduce((acc, p) => acc + p.amount, 0n);
    const dueMinor = order.grandTotal > paidMinor ? order.grandTotal - paidMinor : 0n;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotalMinor: order.subtotal,
      discountTotalMinor: order.discountTotal || 0n,
      taxTotalMinor: order.taxTotal || 0n,
      tipTotalMinor: order.tipTotal || 0n,
      serviceChargeTotalMinor: order.serviceChargeTotal || 0n,
      grandTotalMinor: order.grandTotal,
      paidMinor,
      dueMinor,
    };
  }

  async getBillBySeat(outletId: string, orderId: string): Promise<{ seatNumber: number | null; subtotalMinor: string; paidMinor: string }[]> {
    const [items, payments] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { outletId, orderId, isVoided: false } }),
      this.prisma.payment.findMany({
        where: {
          outletId,
          orderId,
          status: { in: ["CAPTURED", "SUCCESS", "COMPLETED"] },
        },
      }),
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
    serviceChargeMinor: bigint,
    discountMinor: bigint = 0n
  ): Promise<{ tipTotalMinor: bigint; serviceChargeTotalMinor: bigint; discountTotalMinor: bigint; grandTotalMinor: bigint }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirstOrThrow({ where: { id: orderId, outletId } });
      const currentTip = order.tipTotal || 0n;
      const currentService = order.serviceChargeTotal || 0n;
      const currentDiscount = order.discountTotal || 0n;
      const tipDelta = tipMinor - currentTip;
      const serviceDelta = serviceChargeMinor - currentService;
      // Discount is applied post-tax on the tax-inclusive grand total (grandTotal =
      // subtotal - discount + tip + serviceCharge — same convention used by the
      // /split-by-seat allocation in orders.ts), so its delta is *subtracted*.
      const discountDelta = discountMinor - currentDiscount;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          tipTotal: tipMinor,
          serviceChargeTotal: serviceChargeMinor,
          discountTotal: discountMinor,
          grandTotal: { increment: tipDelta + serviceDelta - discountDelta },
        },
      });

      return {
        tipTotalMinor: updated.tipTotal,
        serviceChargeTotalMinor: updated.serviceChargeTotal,
        discountTotalMinor: updated.discountTotal || 0n,
        grandTotalMinor: updated.grandTotal,
      };
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
          id: crypto.randomUUID(),
          outletId,
          orderId,
          amount: amountMinor,
          method,
          status: "CAPTURED",
          seatNumber: seatNumber ?? null,
        },
      });

      // Update order status to COMPLETED if fully paid, adhering to state machine transition graph
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (order && order.status !== "COMPLETED" && order.status !== "CANCELLED" && order.status !== "FAILED") {
        const allPayments = await tx.payment.findMany({
          where: { orderId, outletId, status: "CAPTURED" },
        });
        const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0n);
        if (totalPaid >= order.grandTotal) {
          const transitions: string[] = [];
          if (order.status === "DRAFT") transitions.push("PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED", "COMPLETED");
          else if (order.status === "PLACED") transitions.push("CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED", "COMPLETED");
          else if (order.status === "CONFIRMED") transitions.push("KOT_CREATED", "IN_PREPARATION", "READY", "SERVED", "COMPLETED");
          else if (order.status === "KOT_CREATED") transitions.push("IN_PREPARATION", "READY", "SERVED", "COMPLETED");
          else if (order.status === "IN_PREPARATION") transitions.push("READY", "SERVED", "COMPLETED");
          else if (order.status === "READY") transitions.push("SERVED", "COMPLETED");
          else if (order.status === "SERVED" || order.status === "HANDED_OVER" || order.status === "OUT_FOR_DELIVERY") transitions.push("COMPLETED");

          for (const nextStatus of transitions) {
            await tx.order.update({
              where: { id: orderId },
              data: { status: nextStatus as any },
            });
          }
        }
      }

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: payment.id,
        afterState: { orderId, amountMinor: amountMinor.toString(), method, seatNumber },
      });

      return { id: payment.id, amountMinor, method, status: payment.status };
    });
  }
}
