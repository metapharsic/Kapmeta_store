// Menu Management console - the screen one level below the "All In One
// Menu" card on /menu/hub. Real category data from GET /menu/categories
// (same endpoint pages/menu.tsx uses for category CRUD - category CRUD
// itself still lives there, this page only reads categories to build the
// left rail / filter). Item rows and per-channel price/availability come
// from the new channel-pricing endpoints another agent is building in
// parallel this round:
//   GET /menu/channel-prices?channel=<CHANNEL>
//   PUT /menu/channel-prices/:itemId   { channel, priceMinor, onlineDisplayName?, isAvailable? }
// priceMinor is required on every PUT (apps/api/src/routes/menu-channel-pricing.ts
// 400s without it, even when only isAvailable is changing) - toggleAvailable()
// below always resends the row's current price for that reason. These routes
// may still 404 for a minute or two after this file is written if
// menu-channel-pricing.ts hasn't been mounted into app.ts yet - this
// page is defensive about the response shape (accepts a bare array or an
// {items:[...]} envelope) but does not invent data if the routes are down;
// load failures surface in the normal error banner.
//
// Top tab bar ("Items | Categories | Variants | Addons | Tables/Areas |
// Taxes | Discounts") - only Items has real content on this page. The
// other six route out to whatever screen actually owns that data, or are
// disabled with an honest tooltip when nothing owns it yet:
//   Categories   -> /menu (category CRUD already lives on that page)
//   Variants     -> disabled, no backend/UI exists anywhere in this repo
//   Addons       -> disabled - apps/api/src/routes/menu.ts DOES have full
//                   modifier-group/modifier-option CRUD routes, but no
//                   pos-web page manages them (pages/menu/images-upload.tsx
//                   only lists addon groups to pick an image target, it is
//                   not an addon management screen, and it doesn't even
//                   persist since menu items have no imageUrl column yet)
//   Tables/Areas -> /table-management (real page, backed by GET/POST /tables)
//   Taxes        -> disabled - apps/api/src/routes/tax-settings.ts DOES
//                   have GET/POST /settings/taxes, but no pos-web page
//                   calls it anywhere in this repo
//   Discounts    -> disabled, no backend/UI exists anywhere in this repo
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

interface Category {
  id: string;
  outletId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface ChannelPriceRow {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  categoryName: string;
  priceMinor: string; // BigInt serialized as string, same convention as menu.tsx
  onlineDisplayName: string | null;
  isAvailable: boolean;
  hasOverride: boolean;
}

type ChannelKey = "BASE" | "HOME_DELIVERY" | "PARCEL" | "DINE_IN" | "ZOMATO" | "SWIGGY";
type DineInMode = "AC" | "NON_AC";
type ApiChannel = "BASE" | "HOME_DELIVERY" | "PARCEL" | "DINE_IN_AC" | "DINE_IN_NON_AC" | "ZOMATO" | "SWIGGY";

const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "BASE", label: "Base Menu" },
  { key: "HOME_DELIVERY", label: "Home Delivery" },
  { key: "PARCEL", label: "Parcel" },
  { key: "DINE_IN", label: "Dine In" },
  { key: "ZOMATO", label: "Zomato" },
  { key: "SWIGGY", label: "Swiggy" },
];

function apiChannelFor(key: ChannelKey, dineInMode: DineInMode): ApiChannel {
  if (key === "DINE_IN") return dineInMode === "AC" ? "DINE_IN_AC" : "DINE_IN_NON_AC";
  return key;
}

function channelLabelFor(key: ChannelKey, dineInMode: DineInMode): string {
  if (key === "DINE_IN") return dineInMode === "AC" ? "Dine In (AC)" : "Dine In (Non AC)";
  return CHANNELS.find((c) => c.key === key)?.label ?? key;
}

// Column visibility differs by channel per the reference screenshots -
// exact, not a guess:
//   Base Menu                          -> Short Code, Online Display Name; NO Available
//   Home Delivery / Parcel / Dine In   -> Short Code, Available; NO Online Display Name
//   Zomato / Swiggy                    -> Online Display Name, Available; NO Short Code
function columnsFor(key: ChannelKey): { shortCode: boolean; onlineDisplayName: boolean; available: boolean } {
  if (key === "BASE") return { shortCode: true, onlineDisplayName: true, available: false };
  if (key === "ZOMATO" || key === "SWIGGY") return { shortCode: false, onlineDisplayName: true, available: true };
  return { shortCode: true, onlineDisplayName: false, available: true };
}

function formatPriceMinor(priceMinor: string): string {
  const rupees = Number(BigInt(priceMinor || "0")) / 100;
  return `₹${rupees.toFixed(2)}`;
}

interface TopTab {
  key: string;
  label: string;
  kind: "current" | "link" | "disabled";
  href?: string;
  tooltip?: string;
}

const TOP_TABS: TopTab[] = [
  { key: "items", label: "Items", kind: "current" },
  { key: "categories", label: "Categories", kind: "link", href: "/menu", tooltip: "Categories are managed on the Menu Management page" },
  { key: "variants", label: "Variants", kind: "disabled", tooltip: "Variants are not built yet — coming soon" },
  {
    key: "addons",
    label: "Addons",
    kind: "disabled",
    tooltip: "Addon/modifier groups have no management page yet (backend routes exist, no UI has been built) — coming soon",
  },
  { key: "tables", label: "Tables/Areas", kind: "link", href: "/table-management", tooltip: "Manage tables & areas" },
  {
    key: "taxes",
    label: "Taxes",
    kind: "disabled",
    tooltip: "Tax rate settings have no management page yet (backend route exists at /settings/taxes, no UI has been built) — coming soon",
  },
  { key: "discounts", label: "Discounts", kind: "disabled", tooltip: "Discounts are not built yet — coming soon" },
];

export default function MenuManagePage() {
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const canWrite = me?.permissions.includes("menu.item.manage") ?? false;

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const [channelKey, setChannelKey] = useState<ChannelKey>("BASE");
  const [dineInMode, setDineInMode] = useState<DineInMode>("AC");
  const apiChannel = apiChannelFor(channelKey, dineInMode);
  const columns = columnsFor(channelKey);
  const channelLabel = channelLabelFor(channelKey, dineInMode);

  const [rows, setRows] = useState<ChannelPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !me) return;
    authedFetch("/menu/categories")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("HTTP error " + res.status))))
      .then((data: Category[]) => {
        setCategories(Array.isArray(data) ? data : []);
        setCategoriesLoaded(true);
      })
      .catch(() => setCategoriesLoaded(true));
  }, [authLoading, me]);

  const loadRows = (channel: ApiChannel) => {
    setLoading(true);
    setLoadError(null);
    authedFetch(`/menu/channel-prices?channel=${encodeURIComponent(channel)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = await res.json();
        const list: ChannelPriceRow[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setRows(list);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load channel pricing");
        setRows([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading || !me) return;
    loadRows(apiChannel);
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me, apiChannel]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesCategory = selectedCategory === "ALL" || row.categoryName === selectedCategory;
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || row.name.toLowerCase().includes(q) || (row.onlineDisplayName ?? "").toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [rows, selectedCategory, search]);

  const selectChannel = (key: ChannelKey) => {
    if (key === channelKey) return;
    setChannelKey(key);
    setSelectedCategory("ALL");
    setSearch("");
    setActionError(null);
    setActionNotice(null);
  };

  const openEdit = (row: ChannelPriceRow) => {
    setEditingId(row.id);
    setEditPrice((Number(BigInt(row.priceMinor || "0")) / 100).toFixed(2));
    setEditDisplayName(row.onlineDisplayName ?? "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = async (row: ChannelPriceRow) => {
    const rupees = parseFloat(editPrice);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setEditError("Enter a valid price in Rupees");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const body: Record<string, unknown> = { channel: apiChannel, priceMinor: Math.round(rupees * 100) };
    if (columns.onlineDisplayName) body.onlineDisplayName = editDisplayName.trim() || null;
    try {
      const res = await authedFetch(`/menu/channel-prices/${row.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "HTTP error " + res.status);
      }
      setActionNotice(`Saved "${row.name}" for ${channelLabel}.`);
      setActionError(null);
      setEditingId(null);
      loadRows(apiChannel);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save price");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleAvailable = async (row: ChannelPriceRow) => {
    setActionError(null);
    try {
      // PUT requires priceMinor on every call (apps/api/src/routes/menu-channel-pricing.ts
      // validates it as a required field even when only isAvailable is changing), so the
      // row's current price is always resent unchanged here.
      const res = await authedFetch(`/menu/channel-prices/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          channel: apiChannel,
          priceMinor: Number(row.priceMinor),
          isAvailable: !row.isAvailable,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "HTTP error " + res.status);
      }
      setActionNotice(`"${row.name}" is now ${!row.isAvailable ? "available" : "unavailable"} on ${channelLabel}.`);
      loadRows(apiChannel);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update availability");
    }
  };

  const colSpan =
    3 + // Name, Price, Description are always shown
    (columns.shortCode ? 1 : 0) +
    (columns.onlineDisplayName ? 1 : 0) +
    (columns.available ? 1 : 0) +
    (canWrite ? 1 : 0);

  return (
    <div className="mm-app">
      <Head>
        <title>KapMeta POS — Menu Management</title>
        <meta name="description" content="Per-channel menu items, pricing and availability." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">🍽️</span>
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

          <main className="mm-body">
            {authLoading && (
              <div className="empty-card">
                <span className="empty-icon">🔐</span>
                <h3>Checking access...</h3>
              </div>
            )}

            {!authLoading && (
              <>
                <section className="mm-header-row">
                  <div>
                    <Link href="/menu/hub" className="back-link">← Back to Menu &amp; Discounts</Link>
                    <h1 className="mm-title">Menu Management — {channelLabel}</h1>
                  </div>
                  {(channelKey === "ZOMATO" || channelKey === "SWIGGY") && (
                    <VisitStoreButton channel={channelKey} />
                  )}
                </section>

                <nav className="top-tab-row" aria-label="Menu Management sections">
                  {TOP_TABS.map((tab) =>
                    tab.kind === "current" ? (
                      <span key={tab.key} className="top-tab top-tab-active">
                        {tab.label}
                      </span>
                    ) : tab.kind === "link" ? (
                      <Link key={tab.key} href={tab.href!} className="top-tab" title={tab.tooltip}>
                        {tab.label}
                      </Link>
                    ) : (
                      <span key={tab.key} className="top-tab top-tab-disabled" title={tab.tooltip}>
                        {tab.label}
                      </span>
                    )
                  )}
                </nav>

                <div className="mm-layout">
                  <aside className="category-rail" aria-label="Categories">
                    <h2>Categories</h2>
                    <button
                      type="button"
                      className={`rail-item ${selectedCategory === "ALL" ? "rail-item-active" : ""}`}
                      onClick={() => setSelectedCategory("ALL")}
                    >
                      All Categories
                    </button>
                    {!categoriesLoaded && <p className="rail-hint">Loading categories...</p>}
                    {categoriesLoaded && categories.length === 0 && <p className="rail-hint">No categories yet.</p>}
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`rail-item ${selectedCategory === cat.name ? "rail-item-active" : ""}`}
                        onClick={() => setSelectedCategory(cat.name)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </aside>

                  <div className="mm-content">
                    <section className="channel-select-row">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch.key}
                          type="button"
                          className={`channel-pill ${channelKey === ch.key ? "channel-pill-active" : ""}`}
                          onClick={() => selectChannel(ch.key)}
                        >
                          {ch.label}
                        </button>
                      ))}
                      {channelKey === "DINE_IN" && (
                        <div className="dinein-toggle" role="group" aria-label="Dine In AC / Non AC">
                          <button
                            type="button"
                            className={`dinein-btn ${dineInMode === "AC" ? "dinein-btn-active" : ""}`}
                            onClick={() => setDineInMode("AC")}
                          >
                            AC
                          </button>
                          <button
                            type="button"
                            className={`dinein-btn ${dineInMode === "NON_AC" ? "dinein-btn-active" : ""}`}
                            onClick={() => setDineInMode("NON_AC")}
                          >
                            Non AC
                          </button>
                        </div>
                      )}
                    </section>

                    {(channelKey === "ZOMATO" || channelKey === "SWIGGY") && (
                      <div className="sync-banner">
                        <span className="sync-banner-icon">ℹ️</span>
                        <span>No sync history on file yet for {channelLabel} — this outlet's database has no sync-tracking field yet, so no name, date or status is shown here.</span>
                      </div>
                    )}

                    {actionError && (
                      <div className="notice-card notice-error">
                        <span className="notice-icon">⚠️</span>
                        <p>{actionError}</p>
                      </div>
                    )}
                    {actionNotice && (
                      <div className="notice-card">
                        <span className="notice-icon">ℹ️</span>
                        <p>{actionNotice}</p>
                      </div>
                    )}

                    <div className="table-toolbar">
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Search items..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="row-count">{filteredRows.length} item{filteredRows.length === 1 ? "" : "s"}</span>
                    </div>

                    <div className="table-wrap">
                      <table className="dense-table">
                        <thead>
                          <tr>
                            <th>Name*</th>
                            {columns.shortCode && <th>Short Code*</th>}
                            {columns.onlineDisplayName && <th>Online Display Name</th>}
                            <th className="col-num">Price*</th>
                            <th>Description</th>
                            {columns.available && <th>Available</th>}
                            {canWrite && <th className="col-actions">Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {loading && (
                            <tr>
                              <td colSpan={colSpan} className="state-cell">Loading {channelLabel} items...</td>
                            </tr>
                          )}
                          {!loading && loadError && (
                            <tr>
                              <td colSpan={colSpan} className="state-cell state-cell-error">{loadError}</td>
                            </tr>
                          )}
                          {!loading && !loadError && filteredRows.length === 0 && (
                            <tr>
                              <td colSpan={colSpan} className="state-cell">No items found for {channelLabel}.</td>
                            </tr>
                          )}
                          {!loading && !loadError && filteredRows.map((row) => {
                            const isEditing = editingId === row.id;
                            return (
                              <tr key={row.id}>
                                <td>
                                  <div className="item-name">{row.name}</div>
                                  <div className="item-category">{row.categoryName}</div>
                                </td>
                                {columns.shortCode && <td>{row.shortCode || <span className="muted">—</span>}</td>}
                                {columns.onlineDisplayName && (
                                  <td>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        className="cell-input"
                                        value={editDisplayName}
                                        onChange={(e) => setEditDisplayName(e.target.value)}
                                        placeholder={row.name}
                                      />
                                    ) : (
                                      row.onlineDisplayName || <span className="muted">—</span>
                                    )}
                                  </td>
                                )}
                                <td className="col-num">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      className="cell-input cell-input-num"
                                      min={0}
                                      step="0.01"
                                      value={editPrice}
                                      onChange={(e) => setEditPrice(e.target.value)}
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="price-cell">
                                      {formatPriceMinor(row.priceMinor)}
                                      {!row.hasOverride && (
                                        <span className="inherited-badge" title="No override set for this channel — showing the item's base price">
                                          inherited
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td className="desc-cell">{row.description || <span className="muted">—</span>}</td>
                                {columns.available && (
                                  <td>
                                    <button
                                      type="button"
                                      className={`avail-toggle ${row.isAvailable ? "avail-on" : "avail-off"}`}
                                      disabled={!canWrite}
                                      onClick={() => toggleAvailable(row)}
                                      title={canWrite ? `Click to turn ${row.isAvailable ? "off" : "on"}` : "menu.item.manage permission required"}
                                    >
                                      {row.isAvailable ? "Available" : "Unavailable"}
                                    </button>
                                  </td>
                                )}
                                {canWrite && (
                                  <td className="col-actions">
                                    {isEditing ? (
                                      <div className="edit-actions">
                                        <button type="button" className="row-btn row-btn-primary" disabled={editSaving} onClick={() => saveEdit(row)}>
                                          {editSaving ? "Saving..." : "Save"}
                                        </button>
                                        <button type="button" className="row-btn" disabled={editSaving} onClick={cancelEdit}>
                                          Cancel
                                        </button>
                                        {editError && <div className="edit-error">{editError}</div>}
                                      </div>
                                    ) : (
                                      <button type="button" className="row-btn" onClick={() => openEdit(row)}>
                                        Edit
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .mm-app {
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

        .mm-body {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .empty-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .empty-icon { font-size: 32px; display: block; margin-bottom: 10px; }

        .mm-header-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .back-link {
          display: inline-block;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          text-decoration: none;
          margin-bottom: 6px;
        }
        .back-link:hover { color: var(--accent-subtle-text); }
        .mm-title { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.4px; }

        .top-tab-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          background: var(--bg-subtle);
          padding: 6px;
          border-radius: var(--radius-md);
        }
        .top-tab {
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-decoration: none;
          cursor: pointer;
          background: transparent;
          border: none;
        }
        .top-tab:hover { color: var(--text-primary); }
        .top-tab-active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
          cursor: default;
        }
        .top-tab-disabled {
          color: var(--text-muted);
          opacity: 0.55;
          cursor: not-allowed;
        }
        .top-tab-disabled:hover { color: var(--text-muted); }

        .mm-layout {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 16px;
          align-items: start;
        }

        .category-rail {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: sticky;
          top: 88px;
        }
        .category-rail h2 {
          margin: 0 0 8px;
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted);
        }
        .rail-item {
          text-align: left;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          border: none;
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .rail-item:hover { background: var(--bg-subtle); color: var(--text-primary); }
        .rail-item-active { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .rail-hint { margin: 4px 0; font-size: 0.75rem; color: var(--text-muted); }

        .mm-content {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .channel-select-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 12px;
        }
        .channel-pill {
          padding: 8px 16px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: var(--bg-card);
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .channel-pill:hover { border-color: var(--accent); }
        .channel-pill-active {
          background: var(--dark-btn);
          color: #fff;
          border-color: var(--dark-btn);
        }
        .dinein-toggle {
          display: flex;
          gap: 2px;
          background: var(--bg-subtle);
          border-radius: var(--radius-pill);
          padding: 3px;
          margin-left: 4px;
        }
        .dinein-btn {
          padding: 6px 12px;
          border-radius: var(--radius-pill);
          border: none;
          background: transparent;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .dinein-btn-active { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-sm); }

        .sync-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: var(--bg-subtle);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          padding: 12px 16px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
        .sync-banner-icon { flex-shrink: 0; }

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
        .notice-error { border-color: var(--destructive); }

        .table-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .search-input {
          flex: 1 1 260px;
          max-width: 320px;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .row-count { font-size: 0.75rem; color: var(--text-secondary); }

        .table-wrap {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow-x: auto;
        }
        .dense-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .dense-table th {
          text-align: left;
          padding: 10px 14px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.4px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .dense-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle, var(--border));
          vertical-align: top;
        }
        .dense-table .col-num { text-align: right; }
        .dense-table .col-actions { text-align: right; white-space: nowrap; }
        .item-name { font-weight: 700; color: var(--text-primary); }
        .item-category { font-size: 0.6875rem; color: var(--text-muted); margin-top: 2px; }
        .muted { color: var(--text-muted); }
        .desc-cell { max-width: 260px; color: var(--text-secondary); }

        .price-cell { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
        .inherited-badge {
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          padding: 2px 6px;
          border-radius: var(--radius-pill);
          background: var(--warning-subtle);
          color: var(--warning-text);
          cursor: help;
        }

        .cell-input {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--accent);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          background: var(--bg-base);
          color: var(--text-primary);
        }
        .cell-input-num { width: 100px; text-align: right; }

        .avail-toggle {
          padding: 5px 12px;
          border-radius: var(--radius-pill);
          border: none;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .avail-toggle:disabled { cursor: not-allowed; opacity: 0.7; }
        .avail-on { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .avail-off { background: var(--destructive-subtle); color: var(--destructive-text); }

        .edit-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .edit-error { font-size: 0.6875rem; color: var(--destructive-text); max-width: 160px; text-align: right; }

        .row-btn {
          border: 1px solid var(--border);
          background: var(--bg-card);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 5px 10px;
          cursor: pointer;
          color: var(--text-secondary);
        }
        .row-btn:hover { background: var(--bg-subtle); }
        .row-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .row-btn-primary { background: var(--dark-btn); color: #fff; border-color: var(--dark-btn); }
        .row-btn-primary:hover { background: var(--dark-btn-hover); }

        .state-cell {
          text-align: center;
          padding: 32px 16px;
          color: var(--text-secondary);
          font-size: 0.8125rem;
        }
        .state-cell-error { color: var(--destructive-text); }

        @media (max-width: 900px) {
          .mm-layout { grid-template-columns: 1fr; }
          .category-rail { position: static; flex-direction: row; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}

// Isolated so its own honest "no URL on file" reasoning doesn't clutter the
// main render tree. There is no store-URL field anywhere on ChannelAccount
// (or any other model) in kapmeta/schema.prisma, so this never links to a
// guessed/placeholder URL - it stays disabled with a tooltip explaining why.
function VisitStoreButton({ channel }: { channel: "ZOMATO" | "SWIGGY" }) {
  return (
    <button
      type="button"
      className="visit-store-btn"
      disabled
      title={`No ${channel === "ZOMATO" ? "Zomato" : "Swiggy"} store URL is on file for this outlet yet`}
    >
      Visit Store
      <style jsx>{`
        .visit-store-btn {
          padding: 8px 16px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: var(--bg-subtle);
          color: var(--text-muted);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: not-allowed;
        }
      `}</style>
    </button>
  );
}
