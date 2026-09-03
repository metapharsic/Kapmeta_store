// Shared catalog for the "Management" nav section's generic pages
// (pages/management/list.tsx, settings.tsx, logs.tsx), mirroring the
// pattern in lib/report-catalog.ts + pages/reports/view.tsx: one small
// catalog file + a couple of reusable pages keyed by query param, instead
// of a bespoke page per screen.
//
// 'list' entries map to GET/POST/PUT/DELETE /management/lists (a distinct
// listKey per screen). 'settings' entries map to GET/PUT
// /management/settings/:key (a distinct settingsKey per screen). Every
// entry here is backed by the real routes added alongside this catalog -
// no row here is invented.

export type ManagementEntryKind = "list" | "settings";

export interface ManagementCatalogEntry {
  /** Stable id, used as the ?key= query param for the generic pages. */
  key: string;
  title: string;
  kind: ManagementEntryKind;
  /** Real management_lists.list_key value. Set when kind === "list". */
  listKey?: string;
  /** Real management_settings key. Set when kind === "settings". */
  settingsKey?: string;
}

export const MANAGEMENT_CATALOG: ManagementCatalogEntry[] = [
  // ---- Configuration ------------------------------------------------
  { key: "outlet_configuration", title: "Outlet Configuration", kind: "settings", settingsKey: "outlet_configuration" },
  { key: "sub_order_type", title: "Sub Order Type", kind: "list", listKey: "sub_order_type" },
  { key: "delivery_distance", title: "Delivery Distance", kind: "list", listKey: "delivery_distance" },
  { key: "area_locality_delivery_charges", title: "Area/Locality Wise Delivery Charges", kind: "list", listKey: "area_locality_delivery_charges" },
  { key: "floor_plan", title: "Floor Plan", kind: "list", listKey: "floor_plan" },
  { key: "email_template_settings", title: "Email Template Settings", kind: "list", listKey: "email_template_settings" },

  // ---- Accounting -----------------------------------------------------
  { key: "virtual_wallet", title: "Virtual Wallet", kind: "settings", settingsKey: "virtual_wallet" },
  { key: "online_order_reconciliation", title: "Online Order Reconciliation", kind: "settings", settingsKey: "online_order_reconciliation" },
  { key: "gst_information", title: "GST Information", kind: "settings", settingsKey: "gst_information" },
  { key: "utility_bill_operator", title: "Utility Bill Operator", kind: "list", listKey: "utility_bill_operator" },
  { key: "expense_withdrawal", title: "Expense & Withdrawal", kind: "settings", settingsKey: "expense_withdrawal" },
  { key: "service_payment_history", title: "Service Payment History", kind: "settings", settingsKey: "service_payment_history" },
  { key: "loan_information", title: "Loan Information", kind: "list", listKey: "loan_information" },
  { key: "denomination", title: "Denomination", kind: "list", listKey: "denomination" },
];

export function getManagementEntryByKey(key: string | undefined | null): ManagementCatalogEntry | undefined {
  if (!key) return undefined;
  return MANAGEMENT_CATALOG.find((e) => e.key === key);
}

// ---- User Logs --------------------------------------------------------
// Maps to GET /management/logs?type=<logType>. Real rows only exist today
// for ONLINE_ITEM_ON_OFF - every other type legitimately returns an empty
// array until that log type is written to, which is correct, not a bug.
export interface LogCatalogEntry {
  key: string;
  title: string;
  logType: string;
}

export const LOG_CATALOG: LogCatalogEntry[] = [
  { key: "online-store", title: "Online Store Logs", logType: "ONLINE_STORE" },
  { key: "online-item-on-off", title: "Online Item On/Off Logs", logType: "ONLINE_ITEM_ON_OFF" },
  { key: "auto-accept", title: "Auto Accept Change Logs", logType: "AUTO_ACCEPT" },
  { key: "support-management", title: "Support Management", logType: "SUPPORT" },
  { key: "notification", title: "Notification", logType: "NOTIFICATION" },
  { key: "menu-trigger", title: "Menu Trigger Logs", logType: "MENU_TRIGGER" },
  { key: "closing-hour", title: "Closing Hour Logs", logType: "CLOSING_HOUR" },
  { key: "expense", title: "Expense Logs", logType: "EXPENSE" },
  { key: "withdrawal", title: "Withdrawal Logs", logType: "WITHDRAWAL" },
  { key: "cash-topup", title: "Cash Top-Up Logs", logType: "CASH_TOPUP" },
];

export function getLogEntryByType(logType: string | undefined | null): LogCatalogEntry | undefined {
  if (!logType) return undefined;
  return LOG_CATALOG.find((e) => e.logType === logType);
}
