import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { REPORT_CATALOG, filterReportCatalog, getReportByKey } from "../../lib/report-catalog";

// Real response shape of GET/POST /report-notifications
// (apps/api/src/routes/report-notifications.ts). This table stores
// subscription *intent* only — there is no email/SMS worker anywhere in
// this codebase that reads these rows and actually sends a report, so the
// UI says so plainly rather than implying delivery happens.
interface ReportNotificationApi {
  id: string;
  outletId: string;
  reportKey: string;
  frequency: string;
  recipients: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

const FREQUENCIES = ["DAILY", "WEEKLY"] as const;

export default function ReportNotificationPage() {
  const { me, loading: authLoading } = useAuthGuard("report.read");

  const [subs, setSubs] = useState<ReportNotificationApi[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [reportKey, setReportKey] = useState("");
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>("DAILY");
  const [recipients, setRecipients] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const visibleCatalog = me ? filterReportCatalog(me.permissions) : REPORT_CATALOG;

  const load = () => {
    setLoading(true);
    setError(null);
    authedFetch("/report-notifications")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json() as Promise<ReportNotificationApi[]>;
      })
      .then((data) => {
        setSubs(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load report notifications");
        setSubs(null);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const openForm = () => {
    setReportKey(visibleCatalog[0]?.key || "");
    setFrequency("DAILY");
    setRecipients("");
    setIsActive(true);
    setFormError(null);
    setFormOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportKey) {
      setFormError("Choose a report.");
      return;
    }
    if (!recipients.trim()) {
      setFormError("Enter at least one recipient email.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await authedFetch("/report-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportKey, frequency, recipients: recipients.trim(), isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      const created = (await res.json()) as ReportNotificationApi;
      setSubs((prev) => [created, ...(prev || [])]);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save notification");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this report notification?")) return;
    const prev = subs;
    setSubs((cur) => (cur || []).filter((s) => s.id !== id));
    try {
      const res = await authedFetch(`/report-notifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } catch (err) {
      // best-effort — reconcile with the server if the delete failed
      setSubs(prev);
      alert(err instanceof Error ? err.message : "Failed to delete notification");
    }
  };

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("report.read");

  return (
    <div className="rn-app">
      <Head>
        <title>KapMeta POS - Report Notification</title>
        <meta name="description" content="Subscribe to a report on a schedule." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Reports</span>
                <h1 className="greeting-title">Report Notification</h1>
                <p className="greeting-subtitle">Subscribe outlet reports to a recurring schedule.</p>
              </div>
              {!noAccess && (
                <button type="button" className="btn-primary" onClick={openForm}>
                  + Add Notification
                </button>
              )}
            </section>

            {noAccess ? (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No report access</h3>
                <p>Your role does not grant the "report.read" permission required to manage report notifications.</p>
              </div>
            ) : (
              <>
                <div className="honesty-note">
                  <span className="honesty-note-icon">ℹ️</span>
                  <p>
                    This only saves your subscription preference. There is no email or SMS delivery worker wired up
                    yet in this system, so subscribed reports are <strong>not</strong> actually sent out — this list
                    records intent for when that infrastructure exists.
                  </p>
                </div>

                {formOpen && (
                  <section className="panel-card">
                    <div className="panel-header">
                      <div>
                        <h3>New Report Notification</h3>
                        <p className="panel-sub">Choose a report, a frequency and who should (eventually) receive it.</p>
                      </div>
                    </div>
                    <form onSubmit={handleCreate} className="notif-form">
                      <label className="field">
                        <span className="field-label">Report</span>
                        <select className="field-input" value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
                          {visibleCatalog.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">Frequency</span>
                        <select
                          className="field-input"
                          value={frequency}
                          onChange={(e) => setFrequency(e.target.value as (typeof FREQUENCIES)[number])}
                        >
                          {FREQUENCIES.map((f) => (
                            <option key={f} value={f}>
                              {f.charAt(0) + f.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field field-wide">
                        <span className="field-label">Recipients</span>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="owner@example.com, manager@example.com"
                          value={recipients}
                          onChange={(e) => setRecipients(e.target.value)}
                        />
                      </label>
                      <label className="field-checkbox">
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                        <span>Active</span>
                      </label>

                      {formError && <p className="form-error">{formError}</p>}

                      <div className="filter-actions">
                        <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
                          Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                          {saving ? "Saving..." : "Save Subscription"}
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading report notifications...</h3>
                  </div>
                )}

                {!loading && error && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load report notifications</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && subs && subs.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">🔔</span>
                    <h3>No Report Notifications Yet</h3>
                    <p>Add one to subscribe an outlet report to a recurring schedule.</p>
                  </div>
                )}

                {!loading && !error && subs && subs.length > 0 && (
                  <section className="panel-card">
                    <div className="panel-header">
                      <div>
                        <h3>Subscriptions</h3>
                        <p className="panel-sub">From GET /report-notifications</p>
                      </div>
                      <span className="total-badge">{subs.length} subscription(s)</span>
                    </div>
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Report</th>
                            <th>Frequency</th>
                            <th>Recipients</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {subs.map((s) => {
                            const report = getReportByKey(s.reportKey);
                            return (
                              <tr key={s.id}>
                                <td>{report ? report.title : s.reportKey}</td>
                                <td>{s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()}</td>
                                <td className="recipients-cell">{s.recipients}</td>
                                <td>
                                  <span className={`pill-status ${s.isActive ? "active" : "muted"}`}>
                                    {s.isActive ? "Active" : "Paused"}
                                  </span>
                                </td>
                                <td>{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                                <td>
                                  <button type="button" className="btn-ghost" onClick={() => handleDelete(s.id)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
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
        .rn-app {
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
          max-width: 1200px;
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
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }
        .honesty-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: var(--warning-subtle, #fffbeb);
          border: 1px solid var(--warning, #f59e0b);
          border-radius: var(--radius-md);
          padding: 12px 14px;
        }
        .honesty-note-icon { font-size: 1rem; flex-shrink: 0; }
        .honesty-note p { margin: 0; font-size: 0.8125rem; color: var(--warning-text, #92400e); line-height: 1.5; }
        .btn-primary, .btn-secondary, .btn-ghost {
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
        .btn-primary:hover:not(:disabled) { background: var(--dark-btn-hover); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary {
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .btn-secondary:hover { background: var(--bg-subtle); }
        .btn-ghost {
          border: 1px solid transparent;
          background: transparent;
          color: var(--destructive, #ef4444);
          padding: 0 10px;
          min-height: 30px;
        }
        .btn-ghost:hover { background: var(--destructive-subtle, #fef2f2); }
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
        .notif-form {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          align-items: flex-end;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 180px;
        }
        .field-wide { min-width: 280px; flex: 1; }
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
        .field-checkbox {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          min-height: 38px;
        }
        .form-error {
          width: 100%;
          margin: 0;
          font-size: 0.8125rem;
          color: var(--destructive-text, #991b1b);
        }
        .filter-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
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
        }
        .clean-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .clean-table tr:hover td { background: var(--bg-subtle); }
        .recipients-cell { color: var(--text-secondary); font-size: 0.8125rem; }
        .pill-status {
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.75rem;
          font-weight: 700;
        }
        .pill-status.active { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .pill-status.muted { background: var(--bg-subtle); color: var(--text-muted); }
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
