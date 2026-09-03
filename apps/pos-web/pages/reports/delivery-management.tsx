import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import RevenueTrendChart, { TrendPoint } from "../../components/RevenueTrendChart";
import DonutChart from "../../components/DonutChart";
import { toDateInputValue, daysAgo, formatDayLabel } from "../../components/orders-shared";

// Real response shape of GET /finance/delivery-management
// (apps/api/src/routes/finance.ts). "Delivered" = order reached
// HANDED_OVER or COMPLETED — see the route's own comment for why no
// separate DELIVERED status exists in this schema.
interface DeliveryManagementApi {
  byDay: { date: string; orderCount: number }[];
  byProvider: { provider: string; orderCount: number }[];
  deliveredCount: number;
  totalCount: number;
}

// SWIGGY / ZOMATO is the same fixed provider set used elsewhere in this app
// (components/AggregatorOrdersView.tsx's channel tabs, and the "only SWIGGY
// and ZOMATO have adapters today" check in apps/api/src/routes/integration.ts)
// — not a hardcoded business number, just the two channels this codebase
// actually has adapters for.
const PROVIDERS = ["ALL", "SWIGGY", "ZOMATO"] as const;
type Provider = (typeof PROVIDERS)[number];

function todayIso(): string {
  return toDateInputValue(new Date());
}
function daysAgoIso(n: number): string {
  return toDateInputValue(daysAgo(n));
}

const EMPTY: DeliveryManagementApi = { byDay: [], byProvider: [], deliveredCount: 0, totalCount: 0 };

export default function DeliveryManagementPage() {
  const { me, loading: authLoading } = useAuthGuard("report.read");

  const [draftFrom, setDraftFrom] = useState<string>(daysAgoIso(6));
  const [draftTo, setDraftTo] = useState<string>(todayIso());
  const [draftProvider, setDraftProvider] = useState<Provider>("ALL");
  const [appliedFrom, setAppliedFrom] = useState<string>(draftFrom);
  const [appliedTo, setAppliedTo] = useState<string>(draftTo);
  const [appliedProvider, setAppliedProvider] = useState<Provider>("ALL");

  const [data, setData] = useState<DeliveryManagementApi>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ startDate: appliedFrom, endDate: appliedTo, provider: appliedProvider });
    authedFetch(`/finance/delivery-management?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json() as Promise<DeliveryManagementApi>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load delivery management data");
        setData(EMPTY);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, appliedFrom, appliedTo, appliedProvider]);

  const handleSearch = () => {
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedProvider(draftProvider);
  };

  const handleShowAll = () => {
    const from = daysAgoIso(6);
    const to = todayIso();
    setDraftFrom(from);
    setDraftTo(to);
    setDraftProvider("ALL");
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedProvider("ALL");
  };

  const byDayPoints: TrendPoint[] = useMemo(
    () =>
      data.byDay.map((d) => ({
        label: formatDayLabel(d.date),
        value: d.orderCount,
        tooltipLabel: d.date,
      })),
    [data.byDay]
  );

  const byProviderSlices = useMemo(
    () => data.byProvider.map((p) => ({ label: p.provider, value: p.orderCount })),
    [data.byProvider]
  );

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("report.read");

  return (
    <div className="dm-app">
      <Head>
        <title>KapMeta POS - Delivery Management</title>
        <meta name="description" content="Aggregator / delivery order volume by day and by provider." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Reports</span>
                <h1 className="greeting-title">Delivery Management</h1>
                <p className="greeting-subtitle">
                  Delivery / aggregator order volume — real order data from GET /finance/delivery-management.
                </p>
              </div>
            </section>

            {noAccess ? (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No report access</h3>
                <p>Your role does not grant the "report.read" permission required to view this report.</p>
              </div>
            ) : (
              <>
                <section className="filter-card">
                  <div className="filter-row">
                    <label className="field">
                      <span className="field-label">Start Date</span>
                      <input
                        type="date"
                        className="field-input"
                        value={draftFrom}
                        max={draftTo}
                        onChange={(e) => setDraftFrom(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">End Date</span>
                      <input
                        type="date"
                        className="field-input"
                        value={draftTo}
                        min={draftFrom}
                        onChange={(e) => setDraftTo(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Select Provider</span>
                      <select
                        className="field-input"
                        value={draftProvider}
                        onChange={(e) => setDraftProvider(e.target.value as Provider)}
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p} value={p}>
                            {p === "ALL" ? "All Providers" : p.charAt(0) + p.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="filter-actions">
                      <button type="button" className="btn-primary" onClick={handleSearch}>
                        Search
                      </button>
                      <button type="button" className="btn-secondary" onClick={handleShowAll}>
                        Show All
                      </button>
                    </div>
                  </div>
                </section>

                {error && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load delivery data</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!error && (
                  <>
                    <section className="stat-row">
                      <div className="stat-tile">
                        <span className="stat-label">Total Orders</span>
                        <span className="stat-value">{data.totalCount}</span>
                      </div>
                      <div className="stat-tile">
                        <span className="stat-label">Delivered Orders</span>
                        <span className="stat-value">{data.deliveredCount}</span>
                      </div>
                      <div className="stat-tile is-muted">
                        <span className="stat-label">Credit Remaining</span>
                        <span className="stat-value">—</span>
                        <span className="stat-note">Not tracked in this system</span>
                      </div>
                      <div className="stat-tile is-muted">
                        <span className="stat-label">Credit Purchase Till Now</span>
                        <span className="stat-value">—</span>
                        <span className="stat-note">Not tracked in this system</span>
                      </div>
                    </section>

                    <section className="chart-grid">
                      <div className="chart-card">
                        <div className="chart-card-head">
                          <h2 className="chart-title">Last 7 Days Orders</h2>
                          <span className="chart-sub">by provider</span>
                        </div>
                        <DonutChart
                          slices={byProviderSlices}
                          loading={loading}
                          emptyMessage="No delivery orders in this range."
                          ariaLabel="Orders by provider"
                        />
                      </div>

                      <div className="chart-card">
                        <div className="chart-card-head">
                          <h2 className="chart-title">Last 7 Days - Delivered Orders</h2>
                          <span className="chart-sub">
                            {appliedFrom} &rarr; {appliedTo}
                          </span>
                        </div>
                        <RevenueTrendChart
                          points={byDayPoints}
                          loading={loading}
                          seriesName="Orders"
                          emptyMessage="No orders recorded in this range."
                          valueFormatter={(v) => String(Math.round(v))}
                          ariaLabel="Orders per day"
                        />
                      </div>
                    </section>

                    <section className="panel-card">
                      <div className="panel-header">
                        <div>
                          <h3>By Provider</h3>
                          <p className="panel-sub">From GET /finance/delivery-management for {appliedFrom} to {appliedTo}</p>
                        </div>
                        <span className="total-badge">{data.byProvider.length} provider(s)</span>
                      </div>
                      {data.byProvider.length === 0 ? (
                        <div className="not-available-box">
                          <p>No delivery / aggregator orders were found for this range.</p>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <table className="clean-table">
                            <thead>
                              <tr>
                                <th>Provider</th>
                                <th>Order Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.byProvider.map((p) => (
                                <tr key={p.provider}>
                                  <td>{p.provider}</td>
                                  <td className="amount-cell">{p.orderCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .dm-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background-color: var(--bg-base);
          color: var(--text-primary);
        }
        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
        .dashboard-greeting-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .breadcrumb-line {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .greeting-title {
          margin: 4px 0 2px 0;
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .greeting-subtitle {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .btn-primary, .btn-secondary {
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
        }
        .btn-primary {
          border: 1px solid var(--dark-btn);
          background: var(--dark-btn);
          color: var(--bg-card);
        }
        .btn-primary:hover { background: var(--dark-btn-hover); }
        .btn-secondary {
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .btn-secondary:hover { background: var(--bg-subtle); }
        .filter-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 16px;
        }
        .filter-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 160px;
        }
        .field-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .field-input {
          min-height: 38px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 500;
          width: 100%;
        }
        .filter-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }
        .stat-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
        }
        .stat-tile {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: var(--shadow-card);
        }
        .stat-tile.is-muted { background: var(--bg-subtle); }
        .stat-label {
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-primary);
        }
        .stat-note {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .chart-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
        }
        .chart-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 16px;
        }
        .chart-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .chart-title { margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); }
        .chart-sub { font-size: 0.75rem; color: var(--text-muted); }
        .panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }
        .panel-header h3 { margin: 0 0 2px 0; font-size: 1.125rem; font-weight: 800; }
        .panel-sub { margin: 0; font-size: 0.75rem; color: var(--text-secondary); }
        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }
        .not-available-box {
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 16px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
        .not-available-box p { margin: 0; }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th {
          padding: 12px 16px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }
        .clean-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .clean-table tr:hover td { background: var(--bg-subtle); }
        .amount-cell { font-weight: 700; color: var(--text-primary); }
        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
