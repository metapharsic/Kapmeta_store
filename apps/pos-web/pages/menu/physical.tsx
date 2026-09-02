// "Physical Menu" — outlet-scoped list of uploaded menu files, backed by
// GET/POST/DELETE /physical-menu/files (apps/api/src/routes/physical-menu.ts).
//
// LIMITATION: this repo has no file-upload/object-storage backend anywhere
// (no multer/formidable/S3/blob client). POST /physical-menu/files only
// records a caller-supplied {fileName, fileUrl} pair — it cannot receive
// actual file bytes. "+ Add File" below is honest about that: File URL is a
// plain text field with an inline note, not a working uploader.
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface PhysicalMenuFile {
  id: string;
  outletId: string;
  fileName: string;
  fileUrl: string;
  uploadedByUserId: string | null;
  uploadedAt: string;
  createdAt: string;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function PhysicalMenuPage() {
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const canManage = !!me?.permissions?.includes("menu.item.manage");

  const [files, setFiles] = useState<PhysicalMenuFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFiles = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/physical-menu/files");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load files (HTTP ${res.status})`);
      }
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load physical menu files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const openAdd = () => {
    setNewFileName("");
    setNewFileUrl("");
    setNotice(null);
    setIsAddOpen(true);
  };

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFileName.trim();
    const url = newFileUrl.trim();
    if (!name) {
      setNotice({ kind: "error", text: "File Name is required." });
      return;
    }
    if (!url) {
      setNotice({ kind: "error", text: "File URL is required." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await authedFetch("/physical-menu/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: name, fileUrl: url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add file");
      }
      setIsAddOpen(false);
      setNotice({ kind: "info", text: `"${name}" added.` });
      fetchFiles();
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to add file" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (file: PhysicalMenuFile) => {
    setDeletingId(file.id);
    setNotice(null);
    try {
      const res = await authedFetch(`/physical-menu/files/${file.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete file");
      }
      setNotice({ kind: "info", text: `"${file.fileName}" deleted.` });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err: any) {
      setNotice({ kind: "error", text: err?.message || "Failed to delete file" });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="page-shell">
      <Head>
        <title>KapMeta POS — Physical Menu</title>
        <meta name="description" content="Manage uploaded physical menu files for this outlet." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">📄</span>
                <span className="brand-name">Physical Menu</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="user-profile-badge">
                <div className="avatar-circle">{me?.name ? me.name.charAt(0).toUpperCase() : "?"}</div>
                <span className="user-name">{me?.name ?? "Loading..."}</span>
              </div>
            </div>
          </header>

          <main className="page-content">
            {authLoading && (
              <div className="empty-state-card">
                <span className="empty-icon">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                <section className="toolbar">
                  <div>
                    <h2>Physical Menu Files</h2>
                    <p className="toolbar-subtitle">
                      Printed menus, PDF price cards, and other physical menu documents for this outlet.
                    </p>
                  </div>
                  {canManage && (
                    <button type="button" className="btn-primary" onClick={openAdd}>
                      + Add File
                    </button>
                  )}
                </section>

                {notice && (
                  <div className={`notice-banner notice-${notice.kind}`}>
                    <span className="empty-icon">{notice.kind === "error" ? "❌" : "ℹ️"}</span>
                    <p>{notice.text}</p>
                  </div>
                )}

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading files...</h3>
                  </div>
                )}

                {!loading && loadError && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load files</h3>
                    <p>{loadError}</p>
                  </div>
                )}

                {!loading && !loadError && files.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📂</span>
                    <h3>No Record Found</h3>
                  </div>
                )}

                {!loading && !loadError && files.length > 0 && (
                  <div className="table-scroll">
                    <table className="files-table">
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>File URL</th>
                          <th>Uploaded</th>
                          {canManage && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f) => (
                          <tr key={f.id}>
                            <td className="file-name-cell">{f.fileName}</td>
                            <td className="file-url-cell">
                              <a href={f.fileUrl} target="_blank" rel="noreferrer noopener">
                                {f.fileUrl}
                              </a>
                            </td>
                            <td>{formatDate(f.uploadedAt)}</td>
                            {canManage && (
                              <td>
                                {confirmDeleteId === f.id ? (
                                  <div className="confirm-row">
                                    <span className="confirm-text">Delete this file?</span>
                                    <button
                                      type="button"
                                      className="btn-secondary small btn-danger"
                                      disabled={deletingId === f.id}
                                      onClick={() => handleDelete(f)}
                                    >
                                      {deletingId === f.id ? "Deleting..." : "Yes, delete"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary small"
                                      disabled={deletingId === f.id}
                                      onClick={() => setConfirmDeleteId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-secondary small btn-danger"
                                    onClick={() => setConfirmDeleteId(f.id)}
                                  >
                                    Delete
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {isAddOpen && (
        <div className="modal-overlay" onClick={() => !saving && setIsAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add File</h3>
            <form onSubmit={handleAddFile}>
              <label>
                File Name
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. Winter Menu 2026.pdf"
                  autoFocus
                />
              </label>
              <label>
                File URL
                <input
                  type="text"
                  value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  placeholder="https://..."
                />
                <span className="field-note">
                  Paste a link to a file already hosted somewhere reachable — direct file upload isn't wired up
                  yet, this app has no upload/storage backend.
                </span>
              </label>
              {notice && notice.kind === "error" && <p className="form-error">{notice.text}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsAddOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
          color: var(--text-primary);
        }

        .page-content {
          padding: 24px;
          max-width: 980px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .avatar-circle {
          width: 32px;
          height: 32px;
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
        }

        .toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .toolbar h2 {
          margin: 0 0 4px;
          font-size: 18px;
        }

        .toolbar-subtitle {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary);
          max-width: 520px;
        }

        .notice-banner {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          line-height: 1.5;
        }

        .notice-banner p {
          margin: 0;
        }

        .notice-info {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border: 1px solid var(--accent);
        }

        .notice-error {
          background: var(--destructive-subtle);
          color: var(--destructive-text);
          border: 1px solid var(--destructive);
        }

        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }

        .empty-icon {
          font-size: 28px;
          display: block;
          margin-bottom: 10px;
        }

        .empty-state-card h3 {
          margin: 0;
          font-size: 15px;
        }

        .table-scroll {
          overflow-x: auto;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
        }

        .files-table {
          width: 100%;
          min-width: 560px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .files-table th {
          text-align: left;
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 700;
          padding: 12px;
          border-bottom: 1px solid var(--border);
        }

        .files-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          vertical-align: middle;
        }

        .file-name-cell {
          font-weight: 700;
        }

        .file-url-cell a {
          color: var(--blue-text);
          word-break: break-all;
        }

        .confirm-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .confirm-text {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .btn-primary {
          background: var(--dark-btn);
          color: #fff;
          border: none;
          padding: 10px 16px;
          min-height: 40px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: var(--dark-btn-hover);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          padding: 8px 14px;
          min-height: 36px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-secondary.small {
          padding: 6px 10px;
          min-height: 30px;
          font-size: 12px;
        }

        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-danger {
          border-color: var(--destructive-subtle);
          color: var(--destructive-text);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .modal {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 24px;
          width: 420px;
          max-width: 90vw;
          box-shadow: var(--shadow-modal);
        }

        .modal h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
        }

        .modal label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 14px;
        }

        .modal input {
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--text-primary);
          font-family: inherit;
        }

        .field-note {
          font-size: 11px;
          font-weight: 400;
          color: var(--warning-text);
          background: var(--warning-subtle);
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          line-height: 1.4;
        }

        .form-error {
          font-size: 12px;
          color: var(--destructive-text);
          margin: -6px 0 12px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}
