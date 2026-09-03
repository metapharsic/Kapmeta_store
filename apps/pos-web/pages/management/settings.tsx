import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { getManagementEntryByKey } from "../../lib/management-catalog";

// Generic settings-editor page for any Management screen backed by
// GET/PUT /management/settings/:key. Fields differ per screen and nothing
// is hardcoded as fake business data - this renders an honest generic
// "custom fields" key/value editor over the `data` JSONB object, same
// reusable-page pattern as pages/management/list.tsx and
// pages/reports/view.tsx.

interface FieldRow {
  rowId: string;
  key: string;
  value: string;
}

let rowIdSeq = 0;
function newRowId(): string {
  rowIdSeq += 1;
  return `row-${rowIdSeq}`;
}

function objectToRows(data: Record<string, unknown>): FieldRow[] {
  return Object.entries(data).map(([k, v]) => ({
    rowId: newRowId(),
    key: k,
    value: typeof v === "string" ? v : JSON.stringify(v),
  }));
}

function rowsToObject(rows: FieldRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

export default function ManagementSettingsPage() {
  const router = useRouter();
  const key = typeof router.query.key === "string" ? router.query.key : undefined;
  const entry = getManagementEntryByKey(key);
  const settingsKey = entry?.settingsKey;

  const { me, loading: authLoading } = useAuthGuard("settings.manage");

  const [rows, setRows] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authLoading || !settingsKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedFetch(`/management/settings/${encodeURIComponent(settingsKey)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const data = json && typeof json === "object" && json.data && typeof json.data === "object" ? json.data : json || {};
        setRows(objectToRows(data as Record<string, unknown>));
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
  }, [authLoading, settingsKey]);

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("settings.manage");

  const addRow = () => setRows((prev) => [...prev, { rowId: newRowId(), key: "", value: "" }]);
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  const updateRow = (rowId: string, patch: Partial<FieldRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    if (!settingsKey) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await authedFetch(`/management/settings/${encodeURIComponent(settingsKey)}`, {
        method: "PUT",
        body: JSON.stringify({ data: rowsToObject(rows) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mg-app">
      <Head>
        <title>KapMeta POS - {entry ? entry.title : "Management"}</title>
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">
                  <Link href="/admin">Management</Link> / {entry ? entry.title : "Unknown"}
                </span>
                <h1 className="greeting-title">{entry ? entry.title : "Not Found"}</h1>
              </div>
            </section>

            {!entry && (
              <div className="empty-state-card">
                <span className="empty-icon">❓</span>
                <h3>Unknown screen</h3>
                <p>No management settings screen matches key "{key}".</p>
              </div>
            )}

            {entry && noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "settings.manage" permission required here.</p>
              </div>
            )}

            {entry && !noAccess && loading && (
              <div className="empty-state-card">
                <span className="empty-icon">⏳</span>
                <h3>Loading...</h3>
              </div>
            )}

            {entry && !noAccess && !loading && error && (
              <div className="empty-state-card">
                <span className="empty-icon">⚠️</span>
                <h3>Could not load this screen</h3>
                <p>{error}</p>
              </div>
            )}

            {entry && !noAccess && !loading && !error && (
              <section className="panel-card">
                <div className="panel-card-header">
                  <h4>Custom fields</h4>
                  <p className="panel-hint">
                    This screen has no fixed field layout yet, so fields are edited as free-form key/value pairs backed
                    live by GET/PUT /management/settings/{settingsKey}.
                  </p>
                </div>

                {rows.length === 0 && (
                  <div className="not-available-box">
                    <p>No fields saved yet. Add one below.</p>
                  </div>
                )}

                {rows.map((row) => (
                  <div key={row.rowId} className="kv-row">
                    <input
                      className="field-input"
                      placeholder="Field name"
                      value={row.key}
                      onChange={(e) => updateRow(row.rowId, { key: e.target.value })}
                    />
                    <input
                      className="field-input"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => updateRow(row.rowId, { value: e.target.value })}
                    />
                    <button type="button" className="btn-secondary" onClick={() => removeRow(row.rowId)}>
                      Remove
                    </button>
                  </div>
                ))}

                <div className="panel-card-footer">
                  <button type="button" className="btn-secondary" onClick={addRow}>
                    + Add field
                  </button>
                  <div className="footer-right">
                    {saved && <span className="saved-hint">Saved</span>}
                    <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
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
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
        .panel-card-header h4 { margin: 0 0 4px 0; font-size: 0.9375rem; font-weight: 800; }
        .panel-hint { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .kv-row { display: flex; gap: 10px; align-items: center; }
        .field-input { flex: 1; min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
        .panel-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
        .footer-right { display: flex; align-items: center; gap: 10px; }
        .saved-hint { font-size: 0.8125rem; font-weight: 700; color: var(--accent, #16a34a); }
        .not-available-box { background: var(--bg-subtle); border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 16px; font-size: 0.8125rem; color: var(--text-secondary); }
        .not-available-box p { margin: 0; }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
