import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { getLogEntryByType } from "../../lib/management-catalog";

// Generic activity-log page for any Management "User Logs" screen, backed
// by GET /management/logs?type=<logType>&limit=50. Real rows only exist
// today for ONLINE_ITEM_ON_OFF - every other log type legitimately returns
// an empty array, rendered as an honest empty state rather than faked rows.

interface ManagementLogRow {
  id: string;
  logType: string;
  actorId?: string | null;
  message: string;
  meta?: unknown;
  createdAt: string;
  [k: string]: unknown;
}

export default function ManagementLogsPage() {
  const router = useRouter();
  const type = typeof router.query.type === "string" ? router.query.type : undefined;
  const entry = getLogEntryByType(type);
  const title = entry ? entry.title : type || "Logs";

  const { me, loading: authLoading } = useAuthGuard("users.manage");

  const [rows, setRows] = useState<ManagementLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !type) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedFetch(`/management/logs?type=${encodeURIComponent(type)}&limit=50`)
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
  }, [authLoading, type]);

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("users.manage");

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - {title}</title>
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / {title}
                </span>
                <h1 className="greeting-title">{title}</h1>
              </div>
            </section>

            {!type && (
              <div className="empty-state-card">
                <span className="empty-icon">❓</span>
                <h3>No log type given</h3>
                <p>This page needs a ?type= query param naming the log type.</p>
              </div>
            )}

            {type && noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "users.manage" permission required here.</p>
              </div>
            )}

            {type && !noAccess && loading && (
              <div className="empty-state-card">
                <span className="empty-icon">⏳</span>
                <h3>Loading...</h3>
              </div>
            )}

            {type && !noAccess && !loading && error && (
              <div className="empty-state-card">
                <span className="empty-icon">⚠️</span>
                <h3>Could not load these logs</h3>
                <p>{error}</p>
              </div>
            )}

            {type && !noAccess && !loading && !error && rows && rows.length === 0 && (
              <div className="empty-state-card">
                <span className="empty-icon">📭</span>
                <h3>No {title} events logged yet</h3>
                <p>Events will appear here as they happen.</p>
              </div>
            )}

            {type && !noAccess && !loading && !error && rows && rows.length > 0 && (
              <section className="panel-card">
                <div className="table-responsive">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.createdAt).toLocaleString()}</td>
                          <td>{row.actorId || "—"}</td>
                          <td>{row.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
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
