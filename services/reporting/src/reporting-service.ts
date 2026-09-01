import { KPI_FORMULA_VERSION } from "@kapmeta/shared-types/reporting";
import type {
  DateRange,
  SalesSummary,
  ItemPerformanceRow,
  PaymentBreakdown,
  PaymentMethodBreakdownRow,
  ChannelBreakdown,
  ChannelBreakdownRow,
  TableTurnaroundAverage,
  LeakageReport,
  TaxBreakdown,
  TaxComponentBreakdown,
  ItemMarginRow,
  ItemMarginReport,
  InventoryVarianceRow,
  InventoryVarianceReport,
  StaffPerformanceReport,
  StaffPerformanceRow,
  TableUtilizationReport,
  TableUtilizationRow,
  TableUtilizationSectionRow,
} from "@kapmeta/shared-types/reporting";
import type { OrderStatus } from "@kapmeta/shared-types/orders";

export interface TaxOrderRow {
  subtotalMinor: bigint;
  taxTotalMinor: bigint;
  grandTotalMinor: bigint;
  orderType: string;
}

export interface OrderAggregateRow {
  status: OrderStatus;
  grandTotalMinor: bigint;
}

export interface ItemSaleRow {
  menuItemId: string;
  quantity: number;
  subtotalMinor: bigint;
  orderStatus: OrderStatus;
}

export interface PaymentAggregateRow {
  method: string;
  status: string; // CAPTURED, REFUNDED, FAILED
  amountMinor: bigint;
}

export interface ChannelOrderRow {
  orderType: string;
  status: OrderStatus;
  grandTotalMinor: bigint;
}

// One row per DINE_IN order that has a diningTableId in range. settledAt is
// null when the order has no SETTLED row in OrderStatusHistory (table never
// cleared, or still in progress) — such orders are excluded from the average.
export interface DineInTurnaroundRow {
  orderId: string;
  orderType: string;
  createdAt: Date;
  settledAt: Date | null;
}

// One row per CANCELLED/MODIFIED/SHIFTED KOTStatusHistory entry in range.
export interface KotLeakageEventRow {
  status: string; // CANCELLED | MODIFIED | SHIFTED
  reasonCode: string | null;
}

// One row per Invoice in range (reprint/waive-off leakage figures).
export interface InvoiceLeakageRow {
  reprintCount: number;
  waivedOffMinor: bigint;
}

// One row per KOT ticket in range whose parent order has zero linked
// Invoice rows — i.e. served/in-progress work with no bill raised against it.
export interface UnbilledKotRow {
  kotTicketId: string;
  orderGrandTotalMinor: bigint;
}

// Per-menu-item recipe costing: sum(recipe_ingredients.quantity * ingredients.unit_cost_minor)
// across the item's active recipe's ingredient lines. hasRecipe is false when
// the menu item has no active recipe row at all (costPerUnitMinor is 0n in
// that case and must not be treated as a real zero cost).
export interface MenuItemRecipeCost {
  menuItemId: string;
  hasRecipe: boolean;
  costPerUnitMinor: bigint;
}

// One row per InventoryConsumptionLog entry in range.
export interface ConsumptionLogRow {
  ingredientId: string;
  quantityDeducted: number;
  shortage: number;
  reasonCode: string | null;
}

// One row per purchase_order_items line received within range (joined to its
// parent purchase_orders.outlet_id for scoping).
export interface PurchaseReceiptRow {
  ingredientId: string;
  receivedQty: number;
  receivedCostMinor: bigint; // receivedQty * unit_price_minor
}

// One row per COMPLETED order with a waiterId, in range.
export interface WaiterOrderRow {
  waiterId: string;
  grandTotalMinor: bigint;
  covers: number | null;
}

// One row per WaiterShiftHandover in range.
export interface WaiterHandoverRow {
  waiterId: string;
  actualCashCountedMinor: bigint;
  openingFloatMinor: bigint;
  netTipPayoutMinor: bigint;
  digitalTipsMinor: bigint;
  serviceChargeMinor: bigint;
  cashSalesMinor: bigint;
}

// One row per active DiningTable for the outlet.
export interface TableInfoRow {
  tableId: string;
  tableNumber: string;
  section: string;
}

// One row per DINE_IN order with a diningTableId in range (any status --
// see TableUtilizationRow.totalRevenueMinor doc comment). settledAt mirrors
// DineInTurnaroundRow's updatedAt proxy.
export interface TableUtilizationOrderRow {
  diningTableId: string;
  createdAt: Date;
  settledAt: Date;
  grandTotalMinor: bigint;
  covers: number | null;
}

export interface ReportingRepository {
  listOrdersInRange(outletId: string, range: DateRange): Promise<OrderAggregateRow[]>;
  listOrderItemsInRange(outletId: string, range: DateRange): Promise<ItemSaleRow[]>;
  listPaymentsInRange(outletId: string, range: DateRange): Promise<PaymentAggregateRow[]>;
  listChannelOrdersInRange(outletId: string, range: DateRange): Promise<ChannelOrderRow[]>;
  listDineInTurnaroundRowsInRange(outletId: string, range: DateRange): Promise<DineInTurnaroundRow[]>;
  listKotStatusEventsInRange(outletId: string, range: DateRange): Promise<KotLeakageEventRow[]>;
  listInvoiceLeakageInRange(outletId: string, range: DateRange): Promise<InvoiceLeakageRow[]>;
  listKotsNotBilledInRange(outletId: string, range: DateRange): Promise<UnbilledKotRow[]>;
  listTaxOrdersInRange(outletId: string, range: DateRange): Promise<TaxOrderRow[]>;
  listMenuItemRecipeCosts(outletId: string, menuItemIds: string[]): Promise<MenuItemRecipeCost[]>;
  listInventoryConsumptionInRange(outletId: string, range: DateRange): Promise<ConsumptionLogRow[]>;
  listPurchaseReceiptsInRange(outletId: string, range: DateRange): Promise<PurchaseReceiptRow[]>;
  listWaiterOrdersInRange(outletId: string, range: DateRange): Promise<WaiterOrderRow[]>;
  listWaiterHandoversInRange(outletId: string, range: DateRange): Promise<WaiterHandoverRow[]>;
  listActiveTables(outletId: string): Promise<TableInfoRow[]>;
  listTableUtilizationOrdersInRange(outletId: string, range: DateRange): Promise<TableUtilizationOrderRow[]>;
}

export function computeSalesSummary(
  outletId: string,
  range: DateRange,
  orders: OrderAggregateRow[]
): SalesSummary {
  const completed = orders.filter((order) => order.status === "COMPLETED");
  const orderCount = completed.length;
  const netSalesMinor = completed.reduce((sum, order) => sum + order.grandTotalMinor, 0n);
  const averageOrderValueMinor = orderCount === 0 ? 0n : netSalesMinor / BigInt(orderCount);

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    orderCount,
    netSalesMinor,
    averageOrderValueMinor,
  };
}

export function computeItemPerformance(items: ItemSaleRow[]): ItemPerformanceRow[] {
  const completed = items.filter((item) => item.orderStatus === "COMPLETED");
  const byItem = new Map<string, ItemPerformanceRow>();

  for (const item of completed) {
    const existing = byItem.get(item.menuItemId);
    if (existing) {
      existing.quantitySold += item.quantity;
      existing.netSalesMinor += item.subtotalMinor;
    } else {
      byItem.set(item.menuItemId, {
        menuItemId: item.menuItemId,
        quantitySold: item.quantity,
        netSalesMinor: item.subtotalMinor,
      });
    }
  }

  return Array.from(byItem.values());
}

export async function getSalesSummary(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<SalesSummary> {
  const orders = await repo.listOrdersInRange(outletId, range);
  return computeSalesSummary(outletId, range, orders);
}

export async function getItemPerformance(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<ItemPerformanceRow[]> {
  const items = await repo.listOrderItemsInRange(outletId, range);
  return computeItemPerformance(items);
}

// Only CAPTURED payments count toward totals — REFUNDED/FAILED payments never
// represent settled cash actually received.
export function computePaymentBreakdown(
  outletId: string,
  range: DateRange,
  payments: PaymentAggregateRow[]
): PaymentBreakdown {
  const captured = payments.filter((p) => p.status === "CAPTURED");
  const totalAmountMinor = captured.reduce((sum, p) => sum + p.amountMinor, 0n);

  const byMethod = new Map<string, { amountMinor: bigint; count: number }>();
  for (const p of captured) {
    const existing = byMethod.get(p.method);
    if (existing) {
      existing.amountMinor += p.amountMinor;
      existing.count += 1;
    } else {
      byMethod.set(p.method, { amountMinor: p.amountMinor, count: 1 });
    }
  }

  const totalNumber = Number(totalAmountMinor);
  const methods: PaymentMethodBreakdownRow[] = Array.from(byMethod.entries()).map(([method, agg]) => ({
    method,
    amountMinor: agg.amountMinor,
    count: agg.count,
    percentage: totalNumber === 0 ? 0 : (Number(agg.amountMinor) / totalNumber) * 100,
  }));

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    totalAmountMinor,
    methods,
  };
}

export async function getPaymentBreakdown(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<PaymentBreakdown> {
  const payments = await repo.listPaymentsInRange(outletId, range);
  return computePaymentBreakdown(outletId, range, payments);
}

// Channel breakdown by orderType (DINE_IN/TAKEAWAY/DELIVERY/AGGREGATOR). orderCount
// includes orders of every status; netSalesMinor and successfulOrderCount
// only reflect COMPLETED orders (matches computeSalesSummary formula).
export function computeChannelBreakdown(
  outletId: string,
  range: DateRange,
  orders: ChannelOrderRow[]
): ChannelBreakdown {
  const byType = new Map<string, ChannelBreakdownRow>();

  for (const order of orders) {
    let row = byType.get(order.orderType);
    if (!row) {
      row = {
        orderType: order.orderType,
        orderCount: 0,
        successfulOrderCount: 0,
        cancelledOrderCount: 0,
        netSalesMinor: 0n,
      };
      byType.set(order.orderType, row);
    }
    row.orderCount += 1;
    if (order.status === "COMPLETED") {
      row.successfulOrderCount += 1;
      row.netSalesMinor += order.grandTotalMinor;
    } else if (order.status === "CANCELLED") {
      row.cancelledOrderCount += 1;
    }
  }

  const channels = Array.from(byType.values());
  const totalOrderCount = orders.length;
  const totalSuccessfulOrderCount = channels.reduce((sum, c) => sum + c.successfulOrderCount, 0);
  const totalCancelledOrderCount = channels.reduce((sum, c) => sum + c.cancelledOrderCount, 0);

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    channels,
    totalOrderCount,
    totalSuccessfulOrderCount,
    totalCancelledOrderCount,
  };
}

export async function getChannelBreakdown(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<ChannelBreakdown> {
  const orders = await repo.listChannelOrdersInRange(outletId, range);
  return computeChannelBreakdown(outletId, range, orders);
}

// Table Turnaround Average (T.T.A) — see TableTurnaroundAverage doc comment
// in shared-types/reporting.ts for the formula. Rows with settledAt === null
// (no SETTLED status recorded yet) are excluded from the average.
export function computeTableTurnaroundAverage(
  outletId: string,
  range: DateRange,
  rows: DineInTurnaroundRow[]
): TableTurnaroundAverage {
  const qualifying = rows.filter((r) => r.orderType === "DINE_IN" && r.settledAt !== null);
  const qualifyingOrderCount = qualifying.length;

  const totalMinutes = qualifying.reduce((sum, r) => {
    const minutes = (r.settledAt!.getTime() - r.createdAt.getTime()) / 60000;
    return sum + minutes;
  }, 0);

  const averageMinutes = qualifyingOrderCount === 0 ? 0 : totalMinutes / qualifyingOrderCount;

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    averageMinutes,
    qualifyingOrderCount,
  };
}

export async function getTableTurnaroundAverage(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<TableTurnaroundAverage> {
  const rows = await repo.listDineInTurnaroundRowsInRange(outletId, range);
  return computeTableTurnaroundAverage(outletId, range, rows);
}

// Leakage Report (Phase B) — combines KOT status-history events (CANCELLED/
// MODIFIED/SHIFTED), invoice reprint/waive-off figures, and KOTs with no
// linked invoice into a single anomaly/loss-detection view.
export function computeLeakageReport(
  outletId: string,
  range: DateRange,
  kotEvents: KotLeakageEventRow[],
  invoices: InvoiceLeakageRow[],
  unbilledKots: UnbilledKotRow[]
): LeakageReport {
  let cancelledCount = 0;
  let modifiedCount = 0;
  let shiftedCount = 0;
  const reasonCodeBreakdown: Record<string, number> = {};

  for (const event of kotEvents) {
    if (event.status === "CANCELLED") cancelledCount += 1;
    else if (event.status === "MODIFIED") modifiedCount += 1;
    else if (event.status === "SHIFTED") shiftedCount += 1;

    const key = event.reasonCode ?? "";
    reasonCodeBreakdown[key] = (reasonCodeBreakdown[key] ?? 0) + 1;
  }

  const reprintedInvoices = invoices.filter((inv) => inv.reprintCount > 0);
  const invoiceReprintCount = reprintedInvoices.length;
  const totalReprints = invoices.reduce((sum, inv) => sum + inv.reprintCount, 0);

  const waivedOffInvoices = invoices.filter((inv) => inv.waivedOffMinor > 0n);
  const invoiceWaivedOffCount = waivedOffInvoices.length;
  const totalWaivedOffMinor = invoices.reduce((sum, inv) => sum + inv.waivedOffMinor, 0n);

  const kotsNotBilledCount = unbilledKots.length;
  const estimatedRevenueAtRiskMinor = unbilledKots.reduce((sum, k) => sum + k.orderGrandTotalMinor, 0n);

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    cancelledCount,
    modifiedCount,
    shiftedCount,
    reasonCodeBreakdown,
    invoiceReprintCount,
    totalReprints,
    invoiceWaivedOffCount,
    totalWaivedOffMinor,
    kotsNotBilledCount,
    estimatedRevenueAtRiskMinor,
  };
}

export async function getLeakageReport(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<LeakageReport> {
  const [kotEvents, invoices, unbilledKots] = await Promise.all([
    repo.listKotStatusEventsInRange(outletId, range),
    repo.listInvoiceLeakageInRange(outletId, range),
    repo.listKotsNotBilledInRange(outletId, range),
  ]);
  return computeLeakageReport(outletId, range, kotEvents, invoices, unbilledKots);
}

export function computeTaxBreakdown(
  outletId: string,
  range: DateRange,
  orders: TaxOrderRow[]
): TaxBreakdown {
  const orderCount = orders.length;
  const totalTaxableSalesMinor = orders.reduce((sum, o) => sum + o.subtotalMinor, 0n);
  const totalTaxCollectedMinor = orders.reduce((sum, o) => sum + o.taxTotalMinor, 0n);

  const halfTax = totalTaxCollectedMinor / 2n;
  const otherHalf = totalTaxCollectedMinor - halfTax;

  const cgstCollected = halfTax;
  const sgstCollected = otherHalf;
  const igstCollected = 0n;

  const totalNum = Number(totalTaxCollectedMinor);
  const cgstShare = totalNum > 0 ? (Number(cgstCollected) / totalNum) * 100 : 50;
  const sgstShare = totalNum > 0 ? (Number(sgstCollected) / totalNum) * 100 : 50;

  const components: TaxComponentBreakdown[] = [
    {
      componentName: "CGST",
      ratePercent: 2.5,
      taxableAmountMinor: totalTaxableSalesMinor,
      taxCollectedMinor: cgstCollected,
      percentageShare: cgstShare,
    },
    {
      componentName: "SGST",
      ratePercent: 2.5,
      taxableAmountMinor: totalTaxableSalesMinor,
      taxCollectedMinor: sgstCollected,
      percentageShare: sgstShare,
    },
    {
      componentName: "IGST",
      ratePercent: 5.0,
      taxableAmountMinor: 0n,
      taxCollectedMinor: igstCollected,
      percentageShare: 0,
    },
  ];

  const taxableNum = Number(totalTaxableSalesMinor);
  const effectiveTaxRatePercent = taxableNum > 0 ? (totalNum / taxableNum) * 100 : 5.0;

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    totalTaxableSalesMinor,
    totalTaxCollectedMinor,
    effectiveTaxRatePercent: Number(effectiveTaxRatePercent.toFixed(2)),
    orderCount,
    components,
  };
}

export async function getTaxBreakdown(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<TaxBreakdown> {
  const orders = await repo.listTaxOrdersInRange(outletId, range);
  return computeTaxBreakdown(outletId, range, orders);
}


// Menu Margin / Food Cost Report — builds on computeItemPerformance (net
// sales + quantity per menu item, COMPLETED orders only) and layers per-item
// recipe cost on top. An item with no active recipe on file cannot have a
// real food cost computed, so it is reported with hasRecipe: false and null
// cost/margin fields rather than a misleading 0-cost / 100%-margin row.
export function computeItemMarginReport(
  outletId: string,
  range: DateRange,
  items: ItemSaleRow[],
  recipeCosts: MenuItemRecipeCost[]
): ItemMarginReport {
  const performance = computeItemPerformance(items);
  const costByItem = new Map(recipeCosts.map((c) => [c.menuItemId, c]));

  const rows: ItemMarginRow[] = performance.map((p) => {
    const rc = costByItem.get(p.menuItemId);
    if (!rc || !rc.hasRecipe) {
      return {
        menuItemId: p.menuItemId,
        quantitySold: p.quantitySold,
        netSalesMinor: p.netSalesMinor,
        hasRecipe: false,
        foodCostMinor: null,
        marginMinor: null,
        marginPercent: null,
      };
    }

    const foodCostMinor = rc.costPerUnitMinor * BigInt(p.quantitySold);
    const marginMinor = p.netSalesMinor - foodCostMinor;
    const netSalesNumber = Number(p.netSalesMinor);
    const marginPercent = netSalesNumber === 0 ? 0 : (Number(marginMinor) / netSalesNumber) * 100;

    return {
      menuItemId: p.menuItemId,
      quantitySold: p.quantitySold,
      netSalesMinor: p.netSalesMinor,
      hasRecipe: true,
      foodCostMinor,
      marginMinor,
      marginPercent,
    };
  });

  rows.sort((a, b) => Number(b.netSalesMinor) - Number(a.netSalesMinor));

  const itemsWithRecipe = rows.filter((r) => r.hasRecipe).length;
  const itemsWithoutRecipe = rows.length - itemsWithRecipe;

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    items: rows,
    summary: { itemsWithRecipe, itemsWithoutRecipe },
  };
}

export async function getItemMarginReport(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<ItemMarginReport> {
  const items = await repo.listOrderItemsInRange(outletId, range);
  const menuItemIds = Array.from(new Set(items.map((i) => i.menuItemId)));
  const recipeCosts = await repo.listMenuItemRecipeCosts(outletId, menuItemIds);
  return computeItemMarginReport(outletId, range, items, recipeCosts);
}

// Inventory Consumption vs Purchase (variance/shrinkage) Report — per
// ingredient, total consumed (including shortage and a reasonCode
// breakdown) against total purchased (received qty * unit cost) in range.
// Sorted worst-first: highest recorded shortage, then most negative
// variance (consumed exceeding purchased), so problem ingredients surface
// at the top.
export function computeInventoryVariance(
  outletId: string,
  range: DateRange,
  consumption: ConsumptionLogRow[],
  purchases: PurchaseReceiptRow[]
): InventoryVarianceReport {
  const byIngredient = new Map<string, InventoryVarianceRow>();

  const getRow = (ingredientId: string): InventoryVarianceRow => {
    let row = byIngredient.get(ingredientId);
    if (!row) {
      row = {
        ingredientId,
        consumedQty: 0,
        shortageQty: 0,
        consumedByReasonCode: {},
        purchasedQty: 0,
        purchasedCostMinor: 0n,
        varianceQty: 0,
      };
      byIngredient.set(ingredientId, row);
    }
    return row;
  };

  for (const c of consumption) {
    const row = getRow(c.ingredientId);
    row.consumedQty += c.quantityDeducted;
    row.shortageQty += c.shortage;
    const key = c.reasonCode ?? "";
    row.consumedByReasonCode[key] = (row.consumedByReasonCode[key] ?? 0) + c.quantityDeducted;
  }

  for (const p of purchases) {
    const row = getRow(p.ingredientId);
    row.purchasedQty += p.receivedQty;
    row.purchasedCostMinor += p.receivedCostMinor;
  }

  const ingredients = Array.from(byIngredient.values()).map((row) => ({
    ...row,
    varianceQty: row.purchasedQty - row.consumedQty,
  }));

  ingredients.sort((a, b) => b.shortageQty - a.shortageQty || a.varianceQty - b.varianceQty);

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    ingredients,
  };
}

export async function getInventoryVarianceReport(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<InventoryVarianceReport> {
  const [consumption, purchases] = await Promise.all([
    repo.listInventoryConsumptionInRange(outletId, range),
    repo.listPurchaseReceiptsInRange(outletId, range),
  ]);
  return computeInventoryVariance(outletId, range, consumption, purchases);
}

// Staff/Waiter Performance — see StaffPerformanceRow doc comment in
// shared-types/reporting.ts for field formulas. Waiters with zero orders in
// range are omitted entirely (not a zero-row per every staff member ever).
export function computeStaffPerformance(
  outletId: string,
  range: DateRange,
  orders: WaiterOrderRow[],
  handovers: WaiterHandoverRow[],
  waiterNames: Map<string, string>
): StaffPerformanceReport {
  const byWaiter = new Map<
    string,
    { orderCount: number; netSalesMinor: bigint; coversServed: number }
  >();

  for (const order of orders) {
    let agg = byWaiter.get(order.waiterId);
    if (!agg) {
      agg = { orderCount: 0, netSalesMinor: 0n, coversServed: 0 };
      byWaiter.set(order.waiterId, agg);
    }
    agg.orderCount += 1;
    agg.netSalesMinor += order.grandTotalMinor;
    agg.coversServed += order.covers ?? 0;
  }

  const handoverByWaiter = new Map<
    string,
    { cashTipMinor: bigint; digitalTipMinor: bigint; serviceChargeMinor: bigint; cashVarianceMinor: bigint }
  >();
  for (const h of handovers) {
    let agg = handoverByWaiter.get(h.waiterId);
    if (!agg) {
      agg = { cashTipMinor: 0n, digitalTipMinor: 0n, serviceChargeMinor: 0n, cashVarianceMinor: 0n };
      handoverByWaiter.set(h.waiterId, agg);
    }
    const expectedCashMinor = h.openingFloatMinor + h.cashSalesMinor - h.netTipPayoutMinor;
    agg.cashTipMinor += h.netTipPayoutMinor;
    agg.digitalTipMinor += h.digitalTipsMinor;
    agg.serviceChargeMinor += h.serviceChargeMinor;
    agg.cashVarianceMinor += h.actualCashCountedMinor - expectedCashMinor;
  }

  const staff: StaffPerformanceRow[] = Array.from(byWaiter.entries()).map(([waiterId, agg]) => {
    const handover = handoverByWaiter.get(waiterId);
    return {
      waiterId,
      waiterName: waiterNames.get(waiterId) ?? `Staff (${waiterId.slice(0, 6)})`,
      orderCount: agg.orderCount,
      netSalesMinor: agg.netSalesMinor,
      averageOrderValueMinor: agg.orderCount === 0 ? 0n : agg.netSalesMinor / BigInt(agg.orderCount),
      coversServed: agg.coversServed,
      cashTipMinor: handover?.cashTipMinor ?? 0n,
      digitalTipMinor: handover?.digitalTipMinor ?? 0n,
      serviceChargeMinor: handover?.serviceChargeMinor ?? 0n,
      cashVarianceMinor: handover?.cashVarianceMinor ?? 0n,
    };
  });

  staff.sort((a, b) => (b.netSalesMinor > a.netSalesMinor ? 1 : b.netSalesMinor < a.netSalesMinor ? -1 : 0));

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    staff,
  };
}

export async function getStaffPerformance(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository,
  waiterNames: Map<string, string>
): Promise<StaffPerformanceReport> {
  const [orders, handovers] = await Promise.all([
    repo.listWaiterOrdersInRange(outletId, range),
    repo.listWaiterHandoversInRange(outletId, range),
  ]);
  return computeStaffPerformance(outletId, range, orders, handovers, waiterNames);
}

// Table / Floor Utilization — per-table and per-section breakdown. See
// TableUtilizationRow / TableUtilizationSectionRow doc comments in
// shared-types/reporting.ts for field formulas. Uses the same
// createdAt -> updatedAt window as TableTurnaroundAverage as a proxy for the
// occupied period.
export function computeTableUtilization(
  outletId: string,
  range: DateRange,
  tables: TableInfoRow[],
  orders: TableUtilizationOrderRow[]
): TableUtilizationReport {
  const rangeMinutes = Math.max(0, (range.toDate.getTime() - range.fromDate.getTime()) / 60000);

  const byTable = new Map<
    string,
    { orderCount: number; totalCovers: number; totalRevenueMinor: bigint; totalMinutes: number }
  >();
  const hourlyBySection = new Map<string, number[]>();

  const tableById = new Map(tables.map((t) => [t.tableId, t]));

  for (const order of orders) {
    const table = tableById.get(order.diningTableId);
    if (!table) continue; // table no longer active/known — skip, cannot attribute a section

    let agg = byTable.get(order.diningTableId);
    if (!agg) {
      agg = { orderCount: 0, totalCovers: 0, totalRevenueMinor: 0n, totalMinutes: 0 };
      byTable.set(order.diningTableId, agg);
    }
    const minutes = (order.settledAt.getTime() - order.createdAt.getTime()) / 60000;
    agg.orderCount += 1;
    agg.totalCovers += order.covers ?? 0;
    agg.totalRevenueMinor += order.grandTotalMinor;
    agg.totalMinutes += minutes;

    let hourly = hourlyBySection.get(table.section);
    if (!hourly) {
      hourly = new Array(24).fill(0);
      hourlyBySection.set(table.section, hourly);
    }
    const startHour = order.createdAt.getHours();
    const endHour = order.settledAt.getHours();
    if (endHour >= startHour) {
      for (let h = startHour; h <= endHour; h++) hourly[h] += 1;
    } else {
      // window crosses midnight — mark both tail and head segments
      for (let h = startHour; h <= 23; h++) hourly[h] += 1;
      for (let h = 0; h <= endHour; h++) hourly[h] += 1;
    }
  }

  const tableRows: TableUtilizationRow[] = tables.map((t) => {
    const agg = byTable.get(t.tableId) ?? { orderCount: 0, totalCovers: 0, totalRevenueMinor: 0n, totalMinutes: 0 };
    return {
      tableId: t.tableId,
      tableNumber: t.tableNumber,
      section: t.section,
      orderCount: agg.orderCount,
      totalCovers: agg.totalCovers,
      totalRevenueMinor: agg.totalRevenueMinor,
      averageTurnMinutes: agg.orderCount === 0 ? 0 : agg.totalMinutes / agg.orderCount,
      occupancyRatePercent: rangeMinutes === 0 ? 0 : (agg.totalMinutes / rangeMinutes) * 100,
    };
  });
  tableRows.sort((a, b) => (b.totalRevenueMinor > a.totalRevenueMinor ? 1 : b.totalRevenueMinor < a.totalRevenueMinor ? -1 : 0));

  const sectionAgg = new Map<
    string,
    { tableCount: number; orderCount: number; totalCovers: number; totalRevenueMinor: bigint; totalMinutes: number }
  >();
  for (const row of tableRows) {
    let agg = sectionAgg.get(row.section);
    if (!agg) {
      agg = { tableCount: 0, orderCount: 0, totalCovers: 0, totalRevenueMinor: 0n, totalMinutes: 0 };
      sectionAgg.set(row.section, agg);
    }
    agg.tableCount += 1;
    agg.orderCount += row.orderCount;
    agg.totalCovers += row.totalCovers;
    agg.totalRevenueMinor += row.totalRevenueMinor;
    agg.totalMinutes += row.averageTurnMinutes * row.orderCount;
  }

  const sections: TableUtilizationSectionRow[] = Array.from(sectionAgg.entries())
    .map(([section, agg]) => ({
      section,
      tableCount: agg.tableCount,
      orderCount: agg.orderCount,
      totalCovers: agg.totalCovers,
      totalRevenueMinor: agg.totalRevenueMinor,
      averageTurnMinutes: agg.orderCount === 0 ? 0 : agg.totalMinutes / agg.orderCount,
      occupancyRatePercent:
        rangeMinutes === 0 || agg.tableCount === 0 ? 0 : (agg.totalMinutes / (rangeMinutes * agg.tableCount)) * 100,
      hourlyOccupancy: hourlyBySection.get(section) ?? new Array(24).fill(0),
    }))
    .sort((a, b) => a.section.localeCompare(b.section));

  return {
    outletId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    formulaVersion: KPI_FORMULA_VERSION,
    tables: tableRows,
    sections,
  };
}

export async function getTableUtilization(
  outletId: string,
  range: DateRange,
  repo: ReportingRepository
): Promise<TableUtilizationReport> {
  const [tables, orders] = await Promise.all([
    repo.listActiveTables(outletId),
    repo.listTableUtilizationOrdersInRange(outletId, range),
  ]);
  return computeTableUtilization(outletId, range, tables, orders);
}
