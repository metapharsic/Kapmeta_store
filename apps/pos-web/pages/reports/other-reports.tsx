import React, { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import { REPORT_CATEGORIES, ReportCatalogEntry, ReportCategoryId, filterReportCatalog } from "../../lib/report-catalog";

// Real per-user shortcuts (UserQuickLink rows, GET/POST/DELETE /quick-links
// — same mechanism components/QuickLinks.tsx already uses in the sidebar).
// This app has no separate "favorite report" table, and building one just
// for this screen would be new backend scope the task explicitly says to
// avoid — so "favouriting" a report here really is adding/removing a
// per-user quick link pointed at that report's page. It persists for real
// (survives refresh, is scoped to the signed-in user) rather than being a
// fake, refresh-losing localStorage toggle.
interface QuickLinkApi {
  id: string;
  label: string;
  href: string;
  sortOrder: number;
}

type TabId = "FAVOURITE" | ReportCategoryId;

export default function OtherReportsPage() {
  const { me, loading: authLoading } = useAuthGuard("report.read");
  const [activeTab, setActiveTab] = useState<TabId>("FAVOURITE");
  const [quickLinks, setQuickLinks] = useState<QuickLinkApi[]>([]);
  const [quickLinksLoaded, setQuickLinksLoaded] = useState(false);
  const [busyHref, setBusyHref] = useState<string | null>(null);

  const catalog = useMemo(() => (me ? filterReportCatalog(me.permissions) : []), [me]);

  const loadQuickLinks = useCallback(() => {
    authedFetch("/quick-links")
      .then((res) => (res.ok ? (res.json() as Promise<QuickLinkApi[]>) : []))
      .then((data) => {
        setQuickLinks(data);
        setQuickLinksLoaded(true);
      })
      .catch(() => setQuickLinksLoaded(true));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadQuickLinks();
  }, [authLoading, loadQuickLinks]);

  const favoritedHrefs = useMemo(() => new Set(quickLinks.map((q) => q.href)), [quickLinks]);

  const favouriteReports = useMemo(
    () => catalog.filter((r) => favoritedHrefs.has(r.href)),
    [catalog, favoritedHrefs]
  );

  const visibleReports = activeTab === "FAVOURITE" ? favouriteReports : catalog.filter((r) => r.category === activeTab);

  const toggleFavorite = async (report: ReportCatalogEntry) => {
    setBusyHref(report.href);
    const existing = quickLinks.find((q) => q.href === report.href);
    try {
      if (existing) {
        setQuickLinks((prev) => prev.filter((q) => q.id !== existing.id));
        const res = await authedFetch(`/quick-links/${existing.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
      } else {
        const res = await authedFetch("/quick-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: report.title, href: report.href }),
        });
        if (!res.ok) throw new Error("create failed");
        const created = (await res.json()) as QuickLinkApi;
        setQuickLinks((prev) => [...prev, created]);
      }
    } catch {
      // best-effort — reconcile with the server on failure
      loadQuickLinks();
    } finally {
      setBusyHref(null);
    }
  };

  if (authLoading) return null;

  const noAccess = me && !me.permissions.includes("report.read");

  const tabs: { id: TabId; label: string }[] = [
    { id: "FAVOURITE", label: "Favourite" },
    ...REPORT_CATEGORIES.map((c) => ({ id: c.id as TabId, label: c.label })),
  ];

  return (
    <div className="or-app">
      <Head>
        <title>KapMeta POS - Other Reports</title>
        <meta name="description" content="Browse every report by category." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Reports</span>
                <h1 className="greeting-title">Other Reports</h1>
                <p className="greeting-subtitle">Every real report in this outlet, organized by category.</p>
              </div>
            </section>

            {noAccess ? (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No report access</h3>
                <p>Your role does not grant the "report.read" permission required to browse reports.</p>
              </div>
            ) : (
              <div className="or-layout">
                <nav className="or-tabs" aria-label="Report categories">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`or-tab ${activeTab === t.id ? "is-active" : ""}`}
                      onClick={() => setActiveTab(t.id)}
                    >
                      {t.id === "FAVOURITE" && <span className="or-tab-star">★</span>}
                      {t.label}
                    </button>
                  ))}
                </nav>

                <section className="or-panel">
                  {activeTab === "FAVOURITE" && !quickLinksLoaded && (
                    <div className="empty-state-card">
                      <span className="empty-icon">⏳</span>
                      <h3>Loading favourites...</h3>
                    </div>
                  )}

                  {activeTab === "FAVOURITE" && quickLinksLoaded && favouriteReports.length === 0 && (
                    <div className="empty-state-card">
                      <span className="empty-icon">☆</span>
                      <h3>No Favourites Yet</h3>
                      <p>Star a report from any category below to pin it here for quick access.</p>
                    </div>
                  )}

                  {activeTab !== "FAVOURITE" && visibleReports.length === 0 && (
                    <div className="empty-state-card">
                      <span className="empty-icon">🗂️</span>
                      <h3>No Reports Here Yet</h3>
                      <p>Nothing in this category is available to your role.</p>
                    </div>
                  )}

                  {visibleReports.length > 0 && (
                    <div className="or-grid">
                      {visibleReports.map((r) => {
                        const isFav = favoritedHrefs.has(r.href);
                        return (
                          <article key={r.key} className="or-card">
                            <div className="or-card-head">
                              <h3>{r.title}</h3>
                              <button
                                type="button"
                                className={`or-star-btn ${isFav ? "is-fav" : ""}`}
                                disabled={busyHref === r.href}
                                onClick={() => toggleFavorite(r)}
                                aria-label={isFav ? `Remove ${r.title} from favourites` : `Add ${r.title} to favourites`}
                                title={isFav ? "Remove from favourites" : "Add to favourites"}
                              >
                                {isFav ? "★" : "☆"}
                              </button>
                            </div>
                            <p className="or-card-desc">{r.description}</p>
                            <Link href={r.href} className="or-view-link">
                              View Details &rarr;
                            </Link>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .or-app {
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
          max-width: 1500px;
          margin: 0 auto;
          width: 100%;
        }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }

        .or-layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 20px;
          align-items: start;
        }
        .or-tabs {
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 8px;
          position: sticky;
          top: 24px;
        }
        .or-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          text-align: left;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 0.8438rem;
          font-weight: 600;
          cursor: pointer;
        }
        .or-tab:hover { background: var(--bg-subtle); }
        .or-tab.is-active { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .or-tab-star { color: #f59e0b; }

        .or-panel { min-width: 0; }
        .or-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .or-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .or-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-pop); }
        .or-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .or-card-head h3 { margin: 0; font-size: 0.9375rem; font-weight: 800; color: var(--text-primary); }
        .or-star-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.125rem;
          line-height: 1;
          color: #cbd5e1;
          padding: 2px;
          flex-shrink: 0;
        }
        .or-star-btn.is-fav { color: #f59e0b; }
        .or-star-btn:disabled { opacity: 0.5; cursor: wait; }
        .or-card-desc { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.5; flex: 1; }
        .or-view-link { font-size: 0.8125rem; font-weight: 700; color: var(--accent); text-decoration: none; }
        .or-view-link:hover { text-decoration: underline; }

        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }

        @media (max-width: 720px) {
          .or-layout { grid-template-columns: 1fr; }
          .or-tabs { position: static; flex-direction: row; overflow-x: auto; }
        }
      `}</style>
    </div>
  );
}
