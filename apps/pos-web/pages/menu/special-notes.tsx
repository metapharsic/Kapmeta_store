// Special Notes management console. Real CRUD against
// apps/api/src/routes/special-notes.ts:
//   GET    /special-notes        -> SpecialNoteApi[] (active notes only, no
//                                    pagination/search params on the API)
//   POST   /special-notes        -> { text, sortOrder? }
//   PATCH  /special-notes/:id    -> { text?, sortOrder?, isActive? }
//   DELETE /special-notes/:id    -> 204, soft-deletes (sets is_active=false)
//
// GET only ever returns is_active: true rows (outlet_id + is_active filter
// in the route), so the "Available" column will read "Yes" for every row
// this page can see today -- it still maps directly off is_active rather
// than hardcoding "Yes", so it stays correct if that GET filter is ever
// relaxed. The API has no page/limit/search query params, so this page
// fetches the full active list once and paginates + searches client-side
// (page size 15, per the reference screenshot).
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface SpecialNoteApi {
  id: string;
  outlet_id: string;
  text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 15;

export default function SpecialNotesPage() {
  // GET /special-notes requires "menu.read"; POST/PATCH/DELETE require
  // "menu.item.manage" -- gate the page on the read permission (same
  // pattern as pages/crm.tsx's canWrite) and only show mutation controls
  // when the caller also holds the write permission.
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const canWrite = me?.permissions.includes("menu.item.manage") ?? false;

  const [notes, setNotes] = useState<SpecialNoteApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingNote, setEditingNote] = useState<SpecialNoteApi | null>(null);
  const [editText, setEditText] = useState("");
  const [editAvailable, setEditAvailable] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const initials = me?.name
    ? me.name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase()
    : "?";

  const fetchNotes = () => {
    setLoading(true);
    setLoadError(null);
    authedFetch(`/special-notes`)
      .then(async (res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const data = (await res.json()) as SpecialNoteApi[];
        setNotes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load special notes");
        setNotes([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!authLoading && me) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.text.toLowerCase().includes(q));
  }, [notes, search]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = totalRecords === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, totalRecords);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    setAddSaving(true);
    setAddError(null);
    authedFetch(`/special-notes`, {
      method: "POST",
      body: JSON.stringify({ text: newText.trim() }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        setShowAddModal(false);
        setNewText("");
        setAddSaving(false);
        setActionNotice("Special note added.");
        setActionError(null);
        fetchNotes();
      })
      .catch((err) => {
        setAddError(err instanceof Error ? err.message : "Failed to add special note");
        setAddSaving(false);
      });
  };

  const openEdit = (note: SpecialNoteApi) => {
    setEditingNote(note);
    setEditText(note.text);
    setEditAvailable(note.is_active);
    setEditError(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editText.trim()) return;
    setEditSaving(true);
    setEditError(null);
    authedFetch(`/special-notes/${editingNote.id}`, {
      method: "PATCH",
      body: JSON.stringify({ text: editText.trim(), isActive: editAvailable }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        setEditingNote(null);
        setEditSaving(false);
        setActionNotice("Special note updated.");
        setActionError(null);
        fetchNotes();
      })
      .catch((err) => {
        setEditError(err instanceof Error ? err.message : "Failed to update special note");
        setEditSaving(false);
      });
  };

  const handleDelete = (note: SpecialNoteApi) => {
    if (!window.confirm(`Delete special note "${note.text}"?`)) return;
    setDeletingId(note.id);
    setActionError(null);
    setActionNotice(null);
    authedFetch(`/special-notes/${note.id}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok && res.status !== 204) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        setDeletingId(null);
        setActionNotice("Special note deleted.");
        fetchNotes();
      })
      .catch((err) => {
        setActionError(err instanceof Error ? err.message : "Failed to delete special note");
        setDeletingId(null);
      });
  };

  return (
    <div className="admin-app">
      <Head>
        <title>KapMeta POS - Special Notes</title>
        <meta name="description" content="Manage the special notes staff can attach to order items." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">⚡</span>
                <span className="brand-name">KapMeta Menu</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="user-profile-badge">
                <div className="avatar-circle">{initials}</div>
                <div className="user-info-text">
                  <span className="user-name">{me?.name ?? "Loading..."}</span>
                  <span className="user-role">{me?.roles?.[0] ?? ""}</span>
                </div>
              </div>
            </div>
          </header>

          <main className="dashboard-body">
            {authLoading && (
              <div className="empty-state-card">
                <span className="empty-icon">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                <section className="dashboard-greeting-row">
                  <div>
                    <span className="breadcrumb-line">Menu &gt; Special Notes</span>
                    <h1 className="greeting-title">Special Notes</h1>
                    <p className="greeting-subtitle">
                      Reusable notes staff can attach to order items (e.g. "Less spicy",
                      "No onion"). Backed by GET/POST/PATCH/DELETE /special-notes.
                    </p>
                  </div>
                  {canWrite && (
                    <button className="add-user-btn" onClick={() => { setAddError(null); setNewText(""); setShowAddModal(true); }}>
                      + Add Special Note
                    </button>
                  )}
                </section>

                {actionError && (
                  <div className="empty-state-card error-card">
                    <span className="empty-icon">⚠️</span>
                    <p>{actionError}</p>
                  </div>
                )}

                {actionNotice && (
                  <div className="empty-state-card">
                    <span className="empty-icon">ℹ️</span>
                    <p>{actionNotice}</p>
                  </div>
                )}

                <section className="panel-card">
                  <div className="panel-header">
                    <div>
                      <h3>All Special Notes</h3>
                      <p className="panel-sub">From GET /special-notes</p>
                    </div>
                    <span className="total-badge">{totalRecords} notes</span>
                  </div>

                  <form
                    className="lookup-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPage(1);
                    }}
                  >
                    <input
                      type="text"
                      className="text-input"
                      placeholder="Special Note Name"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </form>

                  {loading && (
                    <div className="empty-state-card">
                      <span className="empty-icon">⏳</span>
                      <h3>Loading special notes...</h3>
                    </div>
                  )}

                  {!loading && loadError && (
                    <div className="not-available-box">
                      <p>{loadError}. Check that the API is running and you are signed in.</p>
                    </div>
                  )}

                  {!loading && !loadError && totalRecords === 0 && (
                    <div className="not-available-box">
                      <p>No special notes found.</p>
                    </div>
                  )}

                  {!loading && !loadError && totalRecords > 0 && (
                    <>
                      <div className="directory-table-wrap">
                        <table className="dense-table">
                          <thead>
                            <tr>
                              <th>Special Note</th>
                              <th>Created</th>
                              <th>Available</th>
                              {canWrite && <th className="col-actions">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {pageRows.map((note) => (
                              <tr key={note.id}>
                                <td>{note.text}</td>
                                <td className="num-cell">{new Date(note.created_at).toLocaleDateString()}</td>
                                <td>
                                  <span className={`status-pill ${note.is_active ? "status-pill-yes" : "status-pill-no"}`}>
                                    {note.is_active ? "Yes" : "No"}
                                  </span>
                                </td>
                                {canWrite && (
                                  <td className="col-actions">
                                    <button type="button" className="row-action-btn" onClick={() => openEdit(note)}>
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="row-action-btn row-action-danger"
                                      disabled={deletingId === note.id}
                                      onClick={() => handleDelete(note)}
                                    >
                                      {deletingId === note.id ? "Deleting..." : "Delete"}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="directory-pagination">
                        <span className="panel-sub">
                          Showing {pageStart} to {pageEnd} of {totalRecords} records
                        </span>
                        <div className="directory-pagination-btns">
                          <button
                            type="button"
                            className="export-btn"
                            disabled={currentPage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className="export-btn"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {showAddModal && (
                  <div className="modal-overlay">
                    <div className="modal-content">
                      <div className="modal-header">
                        <h4>Add Special Note</h4>
                        <button className="close-modal-btn" onClick={() => setShowAddModal(false)}>✕</button>
                      </div>
                      <form onSubmit={submitAdd} className="modal-form">
                        <div className="form-group">
                          <label>Special Note Text *</label>
                          <input
                            type="text"
                            required
                            autoFocus
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            placeholder="e.g. Less spicy"
                          />
                        </div>
                        {addError && <p className="form-error">{addError}</p>}
                        <div className="modal-actions">
                          <button type="button" className="cancel-modal-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
                          <button type="submit" className="submit-modal-btn" disabled={addSaving}>
                            {addSaving ? "Saving..." : "Add Note"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {editingNote && (
                  <div className="modal-overlay">
                    <div className="modal-content">
                      <div className="modal-header">
                        <h4>Edit Special Note</h4>
                        <button className="close-modal-btn" onClick={() => setEditingNote(null)}>✕</button>
                      </div>
                      <form onSubmit={submitEdit} className="modal-form">
                        <div className="form-group">
                          <label>Special Note Text *</label>
                          <input
                            type="text"
                            required
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                        </div>
                        <div className="form-group-checkbox">
                          <input
                            type="checkbox"
                            id="edit-note-available"
                            checked={editAvailable}
                            onChange={(e) => setEditAvailable(e.target.checked)}
                          />
                          <label htmlFor="edit-note-available">Available</label>
                        </div>
                        {editError && <p className="form-error">{editError}</p>}
                        <div className="modal-actions">
                          <button type="button" className="cancel-modal-btn" onClick={() => setEditingNote(null)}>Cancel</button>
                          <button type="submit" className="submit-modal-btn" disabled={editSaving}>
                            {editSaving ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>

          <style dangerouslySetInnerHTML={{ __html: `
        .admin-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100vw;
          background-color: var(--bg-base);
          color: var(--text-primary);
        }

        .topbar {
          height: 64px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .topbar-left { display: flex; align-items: center; gap: 16px; }
        .brand-badge { display: flex; align-items: center; gap: 8px; }
        .brand-icon {
          width: 32px; height: 32px; border-radius: var(--radius-sm);
          background: var(--dark-btn); color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 1rem;
        }
        .brand-name { font-size: 1.125rem; font-weight: 800; letter-spacing: -0.5px; }
        .topbar-right { display: flex; align-items: center; gap: 16px; }
        .user-profile-badge { display: flex; align-items: center; gap: 10px; }
        .avatar-circle {
          width: 34px; height: 34px; border-radius: 50%; background: #e2e8f0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.8125rem;
        }
        .user-info-text { display: flex; flex-direction: column; }
        .user-name { font-size: 0.8125rem; font-weight: 700; line-height: 1.2; }
        .user-role { font-size: 0.6875rem; color: var(--text-secondary); }

        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
        }

        .dashboard-greeting-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 8px;
        }
        .breadcrumb-line {
          font-size: 0.75rem; color: var(--text-muted); font-weight: 600;
          letter-spacing: 0.5px; text-transform: uppercase;
        }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); max-width: 640px; }

        .add-user-btn {
          padding: 10px 20px;
          background: var(--dark-btn);
          color: #fff;
          border: none;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
        }
        .add-user-btn:hover { background: var(--dark-btn-hover); }

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
        .panel-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .panel-header h3 { margin: 0 0 2px 0; font-size: 1.125rem; font-weight: 800; }
        .panel-sub { margin: 0; font-size: 0.75rem; color: var(--text-secondary); }

        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }

        .lookup-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .text-input {
          flex: 1 1 260px;
          padding: 9px 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          background: var(--bg-card);
          color: var(--text-primary);
          min-width: 160px;
        }

        .export-btn {
          padding: 8px 18px;
          background: var(--dark-btn);
          color: #fff;
          border: none;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
        }
        .export-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .empty-state-card.error-card { border-color: var(--destructive); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }

        .not-available-box {
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 16px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
        .not-available-box p { margin: 0; }

        .directory-table-wrap { overflow-x: auto; }

        .dense-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
        }
        .dense-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--bg-card);
        }
        .dense-table td {
          padding: 8px 12px;
          height: 36px;
          border-bottom: 1px solid var(--border-subtle, var(--border));
        }
        .dense-table .num-cell { font-variant-numeric: tabular-nums; }
        .dense-table .col-actions { text-align: right; white-space: nowrap; }

        .status-pill {
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.75rem;
          font-weight: 700;
          display: inline-block;
        }
        .status-pill-yes { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .status-pill-no { background: var(--bg-subtle); color: var(--text-muted); }

        .row-action-btn {
          border: 1px solid var(--border);
          background: var(--bg-card);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 5px 10px;
          cursor: pointer;
          color: var(--text-secondary);
          margin-left: 6px;
        }
        .row-action-btn:hover { background: var(--bg-subtle); }
        .row-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .row-action-danger { color: var(--destructive-text); border-color: var(--destructive); }
        .row-action-danger:hover { background: var(--destructive-subtle); }

        .directory-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .directory-pagination-btns { display: flex; gap: 8px; }

        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
        }
        .modal-content {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          width: 440px;
          max-width: calc(100vw - 32px);
          padding: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px; margin-bottom: 16px;
        }
        .modal-header h4 { margin: 0; font-size: 1.125rem; font-weight: 800; color: var(--text-primary); }
        .close-modal-btn { border: none; background: transparent; font-size: 1.125rem; cursor: pointer; color: var(--text-muted); }
        .modal-form { display: flex; flex-direction: column; gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-group label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
        .form-group input, .form-group select {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          background: var(--bg-base);
          color: var(--text-primary);
        }
        .form-group-checkbox { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; color: var(--text-primary); }
        .form-error { margin: 0; font-size: 0.8125rem; color: var(--destructive-text); }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 4px; }
        .cancel-modal-btn {
          padding: 8px 16px; border: 1px solid var(--border); background: transparent;
          border-radius: var(--radius-pill); font-size: 0.8125rem; font-weight: 700;
          cursor: pointer; color: var(--text-secondary);
        }
        .submit-modal-btn {
          padding: 8px 16px; background: var(--dark-btn); color: #fff; border: none;
          border-radius: var(--radius-pill); font-size: 0.8125rem; font-weight: 700; cursor: pointer;
        }
        .submit-modal-btn:disabled { opacity: 0.6; cursor: not-allowed; }
          ` }} />
        </div>
      </div>
    </div>
  );
}
