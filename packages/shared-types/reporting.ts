// Contract for services/reporting. DEC-009 (approved, Option D): minimal
// signed KPI set for R1, one shared calculation layer, versioned formula
// catalogue, derived from order-level detail — never pre-aggregated tables
// that could drift from the transactional source of truth.

export interface DateRange {
  fromDate: Date;
  toDate: Date;
}

// Every KPI in this catalogue has a version. When a formula changes, bump
// the version rather than silently changing the number a past report showed.
export const KPI_FORMULA_VERSION = 1;

export interface SalesSummary {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  orderCount: number; // COMPLETED orders only — see formula note in reporting-service.ts
  netSalesMinor: bigint; // grandTotal sum, excludes CANCELLED/FAILED orders
  averageOrderValueMinor: bigint; // netSalesMinor / orderCount, 0 if orderCount is 0
}

export interface ItemPerformanceRow {
  menuItemId: string;
  quantitySold: number;
  netSalesMinor: bigint;
}

export interface PaymentMethodBreakdownRow {
  method: string; // raw Payment.method value, e.g. CASH, CARD, UPI, SPLIT
  amountMinor: bigint; // sum of CAPTURED payment amounts for this method
  count: number; // number of CAPTURED payments for this method
  percentage: number; // share of totalAmountMinor, 0-100, 0 if total is 0
}

export interface PaymentBreakdown {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  totalAmountMinor: bigint; // sum across all CAPTURED payments in range
  methods: PaymentMethodBreakdownRow[];
}

export interface ChannelBreakdownRow {
  orderType: string; // raw Order.orderType value, e.g. DINE_IN, TAKEAWAY, DELIVERY, AGGREGATOR
  orderCount: number; // all orders of this type in range (any status)
  successfulOrderCount: number; // COMPLETED orders of this type
  cancelledOrderCount: number; // CANCELLED orders of this type
  netSalesMinor: bigint; // grandTotal sum of COMPLETED orders of this type
}

export interface ChannelBreakdown {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  channels: ChannelBreakdownRow[];
  totalOrderCount: number;
  totalSuccessfulOrderCount: number;
  totalCancelledOrderCount: number;
}

// Table Turnaround Average (T.T.A) — for DINE_IN orders with a diningTableId,
// the average time in minutes from order creation (Order.createdAt, a proxy
// for seat/order-start) to the order's SETTLED status timestamp (a proxy for
// clear-time), across all qualifying orders in range. Orders with no SETTLED
// status row in OrderStatusHistory are excluded (table never cleared).
export interface TableTurnaroundAverage {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  averageMinutes: number; // 0 if no qualifying orders
  qualifyingOrderCount: number;
}

// Leakage Report — Phase B anomaly/loss-detection tracking of KOT
// cancellations/modifications/station-shifts and bill reprints/waive-offs.
// kotsNotBilledCount/estimatedRevenueAtRiskMinor: KOTs in range whose parent
// order has zero linked Invoice rows — revenue at risk is estimated from the
// parent Order's grandTotal (the accurately-derivable figure via existing
// Prisma relations; a KOT has no price of its own, only its parent order does).
export interface LeakageReport {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  cancelledCount: number;
  modifiedCount: number;
  shiftedCount: number;
  reasonCodeBreakdown: Record<string, number>; // reasonCode -> count, across CANCELLED/MODIFIED/SHIFTED rows ("" for null/missing reasonCode)
  invoiceReprintCount: number; // count of invoices with reprintCount > 0
  totalReprints: number; // sum of reprintCount across all invoices
  invoiceWaivedOffCount: number; // count of invoices with waivedOffMinor > 0
  totalWaivedOffMinor?: bigint;
  kotsNotBilledCount: number;
  estimatedRevenueAtRiskMinor: bigint;
}

export interface TaxComponentBreakdown {
  componentName: string; // e.g. "CGST", "SGST", "IGST"
  ratePercent: number; // e.g. 2.5
  taxableAmountMinor: bigint; // net taxable sales basis
  taxCollectedMinor: bigint; // tax amount in minor units
  percentageShare: number; // percentage of total tax collected (0-100)
}

export interface TaxBreakdown {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  totalTaxableSalesMinor: bigint;
  totalTaxCollectedMinor: bigint;
  effectiveTaxRatePercent: number;
  orderCount: number;
  components: TaxComponentBreakdown[];
}

// Staff/Waiter Performance -- per-waiter order activity (COMPLETED orders only,
// same convention as SalesSummary) joined with WaiterShiftHandover figures
// (tips, service charge, cash reconciliation) summed across the range.
// cashVarianceMinor formula: actualCashCountedMinor - (openingFloatMinor +
// cashSalesMinor - netTipPayoutMinor) i.e. actual counted cash vs. the
// expected till balance after cash sales are added and cash tips paid out
// to the waiter are removed. Positive = over, negative = short.
export interface StaffPerformanceRow {
  waiterId: string;
  waiterName: string;
  orderCount: number; // COMPLETED orders with this waiterId in range
  netSalesMinor: bigint;
  averageOrderValueMinor: bigint; // netSalesMinor / orderCount, 0 if orderCount is 0
  coversServed: number; // sum of Order.covers, 0 for orders with covers null
  cashTipMinor: bigint; // sum of WaiterShiftHandover.netTipPayoutMinor
  digitalTipMinor: bigint; // sum of WaiterShiftHandover.digitalTipsMinor
  serviceChargeMinor: bigint; // sum of WaiterShiftHandover.serviceChargeMinor
  cashVarianceMinor: bigint; // see formula note above, summed across handovers in range
}

export interface StaffPerformanceReport {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  staff: StaffPerformanceRow[]; // waiters with orderCount > 0 only, sorted by netSalesMinor desc
}

// Table / Floor Utilization -- per-table and per-section breakdown, distinct
// from the single-average /table-turnaround report. Occupancy uses the same
// createdAt -> updatedAt (proxy for settled) window as TableTurnaroundAverage,
// for DINE_IN orders with a diningTableId in range.
export interface TableUtilizationRow {
  tableId: string;
  tableNumber: string;
  section: string;
  orderCount: number; // qualifying DINE_IN orders seated at this table in range
  totalCovers: number; // sum of Order.covers, 0 for orders with covers null
  totalRevenueMinor: bigint; // grandTotal sum of qualifying orders in range
  averageTurnMinutes: number; // average createdAt->updatedAt minutes across qualifying orders, 0 if none
  occupancyRatePercent: number; // sum of turn minutes / total range minutes * 100
}

export interface TableUtilizationSectionRow {
  section: string;
  tableCount: number; // distinct active tables in this section
  orderCount: number;
  totalCovers: number;
  totalRevenueMinor: bigint;
  averageTurnMinutes: number;
  occupancyRatePercent: number; // sum of turn minutes across all tables in section / (range minutes * tableCount) * 100
  hourlyOccupancy: number[]; // 24 entries (index = hour-of-day 0-23): count of qualifying orders whose seated window overlaps that hour, across the range
}

export interface TableUtilizationReport {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  tables: TableUtilizationRow[]; // sorted by totalRevenueMinor desc
  sections: TableUtilizationSectionRow[]; // sorted by section name
}


// Menu Margin / Food Cost Report — per-MenuItem gross margin for a date
// range, costed via the item's active recipe (recipes -> recipe_ingredients
// -> ingredients.unit_cost_minor BOM join). Items with no active recipe on
// file cannot have a real cost computed: foodCostMinor/marginMinor/
// marginPercent are null and hasRecipe is false for those rows, rather than
// silently reporting 0 cost / 100% margin.
export interface ItemMarginRow {
  menuItemId: string;
  quantitySold: number;
  netSalesMinor: bigint;
  hasRecipe: boolean;
  foodCostMinor: bigint | null; // null when hasRecipe is false
  marginMinor: bigint | null; // netSalesMinor - foodCostMinor, null when hasRecipe is false
  marginPercent: number | null; // marginMinor / netSalesMinor * 100, null when hasRecipe is false
}

export interface ItemMarginSummary {
  itemsWithRecipe: number;
  itemsWithoutRecipe: number;
}

export interface ItemMarginReport {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  items: ItemMarginRow[]; // sorted by netSalesMinor descending
  summary: ItemMarginSummary;
}

// Inventory Consumption vs Purchase (variance/shrinkage) Report — per
// ingredient, total quantity consumed (InventoryConsumptionLog, including
// any recorded shortage and a breakdown by reasonCode) against total
// quantity received via purchase orders in the same range, surfacing
// waste/shrinkage. varianceQty = purchasedQty - consumedQty; a large
// negative variance means more was consumed than was purchased in range
// (drawing down existing stock or unaccounted loss), and shortageQty > 0
// flags recorded stock-outs during consumption.
export interface InventoryVarianceRow {
  ingredientId: string;
  ingredientName?: string; // enriched by the route layer
  unitOfMeasure?: string; // enriched by the route layer
  consumedQty: number;
  shortageQty: number;
  consumedByReasonCode: Record<string, number>; // reasonCode -> quantity consumed ("" for missing reasonCode)
  purchasedQty: number;
  purchasedCostMinor: bigint;
  varianceQty: number; // purchasedQty - consumedQty
}

export interface InventoryVarianceReport {
  outletId: string;
  fromDate: Date;
  toDate: Date;
  formulaVersion: number;
  ingredients: InventoryVarianceRow[]; // sorted by shortageQty desc, then varianceQty asc — worst first
}
