// "All In One Menu" landing page for the Menu & Discounts nav group.
// Enterprise-grade live database operational landing page with A2A sync telemetry.
import React, { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthGuard, authedFetch } from "../../lib/auth";
import { useKapmetaSocket } from "../../lib/useKapmetaSocket";
import Nav from "../../components/Nav";

interface HubCard {
  label: string;
  description: string;
  buttonLabel: string;
  href: string;
  badge?: string;
  icon: JSX.Element;
}

interface SubNavItem {
  label: string;
  href: string;
  badge?: string;
}

interface MenuStats {
  totalItems: number;
  activeCategories: number;
  outOfStockCount: number;
  virtualOutletsCount: number;
  schedulesCount: number;
  specialNotesCount: number;
  lastMenuSyncAt: string | null;
  outletName: string;
}

function CardIcon(path: JSX.Element): JSX.Element {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

const HUB_CARDS: HubCard[] = [
  {
    label: "All In One Menu",
    description: "Manage catalog items, categories, per-channel pricing matrix (Dine In, Takeaway, Delivery, Swiggy, Zomato), and taxes.",
    buttonLabel: "Manage Menu",
    href: "/menu/manage",
    badge: "Core Catalog",
    icon: CardIcon(<><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" /></>),
  },
  {
    label: "Add Virtual Outlet",
    description: "Create and manage virtual cloud kitchen brands with dedicated menus, channel routing, and independent operations.",
    buttonLabel: "Add Outlet",
    href: "/menu/virtual-outlets",
    badge: "Cloud Kitchens",
    icon: CardIcon(<><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /><path d="M3 9h18" /></>),
  },
];

const SUB_NAV: SubNavItem[] = [
  { label: "Menu & Discounts", href: "/menu/hub" },
  { label: "Manage Menu", href: "/menu/manage" },
  { label: "Multi-Item Images Upload", href: "/menu/images-upload" },
  { label: "Menu on/off", href: "/channel-availability" },
  { label: "Special Note", href: "/menu/special-notes" },
  { label: "Set Item Commission", href: "/menu/commission" },
  { label: "Schedule Changes", href: "/menu/scheduling" },
  { label: "Physical Menu", href: "/menu/physical" },
];

function formatSyncBadge(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never synced";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "Just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MenuHubPage() {
  const { me, loading: authLoading } = useAuthGuard("menu.category.manage");
  const router = useRouter();

  const [stats, setStats] = useState<MenuStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const res = await authedFetch("/menu/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load menu stats", err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Live A2A Socket Refresh
  useKapmetaSocket((payload) => {
    if (payload.topic === "menu.synced" || payload.topic === "menu.updated" || payload.topic === "item.availability_changed") {
      fetchStats();
    }
  }, true, "menu-hub");

  const handleSyncMenu = async () => {
    try {
      setSyncing(true);
      setSyncFeedback(null);
      const res = await authedFetch("/menu/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSyncFeedback(data.message || "✓ Menu successfully synced across all POS terminals and channels!");
        await fetchStats();
        setTimeout(() => setSyncFeedback(null), 5000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setSyncFeedback(`⚠️ Sync failed: ${errJson.error || "Unknown error"}`);
      }
    } catch (err) {
      setSyncFeedback("⚠️ Network error while triggering menu synchronization.");
    } finally {
      setSyncing(false);
    }
  };

  const rawSyncAt = stats?.lastMenuSyncAt ?? (me?.outlet as any)?.lastMenuSyncAt ?? null;
  const syncLabel = formatSyncBadge(rawSyncAt);
  const isSynced = rawSyncAt !== null;

  const isSubNavActive = (href: string): boolean =>
    href.includes("?") ? router.asPath === href : router.pathname === href;

  return (
    <div className="hub-app">
      <Head>
        <title>KapMeta POS — Menu &amp; Discounts</title>
        <meta name="description" content="All-in-one landing page for menu, pricing, channels, and multi-agent operations." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon" aria-hidden="true">🍽️</span>
                <span className="brand-name">Menu &amp; Discounts</span>
              </div>
              <div className="outlet-pill">
                <span className="outlet-dot" />
                <span>{stats?.outletName || (me?.outlet as any)?.name || "All In One Menu"}</span>
              </div>
            </div>

            <div className="topbar-right">
              <button
                type="button"
                className={`btn-sync-action ${syncing ? "syncing" : ""}`}
                onClick={handleSyncMenu}
                disabled={syncing}
                title="Trigger real-time menu synchronization across POS and delivery aggregators"
              >
                <span className="sync-icon">{syncing ? "⏳" : "⚡"}</span>
                <span>{syncing ? "Syncing Menu..." : "Sync Menu Now"}</span>
              </button>

              <div className="user-profile-badge">
                <div className="avatar-circle">{me?.name ? me.name.charAt(0).toUpperCase() : "?"}</div>
                <span className="user-name">{me?.name ?? "Loading..."}</span>
              </div>
            </div>
          </header>

          <main className="hub-content">
            {authLoading && (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                {syncFeedback && (
                  <div className={`sync-feedback-banner ${syncFeedback.startsWith("✓") ? "success" : "warning"}`}>
                    <span>{syncFeedback}</span>
                    <button type="button" onClick={() => setSyncFeedback(null)}>✕</button>
                  </div>
                )}

                <section className="hub-toolbar">
                  <div>
                    <h1>Menu &amp; Discounts</h1>
                    <p className="hub-subtitle">Manage your menu or add a virtual outlet with dynamic database telemetry.</p>
                  </div>
                  <div
                    className={`sync-badge ${isSynced ? "synced" : "unsynced"}`}
                    title={rawSyncAt ? new Date(rawSyncAt).toLocaleString() : "Menu has not synced to any channel yet"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    <span>Last Menu Sync: {syncLabel}</span>
                  </div>
                </section>

                {/* Operational Live KPI Strip */}
                <section className="kpi-strip" aria-label="Menu Operational Metrics">
                  <div className="kpi-card">
                    <span className="kpi-label">TOTAL ITEMS</span>
                    <strong className="kpi-value">{stats ? stats.totalItems : "..."}</strong>
                    <span className="kpi-sub">In Active Catalog</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">CATEGORIES</span>
                    <strong className="kpi-value text-blue">{stats ? stats.activeCategories : "..."}</strong>
                    <span className="kpi-sub">Menu Groups</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">VIRTUAL BRANDS</span>
                    <strong className="kpi-value text-purple">{stats ? stats.virtualOutletsCount : "..."}</strong>
                    <span className="kpi-sub">Cloud Outlets</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">TIMED SCHEDULES</span>
                    <strong className="kpi-value text-amber">{stats ? stats.schedulesCount : "..."}</strong>
                    <span className="kpi-sub">Active Shifts</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">OUT OF STOCK (86)</span>
                    <strong className="kpi-value text-red">{stats ? stats.outOfStockCount : "0"}</strong>
                    <span className="kpi-sub">Items Offline</span>
                  </div>
                </section>

                <section className="hub-card-grid" aria-label="Menu setup">
                  {HUB_CARDS.map((card) => (
                    <article key={card.label} className="hub-card">
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                        <span className="hub-card-icon">{card.icon}</span>
                        {card.badge && <span className="card-top-badge">{card.badge}</span>}
                      </div>
                      <h2 className="hub-card-title">{card.label}</h2>
                      <p className="hub-card-desc">{card.description}</p>
                      <Link href={card.href} className="hub-card-btn">
                        {card.buttonLabel} →
                      </Link>
                    </article>
                  ))}
                </section>

                <section className="subnav-section" aria-label="Menu & Discounts tools">
                  <h2>Menu &amp; Discounts tools</h2>
                  <div className="subnav-row">
                    {SUB_NAV.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`subnav-chip ${isSubNavActive(item.href) ? "active" : ""}`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .hub-app {
          min-height: 100vh;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          font-family: "Inter", system-ui, -apple-system, sans-serif;
          color: #0f172a;
        }

        .topbar {
          height: 64px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .brand-icon {
          font-size: 20px;
        }

        .brand-name {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }

        .outlet-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #f1f5f9;
          color: #334155;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid #e2e8f0;
        }

        .outlet-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .btn-sync-action {
          background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25);
          transition: all 0.15s ease;
        }
        .btn-sync-action:hover {
          opacity: 0.95;
          transform: translateY(-1px);
        }
        .btn-sync-action.syncing {
          opacity: 0.8;
          cursor: wait;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .avatar-circle {
          width: 32px;
          height: 32px;
          background: #e2e8f0;
          color: #334155;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .hub-content {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .sync-feedback-banner {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
          animation: fadeIn 0.2s ease;
        }
        .sync-feedback-banner.success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .sync-feedback-banner.warning {
          background: #fffbeb;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .sync-feedback-banner button {
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 14px;
        }

        .hub-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .hub-toolbar h1 {
          margin: 0 0 4px;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
        }

        .hub-subtitle {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        .sync-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 700;
          white-space: nowrap;
        }

        .sync-badge.synced {
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .sync-badge.unsynced {
          background: #fff7ed;
          color: #9a3412;
          border: 1px solid #fed7aa;
        }

        .kpi-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .kpi-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.03em;
        }
        .kpi-value {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
        }
        .kpi-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
        }
        .text-blue { color: #2563eb; }
        .text-purple { color: #7c3aed; }
        .text-amber { color: #d97706; }
        .text-red { color: #dc2626; }

        .hub-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
        }

        .hub-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 28px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
          transition: all 0.18s ease;
        }

        .hub-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 8px 16px -4px rgba(59, 130, 246, 0.12);
          transform: translateY(-2px);
        }

        .hub-card-icon {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #eff6ff;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-top-badge {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          background: #f1f5f9;
          color: #475569;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .hub-card-title {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }

        .hub-card-desc {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #475569;
          flex: 1;
        }

        .hub-card-btn {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          background: #0f172a;
          color: #ffffff;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .hub-card-btn:hover {
          background: #2563eb;
        }

        .subnav-section h2 {
          margin: 0 0 12px;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }

        .subnav-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .subnav-chip {
          display: inline-flex;
          align-items: center;
          padding: 9px 16px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .subnav-chip:hover {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .subnav-chip.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
