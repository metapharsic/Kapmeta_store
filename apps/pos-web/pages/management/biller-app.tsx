import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// GET /management/biller-app?role=<substring>. Real roles in this app are
// free-text, so each tab searches by plain-English substring rather than a
// fake role code - a tab with no matching real users is an honest empty
// state, not a bug to paper over.

interface BillerAppUser {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  roles?: string[];
  isActive?: boolean;
  [k: string]: unknown;
}

const TABS: { id: string; label: string; roleQuery: string }[] = [
  { id: "biller", label: "Biller App", roleQuery: "biller" },
  { id: "captain", label: "Captain App", roleQuery: "captain" },
  { id: "delivery", label: "Delivery Boy App", roleQuery: "delivery" },
  { id: "waiter", label: "Waiter App", roleQuery: "waiter" },
  { id: "order-acceptance", label: "Order Acceptance App", roleQuery: "order acceptance" },
];

function roleLabel(u: BillerAppUser): string {
  if (Array.isArray(u.roles) && u.roles.length > 0) return u.roles.join(", ");
  if (u.role) return u.role;
  return "—";
}

export default function BillerAppPage() {
  const { me, loading: authLoading } = useAuthGuard("users.manage");
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [rows, setRows] = useState<BillerAppUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedFetch(`/management/biller-app?role=${encodeURIComponent(tab.roleQuery)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setRows(Array.isArray(json) ? json : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, tab.roleQuery]);

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("users.manage");

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - Biller App</title>
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / User Management / Biller App
                </span>
                <h1 className="greeting-title">Biller App</h1>
              </div>
            </section>

            {noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "users.manage" permission required here.</p>
              </div>
            )}

            {!noAccess && (
              <>
                <div className="tab-row">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
                      onClick={() => setActiveTab(t.id)}
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
                    <h3>Could not load users</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📭</span>
                    <h3>No users found for "{tab.label}"</h3>
                    <p>No real user in this outlet has a role matching "{tab.roleQuery}" yet.</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length > 0 && (
                  <section className="panel-card">
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email / Phone</th>
                            <th>Role</th>
                            <th>Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((u) => (
                            <tr key={u.id}>
                              <td>{u.name || "—"}</td>
                              <td>{u.email || u.phone || "—"}</td>
                              <td>{roleLabel(u)}</td>
                              <td>{u.isActive === false ? "No" : "Yes"}</td>
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
        .mg-app { display: flex; flex-direction: column; min-height: 100vh; background-color: var(--bg-base); color: var(--text-primary); }
        .dashboard-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .tab-row { display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        .tab-btn { border: none; background: transparent; padding: 10px 14px; font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-md) var(--radius-md) 0 0; }
        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--accent-subtle-text, var(--text-primary)); background: var(--accent-subtle); }
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
