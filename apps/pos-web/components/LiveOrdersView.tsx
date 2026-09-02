import React, { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "../lib/auth";
import { formatCurrency, formatMinor, minorToMajor } from "./orders-shared";

// ---------------------------------------------------------------------------
// Wire shapes (GET /orders/live/summary, GET /tables, GET /tables/occupancy).
// Every money field is a BigInt serialised to a string in minor units.
// ---------------------------------------------------------------------------

interface SummaryBucket {
  count: number;
  amountMinor: string;
}

interface LiveSummary {
  running: {
    totalOrders: number;
    totalAmountMinor: string;
    byOrderType: {
      DINE_IN: SummaryBucket;
      PICKUP: SummaryBucket;
      DELIVERY: SummaryBucket;
    };
  };
  pending: {
    totalOrders: number;
    totalAmountMinor: string;
    inPreparation: SummaryBucket;
    waitingForPickup: SummaryBucket;
    outForDelivery: SummaryBucket;
  };
}

interface TableRow {
  id: string;
  tableNumber: string;
  name?: string;
  section?: string | null;
  status: string;
  capacity?: number;
  elapsedMinutes: number | null;
  currentOrderAmountMinor: string | null;
  activeOrderId?: string | null;
}

interface OccupancySummary {
  totalTables: number;
  occupiedTables: number;
  vacantTables: number;
  estimatedRevenueMinor: string;
}

export interface LiveOrdersViewProps {
  /** Opens the order register filtered to one table's running order. */
  onOpenOrder?: (orderId: string) => void;
}

type LiveTab = "RUNNING_ORDERS" | "RUNNING_TABLES";

const EMPTY_BUCKET: SummaryBucket = { count: 0, amountMinor: "0" };

// --- Icons (SVG, never emoji — the design contract bans emoji as functional
// iconography). 20px stroke glyphs that inherit `currentColor`. -------------

function IconDineIn() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M6 12v9" />
      <path d="M17 3c-1.7 1.2-2.5 3-2.5 5.2 0 1.6.8 2.8 2.5 3.3V21" />
    </svg>
  );
}

function IconPickup() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function IconDelivery() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="18" r="2.6" />
      <path d="M8.6 18h6.8" />
      <path d="M6 15.4V11h5l3 4.5" />
      <path d="M11 11 9.6 6.5H7.2" />
      <path d="M14.6 11h3.2l1.4 4.6" />
    </svg>
  );
}

function IconPreparing() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c1.6 2.4 1 4-.6 5.4C9.4 10.2 8.6 12 8.6 13.6a3.4 3.4 0 0 0 6.8 0c0-1-.3-1.8-.8-2.6 2.2 1 3.4 3 3.4 5.2A6 6 0 0 1 6 16.2C6 11 12 9.6 12 3Z" />
    </svg>
  );
}

function IconWaiting() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function IconOutForDelivery() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 7.5h10v9h-10z" />
      <path d="M12.5 10.5h4l3 3v3h-7z" />
      <circle cx="6.5" cy="18" r="1.8" />
      <circle cx="16.5" cy="18" r="1.8" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export default function LiveOrdersView({ onOpenOrder }: LiveOrdersViewProps) {
  const [tab, setTab] = useState<LiveTab>("RUNNING_ORDERS");
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isManual: boolean) => {
    if (isManual) setRefreshing(true);
    try {
      const [summaryRes, tablesRes, occupancyRes] = await Promise.all([
        authedFetch("/orders/live/summary"),
        authedFetch("/tables"),
        authedFetch("/tables/occupancy"),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(Array.isArray(data) ? data : data.tables || []);
      }
      if (occupancyRes.ok) setOccupancy(await occupancyRes.json());

      if (!summaryRes.ok && !tablesRes.ok) {
        setError("Could not reach the live order feed.");
      } else {
        setError(null);
      }
    } catch (err) {
      console.error("Failed to load live orders:", err);
      setError("Could not reach the live order feed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(false), 20000);
    return () => clearInterval(id);
  }, [load]);

  const running = summary?.running;
  const pending = summary?.pending;

  const runningRows = useMemo(
    () => [
      { key: "DINE_IN", label: "Dine in", icon: <IconDineIn />, bucket: running?.byOrderType?.DINE_IN || EMPTY_BUCKET },
      { key: "PICKUP", label: "Pick up", icon: <IconPickup />, bucket: running?.byOrderType?.PICKUP || EMPTY_BUCKET },
      { key: "DELIVERY", label: "Delivery", icon: <IconDelivery />, bucket: running?.byOrderType?.DELIVERY || EMPTY_BUCKET },
    ],
    [running]
  );

  const pendingRows = useMemo(
    () => [
      { key: "PREP", label: "In Preparation", icon: <IconPreparing />, bucket: pending?.inPreparation || EMPTY_BUCKET },
      { key: "WAIT", label: "Waiting For Pickup", icon: <IconWaiting />, bucket: pending?.waitingForPickup || EMPTY_BUCKET },
      { key: "OFD", label: "Out For Delivery", icon: <IconOutForDelivery />, bucket: pending?.outForDelivery || EMPTY_BUCKET },
    ],
    [pending]
  );

  // A table is "running" when the floor has an open session on it. /tables
  // reports that as a non-VACANT status; the amount/elapsed pair only exists
  // when there is an order behind it.
  const runningTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          String(t.status || "").toUpperCase() !== "VACANT" ||
          t.currentOrderAmountMinor !== null ||
          t.elapsedMinutes !== null
      ),
    [tables]
  );

  const activeTableCount = occupancy ? occupancy.occupiedTables : runningTables.length;
  const estimatedRevenue = occupancy
    ? minorToMajor(occupancy.estimatedRevenueMinor)
    : runningTables.reduce((sum, t) => sum + minorToMajor(t.currentOrderAmountMinor), 0);

  return (
    <div className="live-root">
      <header className="live-head">
        <div className="live-head-left">
          <h1 className="live-title">Live Orders</h1>
          <div className="live-tabstrip" role="tablist" aria-label="Live orders views">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "RUNNING_ORDERS"}
              className={`live-tab ${tab === "RUNNING_ORDERS" ? "is-active" : ""}`}
              onClick={() => setTab("RUNNING_ORDERS")}
            >
              Running Orders
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "RUNNING_TABLES"}
              className={`live-tab ${tab === "RUNNING_TABLES" ? "is-active" : ""}`}
              onClick={() => setTab("RUNNING_TABLES")}
            >
              Running Tables
            </button>
          </div>
        </div>

        <button type="button" className="btn-refresh" onClick={() => load(true)} disabled={refreshing}>
          <IconRefresh />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </header>

      {error && <div className="live-error">{error}</div>}

      {tab === "RUNNING_ORDERS" ? (
        <div className="live-card-grid">
          <section className="live-card">
            <h2 className="live-card-title">Running Orders</h2>
            <div className="tile-pair">
              <div className="tile">
                <span className="tile-label">Total Orders</span>
                <span className="tile-value">{loading && !summary ? "—" : running?.totalOrders ?? 0}</span>
              </div>
              <div className="tile">
                <span className="tile-label">Total Amount</span>
                <span className="tile-value tile-money">
                  {loading && !summary ? "—" : formatCurrency(minorToMajor(running?.totalAmountMinor))}
                </span>
              </div>
            </div>
            <ul className="breakdown-list">
              {runningRows.map((row) => (
                <li className="breakdown-row" key={row.key}>
                  <span className="row-icon" aria-hidden="true">{row.icon}</span>
                  <span className="row-text">
                    <span className="row-title">{row.label}</span>
                    <span className="row-sub">{row.bucket.count} orders</span>
                  </span>
                  <span className="row-amount">{formatCurrency(minorToMajor(row.bucket.amountMinor))}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="live-card">
            <h2 className="live-card-title">Pending Orders</h2>
            <div className="tile-pair">
              <div className="tile">
                <span className="tile-label">Total Orders</span>
                <span className="tile-value">{loading && !summary ? "—" : pending?.totalOrders ?? 0}</span>
              </div>
              <div className="tile">
                <span className="tile-label">Total Amount</span>
                <span className="tile-value tile-money">
                  {loading && !summary ? "—" : formatCurrency(minorToMajor(pending?.totalAmountMinor))}
                </span>
              </div>
            </div>
            <ul className="breakdown-list">
              {pendingRows.map((row) => (
                <li className="breakdown-row" key={row.key}>
                  <span className="row-icon" aria-hidden="true">{row.icon}</span>
                  <span className="row-text">
                    <span className="row-title">{row.label}</span>
                    <span className="row-sub">{row.bucket.count} orders</span>
                  </span>
                  <span className="row-amount">{formatCurrency(minorToMajor(row.bucket.amountMinor))}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="tables-pane">
          <div className="tile-pair tile-pair-wide">
            <div className="tile">
              <span className="tile-label">Active Tables</span>
              <span className="tile-value">{loading && !occupancy ? "—" : activeTableCount}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Revenue (Estimated)</span>
              <span className="tile-value tile-money">
                {loading && !occupancy ? "—" : formatCurrency(estimatedRevenue)}
              </span>
            </div>
          </div>

          {runningTables.length === 0 ? (
            <div className="empty-pane">
              {loading ? "Loading floor status…" : "No table currently has a running order."}
            </div>
          ) : (
            <div className="table-card-grid">
              {runningTables.map((t) => {
                const orderId = t.activeOrderId || null;
                const clickable = Boolean(orderId && onOpenOrder);
                const body = (
                  <>
                    <span className="table-card-name">{t.name || t.tableNumber}</span>
                    <span className="table-card-amount">
                      {t.currentOrderAmountMinor === null
                        ? "—"
                        : `₹${formatMinor(t.currentOrderAmountMinor)}`}
                    </span>
                    <span className="table-card-elapsed">
                      <span className="elapsed-value">
                        {t.elapsedMinutes === null ? "—" : `${t.elapsedMinutes} Min`}
                      </span>
                      <span className="elapsed-label">Time Lapsed</span>
                    </span>
                  </>
                );

                return clickable ? (
                  <button
                    key={t.id}
                    type="button"
                    className="table-card is-clickable"
                    onClick={() => onOpenOrder && orderId && onOpenOrder(orderId)}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={t.id} className="table-card">
                    {body}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .live-root {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: var(--bg-base);
        }

        .live-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .live-title {
          margin: 0 0 10px 0;
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .live-tabstrip {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
        }

        .live-tab {
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
        .live-tab:hover {
          color: var(--text-primary);
        }
        .live-tab.is-active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .live-tab:focus-visible,
        .btn-refresh:focus-visible,
        .table-card:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .btn-refresh {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 18px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: var(--shadow-card);
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .btn-refresh:hover:not(:disabled) {
          background: var(--bg-subtle);
          border-color: var(--text-muted);
        }
        .btn-refresh:disabled {
          cursor: progress;
          color: var(--text-secondary);
        }

        .live-error {
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .live-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 16px;
          align-items: start;
        }

        .live-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 16px;
        }

        .live-card-title {
          margin: 0 0 12px 0;
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .tile-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .tile-pair-wide {
          max-width: 560px;
        }

        .tile {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px;
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
        }

        .tile-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .tile-value {
          font-size: 1.375rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .tile-money {
          font-size: 1.125rem;
        }

        .breakdown-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .breakdown-row {
          display: grid;
          grid-template-columns: 40px 1fr auto;
          align-items: center;
          gap: 12px;
          min-height: 56px;
          padding: 8px 12px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-card);
        }

        .row-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }

        .row-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .row-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .row-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .row-amount {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .tables-pane {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .table-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }

        .table-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          min-height: 118px;
          padding: 14px;
          text-align: left;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          box-shadow: var(--shadow-card);
          font: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .table-card.is-clickable {
          cursor: pointer;
        }
        .table-card.is-clickable:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow-pop);
        }

        .table-card-name {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .table-card-amount {
          display: inline-block;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          font-size: 0.8125rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .table-card-elapsed {
          display: flex;
          flex-direction: column;
          margin-top: auto;
        }

        .elapsed-value {
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .elapsed-label {
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .empty-pane {
          padding: 48px 16px;
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-muted);
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }

        @media (prefers-reduced-motion: reduce) {
          .live-tab,
          .btn-refresh,
          .table-card {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
