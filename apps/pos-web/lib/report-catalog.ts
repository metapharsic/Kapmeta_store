// Shared catalog of real reports for the "Other Reports" screen
// (pages/reports/other-reports.tsx), the generic detail viewer
// (pages/reports/view.tsx) and the report-notification report picker
// (pages/reports/report-notification.tsx).
//
// Every entry here maps to a REAL endpoint or a REAL existing page — no
// row here is invented. `href` is where "View Details" navigates:
//   - a report that already has its own purpose-built page (e.g. the
//     Z-Report tab on /finance, /kitchen-analytics, /waiter-monitor,
//     /admin?tab=audit, /admin?tab=analytics) links straight there so we
//     never build a second, worse view of data that already has a real
//     screen (repo convention: don't duplicate an existing page).
//   - a report from reporting.ts that has no standalone page of its own
//     (its data is folded into the big Sales Analytics dashboard, or has
//     no UI at all yet) routes to /reports/view?key=<key>, which fetches
//     `endpoint` for real and renders the JSON as a generic table.
//
// `permission` mirrors exactly the requirePermission(...) the endpoint (or
// destination page) is guarded with in apps/api, per the same convention
// components/Nav.tsx documents for SIDEBAR_GROUPS.

export type ReportCategoryId =
  | "ALL_RESTAURANT"
  | "ORDER"
  | "ITEM"
  | "CATEGORY"
  | "CUSTOMER"
  | "DISCOUNT"
  | "OTHERS";

export interface ReportCatalogEntry {
  /** Stable id. Used as the ?key= for /reports/view and as the reportKey
   *  stored by POST /report-notifications. */
  key: string;
  title: string;
  description: string;
  category: ReportCategoryId;
  /** Permission required to view this report (matches the API route). */
  permission: string;
  /** Where "View Details" navigates. */
  href: string;
  /** Real GET endpoint backing this report, when `href` is the generic
   *  /reports/view page. Absent for entries whose href is a dedicated page
   *  that already fetches its own data. */
  endpoint?: string;
}

export const REPORT_CATEGORIES: { id: ReportCategoryId; label: string }[] = [
  { id: "ALL_RESTAURANT", label: "All Restaurant Report" },
  { id: "ORDER", label: "Order Related Reports" },
  { id: "ITEM", label: "Item Related Reports" },
  { id: "CATEGORY", label: "Category Related Reports" },
  { id: "CUSTOMER", label: "Customer Related Reports" },
  { id: "DISCOUNT", label: "Discount Related Reports" },
  { id: "OTHERS", label: "Others Reports" },
];

export const REPORT_CATALOG: ReportCatalogEntry[] = [
  // ---- All Restaurant Report -------------------------------------------
  {
    key: "bi-reports",
    title: "BI Reports (Workbench)",
    description:
      "Self-serve BI across every dataset the outlet exposes (GET /bi/catalog) — slice by that dataset's own dimensions, chart any measure, and drill through an aggregate row to the raw underlying records.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/reports/bi",
  },
  {
    key: "day-end-summary",
    title: "Day End Summary",
    description: "Per-day Z-report totals — sales, tax, tips and payment mix across a date range.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/reports/day-end-summary",
  },
  {
    key: "z-report",
    title: "Z-Report",
    description: "Single-day settlement report: sales, tax, tips, service charge and handover totals.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/finance",
  },
  {
    key: "ledger-entries",
    title: "Ledger Entries",
    description: "Posted accounting ledger entries for the outlet.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/finance",
  },
  {
    key: "cash-drawer",
    title: "Cash Drawer",
    description: "Real-time cash drawer reconciliation — opening float, cash sales, petty cash and variance.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/finance",
  },
  {
    key: "sales-summary",
    title: "Sales Summary",
    description: "Gross and net sales, order count and average order value for a period.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/reports/view?key=sales-summary",
    endpoint: "/reporting/sales-summary",
  },
  {
    key: "tax-breakdown",
    title: "Tax Breakdown",
    description: "GST / statutory tax collected, broken down by component.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/reports/view?key=tax-breakdown",
    endpoint: "/reporting/tax-breakdown",
  },
  {
    key: "revenue-trend",
    title: "Revenue Trend",
    description: "Day-by-day revenue trend for the selected period.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/reports/view?key=revenue-trend",
    endpoint: "/reporting/revenue-trend",
  },
  {
    key: "sales-analytics",
    title: "Sales Analytics Dashboard",
    description: "Combined KPI dashboard — hourly sales velocity, category mix and more.",
    category: "ALL_RESTAURANT",
    permission: "report.read",
    href: "/admin?tab=analytics",
  },

  // ---- Order Related Reports --------------------------------------------
  {
    key: "delivery-management",
    title: "Delivery Management",
    description: "Aggregator / delivery order volume by day and by provider.",
    category: "ORDER",
    permission: "report.read",
    href: "/reports/delivery-management",
  },
  {
    key: "payment-breakdown",
    title: "Payment Method Breakdown",
    description: "Sales split by payment method — cash, card, UPI and more.",
    category: "ORDER",
    permission: "report.read",
    href: "/reports/view?key=payment-breakdown",
    endpoint: "/reporting/payment-breakdown",
  },
  {
    key: "channel-breakdown",
    title: "Channel Sales Breakdown",
    description: "Sales split by order channel — dine-in, Swiggy, Zomato and more.",
    category: "ORDER",
    permission: "report.read",
    href: "/reports/view?key=channel-breakdown",
    endpoint: "/reporting/channel-breakdown",
  },
  {
    key: "table-turnaround",
    title: "Table Turnaround Average",
    description: "Average time a dine-in table takes to turn over.",
    category: "ORDER",
    permission: "report.read",
    href: "/reports/view?key=table-turnaround",
    endpoint: "/reporting/table-turnaround",
  },
  {
    key: "invoices",
    title: "Settled Invoices Ledger",
    description: "Recent settled invoices with items, tax and payment detail.",
    category: "ORDER",
    permission: "report.read",
    href: "/reports/view?key=invoices",
    endpoint: "/reporting/invoices",
  },
  {
    key: "refunds",
    title: "Refunds",
    description: "Refunds issued against orders in a date range.",
    category: "ORDER",
    permission: "report.read",
    href: "/finance",
  },

  // ---- Item Related Reports ----------------------------------------------
  {
    key: "item-performance",
    title: "Menu Item Performance",
    description: "Units sold and net sales by menu item.",
    category: "ITEM",
    permission: "report.read",
    href: "/reports/view?key=item-performance",
    endpoint: "/reporting/item-performance",
  },
  {
    key: "item-margin",
    title: "Menu Margin / Food Cost",
    description: "Food cost and margin per menu item, where a recipe is costed.",
    category: "ITEM",
    permission: "report.financial.read",
    href: "/reports/view?key=item-margin",
    endpoint: "/reporting/item-margin",
  },
  {
    key: "inventory-variance",
    title: "Inventory Consumption vs Purchase",
    description: "Ingredient consumption vs purchase variance.",
    category: "ITEM",
    permission: "report.financial.read",
    href: "/reports/view?key=inventory-variance",
    endpoint: "/reporting/inventory-variance",
  },

  // ---- Category Related Reports -------------------------------------------
  {
    key: "category-mix",
    title: "Category-wise Sales Mix",
    description: "Sales split by menu category, from the KPI dashboard.",
    category: "CATEGORY",
    permission: "report.read",
    href: "/reports/view?key=category-mix",
    endpoint: "/reporting/dashboard",
  },

  // ---- Customer Related Reports --------------------------------------------
  {
    key: "customer-insights",
    title: "Customer Insights",
    description: "Unique customers, repeat-visit rate and top spenders.",
    category: "CUSTOMER",
    permission: "report.read",
    href: "/reports/view?key=customer-insights",
    endpoint: "/reporting/customer-insights",
  },

  // ---- Discount Related Reports ---------------------------------------------
  {
    key: "discount-void-analysis",
    title: "Discounts & Voids Analysis",
    description: "Voided items and discounted orders, broken down by reason, staff and day.",
    category: "DISCOUNT",
    permission: "report.financial.read",
    href: "/reports/view?key=discount-void-analysis",
    endpoint: "/reporting/discount-void-analysis",
  },
  {
    key: "leakage-report",
    title: "Leakage & Loss Detection",
    description: "Waived-off invoice value and reprint activity — revenue at risk.",
    category: "DISCOUNT",
    permission: "report.financial.read",
    href: "/reports/view?key=leakage-report",
    endpoint: "/reporting/leakage-report",
  },

  // ---- Others Reports ----------------------------------------------------
  {
    key: "staff-performance",
    title: "Staff / Waiter Performance",
    description: "Sales, tips and cash variance by waiter.",
    category: "OTHERS",
    permission: "report.financial.read",
    href: "/reports/view?key=staff-performance",
    endpoint: "/reporting/staff-performance",
  },
  {
    key: "table-utilization",
    title: "Table / Floor Utilization",
    description: "Table and section utilization across the floor.",
    category: "OTHERS",
    permission: "report.read",
    href: "/reports/view?key=table-utilization",
    endpoint: "/reporting/table-utilization",
  },
  {
    key: "tally-export",
    title: "Tally ERP Voucher Export",
    description: "A day's transactions formatted as Tally ERP vouchers.",
    category: "OTHERS",
    permission: "report.read",
    href: "/reports/view?key=tally-export",
    endpoint: "/reporting/tally-export",
  },
  {
    key: "kitchen-prep-times",
    title: "Kitchen Prep Times",
    description: "KOT prep time by station and item, with SLA breach tracking.",
    category: "OTHERS",
    permission: "report.read",
    href: "/kitchen-analytics",
  },
  {
    key: "waiter-floor-monitor",
    title: "Waiter Floor Monitor",
    description: "Live view of which waiters are on the floor and which tables they hold.",
    category: "OTHERS",
    permission: "report.read",
    href: "/waiter-monitor",
  },
  {
    key: "audit-log",
    title: "Audit Log",
    description: "Who changed what, and when — the outlet's audit trail.",
    category: "OTHERS",
    permission: "report.read",
    href: "/admin?tab=audit",
  },
];

export function getReportByKey(key: string | undefined | null): ReportCatalogEntry | undefined {
  if (!key) return undefined;
  return REPORT_CATALOG.find((r) => r.key === key);
}

/** Reports visible to a user with the given real permission set (super
 * admins pass permissions=null and see everything, matching Nav.tsx). */
export function filterReportCatalog(permissions: string[] | null): ReportCatalogEntry[] {
  if (permissions === null) return REPORT_CATALOG;
  return REPORT_CATALOG.filter((r) => permissions.includes(r.permission));
}
