import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { downloadCsv, toDateInputValue, daysAgo } from "../../components/orders-shared";

// Real response shape of GET /finance/day-end-summary — one entry per
// calendar day that had at least one COMPLETED order, in the same shape as
// GET /finance/z-report (apps/api/src/routes/finance.ts). Days with zero
// orders are simply absent from the array, never a fabricated zero row.
interface DayEndRowApi {
  outletId: string;
  date: string;
  totalSales: string;
  totalTax: string;
  grandTotal: string;
  totalTips: string;
  totalServiceCharge: string;
  handoverCount: number;
  handoverCashCounted: string;
  handoverTipPayout: string;
  handoverDigitalTips: string;
  paymentModes: Record<string, string>;
  invoiceCount: number;
}

const MAX_RANGE_DAYS = 92; // mirrors DAY_END_SUMMARY_MAX_DAYS in apps/api/src/routes/finance.ts

function todayIso(): string {
  return toDateInputValue(new Date());
}

function daysAgoIso(n: number): string {
  return toDateInputValue(daysAgo(n));
}

// Every money field in this response is a stringified BigInt in MINOR units
// (paise) — same convention GET /z-report uses, confirmed against how
// pages/finance.tsx formats the identical fields.
function fmtMoney(minor: string | number | null | undefined): string {
  const n = Number(minor ?? 0);
  const major = Number.isFinite(n) ? n / 100 : 0;
  return `₹${major.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function paymentModesSummary(modes: Record<string, string>): string {
  const entries = Object.entries(modes || {}).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${fmtMoney(v)}`).join(", ");
}

export default function DayEndSummaryPage() {
  const { me, loading: authLoading } = useAuthGuard("report.read");

  const [draftFrom, setDraftFrom] = useState<string>(daysAgoIso(29));
  const [draftTo, setDraftTo] = useState<string>(todayIso());
  const [appliedFrom, setAppliedFrom] = useState<string>(draftFrom);
  const [appliedTo, setAppliedTo] = useState<string>(draftTo);

  const [rows, setRows] = useState<DayEndRowApi[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ startDate: appliedFrom, endDate: appliedTo });
    authedFetch(`/finance/day-end-summary?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json() as Promise<DayEndRowApi[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load day-end summary");
        setRows(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, appliedFrom, appliedTo]);

  const handleSearch = () => {
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
  };

  const handleShowAll = () => {
    // The endpoint requires a bounded range (no open-ended "all time"
    // query) — "Show All" here means the widest range it accepts.
    const from = daysAgoIso(MAX_RANGE_DAYS - 1);
    const to = todayIso();
    setDraftFrom(from);
    setDraftTo(to);
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const exportExcel = () => {
    if (!rows || rows.length === 0) return;
    downloadCsv(
      `day-end-summary_${appliedFrom}_${appliedTo}.csv`,
      ["Date", "Invoices", "Total Sales", "Tax", "Grand Total", "Tips", "Service Charge", "Payment Modes"],
      rows.map((r) => [
        r.date,
        r.invoiceCount,
        (Number(r.totalSales) / 100).toFixed(2),
        (Number(r.totalTax) / 100).toFixed(2),
        (Number(r.grandTotal) / 100).toFixed(2),
        (Number(r.totalTips) / 100).toFixed(2),
        (Number(r.totalServiceCharge) / 100).toFixed(2),
        paymentModesSummary(r.paymentModes),
      ])
    );
  };

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("report.read");

  return (
    <div className="des-app">
      <Head>
        <title>KapMeta POS - Day End Summary</title>
        <meta name="description" content="Per-day Z-report totals across a date range." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Reports</span>
                <h1 className="greeting-title">Day End Summary</h1>
                <p className="greeting-subtitle">
                  One row per day that had at least one settled order — sales, tax, tips and payment mix.
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={exportExcel} disabled={!rows || rows.length === 0}>
                Export Excel
              </button>
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

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading day-end summary...</h3>
                  </div>
                )}

                {!loading && error && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load day-end summary</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">🗒️</span>
                    <h3>No Results Found</h3>
                    <p>No settled orders were found for {appliedFrom} to {appliedTo}. Try a different date range.</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length > 0 && (
                  <section className="panel-card">
                    <div className="panel-header">
                      <div>
                        <h3>Day-End Totals</h3>
                        <p className="panel-sub">From GET /finance/day-end-summary for {appliedFrom} to {appliedTo}</p>
                      </div>
                      <span className="total-badge">{rows.length} day(s)</span>
                    </div>
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Invoices</th>
                            <th>Total Sales</th>
                            <th>Tax</th>
                            <th>Grand Total</th>
                            <th>Tips</th>
                            <th>Service Charge</th>
                            <th>Payment Modes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.date}>
                              <td>{r.date}</td>
                              <td>{r.invoiceCount}</td>
                              <td className="amount-cell">{fmtMoney(r.totalSales)}</td>
                              <td className="amount-cell">{fmtMoney(r.totalTax)}</td>
                              <td className="amount-cell">{fmtMoney(r.grandTotal)}</td>
                              <td className="amount-cell">{fmtMoney(r.totalTips)}</td>
                              <td className="amount-cell">{fmtMoney(r.totalServiceCharge)}</td>
                              <td className="modes-cell">{paymentModesSummary(r.paymentModes)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .des-app {
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
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .btn-primary {
          border: 1px solid var(--dark-btn);
          background: var(--dark-btn);
          color: var(--bg-card);
        }
        .btn-primary:hover:not(:disabled) { background: var(--dark-btn-hover); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
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
          white-space: nowrap;
        }
        .clean-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .clean-table tr:hover td { background: var(--bg-subtle); }
        .amount-cell { font-weight: 700; color: var(--text-primary); white-space: nowrap; }
        .modes-cell { color: var(--text-secondary); font-size: 0.8125rem; }
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
