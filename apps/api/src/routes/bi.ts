import { Router } from "express";
import { prisma } from "../prisma";
import {
  computeTaxBreakdown,
  computeDiscountVoidAnalysis,
  type TaxOrderRow,
} from "@kapmeta/reporting";
import {
  requireAuth,
  requirePermission,
  checkPermissionDirect,
  type AuthedRequest,
} from "../middleware/require-auth";

// ---------------------------------------------------------------------------
// BI — generic dimensional query engine over the real schema.
//
// WHY THIS EXISTS
// ---------------
// apps/api/src/routes/reporting.ts ships 17 fixed reports. "A granular report
// of every thing in the app" is not 90 more bespoke endpoints — it is one
// engine over a whitelisted catalog of real datasets. Three routes:
//
//   GET /bi/catalog     what can be queried, in machine-readable form
//   GET /bi/query       grouped aggregation over one dataset
//   GET /bi/drilldown   the individual rows behind one aggregated cell
//
// GROUND RULES (all enforced below, all learned the hard way in this repo)
// ----------------------------------------------------------------------
//  * Every column named in DATASETS is a real column in kapmeta/schema.prisma
//    or in a db/migrations/*.sql table (expense_transactions,
//    management_lists, management_activity_logs). Nothing is invented. Where a
//    requested figure has no backing table or column, the dataset carries a
//    `note` saying so and the measure is simply absent — never faked
//    (AGENTS.md Rule 1).
//  * SQL is assembled ONLY from these code-level constants. User input never
//    reaches the SQL text: dimension/measure/sort keys are looked up in the
//    catalog and rejected with 400 if unknown, GROUP BY/ORDER BY use ordinal
//    positions, and every filter/date/outlet value is a bound parameter.
//  * Every query is outlet-scoped through req.auth.outletId. There is no way
//    to ask for another outlet's rows.
//  * The live database uses TEXT for every id/FK (sole exception:
//    `integrations`), so joins compare text to text and there is not a single
//    ::uuid cast in this file.
//  * Money is BigInt minor units. Every money aggregate is cast ::bigint in
//    SQL (so Prisma hands back a BigInt, not a Decimal) and serialized to a
//    STRING in JSON. No float ever touches a money value; averages of money
//    use integer division, matching computeSalesSummary().
//  * Calculations that already exist are reused, not re-implemented: the
//    `tax` dataset calls computeTaxBreakdown() and `discounts_voids` calls
//    computeDiscountVoidAnalysis() — the same functions
//    /reporting/tax-breakdown and /reporting/discount-void-analysis use.
//
// TIME GRAINS ARE UTC. date_trunc/EXTRACT are applied to
// `<column> AT TIME ZONE 'UTC'`, matching the UTC day keys the existing
// /reporting/* endpoints produce with Date#toISOString().slice(0, 10). Outlet
// local time (outlets.timezone) is deliberately NOT used here, because that
// would make /bi numbers disagree with the reports they sit next to.
// ---------------------------------------------------------------------------

const router = Router();

type MeasureUnit = "minor" | "count" | "quantity" | "seconds" | "percent";

interface BiDimension {
  key: string;
  label: string;
  /** The real, qualified DB column this dimension reads. Documentation only. */
  sqlColumn: string;
  /** SQL expression used in SELECT/GROUP BY. Constant — never user input. */
  expr: string;
  /** SQL expression used in WHERE for filters, when it differs from `expr`. */
  filterExpr?: string;
}

interface BiMeasure {
  key: string;
  label: string;
  unit: MeasureUnit;
  /** Aggregate SQL expression. Constant — never user input. */
  expr: string;
  /** "string" for BigInt minor-unit money, "number" for counts/rates/durations. */
  serialize: "string" | "number";
}

type GrainKey = "hour" | "day" | "week" | "month";

interface BiDataset {
  domain: string;
  key: string;
  label: string;
  description: string;
  sourceTables: string[];
  /** FROM + JOIN clause. Constant. */
  from: string;
  /** Column carrying the outlet scope. */
  outletExpr: string;
  /** Column the from/to range filters against. */
  dateExpr: string;
  /** Fixed, non-negotiable WHERE fragment (e.g. "o.customer_id IS NOT NULL"). */
  baseWhere?: string;
  dimensions: BiDimension[];
  measures: BiMeasure[];
  defaultGrain: GrainKey | null;
  /** grain -> dimension key, for resolving the `period` pseudo-dimension. */
  grainDimensions?: Partial<Record<GrainKey, string>>;
  defaultGroupBy: string[];
  /** Applied unless the caller passes a filter for the same dimension key. */
  defaultFilters?: Record<string, string | string[]>;
  requiresPermission: string;
  note?: string;
  /** SELECT list for /bi/drilldown. Constant. */
  drilldownSelect: string;
  /** ORDER BY for /bi/drilldown. Constant. */
  drilldownOrderBy: string;
  /** Delegated (non-SQL) aggregation, so an existing calculation is reused. */
  handler?: "tax" | "discounts_voids";
}

// --- shared dimension builders (all reference a real timestamptz column) ----

function timeDims(column: string, sqlColumn: string): BiDimension[] {
  return [
    { key: "day", label: "Day", sqlColumn, expr: `date_trunc('day', ${column} AT TIME ZONE 'UTC')` },
    { key: "week", label: "Week", sqlColumn, expr: `date_trunc('week', ${column} AT TIME ZONE 'UTC')` },
    { key: "month", label: "Month", sqlColumn, expr: `date_trunc('month', ${column} AT TIME ZONE 'UTC')` },
    { key: "hour", label: "Hour", sqlColumn, expr: `date_trunc('hour', ${column} AT TIME ZONE 'UTC')` },
    { key: "hourOfDay", label: "Hour of day (0-23)", sqlColumn, expr: `EXTRACT(HOUR FROM ${column} AT TIME ZONE 'UTC')::int` },
    { key: "dayOfWeek", label: "Day of week", sqlColumn, expr: `to_char(${column} AT TIME ZONE 'UTC', 'Dy')` },
  ];
}

const ALL_GRAINS: Partial<Record<GrainKey, string>> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
};

/** Money sum -> BigInt. Never float. */
const money = (expr: string) => `COALESCE(SUM(${expr}), 0)::bigint`;
/** Integer division for money averages — same semantics as computeSalesSummary. */
const moneyAvg = (expr: string) => `(COALESCE(SUM(${expr}), 0)::bigint / GREATEST(COUNT(*), 1)::bigint)`;

// ---------------------------------------------------------------------------
// THE CATALOG
//
// One entry per domain that has a REAL backing table. Domains asked for but
// omitted, and why, are listed at the bottom of this block.
// ---------------------------------------------------------------------------

const DATASETS: BiDataset[] = [
  // -- sales -----------------------------------------------------------------
  {
    domain: "sales",
    key: "sales",
    label: "Sales (orders)",
    description:
      "Order-level revenue, discount, tax, service charge and tip. Defaults to COMPLETED orders only, matching computeSalesSummary()/GET /reporting/sales-summary; pass filters={\"status\":...} to widen or change that.",
    sourceTables: ["orders", "dining_tables", "users"],
    from: `FROM orders o
      LEFT JOIN dining_tables dt ON dt.id = o.dining_table_id
      LEFT JOIN users u ON u.id = o.waiter_id`,
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
      { key: "status", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
      { key: "outlet", label: "Outlet", sqlColumn: "orders.outlet_id", expr: "o.outlet_id" },
      { key: "terminal", label: "Terminal", sqlColumn: "orders.terminal_number", expr: "o.terminal_number" },
      { key: "advanceStatus", label: "Advance status", sqlColumn: "orders.advance_status", expr: "o.advance_status" },
      { key: "splitMode", label: "Split mode", sqlColumn: "orders.split_mode", expr: "o.split_mode" },
      { key: "waiterId", label: "Waiter (id)", sqlColumn: "orders.waiter_id", expr: "o.waiter_id" },
      {
        key: "waiterName",
        label: "Waiter",
        sqlColumn: "users.first_name",
        expr: "COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), o.waiter_id)",
      },
      { key: "tableId", label: "Dining table (id)", sqlColumn: "orders.dining_table_id", expr: "o.dining_table_id" },
      { key: "tableNumber", label: "Table number", sqlColumn: "dining_tables.table_number", expr: "dt.table_number" },
      { key: "section", label: "Section", sqlColumn: "dining_tables.section", expr: "dt.section" },
      { key: "customerId", label: "Customer (id)", sqlColumn: "orders.customer_id", expr: "o.customer_id" },
    ],
    measures: [
      { key: "orderCount", label: "Orders", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "revenueMinor", label: "Revenue", unit: "minor", expr: money("o.grand_total"), serialize: "string" },
      { key: "subtotalMinor", label: "Subtotal", unit: "minor", expr: money("o.subtotal"), serialize: "string" },
      { key: "discountMinor", label: "Discount", unit: "minor", expr: money("COALESCE(o.discount_total, 0)"), serialize: "string" },
      { key: "taxMinor", label: "Tax", unit: "minor", expr: money("COALESCE(o.tax_total, 0)"), serialize: "string" },
      { key: "serviceChargeMinor", label: "Service charge", unit: "minor", expr: money("o.service_charge_total"), serialize: "string" },
      { key: "tipMinor", label: "Tips", unit: "minor", expr: money("o.tip_total"), serialize: "string" },
      { key: "roundOffMinor", label: "Round off", unit: "minor", expr: money("o.round_off_minor"), serialize: "string" },
      { key: "depositMinor", label: "Advance/deposit", unit: "minor", expr: money("COALESCE(o.deposit_minor, 0)"), serialize: "string" },
      { key: "avgOrderValueMinor", label: "Average order value", unit: "minor", expr: moneyAvg("o.grand_total"), serialize: "string" },
      { key: "covers", label: "Covers", unit: "count", expr: money("COALESCE(o.covers, 0)"), serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["day"],
    defaultFilters: { status: "COMPLETED" },
    requiresPermission: "report.read",
    drilldownSelect: `o.id, o.order_number, o.created_at, o.settled_at, o.status, o.order_type, o.channel,
      o.terminal_number, o.subtotal, o.discount_total, o.tax_total, o.service_charge_total, o.tip_total,
      o.round_off_minor, o.grand_total, o.covers, o.waiter_id, o.customer_id, o.dining_table_id,
      dt.table_number, dt.section`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- items -----------------------------------------------------------------
  {
    domain: "items",
    key: "items",
    label: "Item sales (order lines)",
    description:
      "Per-order-line quantity and net sales, plus void counts. quantitySold/netSalesMinor sum every line of a COMPLETED order including voided ones, exactly as computeItemPerformance()/GET /reporting/item-performance does; the void* measures let you net them out.",
    sourceTables: ["order_items", "orders", "menu_items", "menu_categories"],
    from: `FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN menu_categories mc ON mc.id = mi.category_id`,
    outletExpr: "oi.outlet_id",
    dateExpr: "o.created_at",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "menuItemId", label: "Menu item (id)", sqlColumn: "order_items.menu_item_id", expr: "oi.menu_item_id" },
      { key: "itemName", label: "Menu item", sqlColumn: "menu_items.name", expr: "mi.name" },
      { key: "categoryId", label: "Category (id)", sqlColumn: "menu_items.category_id", expr: "mi.category_id" },
      { key: "categoryName", label: "Category", sqlColumn: "menu_categories.name", expr: "mc.name" },
      { key: "isVeg", label: "Vegetarian", sqlColumn: "menu_items.is_veg", expr: "mi.is_veg" },
      { key: "stationId", label: "Station (id)", sqlColumn: "menu_items.station_id", expr: "mi.station_id" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
      { key: "orderStatus", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
      { key: "course", label: "Course", sqlColumn: "order_items.course", expr: "oi.course" },
      { key: "isVoided", label: "Voided", sqlColumn: "order_items.is_voided", expr: "oi.is_voided" },
      { key: "voidReason", label: "Void reason", sqlColumn: "order_items.void_reason", expr: "oi.void_reason" },
      { key: "voidedBy", label: "Voided by", sqlColumn: "order_items.voided_by", expr: "oi.voided_by" },
    ],
    measures: [
      { key: "quantitySold", label: "Quantity sold", unit: "quantity", expr: "COALESCE(SUM(oi.quantity), 0)::bigint", serialize: "number" },
      { key: "netSalesMinor", label: "Net sales", unit: "minor", expr: money("oi.subtotal"), serialize: "string" },
      { key: "lineCount", label: "Order lines", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "avgLineValueMinor", label: "Average line value", unit: "minor", expr: moneyAvg("oi.subtotal"), serialize: "string" },
      { key: "voidCount", label: "Voided lines", unit: "count", expr: "(COUNT(*) FILTER (WHERE oi.is_voided))::bigint", serialize: "number" },
      { key: "voidedQuantity", label: "Voided quantity", unit: "quantity", expr: "COALESCE(SUM(oi.quantity) FILTER (WHERE oi.is_voided), 0)::bigint", serialize: "number" },
      { key: "voidValueMinor", label: "Voided value", unit: "minor", expr: "COALESCE(SUM(oi.subtotal) FILTER (WHERE oi.is_voided), 0)::bigint", serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["menuItemId"],
    defaultFilters: { orderStatus: "COMPLETED" },
    requiresPermission: "report.read",
    note:
      "order_items has no discount column — discounts are recorded only at order level (orders.discount_total). Item-level discount is therefore NOT available here and is not approximated; use the `sales` dataset for real discount figures.",
    drilldownSelect: `oi.id, oi.order_id, o.order_number, o.created_at, oi.menu_item_id, mi.name AS item_name,
      mc.name AS category_name, oi.quantity, oi.unit_price, oi.subtotal, oi.course, oi.seat_number,
      oi.is_voided, oi.void_reason, oi.voided_by, o.order_type, o.channel, o.status`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- payments --------------------------------------------------------------
  {
    domain: "payments",
    key: "payments",
    label: "Payments",
    description:
      "Captured payment amounts and counts by method/status/time. Defaults to status=CAPTURED, matching computePaymentBreakdown()/GET /reporting/payment-breakdown (REFUNDED/FAILED never count as cash received).",
    sourceTables: ["payments", "orders"],
    from: `FROM payments p
      LEFT JOIN orders o ON o.id = p.order_id`,
    outletExpr: "p.outlet_id",
    dateExpr: "p.created_at",
    dimensions: [
      ...timeDims("p.created_at", "payments.created_at"),
      { key: "method", label: "Payment method", sqlColumn: "payments.method", expr: "p.method" },
      { key: "status", label: "Payment status", sqlColumn: "payments.status", expr: "p.status" },
      { key: "seatNumber", label: "Seat number", sqlColumn: "payments.seat_number", expr: "p.seat_number" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
    ],
    measures: [
      { key: "paymentCount", label: "Payments", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "amountMinor", label: "Amount", unit: "minor", expr: money("p.amount"), serialize: "string" },
      { key: "avgPaymentMinor", label: "Average payment", unit: "minor", expr: moneyAvg("p.amount"), serialize: "string" },
      { key: "orderCount", label: "Distinct orders", unit: "count", expr: "COUNT(DISTINCT p.order_id)::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["method"],
    defaultFilters: { status: "CAPTURED" },
    requiresPermission: "report.read",
    drilldownSelect: `p.id, p.order_id, o.order_number, p.created_at, p.method, p.status, p.amount,
      p.transaction_id, p.seat_number, o.order_type, o.channel, o.grand_total`,
    drilldownOrderBy: "p.created_at DESC",
  },

  // -- tax (delegated to computeTaxBreakdown) --------------------------------
  {
    domain: "tax",
    key: "tax",
    label: "Tax breakdown",
    description:
      "Taxable sales and tax collected, split into components by the SAME computeTaxBreakdown() function that backs GET /reporting/tax-breakdown — the rows are that report, re-run once per requested bucket. COMPLETED orders only.",
    sourceTables: ["orders"],
    from: "FROM orders o",
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    baseWhere: "o.status = 'COMPLETED'",
    dimensions: [
      { key: "day", label: "Day", sqlColumn: "orders.created_at", expr: "date_trunc('day', o.created_at AT TIME ZONE 'UTC')" },
      { key: "week", label: "Week", sqlColumn: "orders.created_at", expr: "date_trunc('week', o.created_at AT TIME ZONE 'UTC')" },
      { key: "month", label: "Month", sqlColumn: "orders.created_at", expr: "date_trunc('month', o.created_at AT TIME ZONE 'UTC')" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
    ],
    measures: [
      { key: "orderCount", label: "Orders", unit: "count", expr: "", serialize: "number" },
      { key: "taxableSalesMinor", label: "Taxable sales", unit: "minor", expr: "", serialize: "string" },
      { key: "taxCollectedMinor", label: "Tax collected", unit: "minor", expr: "", serialize: "string" },
      { key: "cgstMinor", label: "CGST", unit: "minor", expr: "", serialize: "string" },
      { key: "sgstMinor", label: "SGST", unit: "minor", expr: "", serialize: "string" },
      { key: "igstMinor", label: "IGST", unit: "minor", expr: "", serialize: "string" },
      { key: "effectiveTaxRatePercent", label: "Effective tax rate", unit: "percent", expr: "", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: { day: "day", week: "week", month: "month" },
    defaultGroupBy: ["day"],
    requiresPermission: "report.read",
    handler: "tax",
    note:
      "The schema stores tax only as an order-level orders.tax_total; there is no per-rate tax ledger and no per-line tax column, so a true 'tax by GST rate' breakdown cannot be produced. The CGST/SGST/IGST split is whatever computeTaxBreakdown() defines (currently an even CGST/SGST split of the collected total, IGST 0) — this dataset does not re-derive it. Filters and non-time grouping other than orderType are not supported by the delegated handler.",
    drilldownSelect: `o.id, o.order_number, o.created_at, o.order_type, o.channel, o.subtotal, o.tax_total, o.grand_total`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- discounts & voids (delegated to computeDiscountVoidAnalysis) ----------
  {
    domain: "discounts_voids",
    key: "discounts_voids",
    label: "Discounts & voids",
    description:
      "Voided order lines and discounted orders, produced by the SAME computeDiscountVoidAnalysis() function that backs GET /reporting/discount-void-analysis. groupBy voidReason or voidedBy returns the void side; groupBy day returns both sides per day.",
    sourceTables: ["order_items", "orders"],
    from: `FROM order_items oi
      JOIN orders o ON o.id = oi.order_id`,
    outletExpr: "oi.outlet_id",
    dateExpr: "o.created_at",
    baseWhere: "(oi.is_voided = TRUE OR COALESCE(o.discount_total, 0) > 0)",
    dimensions: [
      { key: "day", label: "Day", sqlColumn: "orders.created_at", expr: "date_trunc('day', o.created_at AT TIME ZONE 'UTC')" },
      { key: "voidReason", label: "Void reason", sqlColumn: "order_items.void_reason", expr: "oi.void_reason" },
      { key: "voidedBy", label: "Voided by", sqlColumn: "order_items.voided_by", expr: "oi.voided_by" },
    ],
    measures: [
      { key: "voidCount", label: "Voided lines", unit: "count", expr: "", serialize: "number" },
      { key: "voidedQuantity", label: "Voided quantity", unit: "quantity", expr: "", serialize: "number" },
      { key: "voidValueMinor", label: "Voided value", unit: "minor", expr: "", serialize: "string" },
      { key: "discountOrderCount", label: "Discounted orders", unit: "count", expr: "", serialize: "number" },
      { key: "discountMinor", label: "Discount given", unit: "minor", expr: "", serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: { day: "day" },
    defaultGroupBy: ["day"],
    requiresPermission: "report.financial.read",
    handler: "discounts_voids",
    note:
      "There is no Discount entity and no discount reason column anywhere in the schema — orders stores a single discount_total per order — so discounts cannot be broken down by reason or by the staff member who applied them. Voids can (order_items.void_reason / voided_by). Grouping by voidReason or voidedBy therefore returns NULL for the two discount* measures, and grouping by day returns all five.",
    drilldownSelect: `oi.id, oi.order_id, o.order_number, o.created_at, oi.menu_item_id, oi.quantity,
      oi.unit_price, oi.subtotal, oi.is_voided, oi.void_reason, oi.voided_by,
      o.discount_total, o.grand_total, o.status`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- kitchen ---------------------------------------------------------------
  {
    domain: "kitchen",
    key: "kitchen",
    label: "Kitchen (KOT tickets)",
    description:
      "KOT ticket throughput and prep duration by station, status and hour. Prep duration is kot_tickets.served_at - kot_tickets.created_at and only counts tickets that actually reached served_at.",
    sourceTables: ["kot_tickets", "kot_items", "stations", "orders"],
    from: `FROM kot_tickets kt
      LEFT JOIN stations st ON st.id = kt.station_id
      LEFT JOIN orders o ON o.id = kt.order_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS line_count, COALESCE(SUM(ki.quantity), 0)::bigint AS qty
        FROM kot_items ki WHERE ki.kot_ticket_id = kt.id
      ) kiq ON TRUE`,
    outletExpr: "kt.outlet_id",
    dateExpr: "kt.created_at",
    dimensions: [
      ...timeDims("kt.created_at", "kot_tickets.created_at"),
      { key: "status", label: "Ticket status", sqlColumn: "kot_tickets.status", expr: "kt.status" },
      { key: "stationId", label: "Station (id)", sqlColumn: "kot_tickets.station_id", expr: "kt.station_id" },
      { key: "stationName", label: "Station", sqlColumn: "stations.name", expr: "st.name" },
      { key: "billPrinted", label: "Bill printed", sqlColumn: "kot_tickets.bill_printed_at", expr: "(kt.bill_printed_at IS NOT NULL)" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
    ],
    measures: [
      { key: "ticketCount", label: "KOT tickets", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "servedTicketCount", label: "Served tickets", unit: "count", expr: "(COUNT(*) FILTER (WHERE kt.served_at IS NOT NULL))::bigint", serialize: "number" },
      { key: "cancelledTicketCount", label: "Cancelled tickets", unit: "count", expr: "(COUNT(*) FILTER (WHERE kt.status = 'CANCELLED'))::bigint", serialize: "number" },
      { key: "kotLineCount", label: "KOT lines", unit: "count", expr: "COALESCE(SUM(kiq.line_count), 0)::bigint", serialize: "number" },
      { key: "kotItemQuantity", label: "KOT item quantity", unit: "quantity", expr: "COALESCE(SUM(kiq.qty), 0)::bigint", serialize: "number" },
      {
        key: "avgPrepSeconds",
        label: "Average prep time",
        unit: "seconds",
        expr: "ROUND(AVG(EXTRACT(EPOCH FROM (kt.served_at - kt.created_at))) FILTER (WHERE kt.served_at IS NOT NULL))::bigint",
        serialize: "number",
      },
      {
        key: "maxPrepSeconds",
        label: "Longest prep time",
        unit: "seconds",
        expr: "ROUND(MAX(EXTRACT(EPOCH FROM (kt.served_at - kt.created_at))) FILTER (WHERE kt.served_at IS NOT NULL))::bigint",
        serialize: "number",
      },
      { key: "billPrintedCount", label: "Used in bill", unit: "count", expr: "(COUNT(*) FILTER (WHERE kt.bill_printed_at IS NOT NULL))::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["stationName"],
    requiresPermission: "report.read",
    note:
      "Canonical kot_tickets.status values are QUEUED / PREPARING / READY / SERVED / CANCELLED (legacy aliases KOT_CREATED, PENDING, IN_PREPARATION, COOKING are still tolerated on read elsewhere and will appear as their own rows if present in the data). There is no per-item prep timestamp on kot_items other than served_at, so per-item prep duration is not offered.",
    drilldownSelect: `kt.id, kt.ticket_number, kt.order_id, o.order_number, kt.station_id, st.name AS station_name,
      kt.status, kt.created_at, kt.served_at, kt.bill_printed_at, kiq.line_count, kiq.qty AS item_quantity,
      o.order_type, o.channel`,
    drilldownOrderBy: "kt.created_at DESC",
  },

  // -- tables ----------------------------------------------------------------
  {
    domain: "tables",
    key: "tables",
    label: "Dining tables",
    description:
      "Per-table order counts, covers, revenue and turnaround. Defaults to DINE_IN orders. Turnaround uses orders.updated_at as the settled proxy — the SAME proxy PrismaReportingRepository uses for GET /reporting/table-turnaround and /reporting/table-utilization — so the numbers agree with those reports.",
    sourceTables: ["orders", "dining_tables"],
    from: `FROM orders o
      JOIN dining_tables dt ON dt.id = o.dining_table_id`,
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "tableId", label: "Table (id)", sqlColumn: "orders.dining_table_id", expr: "o.dining_table_id" },
      { key: "tableNumber", label: "Table number", sqlColumn: "dining_tables.table_number", expr: "dt.table_number" },
      { key: "section", label: "Section", sqlColumn: "dining_tables.section", expr: "dt.section" },
      { key: "capacity", label: "Capacity", sqlColumn: "dining_tables.capacity", expr: "dt.capacity" },
      { key: "isAirConditioned", label: "Air conditioned", sqlColumn: "dining_tables.is_air_conditioned", expr: "dt.is_air_conditioned" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "status", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
      { key: "waiterId", label: "Waiter (id)", sqlColumn: "orders.waiter_id", expr: "o.waiter_id" },
    ],
    measures: [
      { key: "orderCount", label: "Orders", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "revenueMinor", label: "Revenue", unit: "minor", expr: money("o.grand_total"), serialize: "string" },
      { key: "avgOrderValueMinor", label: "Average order value", unit: "minor", expr: moneyAvg("o.grand_total"), serialize: "string" },
      { key: "covers", label: "Covers", unit: "count", expr: money("COALESCE(o.covers, 0)"), serialize: "number" },
      {
        key: "avgTurnaroundSeconds",
        label: "Average turnaround",
        unit: "seconds",
        expr: "ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))))::bigint",
        serialize: "number",
      },
      {
        key: "occupiedSeconds",
        label: "Total occupied time",
        unit: "seconds",
        expr: "ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))), 0))::bigint",
        serialize: "number",
      },
      { key: "settledOrderCount", label: "Orders with settled_at", unit: "count", expr: "(COUNT(*) FILTER (WHERE o.settled_at IS NOT NULL))::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["tableNumber"],
    defaultFilters: { orderType: "DINE_IN" },
    requiresPermission: "report.read",
    note:
      "orders.settled_at is a real column but is only populated for some orders, which is why the existing reports use updated_at as the settled proxy and why this dataset does the same. settledOrderCount tells you how much of the range actually has a real settled_at, so you can judge the proxy.",
    drilldownSelect: `o.id, o.order_number, o.created_at, o.updated_at, o.settled_at, o.status, o.order_type,
      o.dining_table_id, dt.table_number, dt.section, dt.capacity, o.covers, o.grand_total, o.waiter_id`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- staff -----------------------------------------------------------------
  {
    domain: "staff",
    key: "staff",
    label: "Staff / waiters",
    description:
      "Orders handled, revenue, tips, service charge, discount and voided lines per waiter. Defaults to COMPLETED orders, matching GET /reporting/staff-performance.",
    sourceTables: ["orders", "users", "order_items"],
    from: `FROM orders o
      LEFT JOIN users u ON u.id = o.waiter_id
      LEFT JOIN LATERAL (
        SELECT (COUNT(*) FILTER (WHERE oi.is_voided))::bigint AS void_lines,
               COALESCE(SUM(oi.subtotal) FILTER (WHERE oi.is_voided), 0)::bigint AS void_value
        FROM order_items oi WHERE oi.order_id = o.id
      ) v ON TRUE`,
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "waiterId", label: "Waiter (id)", sqlColumn: "orders.waiter_id", expr: "o.waiter_id" },
      {
        key: "waiterName",
        label: "Waiter",
        sqlColumn: "users.first_name",
        expr: "COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), o.waiter_id)",
      },
      { key: "userCode", label: "User code", sqlColumn: "users.user_code", expr: "u.user_code" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
      { key: "status", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
      { key: "terminal", label: "Terminal", sqlColumn: "orders.terminal_number", expr: "o.terminal_number" },
    ],
    measures: [
      { key: "orderCount", label: "Orders handled", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "revenueMinor", label: "Revenue", unit: "minor", expr: money("o.grand_total"), serialize: "string" },
      { key: "avgOrderValueMinor", label: "Average order value", unit: "minor", expr: moneyAvg("o.grand_total"), serialize: "string" },
      { key: "covers", label: "Covers served", unit: "count", expr: money("COALESCE(o.covers, 0)"), serialize: "number" },
      { key: "discountMinor", label: "Discount on their orders", unit: "minor", expr: money("COALESCE(o.discount_total, 0)"), serialize: "string" },
      { key: "tipMinor", label: "Tips", unit: "minor", expr: money("o.tip_total"), serialize: "string" },
      { key: "serviceChargeMinor", label: "Service charge", unit: "minor", expr: money("o.service_charge_total"), serialize: "string" },
      { key: "voidLineCount", label: "Voided lines on their orders", unit: "count", expr: "COALESCE(SUM(v.void_lines), 0)::bigint", serialize: "number" },
      { key: "voidValueMinor", label: "Voided value on their orders", unit: "minor", expr: "COALESCE(SUM(v.void_value), 0)::bigint", serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["waiterName"],
    defaultFilters: { status: "COMPLETED" },
    requiresPermission: "report.financial.read",
    note:
      "voidLineCount/voidValueMinor are attributed to the order's waiter (orders.waiter_id), NOT to whoever actually pressed void — order_items.voided_by records that, at a different grain. For voids by the acting staff member use dataset=discounts_voids with groupBy=voidedBy. Tip/service-charge/cash-variance reconciliation against waiter_shift_handovers is not duplicated here; GET /reporting/staff-performance owns that calculation.",
    drilldownSelect: `o.id, o.order_number, o.created_at, o.status, o.order_type, o.channel, o.waiter_id,
      u.first_name, u.last_name, o.covers, o.subtotal, o.discount_total, o.service_charge_total,
      o.tip_total, o.grand_total, v.void_lines, v.void_value`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- customers -------------------------------------------------------------
  {
    domain: "customers",
    key: "customers",
    label: "Customers",
    description:
      "Spend, order frequency and new-vs-repeat split for orders that carry a customer. COMPLETED orders with a non-null customer_id only, matching GET /reporting/customer-insights.",
    sourceTables: ["orders", "customers", "loyalty_accounts"],
    from: `FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN loyalty_accounts la ON la.customer_id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT MIN(o2.created_at) AS first_order_at
        FROM orders o2
        WHERE o2.outlet_id = o.outlet_id
          AND o2.customer_id = o.customer_id
          AND o2.status = 'COMPLETED'
      ) fo ON TRUE`,
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    baseWhere: "o.customer_id IS NOT NULL",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "customerId", label: "Customer (id)", sqlColumn: "orders.customer_id", expr: "o.customer_id" },
      {
        key: "customerName",
        label: "Customer",
        sqlColumn: "customers.name",
        expr: "COALESCE(NULLIF(c.name, ''), NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), c.phone)",
      },
      { key: "customerPhone", label: "Phone", sqlColumn: "customers.phone", expr: "c.phone" },
      { key: "loyaltyTier", label: "Loyalty tier", sqlColumn: "loyalty_accounts.tier", expr: "la.tier" },
      { key: "consentMarketing", label: "Marketing consent", sqlColumn: "customers.consent_marketing", expr: "c.consent_marketing" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
      { key: "status", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
    ],
    measures: [
      { key: "orderCount", label: "Orders", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "uniqueCustomers", label: "Unique customers", unit: "count", expr: "COUNT(DISTINCT o.customer_id)::bigint", serialize: "number" },
      { key: "spendMinor", label: "Spend", unit: "minor", expr: money("o.grand_total"), serialize: "string" },
      { key: "avgOrderValueMinor", label: "Average order value", unit: "minor", expr: moneyAvg("o.grand_total"), serialize: "string" },
      { key: "discountMinor", label: "Discount", unit: "minor", expr: money("COALESCE(o.discount_total, 0)"), serialize: "string" },
      { key: "firstTimeOrders", label: "First-time orders", unit: "count", expr: "(COUNT(*) FILTER (WHERE fo.first_order_at = o.created_at))::bigint", serialize: "number" },
      { key: "repeatOrders", label: "Repeat orders", unit: "count", expr: "(COUNT(*) FILTER (WHERE fo.first_order_at < o.created_at))::bigint", serialize: "number" },
      {
        key: "ordersPerCustomer",
        label: "Orders per customer",
        unit: "count",
        expr: "ROUND(COUNT(*)::numeric / GREATEST(COUNT(DISTINCT o.customer_id), 1), 2)::double precision",
        serialize: "number",
      },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["customerId"],
    defaultFilters: { status: "COMPLETED" },
    requiresPermission: "report.read",
    note:
      "firstTimeOrders/repeatOrders compare each order against that customer's earliest COMPLETED order in the SAME outlet, over all time — not just the selected range — so a customer whose first visit predates `from` counts as repeat. loyalty_accounts contributes only the tier dimension: its `balance` is a current, point-in-time value and summing it across orders would be meaningless, so it is deliberately not offered as a measure.",
    drilldownSelect: `o.id, o.order_number, o.created_at, o.status, o.order_type, o.channel, o.customer_id,
      c.name, c.phone, c.loyalty_points, la.tier, o.subtotal, o.discount_total, o.grand_total,
      fo.first_order_at`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- inventory -------------------------------------------------------------
  {
    domain: "inventory",
    key: "inventory",
    label: "Inventory consumption",
    description:
      "Per-ingredient stock deductions recorded by the recipe engine, with shortages and consumed cost valued at ingredients.unit_cost_minor. This is the real movement ledger — one row per order line per ingredient.",
    sourceTables: ["inventory_consumption_log", "ingredients"],
    from: `FROM inventory_consumption_log icl
      LEFT JOIN ingredients ing ON ing.id = icl.ingredient_id`,
    outletExpr: "icl.outlet_id",
    dateExpr: "icl.created_at",
    dimensions: [
      ...timeDims("icl.created_at", "inventory_consumption_log.created_at"),
      { key: "ingredientId", label: "Ingredient (id)", sqlColumn: "inventory_consumption_log.ingredient_id", expr: "icl.ingredient_id" },
      { key: "ingredientName", label: "Ingredient", sqlColumn: "ingredients.name", expr: "ing.name" },
      { key: "unitOfMeasure", label: "Unit", sqlColumn: "ingredients.unit_of_measure", expr: "ing.unit_of_measure" },
      { key: "reasonCode", label: "Reason code", sqlColumn: "inventory_consumption_log.reason_code", expr: "icl.reason_code" },
      { key: "recipeId", label: "Recipe (id)", sqlColumn: "inventory_consumption_log.recipe_id", expr: "icl.recipe_id" },
      { key: "orderId", label: "Order (id)", sqlColumn: "inventory_consumption_log.order_id", expr: "icl.order_id" },
    ],
    measures: [
      { key: "movementCount", label: "Movements", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "quantityDeducted", label: "Quantity consumed", unit: "quantity", expr: "ROUND(COALESCE(SUM(icl.quantity_deducted), 0), 3)::double precision", serialize: "number" },
      { key: "shortageQty", label: "Shortage quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(icl.shortage), 0), 3)::double precision", serialize: "number" },
      {
        key: "consumedCostMinor",
        label: "Consumed cost",
        unit: "minor",
        expr: "ROUND(COALESCE(SUM(icl.quantity_deducted * ing.unit_cost_minor), 0))::bigint",
        serialize: "string",
      },
      { key: "shortageEventCount", label: "Movements with shortage", unit: "count", expr: "(COUNT(*) FILTER (WHERE icl.shortage > 0))::bigint", serialize: "number" },
      { key: "distinctIngredients", label: "Distinct ingredients", unit: "count", expr: "COUNT(DISTINCT icl.ingredient_id)::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["ingredientName"],
    requiresPermission: "report.financial.read",
    note:
      "consumedCostMinor values consumption at the ingredient's CURRENT unit_cost_minor (there is no historical cost column on inventory_consumption_log), so it is a current-cost valuation, not a point-in-time one. Purchases live in the `purchase` and `stock_purchases` datasets; counted-vs-expected shrinkage lives in the `stock_closing` dataset. stock_consumptions / stock_consumption_items are real tables that apps/api/src/routes/inventory.ts only ever READS -- no route in this repo inserts into them -- so they are not exposed as a dataset rather than shipped as a guaranteed-empty one.",
    drilldownSelect: `icl.id, icl.created_at, icl.order_id, icl.order_item_id, icl.ingredient_id, ing.name AS ingredient_name,
      ing.unit_of_measure, icl.recipe_id, icl.quantity_deducted, icl.remaining_stock, icl.shortage,
      icl.reason_code, ing.unit_cost_minor`,
    drilldownOrderBy: "icl.created_at DESC",
  },

  // -- purchase --------------------------------------------------------------
  {
    domain: "purchase",
    key: "purchase",
    label: "Purchase orders",
    description:
      "Purchase order lines: ordered vs received quantity and value, by vendor, ingredient and status. receivedValueMinor uses received_qty * unit_price_minor, the same basis as PrismaReportingRepository.listPurchaseReceiptsInRange().",
    sourceTables: ["purchase_order_items", "purchase_orders", "vendors", "ingredients"],
    from: `FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN ingredients ing ON ing.id = poi.ingredient_id`,
    outletExpr: "po.outlet_id",
    dateExpr: "poi.created_at",
    dimensions: [
      ...timeDims("poi.created_at", "purchase_order_items.created_at"),
      { key: "vendorId", label: "Vendor (id)", sqlColumn: "purchase_orders.vendor_id", expr: "po.vendor_id" },
      { key: "vendorName", label: "Vendor", sqlColumn: "vendors.name", expr: "v.name" },
      { key: "status", label: "PO status", sqlColumn: "purchase_orders.status", expr: "po.status" },
      { key: "poNumber", label: "PO number", sqlColumn: "purchase_orders.po_number", expr: "po.po_number" },
      { key: "ingredientId", label: "Ingredient (id)", sqlColumn: "purchase_order_items.ingredient_id", expr: "poi.ingredient_id" },
      { key: "ingredientName", label: "Ingredient", sqlColumn: "ingredients.name", expr: "ing.name" },
      { key: "unitOfMeasure", label: "Unit", sqlColumn: "ingredients.unit_of_measure", expr: "ing.unit_of_measure" },
    ],
    measures: [
      { key: "lineCount", label: "PO lines", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "poCount", label: "Purchase orders", unit: "count", expr: "COUNT(DISTINCT po.id)::bigint", serialize: "number" },
      { key: "orderedQty", label: "Ordered quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(poi.quantity), 0), 3)::double precision", serialize: "number" },
      { key: "receivedQty", label: "Received quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(poi.received_qty), 0), 3)::double precision", serialize: "number" },
      { key: "orderedValueMinor", label: "Ordered value", unit: "minor", expr: money("poi.total_minor"), serialize: "string" },
      {
        key: "receivedValueMinor",
        label: "Received value",
        unit: "minor",
        expr: "ROUND(COALESCE(SUM(poi.received_qty * poi.unit_price_minor), 0))::bigint",
        serialize: "string",
      },
      { key: "openLineCount", label: "Lines not fully received", unit: "count", expr: "(COUNT(*) FILTER (WHERE poi.received_qty < poi.quantity))::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["vendorName"],
    requiresPermission: "report.financial.read",
    note:
      "purchase_order_items has no outlet_id of its own; rows are outlet-scoped through their parent purchase_orders.outlet_id. purchase_orders/purchase_order_items are the PO side; vendor invoices actually received live in stock_purchases/stock_purchase_items and have their own `stock_purchases` dataset.",
    drilldownSelect: `poi.id, poi.po_id, po.po_number, po.status, po.created_at AS po_created_at, poi.created_at,
      po.vendor_id, v.name AS vendor_name, poi.ingredient_id, ing.name AS ingredient_name,
      ing.unit_of_measure, poi.quantity, poi.received_qty, poi.unit_price_minor, poi.total_minor`,
    drilldownOrderBy: "poi.created_at DESC",
  },

  // -- expenses --------------------------------------------------------------
  {
    domain: "expenses",
    key: "expenses",
    label: "Expenses, withdrawals & cash top-ups",
    description:
      "Individual expense_transactions entries joined to their management_lists master record for the human-readable title. kind separates EXPENSE / WITHDRAWAL / CASH_TOPUP.",
    sourceTables: ["expense_transactions", "management_lists"],
    from: `FROM expense_transactions et
      LEFT JOIN management_lists ml ON ml.id = et.list_id`,
    outletExpr: "et.outlet_id",
    dateExpr: "et.created_at",
    dimensions: [
      ...timeDims("et.created_at", "expense_transactions.created_at"),
      { key: "kind", label: "Kind", sqlColumn: "expense_transactions.kind", expr: "et.kind" },
      { key: "title", label: "Title", sqlColumn: "management_lists.label", expr: "ml.label" },
      { key: "listKey", label: "Master list key", sqlColumn: "management_lists.list_key", expr: "ml.list_key" },
      { key: "listId", label: "Master record (id)", sqlColumn: "expense_transactions.list_id", expr: "et.list_id" },
      { key: "createdBy", label: "Recorded by", sqlColumn: "expense_transactions.created_by", expr: "et.created_by" },
    ],
    measures: [
      { key: "transactionCount", label: "Entries", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "amountMinor", label: "Amount", unit: "minor", expr: money("et.amount_minor"), serialize: "string" },
      { key: "avgAmountMinor", label: "Average amount", unit: "minor", expr: moneyAvg("et.amount_minor"), serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["kind"],
    requiresPermission: "report.financial.read",
    note:
      "expense_transactions and management_lists were added by db/migrations/0055 and 0053 and are NOT in the generated Prisma client, so this dataset (like the rest of this engine) reads them through parameterized raw SQL. amountMinor is a signed-by-kind figure: WITHDRAWAL and CASH_TOPUP move cash in opposite directions and are stored as positive amounts under different kinds — group by kind before netting.",
    drilldownSelect: `et.id, et.created_at, et.kind, et.amount_minor, et.note, et.created_by,
      et.list_id, ml.label AS title, ml.list_key`,
    drilldownOrderBy: "et.created_at DESC",
  },

  // -- aggregator ------------------------------------------------------------
  {
    domain: "aggregator",
    key: "aggregator",
    label: "Aggregator / online channels",
    description:
      "Orders that arrived on an external channel (orders.channel IS NOT NULL): volume, revenue, acceptance latency and cancellation rate per channel.",
    sourceTables: ["orders"],
    from: "FROM orders o",
    outletExpr: "o.outlet_id",
    dateExpr: "o.created_at",
    baseWhere: "o.channel IS NOT NULL",
    dimensions: [
      ...timeDims("o.created_at", "orders.created_at"),
      { key: "channel", label: "Channel", sqlColumn: "orders.channel", expr: "o.channel" },
      { key: "status", label: "Order status", sqlColumn: "orders.status", expr: "o.status" },
      { key: "orderType", label: "Order type", sqlColumn: "orders.order_type", expr: "o.order_type" },
      { key: "accepted", label: "Accepted", sqlColumn: "orders.accepted_at", expr: "(o.accepted_at IS NOT NULL)" },
    ],
    measures: [
      { key: "orderCount", label: "Orders", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "revenueMinor", label: "Revenue", unit: "minor", expr: money("o.grand_total"), serialize: "string" },
      { key: "avgOrderValueMinor", label: "Average order value", unit: "minor", expr: moneyAvg("o.grand_total"), serialize: "string" },
      { key: "acceptedOrderCount", label: "Accepted orders", unit: "count", expr: "(COUNT(*) FILTER (WHERE o.accepted_at IS NOT NULL))::bigint", serialize: "number" },
      { key: "cancelledOrderCount", label: "Cancelled orders", unit: "count", expr: "(COUNT(*) FILTER (WHERE o.status = 'CANCELLED'))::bigint", serialize: "number" },
      {
        key: "cancellationRatePercent",
        label: "Cancellation rate",
        unit: "percent",
        expr: "ROUND((COUNT(*) FILTER (WHERE o.status = 'CANCELLED'))::numeric * 100 / GREATEST(COUNT(*), 1), 2)::double precision",
        serialize: "number",
      },
      {
        key: "avgAcceptanceSeconds",
        label: "Average time to accept",
        unit: "seconds",
        expr: "ROUND(AVG(EXTRACT(EPOCH FROM (o.accepted_at - o.received_at))) FILTER (WHERE o.accepted_at IS NOT NULL AND o.received_at IS NOT NULL))::bigint",
        serialize: "number",
      },
      { key: "commissionableRevenueMinor", label: "Revenue on COMPLETED", unit: "minor", expr: "COALESCE(SUM(o.grand_total) FILTER (WHERE o.status = 'COMPLETED'), 0)::bigint", serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["channel"],
    requiresPermission: "report.read",
    note:
      "There is NO rejection status in this system — OrderStatus has no REJECTED value and nothing writes one — so a true rejection rate cannot be computed. cancellationRatePercent is derived from status='CANCELLED', the closest real signal, and is named accordingly. channel_accounts is a credentials/config table with no per-order rows, so it contributes nothing to these figures and is not joined; per-channel configuration lives at GET /integrations.",
    drilldownSelect: `o.id, o.order_number, o.external_order_id, o.channel, o.status, o.order_type, o.created_at,
      o.received_at, o.accepted_at, o.promised_at, o.rider_name, o.rider_phone, o.subtotal,
      o.discount_total, o.tax_total, o.grand_total`,
    drilldownOrderBy: "o.created_at DESC",
  },

  // -- activity --------------------------------------------------------------
  {
    domain: "activity",
    key: "activity",
    label: "Management activity log",
    description:
      "Event counts from management_activity_logs by log_type, actor and time — the audit-trail side of the Management screens.",
    sourceTables: ["management_activity_logs", "users"],
    from: `FROM management_activity_logs mal
      LEFT JOIN users u ON u.id = mal.actor_id`,
    outletExpr: "mal.outlet_id",
    dateExpr: "mal.created_at",
    dimensions: [
      ...timeDims("mal.created_at", "management_activity_logs.created_at"),
      { key: "logType", label: "Log type", sqlColumn: "management_activity_logs.log_type", expr: "mal.log_type" },
      { key: "actorId", label: "Actor (id)", sqlColumn: "management_activity_logs.actor_id", expr: "mal.actor_id" },
      {
        key: "actorName",
        label: "Actor",
        sqlColumn: "users.first_name",
        expr: "COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), mal.actor_id)",
      },
    ],
    measures: [
      { key: "eventCount", label: "Events", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "distinctActors", label: "Distinct actors", unit: "count", expr: "COUNT(DISTINCT mal.actor_id)::bigint", serialize: "number" },
      { key: "distinctLogTypes", label: "Distinct log types", unit: "count", expr: "COUNT(DISTINCT mal.log_type)::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: ALL_GRAINS,
    defaultGroupBy: ["logType"],
    requiresPermission: "report.read",
    note:
      "management_activity_logs is storage that only one code path currently writes (the online channel item-availability toggle in apps/api/src/routes/integration.ts, plus the device-mapping routes in management.ts). Every other log_type named in migration 0053 is inert until a caller starts writing it, so an empty result here means 'nothing has been logged', not 'nothing happened'.",
    drilldownSelect: `mal.id, mal.created_at, mal.log_type, mal.actor_id, u.first_name, u.last_name,
      mal.message, mal.meta`,
    drilldownOrderBy: "mal.created_at DESC",
  },

  // -- stock purchases (vendor invoices) -------------------------------------
  {
    domain: "purchase",
    key: "stock_purchases",
    label: "Stock purchases (vendor invoices)",
    description:
      "Per-ingredient lines of received vendor invoices: quantity, unit cost and line value by vendor, ingredient and payment status. This is the goods-actually-received side, as written by the Stock Purchase screens in apps/api/src/routes/inventory.ts.",
    sourceTables: ["stock_purchase_items", "stock_purchases", "vendors", "ingredients"],
    from: `FROM stock_purchase_items spi
      JOIN stock_purchases sp ON sp.id = spi.purchase_id
      LEFT JOIN vendors v ON v.id = sp.vendor_id
      LEFT JOIN ingredients ing ON ing.id = spi.ingredient_id`,
    outletExpr: "sp.outlet_id",
    dateExpr: "sp.invoice_date",
    dimensions: [
      { key: "day", label: "Day", sqlColumn: "stock_purchases.invoice_date", expr: "date_trunc('day', sp.invoice_date)" },
      { key: "week", label: "Week", sqlColumn: "stock_purchases.invoice_date", expr: "date_trunc('week', sp.invoice_date)" },
      { key: "month", label: "Month", sqlColumn: "stock_purchases.invoice_date", expr: "date_trunc('month', sp.invoice_date)" },
      { key: "vendorId", label: "Vendor (id)", sqlColumn: "stock_purchases.vendor_id", expr: "sp.vendor_id" },
      { key: "vendorName", label: "Vendor", sqlColumn: "vendors.name", expr: "v.name" },
      { key: "invoiceNumber", label: "Invoice number", sqlColumn: "stock_purchases.invoice_number", expr: "sp.invoice_number" },
      { key: "paymentStatus", label: "Payment status", sqlColumn: "stock_purchases.payment_status", expr: "sp.payment_status" },
      { key: "paymentMode", label: "Payment mode", sqlColumn: "stock_purchases.payment_mode", expr: "sp.payment_mode" },
      { key: "ingredientId", label: "Ingredient (id)", sqlColumn: "stock_purchase_items.ingredient_id", expr: "spi.ingredient_id" },
      { key: "ingredientName", label: "Ingredient", sqlColumn: "ingredients.name", expr: "ing.name" },
      { key: "unitOfMeasure", label: "Unit", sqlColumn: "ingredients.unit_of_measure", expr: "ing.unit_of_measure" },
    ],
    measures: [
      { key: "lineCount", label: "Invoice lines", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "invoiceCount", label: "Invoices", unit: "count", expr: "COUNT(DISTINCT sp.id)::bigint", serialize: "number" },
      { key: "purchasedQty", label: "Quantity purchased", unit: "quantity", expr: "ROUND(COALESCE(SUM(spi.quantity), 0), 3)::double precision", serialize: "number" },
      { key: "lineValueMinor", label: "Line value", unit: "minor", expr: money("spi.total_minor"), serialize: "string" },
      { key: "avgUnitCostMinor", label: "Average unit cost", unit: "minor", expr: moneyAvg("spi.unit_cost_minor"), serialize: "string" },
    ],
    defaultGrain: "day",
    grainDimensions: { day: "day", week: "week", month: "month" },
    defaultGroupBy: ["vendorName"],
    requiresPermission: "report.financial.read",
    note:
      "Range filtering and time grains use stock_purchases.invoice_date (a DATE column, so no timezone conversion is applied and no hour grain exists), not created_at -- the invoice date is what the purchase actually belongs to. Invoice-level totals (total_amount_minor / tax_amount_minor / discount_amount_minor / net_amount_minor) are deliberately NOT summed here: this dataset is one row per LINE, and summing an invoice-level total across its lines would multiply it. Use drilldown for invoice-level figures.",
    drilldownSelect: `spi.id, spi.purchase_id, sp.invoice_number, sp.invoice_date, sp.vendor_id, v.name AS vendor_name,
      spi.ingredient_id, ing.name AS ingredient_name, ing.unit_of_measure, spi.quantity, spi.unit_cost_minor,
      spi.tax_percent, spi.total_minor, sp.total_amount_minor, sp.tax_amount_minor, sp.discount_amount_minor,
      sp.net_amount_minor, sp.payment_status, sp.paid_amount_minor, sp.payment_mode`,
    drilldownOrderBy: "sp.invoice_date DESC",
  },

  // -- daily stock closing (counted vs expected) -----------------------------
  {
    domain: "inventory",
    key: "stock_closing",
    label: "Daily stock closing variance",
    description:
      "Per-ingredient counted-vs-expected closing stock and the resulting variance valued at unit cost, from the daily stock closing screens. Opening + received - consumed = expected; actual is what was physically counted.",
    sourceTables: ["daily_stock_closing_items", "daily_stock_closings", "ingredients"],
    from: `FROM daily_stock_closing_items dsci
      JOIN daily_stock_closings dsc ON dsc.id = dsci.closing_id
      LEFT JOIN ingredients ing ON ing.id = dsci.ingredient_id`,
    outletExpr: "dsc.outlet_id",
    dateExpr: "dsc.closing_date",
    dimensions: [
      { key: "day", label: "Closing date", sqlColumn: "daily_stock_closings.closing_date", expr: "date_trunc('day', dsc.closing_date)" },
      { key: "week", label: "Week", sqlColumn: "daily_stock_closings.closing_date", expr: "date_trunc('week', dsc.closing_date)" },
      { key: "month", label: "Month", sqlColumn: "daily_stock_closings.closing_date", expr: "date_trunc('month', dsc.closing_date)" },
      { key: "status", label: "Closing status", sqlColumn: "daily_stock_closings.status", expr: "dsc.status" },
      { key: "ingredientId", label: "Ingredient (id)", sqlColumn: "daily_stock_closing_items.ingredient_id", expr: "dsci.ingredient_id" },
      { key: "ingredientName", label: "Ingredient", sqlColumn: "ingredients.name", expr: "ing.name" },
      { key: "unitOfMeasure", label: "Unit", sqlColumn: "ingredients.unit_of_measure", expr: "ing.unit_of_measure" },
      { key: "verifiedBy", label: "Verified by (id)", sqlColumn: "daily_stock_closings.verified_by", expr: "dsc.verified_by" },
    ],
    measures: [
      { key: "lineCount", label: "Counted lines", unit: "count", expr: "COUNT(*)::bigint", serialize: "number" },
      { key: "closingCount", label: "Closings", unit: "count", expr: "COUNT(DISTINCT dsc.id)::bigint", serialize: "number" },
      { key: "openingQty", label: "Opening quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.opening_qty), 0), 3)::double precision", serialize: "number" },
      { key: "receivedQty", label: "Received quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.received_qty), 0), 3)::double precision", serialize: "number" },
      { key: "consumedQty", label: "Consumed quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.consumed_qty), 0), 3)::double precision", serialize: "number" },
      { key: "expectedQty", label: "Expected closing quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.expected_qty), 0), 3)::double precision", serialize: "number" },
      { key: "actualClosingQty", label: "Actual counted quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.actual_closing_qty), 0), 3)::double precision", serialize: "number" },
      { key: "varianceQty", label: "Variance quantity", unit: "quantity", expr: "ROUND(COALESCE(SUM(dsci.variance_qty), 0), 3)::double precision", serialize: "number" },
      { key: "varianceCostMinor", label: "Variance value", unit: "minor", expr: money("dsci.variance_cost_minor"), serialize: "string" },
      { key: "shortLineCount", label: "Lines short", unit: "count", expr: "(COUNT(*) FILTER (WHERE dsci.variance_qty < 0))::bigint", serialize: "number" },
    ],
    defaultGrain: "day",
    grainDimensions: { day: "day", week: "week", month: "month" },
    defaultGroupBy: ["ingredientName"],
    requiresPermission: "report.financial.read",
    note:
      "daily_stock_closings.closing_date is a DATE column, so grains are calendar days with no timezone conversion and there is no hour grain. varianceCostMinor is the stored daily_stock_closing_items.variance_cost_minor, i.e. whatever the closing screen computed and saved -- it is not recomputed here, so this dataset cannot disagree with the closing record itself.",
    drilldownSelect: `dsci.id, dsci.closing_id, dsc.closing_date, dsc.status, dsci.ingredient_id,
      ing.name AS ingredient_name, ing.unit_of_measure, dsci.opening_qty, dsci.received_qty, dsci.consumed_qty,
      dsci.expected_qty, dsci.actual_closing_qty, dsci.variance_qty, dsci.unit_cost_minor,
      dsci.variance_cost_minor, dsc.verified_by, dsc.notes`,
    drilldownOrderBy: "dsc.closing_date DESC",
  },
];

// DOMAINS DELIBERATELY OMITTED (no real backing table — AGENTS.md Rule 1):
//   * A per-rate tax ledger. orders.tax_total is the only tax figure stored;
//     menu_items.tax_rate exists but no per-line tax amount does, so
//     "tax collected by GST rate" is unobtainable and is not faked. See the
//     `tax` dataset's note.
//   * Discount reasons / discount-by-staff. No Discount entity, no
//     discount_reason column, no applied_by column. See the
//     `discounts_voids` note.
//   * A `menu`/`modifier` sales dataset keyed on modifiers:
//     order_item_modifiers holds price_delta_minor per line and IS real, but
//     nothing in the ordering path writes rows to it in this checkout, so a
//     modifier-attach-rate dataset would report a confident zero. Left out.
//   * Aggregator rejections — no REJECTED order status exists.
//   * stock_consumptions / stock_consumption_items — real tables (migration
//     0042) that inventory.ts only reads; nothing in this repo INSERTs into
//     them, so a "consumption by Sales/Transfer/Wastage/Adjustment" dataset
//     would be a guaranteed-empty confident zero. Omitted rather than faked.
//     (stock_purchases and daily_stock_closings ARE written by inventory.ts
//     and do get datasets.)
//   * item_availability / recipes — real, but they are current-state config
//     (an item's on/off flag per channel; an item's ingredient list), not
//     dated event rows. There is nothing to aggregate over a date range, so
//     they back dimensions (via the recipe id on inventory movements) rather
//     than a dataset of their own.
//   * Wallet balances (wallet_transactions, migration 0055) — real table, but
//     it is keyed by customer_mobile with no link to orders or customers.id,
//     so it cannot join this catalog's customer dimension; GET
//     /management/virtual-wallet owns it.

const DATASET_BY_KEY = new Map(DATASETS.map((d) => [d.key, d]));

// ---------------------------------------------------------------------------
// Request parsing / validation helpers
// ---------------------------------------------------------------------------

const GRAINS: GrainKey[] = ["hour", "day", "week", "month"];
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;
const DRILLDOWN_LIMIT = 500;
const MAX_GROUP_BY = 4;

interface DateRangeArg {
  fromDate: Date;
  toDate: Date;
}

/** Accepts from/to (per spec) as well as the fromDate/toDate and
 *  startDate/endDate spellings the existing /reporting routes use.
 *  Falls back to the current calendar month, same as parseRange() there. */
function parseRange(req: AuthedRequest): DateRangeArg | null {
  const from = req.query.from ?? req.query.fromDate ?? req.query.startDate;
  const to = req.query.to ?? req.query.toDate ?? req.query.endDate;
  if (typeof from === "string" && typeof to === "string") {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
    if (fromDate > toDate) return null;
    return { fromDate, toDate };
  }
  const now = new Date();
  return {
    fromDate: new Date(now.getFullYear(), now.getMonth(), 1),
    toDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function parseCsv(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : null;
}

function parseIntParam(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

/** Serializes one raw driver value. BigInt -> string (money-safe), Date ->
 *  ISO, Prisma Decimal -> string. Never converts a BigInt to a JS number. */
function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && typeof (value as any).toFixed === "function") {
    return (value as any).toString();
  }
  return value;
}

/** Measure values: money stays a string, everything else becomes a number. */
function serializeMeasure(measure: BiMeasure, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (measure.serialize === "string") {
    return typeof value === "bigint" ? value.toString() : String(value);
  }
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compareForSort(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b));
}

function publicDataset(ds: BiDataset) {
  return {
    domain: ds.domain,
    key: ds.key,
    label: ds.label,
    description: ds.description,
    sourceTables: ds.sourceTables,
    dimensions: ds.dimensions.map((d) => ({ key: d.key, label: d.label, sqlColumn: d.sqlColumn })),
    measures: ds.measures.map((m) => ({ key: m.key, label: m.label, unit: m.unit })),
    defaultGrain: ds.defaultGrain,
    grains: Object.keys(ds.grainDimensions ?? {}),
    defaultGroupBy: ds.defaultGroupBy,
    defaultFilters: ds.defaultFilters ?? null,
    requiresPermission: ds.requiresPermission,
    delegated: ds.handler ?? null,
    note: ds.note ?? null,
  };
}

/** Truncates a Date to a UTC day/week/month boundary. Week starts Monday,
 *  matching Postgres date_trunc('week', ...) so the delegated handlers bucket
 *  identically to the SQL path. */
function truncUtc(d: Date, grain: "day" | "week" | "month"): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (grain === "month") return new Date(Date.UTC(y, m, 1));
  const base = new Date(Date.UTC(y, m, day));
  if (grain === "day") return base;
  const mondayOffset = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - mondayOffset);
  return base;
}

// ---------------------------------------------------------------------------
// GET /bi/catalog
// ---------------------------------------------------------------------------

router.get(
  "/catalog",
  requireAuth,
  requirePermission("report.read", "report.financial.read"),
  (_req: AuthedRequest, res) => {
    res.status(200).json(DATASETS.map(publicDataset));
  }
);

// ---------------------------------------------------------------------------
// Shared request resolution for /query and /drilldown
// ---------------------------------------------------------------------------

interface ResolvedFilters {
  effective: Record<string, unknown>;
  where: string[];
}

function resolveFilters(
  ds: BiDataset,
  rawFilters: Record<string, unknown>,
  applyDefaults: boolean,
  push: (value: unknown) => string
): ResolvedFilters | { error: string } {
  const dimByKey = new Map(ds.dimensions.map((d) => [d.key, d]));
  const effective: Record<string, unknown> = applyDefaults ? { ...(ds.defaultFilters ?? {}) } : {};
  for (const [key, value] of Object.entries(rawFilters)) {
    effective[key] = value;
  }

  const where: string[] = [];
  for (const [key, value] of Object.entries(effective)) {
    const dim = dimByKey.get(key);
    if (!dim) {
      return {
        error: `unknown filter dimension '${key}' for dataset '${ds.key}'. Allowed: ${ds.dimensions
          .map((d) => d.key)
          .join(", ")}`,
      };
    }
    const expr = dim.filterExpr ?? dim.expr;
    if (value === null) {
      where.push(`(${expr}) IS NULL`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return { error: `filter '${key}' was given an empty list` };
      }
      if (value.some((v) => v !== null && typeof v === "object")) {
        return { error: `filter '${key}' list must contain only strings, numbers, booleans or null` };
      }
      const placeholders = value.map((v) => (v === null ? null : push(String(v))));
      const nonNull = placeholders.filter((x): x is string => x !== null);
      const parts: string[] = [];
      if (nonNull.length > 0) parts.push(`(${expr})::text IN (${nonNull.join(", ")})`);
      if (placeholders.some((x) => x === null)) parts.push(`(${expr}) IS NULL`);
      where.push(`(${parts.join(" OR ")})`);
      continue;
    }
    if (typeof value === "object") {
      return { error: `filter '${key}' must be a string, number, boolean, null, or an array of those` };
    }
    where.push(`(${expr})::text = ${push(String(value))}`);
  }

  return { effective, where };
}

type FiltersParse =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/// Discriminated on `ok` rather than on the presence of an `error` key, so a
/// caller-supplied filter literally named "error" cannot be mistaken for a
/// parse failure.
function parseFiltersParam(raw: unknown): FiltersParse {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: {} };
  if (typeof raw !== "string") return { ok: false, error: "filters must be a JSON object string" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "filters is not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "filters must be a JSON object of dimensionKey -> value" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Delegated datasets — these reuse the EXISTING money calculations rather than
// re-deriving them in SQL, so /bi and /reporting can never disagree.
// ---------------------------------------------------------------------------

interface DelegatedResult {
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  note?: string;
}

async function runTaxDataset(
  outletId: string,
  range: DateRangeArg,
  groupKeys: string[]
): Promise<DelegatedResult> {
  const orders = await prisma.order.findMany({
    where: {
      outletId,
      status: "COMPLETED",
      createdAt: { gte: range.fromDate, lte: range.toDate },
    },
    select: { subtotal: true, taxTotal: true, grandTotal: true, orderType: true, createdAt: true },
  });

  const rowsWithKey = orders.map((o) => ({
    tax: {
      subtotalMinor: o.subtotal ?? (o.grandTotal - (o.taxTotal ?? 0n)),
      taxTotalMinor: o.taxTotal ?? 0n,
      grandTotalMinor: o.grandTotal,
      orderType: o.orderType,
    } as TaxOrderRow,
    createdAt: o.createdAt,
    orderType: o.orderType,
  }));

  const bucketValueFor = (key: string, r: (typeof rowsWithKey)[number]): unknown => {
    switch (key) {
      case "day":
        return truncUtc(r.createdAt, "day");
      case "week":
        return truncUtc(r.createdAt, "week");
      case "month":
        return truncUtc(r.createdAt, "month");
      case "orderType":
        return r.orderType;
      default:
        return null;
    }
  };

  const buckets = new Map<string, { keys: Record<string, unknown>; rows: TaxOrderRow[] }>();
  for (const r of rowsWithKey) {
    const keys: Record<string, unknown> = {};
    for (const gk of groupKeys) keys[gk] = bucketValueFor(gk, r);
    const bucketKey = JSON.stringify(
      groupKeys.map((gk) => (keys[gk] instanceof Date ? (keys[gk] as Date).toISOString() : keys[gk]))
    );
    const existing = buckets.get(bucketKey);
    if (existing) existing.rows.push(r.tax);
    else buckets.set(bucketKey, { keys, rows: [r.tax] });
  }

  const toRow = (keys: Record<string, unknown>, taxRows: TaxOrderRow[]): Record<string, unknown> => {
    const tb = computeTaxBreakdown(outletId, range, taxRows);
    const byName = new Map(tb.components.map((c) => [c.componentName, c]));
    return {
      ...keys,
      orderCount: tb.orderCount,
      taxableSalesMinor: tb.totalTaxableSalesMinor,
      taxCollectedMinor: tb.totalTaxCollectedMinor,
      cgstMinor: byName.get("CGST")?.taxCollectedMinor ?? 0n,
      sgstMinor: byName.get("SGST")?.taxCollectedMinor ?? 0n,
      igstMinor: byName.get("IGST")?.taxCollectedMinor ?? 0n,
      effectiveTaxRatePercent: tb.effectiveTaxRatePercent,
    };
  };

  const rows =
    groupKeys.length === 0
      ? [toRow({}, rowsWithKey.map((r) => r.tax))]
      : Array.from(buckets.values()).map((b) => toRow(b.keys, b.rows));

  const totals = toRow({}, rowsWithKey.map((r) => r.tax));
  for (const gk of groupKeys) delete totals[gk];

  return { rows, totals };
}

async function runDiscountVoidDataset(
  outletId: string,
  range: DateRangeArg,
  groupKeys: string[]
): Promise<DelegatedResult | { error: string }> {
  if (groupKeys.length > 1) {
    return {
      error:
        "dataset 'discounts_voids' supports a single groupBy dimension (day, voidReason or voidedBy) because it delegates to computeDiscountVoidAnalysis(); combine dimensions with dataset=items or dataset=sales instead",
    };
  }

  const [voidedItems, discountOrders] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        outletId,
        isVoided: true,
        order: { createdAt: { gte: range.fromDate, lte: range.toDate } },
      },
      select: {
        subtotal: true,
        quantity: true,
        voidReason: true,
        voidedBy: true,
        order: { select: { createdAt: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: { gte: range.fromDate, lte: range.toDate },
        discountTotal: { gt: 0 },
      },
      select: { discountTotal: true, createdAt: true },
    }),
  ]);

  const analysis = computeDiscountVoidAnalysis(
    outletId,
    range,
    voidedItems.map((i) => ({
      subtotalMinor: i.subtotal,
      quantity: Number(i.quantity),
      voidReason: i.voidReason,
      voidedBy: i.voidedBy,
      orderCreatedAt: i.order.createdAt,
    })),
    discountOrders.map((o) => ({
      discountTotalMinor: o.discountTotal ?? 0n,
      createdAt: o.createdAt,
    }))
  );

  const totals: Record<string, unknown> = {
    voidCount: analysis.voids.count,
    voidedQuantity: analysis.voids.byDay.reduce((sum, d) => sum + d.quantity, 0),
    voidValueMinor: analysis.voids.totalValueMinor,
    discountOrderCount: analysis.discounts.orderCountWithDiscount,
    discountMinor: analysis.discounts.totalDiscountMinor,
  };

  const groupKey = groupKeys[0];
  let rows: Record<string, unknown>[];

  if (!groupKey) {
    rows = [{ ...totals }];
  } else if (groupKey === "voidReason") {
    rows = analysis.voids.byReason.map((r) => ({
      voidReason: r.reason,
      voidCount: r.count,
      voidedQuantity: null,
      voidValueMinor: r.valueMinor,
      discountOrderCount: null,
      discountMinor: null,
    }));
  } else if (groupKey === "voidedBy") {
    rows = analysis.voids.byStaff.map((r) => ({
      voidedBy: r.voidedBy,
      voidCount: r.count,
      voidedQuantity: null,
      voidValueMinor: r.valueMinor,
      discountOrderCount: null,
      discountMinor: null,
    }));
  } else {
    // day — merge the void and discount daily series on the shared UTC date key
    const byDate = new Map<string, Record<string, unknown>>();
    for (const v of analysis.voids.byDay) {
      byDate.set(v.date, {
        day: v.date,
        voidCount: v.count,
        voidedQuantity: v.quantity,
        voidValueMinor: v.valueMinor,
        discountOrderCount: 0,
        discountMinor: 0n,
      });
    }
    for (const d of analysis.discounts.byDay) {
      const existing = byDate.get(d.date);
      if (existing) {
        existing.discountOrderCount = d.count;
        existing.discountMinor = d.totalMinor;
      } else {
        byDate.set(d.date, {
          day: d.date,
          voidCount: 0,
          voidedQuantity: 0,
          voidValueMinor: 0n,
          discountOrderCount: d.count,
          discountMinor: d.totalMinor,
        });
      }
    }
    rows = Array.from(byDate.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }

  const note =
    groupKey === "voidReason" || groupKey === "voidedBy"
      ? `${analysis.note} At this grain voidedQuantity, discountOrderCount and discountMinor are null: the schema attaches no reason or actor to a discount, and computeDiscountVoidAnalysis() does not carry quantity on the reason/staff breakdowns. Group by day for all five measures.`
      : analysis.note;

  return { rows, totals, note };
}

// ---------------------------------------------------------------------------
// GET /bi/query — the engine
// ---------------------------------------------------------------------------

router.get("/query", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const datasetKey = typeof req.query.dataset === "string" ? req.query.dataset.trim() : "";
    const ds = DATASET_BY_KEY.get(datasetKey);
    if (!ds) {
      res.status(400).json({
        error: `unknown dataset '${datasetKey}'`,
        availableDatasets: DATASETS.map((d) => d.key),
      });
      return;
    }

    const perm = await checkPermissionDirect(req.auth!.userId, req.auth!.outletId, ds.requiresPermission);
    if (!perm.allowed) {
      res.status(403).json({ error: `Permission denied. Required: ${ds.requiresPermission}` });
      return;
    }

    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "invalid from/to — expected ISO dates with from <= to" });
      return;
    }

    // --- grain ---------------------------------------------------------------
    let grain: GrainKey | null = ds.defaultGrain;
    if (typeof req.query.grain === "string" && req.query.grain.trim() !== "") {
      const g = req.query.grain.trim() as GrainKey;
      if (!GRAINS.includes(g)) {
        res.status(400).json({ error: `invalid grain '${g}'. Allowed: ${GRAINS.join(", ")}` });
        return;
      }
      if (!ds.grainDimensions?.[g]) {
        res.status(400).json({
          error: `dataset '${ds.key}' does not support grain '${g}'. Supported: ${Object.keys(
            ds.grainDimensions ?? {}
          ).join(", ") || "none"}`,
        });
        return;
      }
      grain = g;
    }

    // --- groupBy (validated against the dataset's declared dimensions) --------
    const dimByKey = new Map(ds.dimensions.map((d) => [d.key, d]));
    const requestedGroupBy = parseCsv(req.query.groupBy) ?? ds.defaultGroupBy;
    const groupKeys: string[] = [];
    for (const rawKey of requestedGroupBy) {
      // `period` is the one alias: it resolves to whichever time dimension the
      // current grain names. Everything else must be a literal dimension key.
      const key = rawKey === "period" ? (grain ? ds.grainDimensions?.[grain] : undefined) : rawKey;
      if (!key) {
        res.status(400).json({
          error: `groupBy 'period' cannot be resolved: dataset '${ds.key}' declares no time grain`,
        });
        return;
      }
      if (!dimByKey.has(key)) {
        res.status(400).json({
          error: `unknown groupBy dimension '${rawKey}' for dataset '${ds.key}'`,
          availableDimensions: ds.dimensions.map((d) => d.key),
        });
        return;
      }
      if (!groupKeys.includes(key)) groupKeys.push(key);
    }
    if (groupKeys.length > MAX_GROUP_BY) {
      res.status(400).json({ error: `groupBy accepts at most ${MAX_GROUP_BY} dimensions` });
      return;
    }

    // --- measures ------------------------------------------------------------
    const measureByKey = new Map(ds.measures.map((m) => [m.key, m]));
    const requestedMeasures = parseCsv(req.query.measures) ?? ds.measures.map((m) => m.key);
    const measures: BiMeasure[] = [];
    for (const key of requestedMeasures) {
      const m = measureByKey.get(key);
      if (!m) {
        res.status(400).json({
          error: `unknown measure '${key}' for dataset '${ds.key}'`,
          availableMeasures: ds.measures.map((x) => x.key),
        });
        return;
      }
      if (!measures.some((x) => x.key === m.key)) measures.push(m);
    }

    const limit = parseIntParam(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const order: "asc" | "desc" = String(req.query.order ?? "").toLowerCase() === "asc" ? "asc" : "desc";
    const sortKey = typeof req.query.sort === "string" && req.query.sort.trim() !== "" ? req.query.sort.trim() : null;
    const sortableKeys = [...groupKeys, ...measures.map((m) => m.key)];
    if (sortKey && !sortableKeys.includes(sortKey)) {
      res.status(400).json({
        error: `cannot sort by '${sortKey}' — it is not in the selected groupBy or measures`,
        sortableKeys,
      });
      return;
    }

    const generatedAt = new Date().toISOString();

    // --- delegated datasets --------------------------------------------------
    if (ds.handler) {
      if (req.query.filters !== undefined && req.query.filters !== "") {
        res.status(400).json({
          error: `dataset '${ds.key}' delegates to an existing report calculation and does not accept filters; use groupBy plus from/to`,
        });
        return;
      }

      const delegated =
        ds.handler === "tax"
          ? await runTaxDataset(req.auth!.outletId, range, groupKeys)
          : await runDiscountVoidDataset(req.auth!.outletId, range, groupKeys);

      if ("error" in delegated) {
        res.status(400).json({ error: delegated.error });
        return;
      }

      const effectiveSort = sortKey ?? (measures.length > 0 ? measures[0].key : groupKeys[0]);
      const sorted = [...delegated.rows].sort((a, b) => {
        const cmp = compareForSort(a[effectiveSort], b[effectiveSort]);
        return order === "asc" ? cmp : -cmp;
      });
      const truncated = sorted.length > limit;
      const page = sorted.slice(0, limit);

      res.status(200).json({
        dataset: ds.key,
        from: range.fromDate.toISOString(),
        to: range.toDate.toISOString(),
        grain,
        groupBy: groupKeys,
        measures: measures.map((m) => m.key),
        filters: {},
        rows: page.map((row) => {
          const out: Record<string, unknown> = {};
          for (const gk of groupKeys) out[gk] = serializeValue(row[gk]);
          for (const m of measures) out[m.key] = serializeMeasure(m, row[m.key] ?? null);
          return out;
        }),
        totals: Object.fromEntries(
          measures.map((m) => [m.key, serializeMeasure(m, delegated.totals[m.key] ?? null)])
        ),
        rowCount: page.length,
        truncated,
        generatedAt,
        note: delegated.note ?? ds.note ?? null,
      });
      return;
    }

    // --- SQL path ------------------------------------------------------------
    const params: unknown[] = [];
    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const parsedFilters = parseFiltersParam(req.query.filters);
    if (!parsedFilters.ok) {
      res.status(400).json({ error: parsedFilters.error });
      return;
    }

    // outlet scope first, then the date range — both always bound parameters.
    const where: string[] = [
      `${ds.outletExpr} = ${push(req.auth!.outletId)}`,
      `${ds.dateExpr} >= ${push(range.fromDate)}`,
      `${ds.dateExpr} <= ${push(range.toDate)}`,
    ];
    if (ds.baseWhere) where.push(ds.baseWhere);

    const resolved = resolveFilters(ds, parsedFilters.value, true, push);
    if ("error" in resolved) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    where.push(...resolved.where);

    const groupDims = groupKeys.map((k) => dimByKey.get(k)!);
    const selectParts = [
      ...groupDims.map((d) => `${d.expr} AS "${d.key}"`),
      ...measures.map((m) => `${m.expr} AS "${m.key}"`),
    ];
    if (selectParts.length === 0) {
      res.status(400).json({ error: "select at least one measure or groupBy dimension" });
      return;
    }

    // GROUP BY / ORDER BY use ORDINAL POSITIONS, so no identifier from the
    // request is ever interpolated into the SQL text.
    const groupByClause =
      groupDims.length > 0 ? `GROUP BY ${groupDims.map((_, i) => i + 1).join(", ")}` : "";

    const effectiveSortKey = sortKey ?? (measures.length > 0 ? measures[0].key : groupKeys[0]);
    const sortOrdinal = [...groupKeys, ...measures.map((m) => m.key)].indexOf(effectiveSortKey) + 1;
    const orderByClause = `ORDER BY ${sortOrdinal} ${order === "asc" ? "ASC" : "DESC"} NULLS LAST`;

    const sql = `SELECT ${selectParts.join(", ")}
      ${ds.from}
      WHERE ${where.join(" AND ")}
      ${groupByClause}
      ${orderByClause}
      LIMIT ${limit + 1}`;

    const totalsSql = `SELECT ${measures.map((m) => `${m.expr} AS "${m.key}"`).join(", ")}
      ${ds.from}
      WHERE ${where.join(" AND ")}`;

    const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
    const truncated = raw.length > limit;
    const page = truncated ? raw.slice(0, limit) : raw;

    const totalsRows =
      measures.length > 0
        ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(totalsSql, ...params)
        : [];
    const totalsRow = totalsRows[0] ?? {};

    res.status(200).json({
      dataset: ds.key,
      from: range.fromDate.toISOString(),
      to: range.toDate.toISOString(),
      grain,
      groupBy: groupKeys,
      measures: measures.map((m) => m.key),
      filters: resolved.effective,
      rows: page.map((row) => {
        const out: Record<string, unknown> = {};
        for (const gk of groupKeys) out[gk] = serializeValue(row[gk]);
        for (const m of measures) out[m.key] = serializeMeasure(m, row[m.key] ?? null);
        return out;
      }),
      totals: Object.fromEntries(measures.map((m) => [m.key, serializeMeasure(m, totalsRow[m.key] ?? null)])),
      rowCount: page.length,
      truncated,
      generatedAt,
      note: ds.note ?? null,
    });
  } catch (err) {
    console.error("[bi/query]", err);
    res.status(500).json({ error: "internal error" });
  }
});

// ---------------------------------------------------------------------------
// GET /bi/drilldown — the individual rows behind one aggregated cell.
// Same dataset, same whitelisted filters, no aggregation, hard cap of 500.
// ---------------------------------------------------------------------------

router.get("/drilldown", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const datasetKey = typeof req.query.dataset === "string" ? req.query.dataset.trim() : "";
    const ds = DATASET_BY_KEY.get(datasetKey);
    if (!ds) {
      res.status(400).json({
        error: `unknown dataset '${datasetKey}'`,
        availableDatasets: DATASETS.map((d) => d.key),
      });
      return;
    }

    const perm = await checkPermissionDirect(req.auth!.userId, req.auth!.outletId, ds.requiresPermission);
    if (!perm.allowed) {
      res.status(403).json({ error: `Permission denied. Required: ${ds.requiresPermission}` });
      return;
    }

    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "invalid from/to — expected ISO dates with from <= to" });
      return;
    }

    const parsedFilters = parseFiltersParam(req.query.filters);
    if (!parsedFilters.ok) {
      res.status(400).json({ error: parsedFilters.error });
      return;
    }

    const limit = parseIntParam(req.query.limit, DRILLDOWN_LIMIT, DRILLDOWN_LIMIT);

    const params: unknown[] = [];
    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [
      `${ds.outletExpr} = ${push(req.auth!.outletId)}`,
      `${ds.dateExpr} >= ${push(range.fromDate)}`,
      `${ds.dateExpr} <= ${push(range.toDate)}`,
    ];
    if (ds.baseWhere) where.push(ds.baseWhere);

    // Drilldown applies the dataset's default filters too, so the rows you get
    // back are the rows that produced the aggregate you clicked on.
    const resolved = resolveFilters(ds, parsedFilters.value, true, push);
    if ("error" in resolved) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    where.push(...resolved.where);

    const sql = `SELECT ${ds.drilldownSelect}
      ${ds.from}
      WHERE ${where.join(" AND ")}
      ORDER BY ${ds.drilldownOrderBy}
      LIMIT ${limit + 1}`;

    const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
    const truncated = raw.length > limit;
    const page = truncated ? raw.slice(0, limit) : raw;

    res.status(200).json({
      dataset: ds.key,
      from: range.fromDate.toISOString(),
      to: range.toDate.toISOString(),
      filters: resolved.effective,
      rows: page.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
        return out;
      }),
      rowCount: page.length,
      limit,
      truncated,
      generatedAt: new Date().toISOString(),
      note: ds.note ?? null,
    });
  } catch (err) {
    console.error("[bi/drilldown]", err);
    res.status(500).json({ error: "internal error" });
  }
});

export const biRouter = router;
