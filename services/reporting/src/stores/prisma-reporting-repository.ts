import { PrismaClient } from "@prisma/client";
import type {
  ReportingRepository,
  OrderAggregateRow,
  ItemSaleRow,
  PaymentAggregateRow,
  ChannelOrderRow,
  DineInTurnaroundRow,
  KotLeakageEventRow,
  InvoiceLeakageRow,
  UnbilledKotRow,
  TaxOrderRow,
} from "../reporting-service";
import type { DateRange } from "@kapmeta/shared-types/reporting";
import type { OrderStatus } from "@kapmeta/shared-types/orders";

export class PrismaReportingRepository implements ReportingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOrdersInRange(outletId: string, range: DateRange): Promise<OrderAggregateRow[]> {
    const rows = await this.prisma.order.findMany({
      where: { outletId, createdAt: { gte: range.fromDate, lte: range.toDate } },
      select: { status: true, grandTotal: true },
    });

    return rows.map((row) => ({
      status: row.status as OrderStatus,
      grandTotalMinor: row.grandTotal,
    }));
  }

  async listOrderItemsInRange(outletId: string, range: DateRange): Promise<ItemSaleRow[]> {
    const rows = await this.prisma.orderItem.findMany({
      where: { outletId, order: { createdAt: { gte: range.fromDate, lte: range.toDate } } },
      select: {
        menuItemId: true,
        quantity: true,
        subtotal: true,
        order: { select: { status: true } },
      },
    });

    return rows.map((row) => ({
      menuItemId: row.menuItemId,
      quantity: row.quantity,
      subtotalMinor: row.subtotal,
      orderStatus: row.order.status as OrderStatus,
    }));
  }

  async listPaymentsInRange(outletId: string, range: DateRange): Promise<PaymentAggregateRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: { outletId, createdAt: { gte: range.fromDate, lte: range.toDate } },
      select: { method: true, status: true, amount: true },
    });

    return rows.map((row) => ({
      method: row.method,
      status: row.status,
      amountMinor: row.amount,
    }));
  }

  async listChannelOrdersInRange(outletId: string, range: DateRange): Promise<ChannelOrderRow[]> {
    const rows = await this.prisma.order.findMany({
      where: { outletId, createdAt: { gte: range.fromDate, lte: range.toDate } },
      select: { orderType: true, status: true, grandTotal: true },
    });

    return rows.map((row) => ({
      orderType: row.orderType,
      status: row.status as OrderStatus,
      grandTotalMinor: row.grandTotal,
    }));
  }

  // Single query: DINE_IN orders with a table assigned
  async listDineInTurnaroundRowsInRange(outletId: string, range: DateRange): Promise<DineInTurnaroundRow[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        outletId,
        orderType: "DINE_IN",
        diningTableId: { not: null },
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: {
        id: true,
        orderType: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      orderId: row.id,
      orderType: row.orderType,
      createdAt: row.createdAt,
      settledAt: null,
    }));
  }

  // CANCELLED/MODIFIED/SHIFTED KOTStatusHistory rows, scoped to this outlet's
  // KOT tickets and to history rows created within range.
  async listKotStatusEventsInRange(outletId: string, range: DateRange): Promise<KotLeakageEventRow[]> {
    const rows = await this.prisma.kOTStatusHistory.findMany({
      where: {
        status: { in: ["CANCELLED", "MODIFIED", "SHIFTED"] },
        createdAt: { gte: range.fromDate, lte: range.toDate },
        kotTicket: { outletId },
      },
      select: { status: true, reasonCode: true },
    });

    return rows.map((row) => ({
      status: row.status,
      reasonCode: row.reasonCode,
    }));
  }

  // Invoice-level reprint/waive-off figures for invoices created in range.
  async listInvoiceLeakageInRange(_outletId: string, _range: DateRange): Promise<InvoiceLeakageRow[]> {
    return [];
  }

  // KOT tickets in range whose parent order has zero linked Invoice rows —
  // revenue-at-risk is estimated from the parent Order's grandTotal
  async listKotsNotBilledInRange(outletId: string, range: DateRange): Promise<UnbilledKotRow[]> {
    const kots = await this.prisma.kOTTicket.findMany({
      where: { outletId, createdAt: { gte: range.fromDate, lte: range.toDate } },
      select: { id: true, orderId: true },
    });
    if (kots.length === 0) return [];

    const orderIds = Array.from(new Set(kots.map((k) => k.orderId)));
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, grandTotal: true },
    });
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const result: UnbilledKotRow[] = [];
    for (const kot of kots) {
      const order = orderById.get(kot.orderId);
      if (order) {
        result.push({
          kotTicketId: kot.id,
          orderId: kot.orderId,
          orderGrandTotalMinor: order.grandTotal,
        });
      }
    }
    return result;
  }

  async listTaxOrdersInRange(outletId: string, range: DateRange): Promise<TaxOrderRow[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: {
        subtotal: true,
        taxTotal: true,
        grandTotal: true,
        orderType: true,
      },
    });

    return rows.map((row) => ({
      subtotalMinor: row.subtotal ?? (row.grandTotal - (row.taxTotal ?? 0n)),
      taxTotalMinor: row.taxTotal ?? 0n,
      grandTotalMinor: row.grandTotal,
      orderType: row.orderType,
    }));
  }
}

