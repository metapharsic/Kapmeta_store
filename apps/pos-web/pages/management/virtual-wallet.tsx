import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// Payments > Virtual Wallet. Real fetch against
// GET /management/virtual-wallet?mobile=&from=&to= (apps/api/src/routes/
// management.ts) - real balances computed from wallet_transactions.

interface WalletRow {
  customerMobile: string;
  remainingAmountMinor: string;
  lastActivityAt: string;
}

function formatMoney(minor: string): string {
  const n = Number(minor) / 100;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VirtualWalletPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.read");

  const [mobile, setMobile] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState<WalletRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  const runSearch = React.useCallback((clear = false) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (!clear) {
      if (mobile.trim()) params.set("mobile", mobile.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    authedFetch(`/management/virtual-wallet?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => setRows(Array.isArray(json) ? json : []))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setRows(null);
      })
      .finally(() => setLoading(false));
  }, [mobile, from, to]);

  React.useEffect(() => {
    if (authLoading) return;
    runSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  if (authLoading) return null;
  const noAccess = me && !me.permissions.includes("settings.read");

  const copyMobile = async (m: string) => {
    try {
      await navigator.clipboard.writeText(m);
      setCopiedFor(m);
      setTimeout(() => setCopiedFor((c) => (c === m ? null : c)), 1500);
    } catch {
      // clipboard API unavailable - silently ignore, not a functional bug
    }
  };

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Virtual Wallet</title>
      </Head>
      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / Payments / Virtual Wallet
                </span>
                <h1 className="greeting-title">Virtual Wallet</h1>
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
                  <div className="filter-row">
                    <label className="filter-field">
                      <span>Mobile No</span>
                      <input className="field-input" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                    </label>
                    <label className="filter-field">
                      <span>From</span>
                      <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="filter-field">
                      <span>To</span>
                      <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                    <div className="filter-actions">
                      <button type="button" className="btn-primary" disabled={loading} onClick={() => runSearch(false)}>
                        Search
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={loading}
                        onClick={() => {
                          setMobile("");
                          setFrom("");
                          setTo("");
                          runSearch(true);
                        }}
                      >
                        Show All
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
                    <h3>Could not load virtual wallet balances</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📭</span>
                    <h3>No wallet balances found</h3>
                    <p>Try widening the date range or clearing the mobile filter.</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length > 0 && (
                  <section className="panel-card">
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Mobile No</th>
                            <th>Remaining Amount</th>
                            <th>Last Activity</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.customerMobile}>
                              <td>{r.customerMobile}</td>
                              <td>{formatMoney(r.remainingAmountMinor)}</td>
                              <td>{new Date(r.lastActivityAt).toLocaleString("en-IN")}</td>
                              <td>
                                <button type="button" className="btn-secondary" onClick={() => copyMobile(r.customerMobile)}>
                                  {copiedFor === r.customerMobile ? "Copied" : "Copy"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="footer-count">
                      Showing 1 to {rows.length} of {rows.length} record{rows.length === 1 ? "" : "s"}.
                    </p>
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
        .filter-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
        .filter-actions { display: flex; gap: 10px; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
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
