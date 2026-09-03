import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { getManagementEntryByKey } from "../../lib/management-catalog";

// Generic list-editor page for any Management screen backed by
// GET/POST/PUT/DELETE /management/lists (a distinct listKey per screen,
// named by the ?key= catalog entry in lib/management-catalog.ts). Mirrors
// the reusable pattern in pages/reports/view.tsx - a new list-backed
// Management screen only needs a new catalog entry, never a new page.

interface ManagementListRow {
  id: string;
  listKey: string;
  label: string;
  value?: string | null;
  extra?: unknown;
  isActive: boolean;
  sortOrder?: number;
  [k: string]: unknown;
}

export default function ManagementListPage() {
  const router = useRouter();
  const key = typeof router.query.key === "string" ? router.query.key : undefined;
  const entry = getManagementEntryByKey(key);
  const listKey = entry?.listKey;

  const { me, loading: authLoading } = useAuthGuard("settings.manage");

  const [rows, setRows] = useState<ManagementListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");

  const load = React.useCallback(() => {
    if (!listKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    authedFetch(`/management/lists?key=${encodeURIComponent(listKey)}`)
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
  }, [listKey]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("settings.manage");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listKey || !newLabel.trim()) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/management/lists`, {
        method: "POST",
        body: JSON.stringify({ listKey, label: newLabel.trim(), value: newValue.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      setNewLabel("");
      setNewValue("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add row");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: ManagementListRow) => {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditValue(row.value != null ? String(row.value) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditValue("");
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await authedFetch(`/management/lists/${id}`, {
        method: "PUT",
        body: JSON.stringify({ label: editLabel.trim(), value: editValue.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      cancelEdit();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ManagementListRow) => {
    setSaving(true);
    try {
      const res = await authedFetch(`/management/lists/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/management/lists/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
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
                <p>No management list matches key "{key}".</p>
              </div>
            )}

            {entry && noAccess && (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No access</h3>
                <p>Your role does not grant the "settings.manage" permission required here.</p>
              </div>
            )}

            {entry && !noAccess && (
              <>
                <section className="panel-card">
                  <h4>Add new</h4>
                  <form className="add-row-form" onSubmit={handleAdd}>
                    <input
                      className="field-input"
                      placeholder="Label"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      required
                    />
                    <input
                      className="field-input"
                      placeholder="Value (optional)"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={saving || !newLabel.trim()}>
                      Add
                    </button>
                  </form>
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
                    <h3>Could not load this screen</h3>
                    <p>{error}</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📭</span>
                    <h3>No {entry.title} entries yet</h3>
                    <p>Add one above to get started.</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length > 0 && (
                  <section className="panel-card">
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Label</th>
                            <th>Value</th>
                            <th>Active</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id}>
                              {editingId === row.id ? (
                                <>
                                  <td>
                                    <input className="field-input" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                                  </td>
                                  <td>
                                    <input className="field-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                                  </td>
                                  <td>{row.isActive ? "Yes" : "No"}</td>
                                  <td className="row-actions">
                                    <button type="button" className="btn-primary" disabled={saving} onClick={() => saveEdit(row.id)}>
                                      Save
                                    </button>
                                    <button type="button" className="btn-secondary" onClick={cancelEdit}>
                                      Cancel
                                    </button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td>{row.label}</td>
                                  <td>{row.value || "—"}</td>
                                  <td>
                                    <button type="button" className="btn-secondary" disabled={saving} onClick={() => toggleActive(row)}>
                                      {row.isActive ? "Active" : "Inactive"}
                                    </button>
                                  </td>
                                  <td className="row-actions">
                                    <button type="button" className="btn-secondary" onClick={() => startEdit(row)}>
                                      Edit
                                    </button>
                                    <button type="button" className="btn-secondary" disabled={saving} onClick={() => handleDelete(row.id)}>
                                      Delete
                                    </button>
                                  </td>
                                </>
                              )}
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
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
        .panel-card h4 { margin: 0; font-size: 0.9375rem; font-weight: 800; }
        .add-row-form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .field-input { min-height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }
        .btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .btn-primary { border: 1px solid var(--dark-btn); background: var(--dark-btn); color: var(--bg-card); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); }
        .row-actions { display: flex; gap: 8px; }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
