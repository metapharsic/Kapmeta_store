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
  MenuItemRecipeCost,
  ConsumptionLogRow,
  PurchaseReceiptRow,
  WaiterOrderRow,
  WaiterHandoverRow,
  TableInfoRow,
  TableUtilizationOrderRow,
} from "../reporting-service";
import type { DateRange } from "@kapmeta/shared-types/reporting";
import type { OrderStatus } from "@kapmeta/shared-types/orders";

export class PrismaReportingRepository implements ReportingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOrdersInRange(outletId: string, range: DateRange): Promise<OrderAggregateRow[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: { status: true, grandTotal: true },
    });

    return rows.map((row) => ({
      status: row.status as OrderStatus,
      grandTotalMinor: row.grandTotal,
    }));
  }

  async listOrderItemsInRange(outletId: string, range: DateRange): Promise<ItemSaleRow[]> {
    const rows = await this.prisma.orderItem.findMany({
      where: {
        outletId,
        order: {
          status: "COMPLETED",
          createdAt: { gte: range.fromDate, lte: range.toDate },
        },
      },
      select: {
        menuItemId: true,
        quantity: true,
        subtotal: true,
        order: { select: { status: true } },
      },
    });

    return rows.map((row) => ({
      menuItemId: row.menuItemId,
      quantity: Number(row.quantity),
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
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
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
        updatedAt: true,
      },
    });

    return rows.map((row) => ({
      orderId: row.id,
      orderType: row.orderType,
      createdAt: row.createdAt,
      settledAt: row.updatedAt,
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
  async listInvoiceLeakageInRange(outletId: string, range: DateRange): Promise<InvoiceLeakageRow[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        outletId,
        createdAt: { gte: range.fromDate, lte: range.toDate },
        OR: [
          { reprintCount: { gt: 0 } },
          { waivedOffMinor: { gt: 0 } },
        ],
      },
      select: { reprintCount: true, waivedOffMinor: true },
    });
    return rows.map((row) => ({
      reprintCount: row.reprintCount,
      waivedOffMinor: row.waivedOffMinor,
    }));
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
      select: { id: true, grandTotal: true, status: true },
    });
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const billed = await this.prisma.invoice.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true },
    });
    const billedIds = new Set(billed.map((i) => i.orderId));
    const completed = new Set(orders.filter((o) => (o as { status?: string }).status === "COMPLETED").map((o) => o.id));

    const result: UnbilledKotRow[] = [];
    for (const kot of kots) {
      if (billedIds.has(kot.orderId) || completed.has(kot.orderId)) continue;
      const order = orderById.get(kot.orderId);
      if (order) {
        result.push({
          kotTicketId: kot.id,
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

  // Per-menu-item recipe cost: sums recipe_ingredients.quantity *
  // ingredients.unit_cost_minor across each menu item's active recipe.
  // Menu items with zero active recipes get hasRecipe: false so callers
  // never mistake "no recipe on file" for a real 0-cost recipe.
  async listMenuItemRecipeCosts(outletId: string, menuItemIds: string[]): Promise<MenuItemRecipeCost[]> {
    if (menuItemIds.length === 0) return [];

    const recipes = await this.prisma.recipes.findMany({
      where: {
        outlet_id: outletId,
        menu_item_id: { in: menuItemIds },
        is_active: true,
      },
      select: {
        menu_item_id: true,
        recipe_ingredients: {
          select: {
            quantity: true,
            ingredients: { select: { unit_cost_minor: true } },
          },
        },
      },
    });

    const costByMenuItem = new Map<string, bigint>();
    for (const recipe of recipes) {
      if (!recipe.menu_item_id) continue;
      let cost = costByMenuItem.get(recipe.menu_item_id) ?? 0n;
      for (const line of recipe.recipe_ingredients) {
        const quantity = Number(line.quantity);
        cost += BigInt(Math.round(quantity * Number(line.ingredients.unit_cost_minor)));
      }
      costByMenuItem.set(recipe.menu_item_id, cost);
    }

    return menuItemIds.map((menuItemId) => ({
      menuItemId,
      hasRecipe: costByMenuItem.has(menuItemId),
      costPerUnitMinor: costByMenuItem.get(menuItemId) ?? 0n,
    }));
  }

  async listInventoryConsumptionInRange(outletId: string, range: DateRange): Promise<ConsumptionLogRow[]> {
    const rows = await this.prisma.inventoryConsumptionLog.findMany({
      where: {
        outletId,
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: {
        ingredientId: true,
        quantityDeducted: true,
        shortage: true,
        reasonCode: true,
      },
    });

    return rows.map((row) => ({
      ingredientId: row.ingredientId,
      quantityDeducted: Number(row.quantityDeducted),
      shortage: Number(row.shortage),
      reasonCode: row.reasonCode,
    }));
  }

  // Purchase order lines received within range, scoped to this outlet via
  // the parent purchase_orders row. Cost is receivedQty * unit_price_minor
  // (rather than the PO line's total_minor, which reflects ordered
  // quantity, not what was actually received).
  async listPurchaseReceiptsInRange(outletId: string, range: DateRange): Promise<PurchaseReceiptRow[]> {
    const rows = await this.prisma.purchase_order_items.findMany({
      where: {
        purchase_orders: { outlet_id: outletId },
        created_at: { gte: range.fromDate, lte: range.toDate },
        received_qty: { gt: 0 },
      },
      select: {
        ingredient_id: true,
        received_qty: true,
        unit_price_minor: true,
      },
    });

    return rows.map((row) => {
      const receivedQty = Number(row.received_qty);
      return {
        ingredientId: row.ingredient_id,
        receivedQty,
        receivedCostMinor: BigInt(Math.round(receivedQty * Number(row.unit_price_minor))),
      };
    });
  }

  // COMPLETED orders with a waiterId assigned, in range — matches the
  // COMPLETED-only convention used by listOrdersInRange for net sales.
  async listWaiterOrdersInRange(outletId: string, range: DateRange): Promise<WaiterOrderRow[]> {
    // covers is cast via `as any` on the select — it exists on the orders
    // table (kapmeta/schema.prisma) but predates the last `prisma generate`
    // run against this checkout, same as other stale-client fields elsewhere
    // in this repo (e.g. table_number, business_date).
    const rows = (await this.prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        waiterId: { not: null },
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: { waiterId: true, grandTotal: true, covers: true } as any,
    })) as unknown as Array<{ waiterId: string | null; grandTotal: bigint; covers: number | null }>;

    return rows
      .filter((row) => row.waiterId !== null)
      .map((row) => ({
        waiterId: row.waiterId as string,
        grandTotalMinor: row.grandTotal,
        covers: row.covers,
      }));
  }

  // WaiterShiftHandover rows in range, scoped by businessDate.
  async listWaiterHandoversInRange(outletId: string, range: DateRange): Promise<WaiterHandoverRow[]> {
    const rows = await this.prisma.waiterShiftHandover.findMany({
      where: {
        outletId,
        businessDate: { gte: range.fromDate, lte: range.toDate },
      },
      select: {
        waiterId: true,
        actualCashCountedMinor: true,
        openingFloatMinor: true,
        netTipPayoutMinor: true,
        digitalTipsMinor: true,
        serviceChargeMinor: true,
        cashSalesMinor: true,
      },
    });

    return rows.map((row) => ({
      waiterId: row.waiterId,
      actualCashCountedMinor: row.actualCashCountedMinor,
      openingFloatMinor: row.openingFloatMinor,
      netTipPayoutMinor: row.netTipPayoutMinor,
      digitalTipsMinor: row.digitalTipsMinor,
      serviceChargeMinor: row.serviceChargeMinor,
      cashSalesMinor: row.cashSalesMinor,
    }));
  }

  // Active dining tables for the outlet (used as the universe of tables for
  // the utilization report, so tables with zero orders in range still show
  // a 0% occupancy row rather than being silently omitted).
  async listActiveTables(outletId: string): Promise<TableInfoRow[]> {
    const rows = await this.prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      select: { id: true, tableNumber: true, section: true },
    });

    return rows.map((row) => ({
      tableId: row.id,
      tableNumber: row.tableNumber,
      section: row.section,
    }));
  }

  // DINE_IN orders with a diningTableId in range. settledAt mirrors
  // listDineInTurnaroundRowsInRange's updatedAt proxy.
  async listTableUtilizationOrdersInRange(outletId: string, range: DateRange): Promise<TableUtilizationOrderRow[]> {
    // covers cast via `as any` on the select — see note in
    // listWaiterOrdersInRange above.
    const rows = (await this.prisma.order.findMany({
      where: {
        outletId,
        orderType: "DINE_IN",
        diningTableId: { not: null },
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: {
        diningTableId: true,
        createdAt: true,
        updatedAt: true,
        grandTotal: true,
        covers: true,
      } as any,
    })) as unknown as Array<{
      diningTableId: string | null;
      createdAt: Date;
      updatedAt: Date;
      grandTotal: bigint;
      covers: number | null;
    }>;

    return rows
      .filter((row) => row.diningTableId !== null)
      .map((row) => ({
        diningTableId: row.diningTableId as string,
        createdAt: row.createdAt,
        settledAt: row.updatedAt,
        grandTotalMinor: row.grandTotal,
        covers: row.covers,
      }));
  }
}
