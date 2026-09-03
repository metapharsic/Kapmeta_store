import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// Online Order Reconciliation. Provider tabs come from the REAL connected
// channel accounts (GET /channels), not a hardcoded Zomato/Swiggy list -
// an outlet with different or no connections must see its actual state.
// Sub-tabs:
//  - Missing Orders: real orders for the provider/date range
//    (GET /management/online-reconciliation/missing-orders) - see that
//    route's own header comment for why it's a simplification, not a true
//    provider-feed diff.
//  - Status Mismatch / Variance / Rejected-Cancelled / Final: honest
//    stubs (GET /management/online-reconciliation/:tab) - no provider
//    feed exists in this schema to compute these against, and the route
//    says so in its `note` field, surfaced here instead of hidden.

interface ChannelAccount {
  id: string;
  channel: string | null;
  externalOutletId: string | null;
  status: string;
}

interface MissingOrderRow {
  id: string;
  orderNumber: string;
  provider: string | null;
  externalOrderId: string | null;
  status: string;
  grandTotalMinor: string;
  createdAt: string;
}

interface StubResult {
  items: unknown[];
  total: number;
  note?: string;
}

const SUB_TABS = [
  { key: "missing-orders", label: "Missing Orders" },
  { key: "status-mismatch", label: "Status Mismatch Orders" },
  { key: "variance", label: "Variance Orders" },
  { key: "rejected-cancelled", label: "Rejected-Cancelled Orders" },
  { key: "final", label: "Final Reconciliation" },
] as const;

type SubTabKey = (typeof SUB_TABS)[number]["key"];

function formatMoney(minor: string): string {
  const n = Number(minor) / 100;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OnlineReconciliationPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.read");

  const [channels, setChannels] = useState<ChannelAccount[] | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subTab, setSubTab] = useState<SubTabKey>("missing-orders");

  const [missingRows, setMissingRows] = useState<MissingOrderRow[] | null>(null);
  const [stubResult, setStubResult] = useState<StubResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real connected channel accounts drive the provider tab list - never a
  // hardcoded Zomato/Swiggy guess (GET /channels requires
  // integration.manage; a role without it just sees "All Providers").
  useEffect(() => {
    if (authLoading) return;
    authedFetch("/channels")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => setChannels(Array.isArray(json) ? json : []))
      .catch((err) => {
        setChannelsError(err instanceof Error ? err.message : "Failed to load connected channels");
        setChannels([]);
      });
  }, [authLoading]);

  const runSearch = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (provider) params.set("provider", provider);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    if (subTab === "missing-orders") {
      authedFetch(`/management/online-reconciliation/missing-orders?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP error ${res.status}`);
          }
          return res.json();
        })
        .then((json) => {
          setMissingRows(Array.isArray(json) ? json : []);
          setStubResult(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load");
          setMissingRows(null);
        })
        .finally(() => setLoading(false));
    } else {
      authedFetch(`/management/online-reconciliation/${subTab}?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP error ${res.status}`);
          }
          return res.json();
        })
        .then((json: StubResult) => {
          setStubResult(json);
          setMissingRows(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load");
          setStubResult(null);
        })
        .finally(() => setLoading(false));
    }
  }, [provider, from, to, subTab]);

  useEffect(() => {
    if (authLoading) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, subTab]);

  if (authLoading) return null;
  const noAccess = me && !me.permissions.includes("settings.read");

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Online Order Reconciliation</title>
      </Head>
      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / Accounting / Online Order Reconciliation
                </span>
                <h1 className="greeting-title">Online Order Reconciliation</h1>
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
                  <div className="provider-tabs">
                    <button type="button" className={`chip ${provider === "" ? "chip-active" : ""}`} onClick={() => setProvider("")}>
                      All Providers
                    </button>
                    {channels && channels.length > 0 &&
                      Array.from(new Set(channels.map((c) => c.channel).filter((c): c is string => !!c))).map((ch) => (
                        <button
                          type="button"
                          key={ch}
                          className={`chip ${provider === ch ? "chip-active" : ""}`}
                          onClick={() => setProvider(ch)}
                        >
                          {ch}
                        </button>
                      ))}
                  </div>
                  {channelsError && (
                    <p className="hint-text">
                      Could not load connected channel accounts ({channelsError}) - showing "All Providers" only. This
                      requires the "integration.manage" permission.
                    </p>
                  )}
                  {channels && channels.length === 0 && !channelsError && (
                    <p className="hint-text">No delivery apps are connected for this outlet yet (see Aggregator Center &gt; Connect Delivery Apps).</p>
                  )}

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
                      <button type="button" className="btn-secondary" disabled title="File processing for provider reconciliation exports is not implemented yet">
                        Upload File (not yet implemented)
                      </button>
                    </div>
                  </div>
                </section>

                <section className="panel-card">
                  <div className="sub-tabs">
                    {SUB_TABS.map((t) => (
                      <button
                        type="button"
                        key={t.key}
                        className={`sub-tab ${subTab === t.key ? "sub-tab-active" : ""}`}
                        onClick={() => setSubTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

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

                  {!loading && !error && subTab === "missing-orders" && missingRows && missingRows.length === 0 && (
                    <div className="empty-state-card">
                      <span className="empty-icon">📭</span>
                      <h3>No online orders found</h3>
                      <p>No orders match this provider/date range.</p>
                    </div>
                  )}

                  {!loading && !error && subTab === "missing-orders" && missingRows && missingRows.length > 0 && (
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Order #</th>
                            <th>Provider</th>
                            <th>External Order ID</th>
                            <th>Status</th>
                            <th>Total</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missingRows.map((r) => (
                            <tr key={r.id}>
                              <td>{r.orderNumber}</td>
                              <td>{r.provider || "—"}</td>
                              <td>{r.externalOrderId || "—"}</td>
                              <td>{r.status}</td>
                              <td>{formatMoney(r.grandTotalMinor)}</td>
                              <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!loading && !error && subTab !== "missing-orders" && stubResult && (
                    <div className="empty-state-card">
                      <span className="empty-icon">🚧</span>
                      <h3>Not yet computable</h3>
                      <p>{stubResult.note || "This tab has no backing data source yet."}</p>
                    </div>
                  )}
                </section>
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
        .provider-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); border-radius: 999px; padding: 6px 14px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
        .chip-active { background: var(--dark-btn); color: var(--bg-card); border-color: var(--dark-btn); }
        .hint-text { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .filter-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
        .filter-actions { display: flex; gap: 10px; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
        .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .sub-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .sub-tab { border: none; background: transparent; color: var(--text-muted); padding: 8px 12px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; border-radius: var(--radius-md); }
        .sub-tab-active { background: var(--bg-base); color: var(--text-primary); }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
