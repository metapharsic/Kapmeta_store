// KOT history report ("KOT" screen from the reference design).
//
// This is deliberately a SEPARATE view from the live KDS card board in
// KapMetaKotView.tsx: the board is a real-time work surface (live timers,
// "Food Is Ready" buttons, audio chime) while this is a historical, filterable,
// paginated table. They share the /kitchen route and are switched with the
// `?view=list` query param so the history screen is deep-linkable and the
// browser Back button works between the two.
//
// Data source: GET /kitchen/kot/history?fromDate&toDate&orderType&page&limit
// (apps/api/src/routes/kitchen.ts).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";

export interface KotHistoryItem {
  kotId: string;
  ticketNumber: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderType: string | null;
  tableNumber: string | null;
  stationName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
  itemNames: string[];
  status: string;
  billPrintedAt: string | null;
  servedAt: string | null;
  completeDurationSeconds: number | null;
  completeDuration: string | null;
  createdAt: string;
}

interface KotHistoryResponse {
  items: KotHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 15;

const ORDER_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Order Type" },
  { value: "DINE_IN", label: "Dine In" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICK_UP,PICKUP,TAKEAWAY", label: "Pick Up" },
  { value: "ONLINE", label: "Online" },
];

/* ------------------------------------------------------------------ */
/* Status mapping                                                      */
/* ------------------------------------------------------------------ */
// Implemented from the canonical mapping documented above `model KOTTicket`
// in kapmeta/schema.prisma. That doc block is the source of truth:
//
//   Reference label   Canonical value
//   Not Prepared      QUEUED       (legacy aliases: KOT_CREATED, PENDING)
//   Preparing         PREPARING    (legacy aliases: IN_PREPARATION, COOKING)
//   Active            READY
//   Used In Bill      SERVED, with billPrintedAt non-null
//   Cancelled         CANCELLED
//
// "Used In Bill" is not a stored status: it is SERVED *plus* a printed bill.
// A SERVED ticket with no bill printed yet is therefore not "Used In Bill";
// it is still an open ticket on the floor, so it shows the nearest reference
// label, "Active".
export type KotStatusLabel = "Used In Bill" | "Not Prepared" | "Active" | "Preparing" | "Cancelled" | "Unknown";

export function normalizeKotStatus(raw: string | null | undefined): string {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "KOT_CREATED" || s === "PENDING") return "QUEUED";
  if (s === "IN_PREPARATION" || s === "COOKING") return "PREPARING";
  return s;
}

export function kotStatusLabel(raw: string | null | undefined, billPrintedAt: string | null): KotStatusLabel {
  switch (normalizeKotStatus(raw)) {
    case "QUEUED":
      return "Not Prepared";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Active";
    case "SERVED":
      return billPrintedAt ? "Used In Bill" : "Active";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function statusToneClass(label: KotStatusLabel): string {
  switch (label) {
    case "Used In Bill":
      return "tone-accent";
    case "Preparing":
      return "tone-warning";
    case "Active":
      return "tone-blue";
    case "Cancelled":
      return "tone-destructive";
    case "Not Prepared":
    default:
      return "tone-neutral";
  }
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */
function formatDateTime(value: string | null): string {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const pad = (n: number) => String(n).padStart(2, "0");
  let hours = d.getHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(hours)}:${pad(d.getMinutes())} ${meridiem}`;
}

function orderTypeDisplay(raw: string | null): string {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return "--";
  if (t === "DINE_IN") return "Dine In";
  if (t === "DELIVERY") return "Delivery";
  if (t === "PICK_UP" || t === "PICKUP" || t === "TAKEAWAY") return "Pick Up";
  if (t === "ONLINE") return "Online";
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function kotDisplayId(row: KotHistoryItem): string {
  return row.ticketNumber || (row.kotId ? row.kotId.slice(0, 8).toUpperCase() : "--");
}

// Same client-side CSV construction the rest of the app uses
// (pages/kitchen-analytics.tsx, pages/inventory.tsx) - this app deliberately
// ships no spreadsheet dependency.
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function toFromIso(date: string): string | undefined {
  return date ? `${date}T00:00:00` : undefined;
}
function toToIso(date: string): string | undefined {
  // The API filters createdAt with `lte`, so a bare date would exclude the day.
  return date ? `${date}T23:59:59.999` : undefined;
}

export interface KotHistoryViewProps {
  onBackToBoard?: () => void;
}

export default function KotHistoryView({ onBackToBoard }: KotHistoryViewProps) {
  const router = useRouter();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [orderType, setOrderType] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<KotHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchPage = useCallback(
    async (targetPage: number, signal?: AbortSignal): Promise<KotHistoryResponse | null> => {
      const url =
        "/kitchen/kot/history" +
        buildQuery({
          fromDate: toFromIso(fromDate),
          toDate: toToIso(toDate),
          orderType: orderType || undefined,
          page: targetPage,
          limit: PAGE_SIZE,
        });
      const res = await authedFetch(url, signal ? { signal } : {});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as KotHistoryResponse;
      return data;
    },
    [fromDate, toDate, orderType]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPage(page, controller.signal)
      .then((data) => {
        if (controller.signal.aborted || !data) return;
        setRows(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total) || 0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRows([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load KOT history");
        setLoading(false);
      });
    return () => controller.abort();
  }, [fetchPage, page]);

  // Date / order-type filtering happens server side; the free-text box and the
  // status select narrow the page that is already loaded.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const label = kotStatusLabel(r.status, r.billPrintedAt);
      if (statusFilter && label !== statusFilter) return false;
      if (!q) return true;
      return (
        kotDisplayId(r).toLowerCase().includes(q) ||
        String(r.orderNumber || "").toLowerCase().includes(q) ||
        String(r.customerName || "").toLowerCase().includes(q) ||
        String(r.customerPhone || "").toLowerCase().includes(q) ||
        String(r.tableNumber || "").toLowerCase().includes(q) ||
        String(r.stationName || "").toLowerCase().includes(q) ||
        r.itemNames.some((n) => String(n).toLowerCase().includes(q))
      );
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRecord = Math.min(page * PAGE_SIZE, total);

  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const out: number[] = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }, [page, totalPages]);

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setOrderType("");
    setSearch("");
    setStatusFilter("");
    setPage(1);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Pull every page that matches the current server-side filters so the
      // export is the whole report, not just the visible 15 rows.
      const collected: KotHistoryItem[] = [];
      const maxPages = Math.max(1, Math.min(totalPages, 400));
      for (let p = 1; p <= maxPages; p += 1) {
        const data = await fetchPage(p);
        if (!data || !Array.isArray(data.items) || data.items.length === 0) break;
        collected.push(...data.items);
        if (collected.length >= (Number(data.total) || 0)) break;
      }
      const source = collected.length > 0 ? collected : rows;
      const header = [
        "KOT ID",
        "Order Type",
        "Customer Name",
        "Customer Phone",
        "No. Of Items",
        "Items",
        "Status",
        "Bill Print Date",
        "Complete Duration",
        "Created",
      ];
      const body = source.map((r) => [
        kotDisplayId(r),
        orderTypeDisplay(r.orderType),
        r.customerName || "",
        r.customerPhone || "",
        r.itemCount,
        r.itemNames.join("; "),
        kotStatusLabel(r.status, r.billPrintedAt),
        formatDateTime(r.billPrintedAt),
        r.completeDuration || "--",
        formatDateTime(r.createdAt),
      ]);
      downloadCsv(`kot-report-${new Date().toISOString().split("T")[0]}.csv`, [header, ...body]);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const goToBoard = () => {
    if (onBackToBoard) onBackToBoard();
    else router.push("/kitchen");
  };

  return (
    <div className="kot-history-root">
      {/* Heading + Export */}
      <div className="kot-history-topbar">
        <div className="heading-block">
          <h1 className="kot-history-heading">KOT</h1>
          <div className="view-switch" role="group" aria-label="KOT view">
            <button type="button" className="switch-opt" onClick={goToBoard}>
              Live Board
            </button>
            <button type="button" className="switch-opt is-selected" aria-current="page">
              KOT List
            </button>
          </div>
        </div>

        <button type="button" className="btn-export" onClick={handleExport} disabled={exporting}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Filter row */}
      <div className="kot-filter-row">
        <label className="filter-field">
          <span className="filter-label">Start Date</span>
          <input
            type="date"
            className="filter-input"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="filter-field">
          <span className="filter-label">End Date</span>
          <input
            type="date"
            className="filter-input"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="filter-field">
          <span className="filter-label">Order Type</span>
          <select
            className="filter-input"
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value);
              setPage(1);
            }}
          >
            {ORDER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`btn-ghost ${showMoreFilters ? "is-open" : ""}`}
          onClick={() => setShowMoreFilters((p) => !p)}
          aria-expanded={showMoreFilters}
        >
          More Filters
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div className="filter-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="filter-input search-input"
            placeholder="Search KOT, order, customer or item"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button type="button" className="btn-primary" onClick={resetFilters}>
          Show All
        </button>
      </div>

      {showMoreFilters && (
        <div className="more-filters-panel">
          <label className="filter-field">
            <span className="filter-label">Status</span>
            <select
              className="filter-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Used In Bill">Used In Bill</option>
              <option value="Not Prepared">Not Prepared</option>
              <option value="Active">Active</option>
              <option value="Preparing">Preparing</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <p className="panel-hint">
            Dates and order type are applied across the whole report. Status and search narrow the{" "}
            {rows.length} record{rows.length === 1 ? "" : "s"} on this page.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="kot-table-scroll">
        <table className="kot-table">
          <thead>
            <tr>
              <th scope="col">KOT ID</th>
              <th scope="col">Order Type</th>
              <th scope="col">Customer Name</th>
              <th scope="col">Customer Phone</th>
              <th scope="col" className="num">No. Of Items</th>
              <th scope="col">Items</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Bill Print Date</th>
              <th scope="col" className="num">Complete Duration</th>
              <th scope="col" className="num">Created</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="table-state">Loading KOT history...</td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={11} className="table-state is-error">{error}</td>
              </tr>
            )}

            {!loading && !error && visibleRows.length === 0 && (
              <tr>
                <td colSpan={11} className="table-state">No KOT records found for these filters.</td>
              </tr>
            )}

            {!loading &&
              !error &&
              visibleRows.map((row) => {
                const label = kotStatusLabel(row.status, row.billPrintedAt);
                const isOpen = expandedId === row.kotId;
                return (
                  <React.Fragment key={row.kotId}>
                    <tr className={isOpen ? "is-expanded" : ""}>
                      <td className="cell-strong">{kotDisplayId(row)}</td>
                      <td>{orderTypeDisplay(row.orderType)}</td>
                      <td>{row.customerName || "--"}</td>
                      <td className="num">{row.customerPhone || "--"}</td>
                      <td className="num">{row.itemCount}</td>
                      <td className="cell-items" title={row.itemNames.join(", ")}>
                        {row.itemNames.length > 0 ? row.itemNames.join(", ") : "--"}
                      </td>
                      <td>
                        <span className={`status-chip ${statusToneClass(label)}`}>{label}</span>
                      </td>
                      <td className="num">{formatDateTime(row.billPrintedAt)}</td>
                      <td className="num">{row.completeDuration || "--"}</td>
                      <td className="num">{formatDateTime(row.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-row-action"
                          onClick={() => setExpandedId(isOpen ? null : row.kotId)}
                          aria-expanded={isOpen}
                          title={isOpen ? "Hide KOT details" : "View KOT details"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span className="sr-only">View KOT {kotDisplayId(row)}</span>
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={11}>
                          <div className="detail-grid">
                            <div>
                              <span className="detail-label">Order No.</span>
                              <span className="detail-value">{row.orderNumber || "--"}</span>
                            </div>
                            <div>
                              <span className="detail-label">Table</span>
                              <span className="detail-value">{row.tableNumber || "--"}</span>
                            </div>
                            <div>
                              <span className="detail-label">Station</span>
                              <span className="detail-value">{row.stationName || "--"}</span>
                            </div>
                            <div>
                              <span className="detail-label">Served At</span>
                              <span className="detail-value num">{formatDateTime(row.servedAt)}</span>
                            </div>
                            <div className="detail-items">
                              <span className="detail-label">Items</span>
                              <span className="detail-value">
                                {row.itemNames.length > 0 ? row.itemNames.join(", ") : "--"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Footer: modified-KOT legend + pagination */}
      <div className="kot-table-footer">
        <div className="footer-left">
          <span
            className="modified-kot-legend"
            title="Rows highlighted in this colour were edited after the KOT was printed."
          >
            <span className="legend-swatch" aria-hidden="true" />
            Modified KOT
          </span>
        </div>

        <div className="footer-right">
          <span className="record-count num">
            Showing {firstRecord} to {lastRecord} of {total} records
          </span>

          <div className="pager" role="navigation" aria-label="Pagination">
            {page > 1 && (
              <button type="button" className="pager-btn" onClick={() => setPage(page - 1)}>
                Prev
              </button>
            )}
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                className={`pager-btn num ${n === page ? "is-current" : ""}`}
                aria-current={n === page ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="pager-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Next
            </button>
            <button
              type="button"
              className="pager-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .kot-history-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 64px);
          background: var(--bg-base);
          padding: 16px 20px 12px;
          gap: 12px;
          overflow: hidden;
        }

        .kot-history-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .heading-block {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .kot-history-heading {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.3px;
          color: var(--text-primary);
        }

        .view-switch {
          display: inline-flex;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          padding: 3px;
          gap: 2px;
        }
        .switch-opt {
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 600;
          padding: 7px 14px;
          min-height: 32px;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: background 180ms ease, color 180ms ease;
        }
        .switch-opt:hover {
          color: var(--text-primary);
        }
        .switch-opt.is-selected {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .btn-export {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--accent);
          color: var(--bg-card);
          border: 1px solid var(--accent);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 600;
          padding: 9px 16px;
          min-height: 38px;
          cursor: pointer;
          transition: background 180ms ease;
        }
        .btn-export:hover:not(:disabled) {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }
        .btn-export:disabled {
          opacity: 0.6;
          cursor: progress;
        }

        /* Filters */
        .kot-filter-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 12px;
        }
        .filter-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .filter-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .filter-input {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 500;
          padding: 8px 10px;
          min-height: 36px;
          cursor: pointer;
        }
        .filter-input:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
        .search-input {
          cursor: text;
          padding-left: 30px;
          min-width: 240px;
        }
        .filter-search {
          position: relative;
          display: flex;
          align-items: center;
          color: var(--text-muted);
        }
        .filter-search > :global(svg) {
          position: absolute;
          left: 9px;
          pointer-events: none;
        }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 600;
          padding: 8px 12px;
          min-height: 36px;
          cursor: pointer;
          transition: background 180ms ease, color 180ms ease;
        }
        .btn-ghost:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .btn-ghost :global(svg) {
          transition: transform 180ms ease;
        }
        .btn-ghost.is-open :global(svg) {
          transform: rotate(180deg);
        }

        .btn-primary {
          background: var(--dark-btn);
          color: var(--bg-card);
          border: 1px solid var(--dark-btn);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          font-weight: 600;
          padding: 8px 16px;
          min-height: 36px;
          cursor: pointer;
          transition: background 180ms ease;
        }
        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }

        .more-filters-panel {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 12px;
        }
        .panel-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* Table */
        .kot-table-scroll {
          flex: 1;
          overflow: auto;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
        }
        .kot-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.8125rem;
        }
        .kot-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: var(--bg-subtle);
          border-bottom: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          text-align: left;
          padding: 10px 12px;
          white-space: nowrap;
        }
        .kot-table thead th.num {
          text-align: right;
        }
        .kot-table tbody td {
          height: 36px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          vertical-align: middle;
        }
        .kot-table tbody tr:hover td {
          background: var(--bg-hover);
        }
        .kot-table tbody tr.is-expanded td {
          background: var(--bg-hover);
        }
        .cell-strong {
          color: var(--text-primary);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .cell-items {
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .table-state {
          text-align: center;
          color: var(--text-muted);
          padding: 28px 12px;
        }
        .table-state.is-error {
          color: var(--destructive-text);
        }

        .status-chip {
          display: inline-flex;
          align-items: center;
          border-radius: var(--radius-pill);
          font-size: 0.72rem;
          font-weight: 700;
          padding: 4px 10px;
          white-space: nowrap;
        }
        .tone-accent {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }
        .tone-warning {
          background: var(--warning-subtle);
          color: var(--warning-text);
        }
        .tone-blue {
          background: var(--blue-subtle);
          color: var(--blue-text);
        }
        .tone-destructive {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
        }
        .tone-neutral {
          background: var(--bg-subtle);
          color: var(--text-secondary);
        }

        .btn-row-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 180ms ease, color 180ms ease;
        }
        .btn-row-action:hover {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-color: var(--accent-subtle);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .detail-row td {
          background: var(--bg-subtle);
        }
        .detail-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 28px;
        }
        .detail-grid > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .detail-items {
          flex: 1 1 100%;
        }
        .detail-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .detail-value {
          font-size: 0.8125rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        /* Footer */
        .kot-table-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .modified-kot-legend {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: help;
        }
        .legend-swatch {
          width: 12px;
          height: 12px;
          border-radius: var(--radius-sm);
          background: var(--warning-subtle);
          border: 1px solid var(--warning);
        }
        .footer-right {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .record-count {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .pager {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .pager-btn {
          min-width: 32px;
          min-height: 32px;
          padding: 0 9px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 180ms ease, color 180ms ease;
        }
        .pager-btn:hover:not(:disabled) {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .pager-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .pager-btn.is-current {
          background: var(--accent-subtle);
          border-color: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }

        @media (prefers-reduced-motion: reduce) {
          .switch-opt,
          .btn-export,
          .btn-ghost,
          .btn-ghost :global(svg),
          .btn-primary,
          .btn-row-action,
          .pager-btn {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
