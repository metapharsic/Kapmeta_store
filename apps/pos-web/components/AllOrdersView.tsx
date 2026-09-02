import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "../lib/auth";
import RevenueTrendChart, { TrendPoint } from "./RevenueTrendChart";
import {
  daysAgo,
  downloadCsv,
  endOfToday,
  formatCurrency,
  formatDateTime,
  formatDayLabel,
  formatMoney,
  humanizeCode,
  minorToMajor,
  startOfToday,
  statusTone,
  toDateInputValue,
} from "./orders-shared";

export type AllOrdersMode = "ORDER" | "ADVANCE";

/**
 * One normalised row of the All Orders / Advance Order table. Both feeds
 * (`GET /orders`, which returns the `*Minor` envelope, and `GET /orders/advance`,
 * which returns raw order rows) are folded onto this shape.
 *
 * `isAirConditioned` is deliberately `boolean | null`: the `dining_tables`
 * column exists but is NULL until the outlet fills it in, and "unknown" is not
 * the same as "not air conditioned". The subtitle is rendered only for `true`
 * or `false`.
 */
export interface OrdersTableRow {
  id: string;
  orderNo: string;
  orderTypeRaw: string;
  tableNumber: string | null;
  isAirConditioned: boolean | null;
  customerName: string | null;
  assignTo: string | null;
  itemCount: number;
  myAmountMinorNum: number;
  taxMinorNum: number;
  discountMinorNum: number;
  grandTotalMinorNum: number;
  roundOffMinorNum: number | null;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
  channel: string | null;
  isAdvance: boolean;
  isSplit: boolean;
  isSettled: boolean;
  /** `updated_at` moved after `created_at` — the bill was edited post-print. */
  isUpdatedAfterSave: boolean;
}

export interface AllOrdersViewProps {
  mode: AllOrdersMode;
  onModeChange: (mode: AllOrdersMode) => void;
  onViewOrder: (orderId: string) => void;
  /** Optional pre-seeded rows shown until the first fetch resolves. */
  seedRows?: OrdersTableRow[];
}

interface CumulativeItem {
  menuItemId: string;
  menuItemName: string;
  totalQuantity: number;
  totalAmountMinor: string;
}

interface AppliedFilters {
  fromDate: string;
  toDate: string;
  orderType: string;
  orderNumber: string;
  status: string;
  /** Server-side scope: "" (everything), "live" or "online". */
  view: string;
}

const PAGE_SIZE = 10;
const AGGREGATE_LIMIT = 200;
const AGGREGATE_MAX_PAGES = 25;

const RANGE_PRESETS: { value: string; label: string; days: number | null }[] = [
  { value: "TODAY", label: "Today's Orders", days: 0 },
  { value: "D7", label: "Last 7 Days Orders", days: 6 },
  { value: "D15", label: "Last 15 Days Orders", days: 14 },
  { value: "D30", label: "Last 30 Days Orders", days: 29 },
  { value: "D90", label: "Last 90 Days Orders", days: 89 },
  { value: "CUSTOM", label: "Custom Range", days: null },
];

// Only these order types survive the repository's whitelist
// (PrismaOrderRepository.buildOrdersWhere) — anything else is dropped and the
// list comes back unfiltered, so offering it would be a dead control.
const ORDER_TYPE_OPTIONS = ["DINE_IN", "PICKUP", "TAKEAWAY", "DELIVERY"];
const STATUS_OPTIONS = [
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "KOT_CREATED",
  "IN_PREPARATION",
  "READY",
  "SERVED",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
];
// `view` is the only other narrowing the orders repository honours. A
// `channel` filter is deliberately NOT offered here: the route accepts the
// parameter but buildOrdersWhere ignores it, so the control would look like it
// worked while changing nothing.
const VIEW_OPTIONS: { value: string; label: string }[] = [
  { value: "live", label: "Open orders only" },
  { value: "online", label: "Online / aggregator only" },
];

const SETTLED_STATUSES = new Set(["COMPLETED", "SETTLED", "PAID"]);
// Mirrors TERMINAL_ORDER_STATUSES in @kapmeta/orders: what `view=live` excludes.
const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "FAILED"]);

/**
 * "Updated After Save & Print" is only knowable when the payload carries both
 * timestamps. `GET /orders` does not send `updatedAt`, so list rows report
 * false rather than guessing; the advance feed does, so those rows are real.
 * A one-second floor keeps insert-time jitter from flagging every row.
 */
function detectUpdatedAfterSave(createdAt: unknown, updatedAt: unknown): boolean {
  if (!createdAt || !updatedAt) return false;
  const c = new Date(String(createdAt)).getTime();
  const u = new Date(String(updatedAt)).getTime();
  if (!Number.isFinite(c) || !Number.isFinite(u)) return false;
  return u - c > 1000;
}

function toIsoStart(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toIsoEnd(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `GET /orders` envelope row -> table row. */
function normalizeListRow(
  o: any,
  tableInfo: Map<string, { tableNumber: string; isAirConditioned: boolean | null }>
): OrdersTableRow {
  const grand = Number(o.grandTotalMinor || 0);
  const tax = Number(o.taxTotalMinor || 0);
  const discount = Number(o.discountTotalMinor || 0);
  const table = o.diningTableId ? tableInfo.get(o.diningTableId) : undefined;
  const status = String(o.status || "");

  return {
    id: o.id,
    orderNo: o.orderNumber,
    orderTypeRaw: o.orderType,
    tableNumber: table?.tableNumber ?? null,
    isAirConditioned: table?.isAirConditioned ?? null,
    customerName: o.customerName ?? null,
    assignTo: o.waiterName ?? null,
    itemCount: Number(o.itemCount || 0),
    myAmountMinorNum: grand - tax + discount,
    taxMinorNum: tax,
    discountMinorNum: discount,
    grandTotalMinorNum: grand,
    roundOffMinorNum:
      o.roundOffMinor === undefined || o.roundOffMinor === null ? null : Number(o.roundOffMinor),
    paymentMethod: o.paymentMethod ?? null,
    status,
    createdAt: o.createdAt,
    channel: o.channel ?? null,
    isAdvance: Boolean(o.scheduledFireAt || o.advanceStatus),
    isSplit: Boolean(o.splitMode),
    isSettled: SETTLED_STATUSES.has(status.toUpperCase()),
    isUpdatedAfterSave: detectUpdatedAfterSave(o.createdAt, o.updatedAt),
  };
}

/** Raw `GET /orders/advance` order row (Prisma model shape) -> table row. */
function normalizeAdvanceRow(o: any): OrdersTableRow {
  const grand = Number(o.grandTotal ?? o.grandTotalMinor ?? 0);
  const tax = Number(o.taxTotal ?? o.taxTotalMinor ?? 0);
  const discount = Number(o.discountTotal ?? o.discountTotalMinor ?? 0);
  const status = String(o.status || "");
  const acRaw = o.diningTable ? o.diningTable.isAirConditioned : undefined;

  return {
    id: o.id,
    orderNo: o.orderNumber,
    orderTypeRaw: o.orderType,
    tableNumber: o.diningTable?.tableNumber ?? null,
    isAirConditioned: acRaw === true || acRaw === false ? acRaw : null,
    customerName: o.customerName ?? null,
    assignTo: o.waiterName ?? null,
    itemCount: Array.isArray(o.orderItems)
      ? o.orderItems.filter((it: any) => !it.isVoided).length
      : Number(o.itemCount || 0),
    myAmountMinorNum: grand - tax + discount,
    taxMinorNum: tax,
    discountMinorNum: discount,
    grandTotalMinorNum: grand,
    roundOffMinorNum:
      o.roundOffMinor === undefined || o.roundOffMinor === null ? null : Number(o.roundOffMinor),
    paymentMethod: o.paymentMethod ?? null,
    status,
    createdAt: o.scheduledFireAt || o.createdAt,
    channel: o.channel ?? null,
    isAdvance: true,
    isSplit: Boolean(o.splitMode),
    isSettled: SETTLED_STATUSES.has(status.toUpperCase()),
    isUpdatedAfterSave: detectUpdatedAfterSave(o.createdAt, o.updatedAt),
  };
}

function buildTrendFromRows(rows: OrdersTableRow[]): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) || 0) + r.grandTotalMinorNum / 100);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ label: formatDayLabel(date), value, tooltipLabel: date }));
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9V3.5h10V9" />
      <path d="M6.5 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1.5" />
      <path d="M7 14h10v6.5H7Z" />
    </svg>
  );
}

export default function AllOrdersView({
  mode,
  onModeChange,
  onViewOrder,
  seedRows,
}: AllOrdersViewProps) {
  const defaultFrom = toDateInputValue(daysAgo(14));
  const defaultTo = toDateInputValue(startOfToday());

  const [rangePreset, setRangePreset] = useState("D15");
  const [draft, setDraft] = useState<AppliedFilters>({
    fromDate: defaultFrom,
    toDate: defaultTo,
    orderType: "",
    orderNumber: "",
    status: "",
    view: "",
  });
  const [applied, setApplied] = useState<AppliedFilters>(draft);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrdersTableRow[]>(seedRows || []);
  const [total, setTotal] = useState(seedRows?.length || 0);
  const [aggregateRows, setAggregateRows] = useState<OrdersTableRow[]>([]);
  const [aggregateTruncated, setAggregateTruncated] = useState(false);
  const [grandTotal, setGrandTotal] = useState(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendMessage, setTrendMessage] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [cumulativeOpen, setCumulativeOpen] = useState(false);
  const [cumulativeLoading, setCumulativeLoading] = useState(false);
  const [cumulativeItems, setCumulativeItems] = useState<CumulativeItem[]>([]);
  const [cumulativeOrderCount, setCumulativeOrderCount] = useState(0);
  const [cumulativeTotals, setCumulativeTotals] = useState<{ qty: number; amountMinor: string }>({
    qty: 0,
    amountMinor: "0",
  });

  const tableInfoRef = useRef<Map<string, { tableNumber: string; isAirConditioned: boolean | null }>>(
    new Map()
  );
  const [tableInfoVersion, setTableInfoVersion] = useState(0);

  // Table numbers (and the AC flag, once the outlet fills it in) are not on the
  // orders payload; they come from the floor plan and are joined client-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/tables");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data.tables || [];
        const map = new Map<string, { tableNumber: string; isAirConditioned: boolean | null }>();
        for (const t of list) {
          const ac = t.isAirConditioned;
          map.set(t.id, {
            tableNumber: t.tableNumber || t.name || "",
            isAirConditioned: ac === true || ac === false ? ac : null,
          });
        }
        tableInfoRef.current = map;
        setTableInfoVersion((v) => v + 1);
      } catch {
        /* table names stay blank; the order rows still render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQuery = useCallback((f: AppliedFilters) => {
    const qs = new URLSearchParams();
    const from = toIsoStart(f.fromDate);
    const to = toIsoEnd(f.toDate);
    if (from) qs.set("fromDate", from);
    if (to) qs.set("toDate", to);
    if (f.orderType) qs.set("orderType", f.orderType);
    if (f.orderNumber.trim()) qs.set("orderNumber", f.orderNumber.trim());
    if (f.status) qs.set("status", f.status);
    if (f.view) qs.set("view", f.view);
    return qs;
  }, []);

  // --- Page of rows --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (mode === "ADVANCE") {
          const res = await authedFetch("/orders/advance");
          if (!res.ok) throw new Error("Failed to load advance orders");
          const data = await res.json();
          const list: any[] = Array.isArray(data) ? data : data.orders || [];
          const all = list.map(normalizeAdvanceRow);

          const fromMs = applied.fromDate ? new Date(`${applied.fromDate}T00:00:00`).getTime() : null;
          const toMs = applied.toDate ? new Date(`${applied.toDate}T23:59:59.999`).getTime() : null;
          const wanted = all.filter((r) => {
            const t = new Date(r.createdAt).getTime();
            if (fromMs !== null && Number.isFinite(t) && t < fromMs) return false;
            if (toMs !== null && Number.isFinite(t) && t > toMs) return false;
            if (applied.orderType && String(r.orderTypeRaw).toUpperCase() !== applied.orderType)
              return false;
            if (applied.status && String(r.status).toUpperCase() !== applied.status) return false;
            if (applied.view === "online" && !r.channel) return false;
            if (
              applied.view === "live" &&
              TERMINAL_STATUSES.has(String(r.status).toUpperCase())
            )
              return false;
            if (
              applied.orderNumber.trim() &&
              !String(r.orderNo).toLowerCase().includes(applied.orderNumber.trim().toLowerCase())
            )
              return false;
            return true;
          });
          wanted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (cancelled) return;
          setAggregateRows(wanted);
          setAggregateTruncated(false);
          setTotal(wanted.length);
          setRows(wanted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
          setGrandTotal(wanted.reduce((s, r) => s + r.grandTotalMinorNum / 100, 0));
          setTrend(buildTrendFromRows(wanted));
          setTrendMessage(undefined);
          setTrendLoading(false);
        } else {
          const qs = buildQuery(applied);
          qs.set("page", String(page));
          qs.set("limit", String(PAGE_SIZE));
          const res = await authedFetch(`/orders?${qs.toString()}`);
          if (!res.ok) throw new Error("Failed to load orders");
          const data = await res.json();
          const list: any[] = data.orders || (Array.isArray(data) ? data : []);
          if (cancelled) return;
          setRows(list.map((o) => normalizeListRow(o, tableInfoRef.current)));
          setTotal(Number(data.total || list.length));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load orders for this range.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, applied, page, buildQuery, tableInfoVersion]);

  // --- Range aggregate (Grand Total + export set + trend fallback) ---------
  useEffect(() => {
    if (mode === "ADVANCE") return;
    let cancelled = false;

    (async () => {
      const base = buildQuery(applied);
      const collected: OrdersTableRow[] = [];
      let truncated = false;
      let apiTotal = 0;

      try {
        for (let p = 1; p <= AGGREGATE_MAX_PAGES; p += 1) {
          const qs = new URLSearchParams(base);
          qs.set("page", String(p));
          qs.set("limit", String(AGGREGATE_LIMIT));
          const res = await authedFetch(`/orders?${qs.toString()}`);
          if (!res.ok) break;
          const data = await res.json();
          const list: any[] = data.orders || [];
          apiTotal = Number(data.total || 0);
          for (const o of list) collected.push(normalizeListRow(o, tableInfoRef.current));
          if (list.length < AGGREGATE_LIMIT || collected.length >= apiTotal) break;
          if (p === AGGREGATE_MAX_PAGES) truncated = true;
        }
        if (apiTotal > collected.length) truncated = true;
      } catch (err) {
        console.error("Failed to aggregate order totals:", err);
      }

      if (cancelled) return;
      setAggregateRows(collected);
      setAggregateTruncated(truncated);
      setGrandTotal(collected.reduce((s, r) => s + r.grandTotalMinorNum / 100, 0));
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, applied, buildQuery, tableInfoVersion]);

  // --- Revenue trend (Order tab) ------------------------------------------
  useEffect(() => {
    if (mode === "ADVANCE") return;
    let cancelled = false;
    setTrendLoading(true);

    (async () => {
      const qs = new URLSearchParams();
      const from = toIsoStart(applied.fromDate);
      const to = toIsoEnd(applied.toDate);
      if (from) qs.set("fromDate", from);
      if (to) qs.set("toDate", to);

      try {
        const res = await authedFetch(`/reporting/revenue-trend?${qs.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const list: any[] = Array.isArray(data) ? data : data.points || [];
          if (cancelled) return;
          setTrend(
            list.map((p) => ({
              label: formatDayLabel(p.date),
              value: minorToMajor(p.grandTotalMinor),
              tooltipLabel: p.date,
            }))
          );
          setTrendMessage(undefined);
          setTrendLoading(false);
          return;
        }
        if (!cancelled) {
          // No report.read permission (or the endpoint is down): fall back to
          // the rows already fetched for the Grand Total so the panel still
          // shows something real rather than an empty frame.
          setTrendMessage(
            res.status === 403
              ? "Revenue trend needs the report.read permission."
              : "Revenue trend is unavailable; showing the orders in range."
          );
          setTrend(buildTrendFromRows(aggregateRows));
          setTrendLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setTrend(buildTrendFromRows(aggregateRows));
          setTrendMessage("Revenue trend is unavailable; showing the orders in range.");
          setTrendLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // aggregateRows is intentionally read as a fallback only; it must not
    // re-trigger the trend request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, applied.fromDate, applied.toDate]);

  const applyPreset = (value: string) => {
    setRangePreset(value);
    const preset = RANGE_PRESETS.find((p) => p.value === value);
    if (!preset || preset.days === null) return;
    const next = {
      ...draft,
      fromDate: toDateInputValue(daysAgo(preset.days)),
      toDate: toDateInputValue(endOfToday()),
    };
    setDraft(next);
    setApplied(next);
    setPage(1);
  };

  const handleSearch = () => {
    setApplied(draft);
    setPage(1);
  };

  const handleShowAll = () => {
    const cleared: AppliedFilters = {
      fromDate: "",
      toDate: "",
      orderType: "",
      orderNumber: "",
      status: "",
      view: "",
    };
    setRangePreset("CUSTOM");
    setDraft(cleared);
    setApplied(cleared);
    setShowMoreFilters(false);
    setPage(1);
  };

  const openCumulative = async () => {
    setCumulativeOpen(true);
    setCumulativeLoading(true);
    try {
      const qs = new URLSearchParams();
      const from = toIsoStart(applied.fromDate);
      const to = toIsoEnd(applied.toDate);
      if (from) qs.set("fromDate", from);
      if (to) qs.set("toDate", to);
      const res = await authedFetch(`/orders/advance/cumulative-items?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCumulativeItems(data.items || []);
        setCumulativeOrderCount(Number(data.orderCount || 0));
        setCumulativeTotals({
          qty: Number(data.totals?.totalQuantity || 0),
          amountMinor: String(data.totals?.totalAmountMinor || "0"),
        });
      }
    } catch (err) {
      console.error("Failed to load cumulative items:", err);
    } finally {
      setCumulativeLoading(false);
    }
  };

  const exportExcel = () => {
    const source = aggregateRows.length ? aggregateRows : rows;
    downloadCsv(
      `${mode === "ADVANCE" ? "advance-orders" : "all-orders"}-${
        applied.fromDate || "start"
      }_${applied.toDate || "today"}.csv`,
      [
        "Order No.",
        "Order Type",
        "Table",
        "AC",
        "Customer Name",
        "Assign To",
        "Items",
        "My Amount",
        "Tax",
        "Discount",
        "Round Off",
        "Grand Total",
        "Payment",
        "Status",
        "Created",
      ],
      source.map((r) => [
        r.orderNo,
        humanizeCode(r.orderTypeRaw),
        r.tableNumber || "",
        r.isAirConditioned === null ? "" : r.isAirConditioned ? "AC" : "Non AC",
        r.customerName || "",
        r.assignTo || "",
        r.itemCount,
        (r.myAmountMinorNum / 100).toFixed(2),
        (r.taxMinorNum / 100).toFixed(2),
        (r.discountMinorNum / 100).toFixed(2),
        r.roundOffMinorNum === null ? "" : (r.roundOffMinorNum / 100).toFixed(2),
        (r.grandTotalMinorNum / 100).toFixed(2),
        r.paymentMethod || "",
        humanizeCode(r.status),
        formatDateTime(r.createdAt),
      ])
    );
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRecord = Math.min(page * PAGE_SIZE, total);

  const pageButtons = useMemo(() => {
    const out: number[] = [];
    const start = Math.max(1, Math.min(page - 2, pageCount - 4));
    for (let i = start; i < start + 5 && i <= pageCount; i += 1) out.push(i);
    return out;
  }, [page, pageCount]);

  const rangeLabel =
    RANGE_PRESETS.find((p) => p.value === rangePreset)?.label || "Custom Range";

  // If the reporting endpoint refused us, plot the orders we already loaded
  // for the Grand Total instead of showing an empty frame.
  const chartPoints = useMemo(
    () => (trend.length === 0 && trendMessage ? buildTrendFromRows(aggregateRows) : trend),
    [trend, trendMessage, aggregateRows]
  );

  return (
    <div className="all-root">
      <header className="all-head">
        <div className="all-head-left">
          <h1 className="all-title">All Orders</h1>
          <div className="all-tabstrip" role="tablist" aria-label="All orders views">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ORDER"}
              className={`all-tab ${mode === "ORDER" ? "is-active" : ""}`}
              onClick={() => onModeChange("ORDER")}
            >
              Order
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ADVANCE"}
              className={`all-tab ${mode === "ADVANCE" ? "is-active" : ""}`}
              onClick={() => onModeChange("ADVANCE")}
            >
              Advance Order
            </button>
          </div>
        </div>

        <div className="all-head-right">
          <div className="grand-total-chip">
            <span className="grand-total-label">Grand Total :</span>
            <span className="grand-total-value">
              {formatCurrency(grandTotal)}
              {aggregateTruncated ? "+" : ""}
            </span>
          </div>

          <label className="range-select-wrap">
            <span className="visually-hidden">Order date range</span>
            <select
              className="range-select"
              value={rangePreset}
              onChange={(e) => applyPreset(e.target.value)}
              title={rangeLabel}
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {mode === "ADVANCE" && (
            <button type="button" className="btn-secondary" onClick={openCumulative}>
              Cumulative Items
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedId}
            title={selectedId ? "Open the bill for the selected order" : "Select an order row first"}
            onClick={() => selectedId && onViewOrder(selectedId)}
          >
            Generate Invoice
          </button>

          <button type="button" className="btn-primary" onClick={exportExcel}>
            Export Excel
          </button>
        </div>
      </header>

      <section className="chart-card">
        <div className="chart-card-head">
          <h2 className="chart-title">
            {mode === "ADVANCE" ? "Advance Order Value Trend" : "Revenue Trend"}
          </h2>
          <span className="chart-sub">
            {applied.fromDate || "beginning"} &rarr; {applied.toDate || "today"}
          </span>
        </div>
        <RevenueTrendChart
          points={chartPoints}
          loading={trendLoading}
          seriesName={mode === "ADVANCE" ? "Advance value" : "Revenue"}
          emptyMessage={trendMessage || "No revenue recorded in this range."}
          ariaLabel={mode === "ADVANCE" ? "Advance order value per day" : "Revenue per day"}
        />
        {trendMessage && chartPoints.length > 0 && <p className="chart-note">{trendMessage}</p>}
      </section>

      <section className="filter-card">
        <div className="filter-row">
          <label className="field">
            <span className="field-label">Start Date</span>
            <input
              type="date"
              className="field-input"
              value={draft.fromDate}
              onChange={(e) => {
                setDraft({ ...draft, fromDate: e.target.value });
                setRangePreset("CUSTOM");
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">End Date</span>
            <input
              type="date"
              className="field-input"
              value={draft.toDate}
              onChange={(e) => {
                setDraft({ ...draft, toDate: e.target.value });
                setRangePreset("CUSTOM");
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">Order Type</span>
            <select
              className="field-input"
              value={draft.orderType}
              onChange={(e) => setDraft({ ...draft, orderType: e.target.value })}
            >
              <option value="">All Order Type</option>
              {ORDER_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {humanizeCode(t)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Order ID</span>
            <input
              type="text"
              className="field-input"
              placeholder="Order ID"
              value={draft.orderNumber}
              onChange={(e) => setDraft({ ...draft, orderNumber: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </label>

          <div className="filter-actions">
            <button
              type="button"
              className="btn-ghost"
              aria-expanded={showMoreFilters}
              onClick={() => setShowMoreFilters((v) => !v)}
            >
              More Filters <IconChevron open={showMoreFilters} />
            </button>
            <button type="button" className="btn-primary" onClick={handleSearch}>
              Search
            </button>
            <button type="button" className="btn-secondary" onClick={handleShowAll}>
              Show All
            </button>
          </div>
        </div>

        {showMoreFilters && (
          <div className="filter-row filter-row-more">
            <label className="field">
              <span className="field-label">Status</span>
              <select
                className="field-input"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {humanizeCode(s)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Records</span>
              <select
                className="field-input"
                value={draft.view}
                onChange={(e) => setDraft({ ...draft, view: e.target.value })}
              >
                <option value="">All Records</option>
                {VIEW_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      {error && <div className="all-error">{error}</div>}

      <section className="table-card">
        <div className="table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th scope="col">Order No.</th>
                <th scope="col">Order Type</th>
                <th scope="col">Customer Name</th>
                <th scope="col">Assign To</th>
                <th scope="col" className="num">Items</th>
                <th scope="col" className="num">My Amount (₹)</th>
                <th scope="col" className="num">Tax (₹)</th>
                <th scope="col" className="num">Discount (₹)</th>
                <th scope="col" className="num">Grand Total [Round Off] (₹)</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col" className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="state-cell">
                    Loading orders…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="state-cell">
                    No orders match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const tone = statusTone(r.status);
                  const classes = ["data-row"];
                  if (r.isUpdatedAfterSave) classes.push("row-updated");
                  if (r.isSettled) classes.push("row-settled");
                  if (r.channel) classes.push("row-online");
                  if (r.isAdvance) classes.push("row-advance");
                  if (r.isSplit) classes.push("row-split");
                  if (selectedId === r.id) classes.push("is-selected");

                  return (
                    <tr
                      key={r.id}
                      className={classes.join(" ")}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className="link-cell"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewOrder(r.id);
                          }}
                        >
                          {r.orderNo}
                        </button>
                        {r.channel && <span className="chip-inline">{humanizeCode(r.channel)}</span>}
                      </td>

                      <td>
                        <span className="cell-title">
                          {humanizeCode(r.orderTypeRaw)}
                          {r.tableNumber ? ` (${r.tableNumber})` : ""}
                        </span>
                        {r.isAirConditioned !== null && (
                          <span className="cell-sub">{r.isAirConditioned ? "(AC)" : "(Non AC)"}</span>
                        )}
                      </td>

                      <td>{r.customerName || <span className="cell-blank">—</span>}</td>
                      <td>{r.assignTo || <span className="cell-blank">—</span>}</td>
                      <td className="num">{r.itemCount}</td>
                      <td className="num">{formatMoney(r.myAmountMinorNum / 100)}</td>
                      <td className="num">{formatMoney(r.taxMinorNum / 100)}</td>
                      <td className="num">
                        {r.discountMinorNum ? `(${formatMoney(r.discountMinorNum / 100)})` : formatMoney(0)}
                      </td>
                      <td className="num">
                        <span className="grand-cell">{formatMoney(r.grandTotalMinorNum / 100)}</span>
                        {r.roundOffMinorNum !== null && r.roundOffMinorNum !== 0 && (
                          <span className="roundoff">[{formatMoney(r.roundOffMinorNum / 100)}]</span>
                        )}
                      </td>
                      <td>{r.paymentMethod ? humanizeCode(r.paymentMethod) : <span className="cell-blank">—</span>}</td>
                      <td>
                        <span className={`badge tone-${tone}`}>{humanizeCode(r.status)}</span>
                      </td>
                      <td className="nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="View order details"
                          aria-label={`View order ${r.orderNo}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewOrder(r.id);
                          }}
                        >
                          <IconEye />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Print bill"
                          aria-label={`Print bill for order ${r.orderNo}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewOrder(r.id);
                          }}
                        >
                          <IconPrinter />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span className="record-count">
            Showing {firstRecord} to {lastRecord} of {total} records
          </span>
          <div className="pager">
            <button
              type="button"
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage(1)}
            >
              First
            </button>
            <button
              type="button"
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            {pageButtons.map((p) => (
              <button
                key={p}
                type="button"
                className={`page-btn ${p === page ? "is-current" : ""}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage(pageCount)}
            >
              Last
            </button>
          </div>
        </div>

        <ul className="legend">
          <li className="legend-item">
            <span className="legend-swatch sw-settled" aria-hidden="true" />
            Settlement Amount
          </li>
          <li className="legend-item">
            <span className="legend-swatch sw-updated" aria-hidden="true" />
            Updated After Save &amp; Print
          </li>
          <li className="legend-item">
            <span className="legend-swatch sw-online" aria-hidden="true" />
            Online Order
          </li>
          <li className="legend-item">
            <span className="legend-swatch sw-advance" aria-hidden="true" />
            Advance Order
          </li>
          <li className="legend-item">
            <span className="legend-swatch sw-split" aria-hidden="true" />
            Split Bill
          </li>
        </ul>
      </section>

      {cumulativeOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Cumulative items"
          onClick={() => setCumulativeOpen(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 className="modal-title">Cumulative Items</h3>
                <p className="modal-sub">
                  {cumulativeOrderCount} advance {cumulativeOrderCount === 1 ? "order" : "orders"} in
                  this range
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close cumulative items"
                onClick={() => setCumulativeOpen(false)}
              >
                <IconClose />
              </button>
            </div>

            <div className="modal-body">
              {cumulativeLoading ? (
                <p className="state-cell">Loading items…</p>
              ) : cumulativeItems.length === 0 ? (
                <p className="state-cell">No advance items in this range.</p>
              ) : (
                <table className="orders-table modal-table">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" className="num">Qty</th>
                      <th scope="col" className="num">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cumulativeItems.map((it) => (
                      <tr key={it.menuItemId} className="data-row">
                        <td>{it.menuItemName}</td>
                        <td className="num">{it.totalQuantity}</td>
                        <td className="num">{formatMoney(minorToMajor(it.totalAmountMinor))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="foot-cell">Total</td>
                      <td className="num foot-cell">{cumulativeTotals.qty}</td>
                      <td className="num foot-cell">
                        {formatMoney(minorToMajor(cumulativeTotals.amountMinor))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .all-root {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .all-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .all-title {
          margin: 0 0 10px 0;
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .all-tabstrip {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
        }

        .all-tab {
          min-height: 36px;
          padding: 0 18px;
          border: none;
          border-radius: var(--radius-pill);
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .all-tab:hover {
          color: var(--text-primary);
        }
        .all-tab.is-active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .all-head-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .grand-total-chip {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--radius-md);
          background: var(--accent-subtle);
          border: 1px solid var(--border-subtle);
        }
        .grand-total-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent-subtle-text);
        }
        .grand-total-value {
          font-size: 0.9375rem;
          font-weight: 800;
          color: var(--accent-subtle-text);
          font-variant-numeric: tabular-nums;
        }

        .range-select-wrap {
          display: inline-flex;
        }
        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
          border: 0;
        }

        .range-select,
        .field-input {
          min-height: 38px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
        }
        .field-input {
          cursor: text;
          width: 100%;
        }
        select.field-input {
          cursor: pointer;
        }

        .btn-primary,
        .btn-secondary,
        .btn-ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 38px;
          padding: 0 16px;
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .btn-primary {
          border: 1px solid var(--dark-btn);
          background: var(--dark-btn);
          color: var(--bg-card);
        }
        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }
        .btn-secondary {
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .btn-secondary:hover:not(:disabled) {
          background: var(--bg-subtle);
        }
        .btn-secondary:disabled {
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .btn-ghost {
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
        }
        .btn-ghost:hover {
          color: var(--text-primary);
          background: var(--bg-subtle);
        }

        .btn-primary:focus-visible,
        .btn-secondary:focus-visible,
        .btn-ghost:focus-visible,
        .all-tab:focus-visible,
        .range-select:focus-visible,
        .field-input:focus-visible,
        .page-btn:focus-visible,
        .icon-btn:focus-visible,
        .link-cell:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .chart-card,
        .filter-card,
        .table-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 12px;
        }

        .chart-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
        }
        .chart-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .chart-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        .chart-note {
          margin: 6px 0 0 0;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .filter-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .filter-row-more {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 140px;
        }
        .field-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .filter-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }

        .all-error {
          padding: 10px 14px;
          border-radius: var(--radius-md);
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .table-scroll {
          overflow-x: auto;
        }

        .orders-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
        }

        .orders-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: var(--bg-card);
          padding: 10px 12px;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          border-bottom: 1px solid var(--border);
        }

        .orders-table td {
          padding: 8px 12px;
          height: 36px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: middle;
        }

        .orders-table .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .nowrap {
          white-space: nowrap;
        }
        .col-actions {
          text-align: right;
          white-space: nowrap;
        }

        .data-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .data-row:hover td {
          background: var(--bg-hover);
        }
        .data-row.is-selected td {
          background: var(--bg-subtle);
          box-shadow: inset 3px 0 0 0 var(--accent);
        }

        /* Row provenance tints. Each maps to the footer legend and uses only
           the subtle token palettes, so text keeps its measured contrast. */
        .row-updated td {
          background: var(--bg-subtle);
        }
        .row-settled td {
          background: var(--accent-subtle);
        }
        .row-online td {
          background: var(--blue-subtle);
        }
        .row-advance td {
          background: var(--purple-subtle);
        }
        .row-split td {
          background: var(--warning-subtle);
        }

        .link-cell {
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          background: var(--bg-card);
          padding: 3px 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-primary);
          cursor: pointer;
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        .link-cell:hover {
          border-color: var(--accent);
          color: var(--accent-subtle-text);
        }

        .chip-inline {
          margin-left: 6px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--blue-text);
        }

        .cell-title {
          display: block;
          font-weight: 600;
        }
        .cell-sub {
          display: block;
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .cell-blank {
          color: var(--text-muted);
        }

        .grand-cell {
          font-weight: 700;
        }
        .roundoff {
          margin-left: 4px;
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.6875rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .tone-neutral {
          background: var(--bg-subtle);
          color: var(--text-secondary);
        }
        .tone-accent {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }
        .tone-warning {
          background: var(--warning-subtle);
          color: var(--warning-text);
        }
        .tone-danger {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
        }
        .tone-info {
          background: var(--blue-subtle);
          color: var(--blue-text);
        }
        .tone-purple {
          background: var(--purple-subtle);
          color: var(--purple-text);
        }

        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          margin-left: 4px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .icon-btn:hover {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }

        .state-cell {
          padding: 40px 12px;
          text-align: center;
          color: var(--text-muted);
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 4px 4px 4px;
        }

        .record-count {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .pager {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }

        .page-btn {
          min-width: 34px;
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .page-btn:hover:not(:disabled) {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }
        .page-btn:disabled {
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .page-btn.is-current {
          background: var(--dark-btn);
          border-color: var(--dark-btn);
          color: var(--bg-card);
        }

        .legend {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          list-style: none;
          margin: 8px 0 0 0;
          padding: 10px 4px 0 4px;
          border-top: 1px solid var(--border-subtle);
        }
        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .legend-swatch {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          border: 1px solid var(--border);
        }
        .sw-settled {
          background: var(--accent-subtle);
        }
        .sw-updated {
          background: var(--bg-subtle);
        }
        .sw-online {
          background: var(--blue-subtle);
        }
        .sw-advance {
          background: var(--purple-subtle);
        }
        .sw-split {
          background: var(--warning-subtle);
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 200;
        }
        /* Scrim painted from a token rather than a literal rgba() value. */
        .modal-backdrop::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--dark-btn);
          opacity: 0.5;
        }
        .modal-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 560px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-modal);
          padding: 16px;
        }
        .modal-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .modal-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .modal-sub {
          margin: 4px 0 0 0;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .modal-body {
          overflow-y: auto;
        }
        .modal-table th {
          position: static;
        }
        .foot-cell {
          font-weight: 800;
          border-top: 1px solid var(--border);
        }

        @media (prefers-reduced-motion: reduce) {
          .all-tab,
          .btn-primary,
          .btn-secondary,
          .btn-ghost,
          .data-row,
          .icon-btn,
          .page-btn,
          .link-cell {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
