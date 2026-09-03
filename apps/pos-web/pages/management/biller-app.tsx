import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

// GET /management/biller-app?role=<substring>. Real roles in this app are
// free-text, so each tab searches by plain-English substring rather than a
// fake role code - a tab with no matching real users is an honest empty
// state, not a bug to paper over.
//
// Create/edit/status-toggle/sync-code below call real endpoints added
// alongside this page (POST/PUT/PUT-isActive/POST .../sync-code on
// apps/api/src/routes/management.ts) -- they create/update real `users`
// rows via the same mechanism as Management > User Management's own
// create-user form, not local-only UI state.

interface BillerAppUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  userCode?: string | null;
  role?: string;
  roles?: string[];
  userRoles?: { roleName: string }[];
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

function displayName(u: BillerAppUser): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return n || u.name || "—";
}

function roleLabel(u: BillerAppUser): string {
  if (Array.isArray(u.userRoles) && u.userRoles.length > 0) return u.userRoles.map((r) => r.roleName).join(", ");
  if (Array.isArray(u.roles) && u.roles.length > 0) return u.roles.join(", ");
  if (u.role) return u.role;
  return "—";
}

interface FormState {
  name: string;
  username: string;
  password: string;
}

const EMPTY_FORM: FormState = { name: "", username: "", password: "" };

export default function BillerAppPage() {
  const { me, loading: authLoading } = useAuthGuard("users.manage");
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [rows, setRows] = useState<BillerAppUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<BillerAppUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingUser, setViewingUser] = useState<BillerAppUser | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
  }, [authLoading, tab.roleQuery, reloadToken]);

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("users.manage");

  function openCreateForm() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(u: BillerAppUser) {
    setEditingUser(u);
    setForm({ name: displayName(u) === "—" ? "" : displayName(u), username: u.email || "", password: "" });
    setFormError(null);
    setShowForm(true);
  }

  async function submitForm() {
    setFormError(null);
    if (editingUser) {
      if (!form.name.trim() && !form.username.trim()) {
        setFormError("Enter a name or user name to update.");
        return;
      }
      setSaving(true);
      try {
        const res = await authedFetch(`/management/biller-app/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.trim() || undefined, username: form.username.trim() || undefined }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP error ${res.status}`);
        setShowForm(false);
        setReloadToken((t) => t + 1);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("Name, user name, and password are all required.");
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch("/management/biller-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: tab.roleQuery,
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP error ${res.status}`);
      setShowForm(false);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: BillerAppUser) {
    setBusyUserId(u.id);
    try {
      const res = await authedFetch(`/management/biller-app/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !(u.isActive !== false) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP error ${res.status}`);
      }
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyUserId(null);
    }
  }

  async function syncCode(u: BillerAppUser) {
    setBusyUserId(u.id);
    try {
      const res = await authedFetch(`/management/biller-app/${u.id}/sync-code`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP error ${res.status}`);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync code");
    } finally {
      setBusyUserId(null);
    }
  }

  async function copyCode(u: BillerAppUser) {
    if (!u.userCode) return;
    try {
      await navigator.clipboard.writeText(u.userCode);
      setCopiedId(u.id);
      setTimeout(() => setCopiedId((id) => (id === u.id ? null : id)), 1500);
    } catch {
      // clipboard API unavailable/blocked -- non-fatal, user can still read the code column.
    }
  }

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
              {!noAccess && (
                <div className="header-actions">
                  {/* There is no real "sync to POS device" channel anywhere in this
                      repo (no device registry, no push channel) -- Sync Code here
                      regenerates the selected user's code server-side via POST
                      .../sync-code, it does not push to a device. Per-row sync is
                      below in the Action column; this header button is a
                      shortcut when exactly one row is selected implicitly via the
                      view/edit modal, so it's disabled until a row is open. */}
                  {tab.id === "order-acceptance" && (
                    // No real mobile app binary ships in this repo -- this is a
                    // placeholder static link, not a claim that a download exists.
                    <a
                      className="btn btn-secondary"
                      href="https://www.petpooja.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download App
                    </a>
                  )}
                  <button type="button" className="btn btn-primary" onClick={openCreateForm}>
                    + Create
                  </button>
                </div>
              )}
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
                  <div className="empty-state-card empty-add-card">
                    <button type="button" className="add-fab" onClick={openCreateForm} aria-label={`Add ${tab.label} user`}>
                      +
                    </button>
                    <h3>No users found for "{tab.label}"</h3>
                    <p>No real user in this outlet has a role matching "{tab.roleQuery}" yet. Create one to get started.</p>
                  </div>
                )}

                {!loading && !error && rows && rows.length > 0 && (
                  <section className="panel-card">
                    <div className="table-responsive">
                      <table className="clean-table">
                        <thead>
                          <tr>
                            <th>Biller Name</th>
                            <th>User Name</th>
                            <th>User Code</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((u) => {
                            const active = u.isActive !== false;
                            const busy = busyUserId === u.id;
                            return (
                              <tr key={u.id}>
                                <td>{displayName(u)}</td>
                                <td>{u.email || u.phone || "—"}</td>
                                <td className="code-cell">
                                  <span className="code-text">{u.userCode || "—"}</span>
                                  {u.userCode && (
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      title="Copy user code"
                                      onClick={() => copyCode(u)}
                                    >
                                      {copiedId === u.id ? "✓" : "⧉"}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={`status-toggle ${active ? "on" : "off"}`}
                                    disabled={busy}
                                    onClick={() => toggleActive(u)}
                                    aria-pressed={active}
                                    aria-label={active ? "Active - click to deactivate" : "Inactive - click to activate"}
                                  >
                                    <span className="status-knob" />
                                  </button>
                                </td>
                                <td className="action-cell">
                                  <button type="button" className="icon-btn" title="View" onClick={() => setViewingUser(u)}>
                                    👁
                                  </button>
                                  <button type="button" className="icon-btn" title="Edit" onClick={() => openEditForm(u)}>
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title="Sync code"
                                    disabled={busy}
                                    onClick={() => syncCode(u)}
                                  >
                                    ↻
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

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{editingUser ? `Edit ${tab.label} user` : `Create ${tab.label} user`}</h3>
            {!editingUser && (
              <p className="modal-hint">
                Role will be set to "{tab.roleQuery}" (created if it doesn't already exist for this outlet).
              </p>
            )}
            <label className="field-label">
              Name
              <input
                className="text-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </label>
            <label className="field-label">
              User Name
              <input
                className="text-input"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="login email/username"
              />
            </label>
            {!editingUser && (
              <label className="field-label">
                Password
                <input
                  className="text-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="min 4 characters"
                />
              </label>
            )}
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submitForm}>
                {saving ? "Saving..." : editingUser ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingUser && (
        <div className="modal-backdrop" onClick={() => setViewingUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{displayName(viewingUser)}</h3>
            <dl className="view-dl">
              <dt>User Name</dt>
              <dd>{viewingUser.email || "—"}</dd>
              <dt>Phone</dt>
              <dd>{viewingUser.phone || "—"}</dd>
              <dt>User Code</dt>
              <dd>{viewingUser.userCode || "—"}</dd>
              <dt>Role</dt>
              <dd>{roleLabel(viewingUser)}</dd>
              <dt>Status</dt>
              <dd>{viewingUser.isActive !== false ? "Active" : "Inactive"}</dd>
            </dl>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setViewingUser(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .mg-app { display: flex; flex-direction: column; min-height: 100vh; background-color: var(--bg-base); color: var(--text-primary); }
        .dashboard-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .breadcrumb-line :global(a) { color: var(--text-muted); text-decoration: underline; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .header-actions { display: flex; gap: 10px; align-items: center; }
        .btn { border-radius: var(--radius-md); padding: 9px 16px; font-size: 0.8125rem; font-weight: 700; cursor: pointer; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); text-decoration: none; display: inline-flex; align-items: center; }
        .btn-primary { background: var(--accent, #2563eb); border-color: var(--accent, #2563eb); color: #fff; }
        .btn-secondary { background: var(--bg-card); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .tab-row { display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        .tab-btn { border: none; background: transparent; padding: 10px 14px; font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-md) var(--radius-md) 0 0; }
        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--accent-subtle-text, var(--text-primary)); background: var(--accent-subtle); }
        .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); }
        .table-responsive { overflow-x: auto; }
        .clean-table { width: 100%; border-collapse: collapse; text-align: left; }
        .clean-table th { padding: 12px 16px; font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .clean-table td { padding: 12px 16px; font-size: 0.8438rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
        .code-cell { display: flex; align-items: center; gap: 8px; }
        .code-text { font-family: monospace; letter-spacing: 0.5px; }
        .action-cell { display: flex; gap: 6px; }
        .icon-btn { border: 1px solid var(--border); background: var(--bg-card); border-radius: var(--radius-sm, 6px); width: 28px; height: 28px; cursor: pointer; font-size: 0.8125rem; display: inline-flex; align-items: center; justify-content: center; }
        .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .status-toggle { width: 38px; height: 22px; border-radius: 11px; border: none; padding: 2px; cursor: pointer; background: var(--border); position: relative; }
        .status-toggle.on { background: #22c55e; }
        .status-toggle.off { background: var(--border); }
        .status-toggle:disabled { opacity: 0.6; cursor: not-allowed; }
        .status-knob { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.15s ease; transform: translateX(0); }
        .status-toggle.on .status-knob { transform: translateX(16px); }
        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
        .empty-add-card { padding-top: 32px; }
        .add-fab { width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--accent, #2563eb); color: #fff; font-size: 1.75rem; line-height: 1; cursor: pointer; margin-bottom: 16px; }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal-card { background: var(--bg-card); border-radius: var(--radius-lg); padding: 24px; width: 380px; max-width: calc(100vw - 40px); box-shadow: var(--shadow-card); }
        .modal-card h3 { margin: 0 0 6px 0; font-size: 1.125rem; font-weight: 800; }
        .modal-hint { margin: 0 0 14px 0; font-size: 0.75rem; color: var(--text-secondary); }
        .field-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 12px; }
        .text-input { border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); padding: 8px 10px; font-size: 0.875rem; background: var(--bg-base); color: var(--text-primary); }
        .form-error { color: #dc2626; font-size: 0.75rem; margin: 0 0 10px 0; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
        .view-dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 0.8438rem; margin: 8px 0 16px 0; }
        .view-dl dt { color: var(--text-muted); font-weight: 700; }
        .view-dl dd { margin: 0; }
      `}</style>
    </div>
  );
}
