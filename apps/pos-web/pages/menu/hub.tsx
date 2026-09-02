// "All In One Menu" landing page for the Menu & Discounts nav group.
// Pure navigation surface - no catalog CRUD lives here (that's /menu). Tiles
// route into the real screens (some built by other agents this round; see
// apps/pos-web/pages/menu/{special-notes,commission,scheduling,physical,
// images-upload}.tsx). The "Last Menu Sync" badge reads Outlet.lastMenuSyncAt
// off GET /auth/me if the field is present there - it is not exposed by that
// endpoint as of this page's authoring (apps/api/src/routes/auth.ts only
// projects a fixed outlet field list), so the badge reads "Never synced"
// until a future change adds it. No fake relative timestamp is ever shown.
import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface CategoryTile {
  label: string;
  href: string;
  hint: string;
  icon: JSX.Element;
}

interface SubNavItem {
  label: string;
  href: string;
}

function TileIcon(path: JSX.Element): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    label: "Base Menu",
    href: "/menu",
    hint: "Categories & items",
    icon: TileIcon(<><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" /></>),
  },
  {
    label: "Home Delivery",
    href: "/menu?filter=delivery",
    hint: "Delivery-channel pricing",
    icon: TileIcon(<><rect x="1" y="7" width="14" height="10" rx="1.5" /><path d="M15 10h4l3 3v4h-7z" /><circle cx="6" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></>),
  },
  {
    label: "Parcel",
    href: "/menu?filter=parcel",
    hint: "Takeaway packaging & items",
    icon: TileIcon(<><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8" /><path d="M12 13v9" /></>),
  },
  {
    label: "Dine In",
    href: "/menu?filter=dinein",
    hint: "Table-service menu",
    icon: TileIcon(<><path d="M6 2v7a3 3 0 0 0 6 0V2" /><path d="M9 9v13" /><path d="M18 2c-1.5 0-3 1.5-3 4v4h6" /><path d="M18 10v11" /></>),
  },
  {
    label: "Zomato",
    href: "/channel-availability?channel=zomato",
    hint: "Aggregator item status",
    icon: TileIcon(<><circle cx="12" cy="12" r="9.5" /><path d="M8 9c1.5-2 6.5-2 8 0" /><path d="M8 15c1.5 2 6.5 2 8 0" /></>),
  },
  {
    label: "Swiggy",
    href: "/channel-availability?channel=swiggy",
    hint: "Aggregator item status",
    icon: TileIcon(<><path d="M12 2 4 12h6l-2 10 10-13h-6l0-7Z" /></>),
  },
];

// Task text calls for the hub link plus the six other Menu & Discounts
// screens here - Base Menu is left out because it already leads the tile
// grid above.
const SUB_NAV: SubNavItem[] = [
  { label: "Menu & Discounts", href: "/menu/hub" },
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

  // GET /auth/me's outlet payload today only projects a fixed field list
  // (name/code/address/phone/email/logoUrl/fssaiNumber/upiVpa/taxNumber) -
  // lastMenuSyncAt is not among them. Read it defensively so this page
  // starts working the moment that's added, without needing another edit.
  const rawSyncAt = (me?.outlet as unknown as { lastMenuSyncAt?: string | null } | null)?.lastMenuSyncAt ?? null;
  const syncLabel = formatSyncBadge(rawSyncAt);
  const isSynced = rawSyncAt !== null;

  const isSubNavActive = (href: string): boolean =>
    href.includes("?") ? router.asPath === href : router.pathname === href;

  return (
    <div className="hub-app">
      <Head>
        <title>KapMeta POS — Menu & Discounts</title>
        <meta name="description" content="All-in-one landing page for menu, pricing and channel management." />
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
                <span>All In One Menu</span>
              </div>
            </div>

            <div className="topbar-right">
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
                <section className="hub-toolbar">
                  <div>
                    <h1>Menu &amp; Discounts</h1>
                    <p className="hub-subtitle">Pick a channel or open a Menu &amp; Discounts tool below.</p>
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

                <section className="tile-grid" aria-label="Menu categories">
                  {CATEGORY_TILES.map((tile) => (
                    <Link key={tile.label} href={tile.href} className="category-tile">
                      <span className="tile-icon">{tile.icon}</span>
                      <span className="tile-label">{tile.label}</span>
                      <span className="tile-hint">{tile.hint}</span>
                    </Link>
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
          color: var(--text-primary);
        }

        .outlet-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 600;
        }

        .outlet-dot {
          width: 6px;
          height: 6px;
          background: var(--accent);
          border-radius: 50%;
          flex-shrink: 0;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
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

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .hub-content {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 64px 0;
          color: var(--text-secondary);
        }

        .empty-icon {
          font-size: 28px;
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
          font-weight: 700;
          color: var(--text-primary);
        }

        .hub-subtitle {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .sync-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: var(--radius-pill);
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
        }

        .sync-badge.synced {
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }

        .sync-badge.unsynced {
          background: var(--warning-subtle);
          color: var(--warning-text);
        }

        .tile-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 16px;
        }

        .category-tile {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          text-decoration: none;
          color: var(--text-primary);
          box-shadow: var(--shadow-card);
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }

        .category-tile:hover,
        .category-tile:focus-visible {
          border-color: var(--accent);
          box-shadow: var(--shadow-pop);
          transform: translateY(-2px);
        }

        .category-tile:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .tile-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-md);
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tile-label {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .tile-hint {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .subnav-section h2 {
          margin: 0 0 12px;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
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
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
        }

        .subnav-chip:hover,
        .subnav-chip:focus-visible {
          border-color: var(--accent);
          background: var(--accent-subtle);
          color: var(--accent-subtle-text);
        }

        .subnav-chip:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .subnav-chip.active {
          background: var(--accent);
          border-color: var(--accent);
          /* Existing convention for text-on-accent in this codebase (see the
             group badge in Nav.tsx's sidebar variant) - there is no
             dedicated --color-on-accent token defined in _app.tsx. */
          color: var(--bg-card);
        }

        @media (prefers-reduced-motion: reduce) {
          .category-tile,
          .subnav-chip {
            transition: none;
          }
          .category-tile:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
