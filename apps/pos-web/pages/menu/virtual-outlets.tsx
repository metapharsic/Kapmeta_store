// "Add Virtual Outlet" screen, opened from the second card on /menu/hub.
// The reference screenshots only show that entry card, not a deeper flow,
// so this stays deliberately small: a list of existing virtual outlets and
// a one-field form to create another. Backed by routes another agent is
// building in parallel this round (may still 404 for a few minutes):
//   GET  /outlets/virtual   -> virtual outlets for this outlet's account
//   POST /outlets/virtual   -> { name } creates one
// Per kapmeta/schema.prisma (migration 0041), a virtual outlet is just an
// Outlet row with isVirtual=true and parentOutletId set - there is no
// separate VirtualOutlet model - so the list below is plain Outlet fields
// (name + createdAt) and nothing invented beyond that.
//
// Guarded on "settings.manage" - apps/api/src/routes/virtual-outlets.ts
// requires that exact permission on both GET and POST /outlets/virtual, so
// gating the page on anything looser (e.g. menu.category.manage, which is
// what pages/menu/hub.tsx itself requires) would let someone reach a page
// whose own API calls then 403 underneath them.
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface VirtualOutlet {
  id: string;
  name: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function VirtualOutletsPage() {
  const { me, loading: authLoading } = useAuthGuard("settings.manage");

  const [outlets, setOutlets] = useState<VirtualOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadOutlets = () => {
    setLoading(true);
    setLoadError(null);
    authedFetch("/outlets/virtual")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = await res.json();
        const list: VirtualOutlet[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setOutlets(list);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load virtual outlets");
        setOutlets([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!authLoading && me) loadOutlets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Outlet name cannot be empty");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await authedFetch("/outlets/virtual", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "HTTP error " + res.status);
      }
      setName("");
      setActionNotice(`Virtual outlet "${trimmed}" created.`);
      loadOutlets();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create virtual outlet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vo-app">
      <Head>
        <title>KapMeta POS — Add Virtual Outlet</title>
        <meta name="description" content="Create and manage virtual outlets." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">🏬</span>
                <span className="brand-name">KapMeta Menu</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="user-profile-badge">
                <div className="avatar-circle">{me?.name ? me.name.charAt(0).toUpperCase() : "?"}</div>
                <span className="user-name">{me?.name ?? "Loading..."}</span>
              </div>
            </div>
          </header>

          <main className="vo-body">
            {authLoading && (
              <div className="empty-card">
                <span className="empty-icon">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                <Link href="/menu/hub" className="back-link">← Back to Menu &amp; Discounts</Link>
                <h1 className="vo-title">Add Virtual Outlet</h1>
                <p className="vo-subtitle">
                  Create a new virtual outlet and have the ability to control the menu independently.
                </p>

                {actionNotice && (
                  <div className="notice-card">
                    <span className="notice-icon">ℹ️</span>
                    <p>{actionNotice}</p>
                  </div>
                )}

                <section className="panel-card">
                  <h2 className="panel-title">New Virtual Outlet</h2>
                  <form className="create-form" onSubmit={handleCreate}>
                    <div className="form-field">
                      <label htmlFor="vo-name">Name *</label>
                      <input
                        id="vo-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Downtown Cloud Kitchen"
                      />
                    </div>
                    {formError && <p className="form-error">{formError}</p>}
                    <button type="submit" className="submit-btn" disabled={saving}>
                      {saving ? "Creating..." : "Add Outlet"}
                    </button>
                  </form>
                </section>

                <section className="panel-card">
                  <div className="panel-header">
                    <h2 className="panel-title">Existing Virtual Outlets</h2>
                    <span className="total-badge">{outlets.length}</span>
                  </div>

                  {loading && <div className="state-block">Loading virtual outlets...</div>}
                  {!loading && loadError && <div className="state-block state-block-error">{loadError}</div>}
                  {!loading && !loadError && outlets.length === 0 && (
                    <div className="state-block">No virtual outlets yet. Create one above.</div>
                  )}
                  {!loading && !loadError && outlets.length > 0 && (
                    <div className="table-wrap">
                      <table className="dense-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outlets.map((o) => (
                            <tr key={o.id}>
                              <td className="name-cell">{o.name}</td>
                              <td>{formatDate(o.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .vo-app {
          min-height: 100vh;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
          font-family: "Inter", system-ui, -apple-system, sans-serif;
          color: var(--text-primary);
        }
        .topbar {
          height: 64px;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .topbar-left { display: flex; align-items: center; gap: 16px; }
        .brand-badge { display: flex; align-items: center; gap: 8px; }
        .brand-icon { font-size: 20px; }
        .brand-name { font-size: 16px; font-weight: 700; }
        .topbar-right { display: flex; align-items: center; }
        .user-profile-badge { display: flex; align-items: center; gap: 8px; }
        .avatar-circle {
          width: 32px; height: 32px; background: var(--accent-subtle); color: var(--accent-subtle-text);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 13px;
        }
        .user-name { font-size: 13px; font-weight: 600; }

        .vo-body {
          padding: 24px;
          max-width: 760px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .empty-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .empty-icon { font-size: 32px; display: block; margin-bottom: 10px; }

        .back-link {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          text-decoration: none;
        }
        .back-link:hover { color: var(--accent-subtle-text); }

        .vo-title { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.4px; }
        .vo-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }

        .notice-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          background: var(--bg-card);
          border: 1px solid var(--border);
          font-size: 0.8125rem;
        }
        .notice-card p { margin: 0; }

        .panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .panel-header { display: flex; justify-content: space-between; align-items: center; }
        .panel-title { margin: 0; font-size: 1rem; font-weight: 800; }
        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }

        .create-form { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .form-field { display: flex; flex-direction: column; gap: 4px; width: 100%; }
        .form-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
        .form-field input {
          padding: 9px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          background: var(--bg-base);
          color: var(--text-primary);
        }
        .form-error { margin: 0; font-size: 0.8125rem; color: var(--destructive-text); }
        .submit-btn {
          padding: 9px 20px;
          background: var(--dark-btn);
          color: #fff;
          border: none;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
        }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .state-block {
          text-align: center;
          padding: 24px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
        }
        .state-block-error { color: var(--destructive-text); }

        .table-wrap { overflow-x: auto; }
        .dense-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .dense-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.4px;
          border-bottom: 1px solid var(--border);
        }
        .dense-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-subtle, var(--border));
        }
        .name-cell { font-weight: 700; }
      `}</style>
    </div>
  );
}
