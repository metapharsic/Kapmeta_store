import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// Service Payment History. 7 tabs, all fetching
// GET /management/payment-history?tab=<key>. Only "PG Transactions" has
// real backing data (the payments table, filtered to non-cash methods) -
// every other tab returns { items: [], note } from the honest-stub route
// in management.ts, and this page surfaces that note instead of hiding
// the gap or fabricating rows.

interface TxnRow {
  id: string;
  orderId: string;
  amountMinor: string;
  method: string;
  status: string;
  transactionId: string | null;
  createdAt: string;
}

interface HistoryResult {
  items: TxnRow[];
  total: number;
  note?: string;
}

const TABS = [
  { key: "pg", label: "PG Transactions" },
  { key: "swiping", label: "Swiping Transactions" },
  { key: "mdr", label: "MDR Transactions" },
  { key: "hardware", label: "Hardware" },
  { key: "deposit", label: "Security Deposit" },
  { key: "invoices", label: "Monthly Invoices" },
  { key: "ledgers", label: "Restaurant Ledgers" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function formatMoney(minor: string): string {
  const n = Number(minor) / 100;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ServicePaymentHistoryPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.read");

  const [tab, setTab] = useState<TabKey>("pg");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [result, setResult] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ tab });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    authedFetch(`/management/payment-history?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json: HistoryResult) => setResult(json))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setResult(null);
      })
      .finally(() => setLoading(false));
  }, [tab, from, to]);

  useEffect(() => {
    if (authLoading) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, tab]);

  if (authLoading) return null;
  const noAccess = me && !me.permissions.includes("settings.read");

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Service Payment History</title>
      </Head>
      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / Accounting / Service Payment History
                </span>
                <h1 className="greeting-title">Service Payment History</h1>
              </div>
            </section>

            {noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "settings.read" permission required here.</p>
              </div>
            )}

            {!noAccess && (
              <>
                <section className="panel-card">
                  <div className="sub-tabs">
                    {TABS.map((t) => (
                      <button
                        type="button"
                        key={t.key}
                        className={`sub-tab ${tab === t.key ? "sub-tab-active" : ""}`}
                        onClick={() => setTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="filter-row">
                    <label className="filter-field">
                      <span>From</span>
                      <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="filter-field">
                      <span>To</span>
                      <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                    <div className="filter-actions">
                      <button type="button" className="btn-primary" disabled={loading} onClick={runSearch}>
                        Search
                      </button>
                    </div>
                  </div>
                </section>

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading...</h3>
                  </div>
                )}

                {!loading && error && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load this tab</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && result && result.note && (
                  <div className="empty-state-card">
                    <span className="empty-icon">🚧</span>
                    <h3>Not yet available</h3>
                    <p>{result.note}</p>
                  </div>
                )}

                {!loading && !error && result && !result.note && result.items.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📭</span>
                    <h3>No records found</h3>
                    <p>Try widening the date range.</p>
                  </div>
                )}

                {!loading && !error && result && !result.note && result.items.length > 0 && (
                  <section className="panel-card">
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Method</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Transaction ID</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.items.map((r) => (
                            <tr key={r.id}>
                              <td>{r.orderId}</td>
                              <td>{r.method}</td>
                              <td>{formatMoney(r.amountMinor)}</td>
                              <td>{r.status}</td>
                              <td>{r.transactionId || "—"}</td>
                              <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="footer-count">Showing {result.items.length} of {result.total} record{result.total === 1 ? "" : "s"}.</p>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .mg-app { display: flex; flex-direction: column; min-height: 100vh; background-color: var(--bg-base); color: var(--text-primary); }
        .dashboard-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
        .sub-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .sub-tab { border: none; background: transparent; color: var(--text-muted); padding: 8px 12px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; border-radius: var(--radius-md); }
        .sub-tab-active { background: var(--bg-base); color: var(--text-primary); }
        .filter-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
        .filter-actions { display: flex; gap: 10px; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
        .footer-count { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
