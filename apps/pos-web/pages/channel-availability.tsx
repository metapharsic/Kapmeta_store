import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../lib/auth";
import Nav from "../components/Nav";

// Per-aggregator-channel item availability ("Online Item Status"). Distinct
// from /inventory's outlet-wide 86-list toggle: that page controls whether
// an item is sellable at the outlet at all; this page controls whether an
// already-sellable item is turned ON/OFF on each connected aggregator
// channel (Swiggy, Zomato, ...), backed by ChannelItemMapping.isAvailable.
// Channel tabs are derived from the outlet's real ChannelItemMapping rows
// (via GET /integration/channel-items) — never a hardcoded channel list.

type OverallStatus = "ALL_ON" | "ALL_OFF" | "PARTIAL";

interface ChannelRow {
  mappingId: string;
  channelAccountId: string;
  channel: string;
  menuItemId: string;
  isAvailable: boolean;
  version: number;
}

interface ChannelItemStatusRow {
  menuItemId: string;
  name: string;
  onlineDisplayName: string | null;
  categoryName: string;
  overallStatus: OverallStatus;
  channels: ChannelRow[];
}

type StatusFilter = "ALL" | "ON" | "OFF" | "PARTIAL";

function statusBadge(status: OverallStatus): { label: string; className: string } {
  if (status === "ALL_ON") return { label: "ON", className: "on" };
  if (status === "ALL_OFF") return { label: "OFF", className: "off" };
  return { label: "PARTIAL", className: "partial" };
}

export default function ChannelAvailabilityPage() {
  const { me, loading: authLoading } = useAuthGuard("integration.manage");
  const [items, setItems] = useState<ChannelItemStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchItems = () => {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    authedFetch(`/integration/channel-items`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((data: ChannelItemStatusRow[]) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setLoadError(err instanceof Error ? err.message : "Failed to load channel availability");
        setItems([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading) return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Real channel tabs, derived from the outlet's actual ChannelItemMapping
  // rows rather than a hardcoded ["Swiggy","Zomato"] list.
  const channelTabs = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const ch of item.channels) set.add(ch.channel);
    }
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.categoryName).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [items]);

  const rowsForActiveChannel = useMemo(() => {
    if (activeChannel === "All") {
      return items.map((item) => ({ item, status: item.overallStatus, channels: item.channels }));
    }
    return items
      .filter((item) => item.channels.some((c) => c.channel === activeChannel))
      .map((item) => {
        const channels = item.channels.filter((c) => c.channel === activeChannel);
        const status: OverallStatus = channels.every((c) => c.isAvailable)
          ? "ALL_ON"
          : channels.every((c) => !c.isAvailable)
          ? "ALL_OFF"
          : "PARTIAL";
        return { item, status, channels };
      });
  }, [items, activeChannel]);

  const filteredRows = useMemo(() => {
    return rowsForActiveChannel.filter(({ item, status }) => {
      const displayName = item.onlineDisplayName || item.name;
      const matchesSearch =
        displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || item.categoryName === selectedCategory;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ON" && status === "ALL_ON") ||
        (statusFilter === "OFF" && status === "ALL_OFF") ||
        (statusFilter === "PARTIAL" && status === "PARTIAL");
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [rowsForActiveChannel, searchQuery, selectedCategory, statusFilter]);

  const stats = useMemo(() => {
    const total = rowsForActiveChannel.length;
    const on = rowsForActiveChannel.filter((r) => r.status === "ALL_ON").length;
    const off = rowsForActiveChannel.filter((r) => r.status === "ALL_OFF").length;
    const partial = rowsForActiveChannel.filter((r) => r.status === "PARTIAL").length;
    return { total, on, off, partial };
  }, [rowsForActiveChannel]);

  const toggleMapping = async (mappingId: string, nextAvailable: boolean, expectedVersion: number) => {
    try {
      const res = await authedFetch(`/integration/channel-items/${mappingId}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: nextAvailable, expectedVersion }),
      });
      if (res.status === 409 || res.status === 404) {
        fetchItems();
        return;
      }
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const result: { newVersion: number } = await res.json();
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          channels: item.channels.map((c) =>
            c.mappingId === mappingId ? { ...c, isAvailable: nextAvailable, version: result.newVersion } : c
          ),
        })).map((item) => ({
          ...item,
          overallStatus:
            item.channels.length === 0
              ? "ALL_OFF"
              : item.channels.every((c) => c.isAvailable)
              ? "ALL_ON"
              : item.channels.every((c) => !c.isAvailable)
              ? "ALL_OFF"
              : "PARTIAL",
        }))
      );
    } catch {
      fetchItems();
    }
  };

  const toggleSelected = (menuItemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuItemId)) next.delete(menuItemId);
      else next.add(menuItemId);
      return next;
    });
  };

  const bulkSetAvailability = async (nextAvailable: boolean) => {
    setBulkBusy(true);
    const targets = filteredRows.filter((r) => selectedIds.has(r.item.menuItemId));
    for (const { channels } of targets) {
      for (const ch of channels) {
        if (ch.isAvailable !== nextAvailable) {
          // eslint-disable-next-line no-await-in-loop
          await toggleMapping(ch.mappingId, nextAvailable, ch.version);
        }
      }
    }
    setSelectedIds(new Set());
    setBulkBusy(false);
  };

  return (
    <div className="channel-app">
      <Head>
        <title>KapMeta POS — Online Item Status</title>
        <meta name="description" content="Per-channel (Swiggy/Zomato) item availability sync console." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Nav variant="sidebar" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-badge">
            <span className="brand-icon">📡</span>
            <span className="brand-name">KapMeta POS</span>
          </div>
          <div className="outlet-pill">
            <span className="outlet-dot"></span>
            <span>Online Item Status</span>
          </div>
        </div>
        <div className="topbar-right">
          <div className="user-profile-badge">
            <div className="avatar-circle">{me?.name ? me.name.charAt(0).toUpperCase() : "?"}</div>
            <span className="user-name">{me?.name ?? "Loading..."}</span>
          </div>
        </div>
      </header>

      <main className="channel-content">
        {authLoading && (
          <div className="empty-state">
            <span className="empty-icon">🔐</span>
            <h3>Checking access...</h3>
          </div>
        )}

        {!authLoading && (
          <>
            <section className="channel-tabs">
              {channelTabs.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={`tab-btn ${activeChannel === ch ? "active" : ""}`}
                  onClick={() => setActiveChannel(ch)}
                >
                  {ch}
                </button>
              ))}
              {channelTabs.length === 1 && !loading && !loadError && (
                <span className="no-channels-hint">No connected channels found for this outlet yet.</span>
              )}
            </section>

            <section className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon-square blue">📋</div>
                <div className="kpi-info">
                  <span className="kpi-label">TOTAL ITEMS</span>
                  <h3 className="kpi-value">{stats.total}</h3>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon-square green">✓</div>
                <div className="kpi-info">
                  <span className="kpi-label">ON</span>
                  <h3 className="kpi-value">{stats.on}</h3>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon-square purple">✕</div>
                <div className="kpi-info">
                  <span className="kpi-label">OFF</span>
                  <h3 className="kpi-value">{stats.off}</h3>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon-square amber">◐</div>
                <div className="kpi-info">
                  <span className="kpi-label">PARTIAL</span>
                  <h3 className="kpi-value">{stats.partial}</h3>
                </div>
              </div>
            </section>

            <section className="toolbar">
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search items or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-field"
                />
              </div>

              <select className="cat-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? "All Categories" : c}
                  </option>
                ))}
              </select>

              <div className="status-pill-group">
                {(["ALL", "ON", "OFF", "PARTIAL"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`status-pill ${statusFilter === s ? "active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {selectedIds.size > 0 && (
                <div className="bulk-actions">
                  <span className="bulk-count">{selectedIds.size} selected</span>
                  <button type="button" className="bulk-btn on" disabled={bulkBusy} onClick={() => bulkSetAvailability(true)}>
                    Turn ON
                  </button>
                  <button type="button" className="bulk-btn off" disabled={bulkBusy} onClick={() => bulkSetAvailability(false)}>
                    Turn OFF
                  </button>
                </div>
              )}
            </section>

            <section className="items-table-wrap">
              {loading && (
                <div className="empty-state">
                  <span className="empty-icon">⏳</span>
                  <h3>Loading channel status...</h3>
                </div>
              )}

              {!loading && loadError && (
                <div className="empty-state">
                  <span className="empty-icon">⚠️</span>
                  <h3>Could not load channel status</h3>
                  <p>{loadError}. Check that the API is running and you are signed in.</p>
                </div>
              )}

              {!loading && !loadError && items.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📡</span>
                  <h3>No channel-mapped items yet</h3>
                  <p>Connect a channel account and create item mappings to see them here.</p>
                </div>
              )}

              {!loading && !loadError && items.length > 0 && (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th className="select-col"></th>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Per-channel toggle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ item, status, channels }) => {
                      const badge = statusBadge(status);
                      return (
                        <tr key={item.menuItemId}>
                          <td className="select-col">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.menuItemId)}
                              onChange={() => toggleSelected(item.menuItemId)}
                            />
                          </td>
                          <td>
                            <div className="item-name">{item.onlineDisplayName || item.name}</div>
                            {item.onlineDisplayName && <div className="item-name-orig">Menu name: {item.name}</div>}
                          </td>
                          <td className="item-category">{item.categoryName}</td>
                          <td>
                            <span className={`status-badge ${badge.className}`}>{badge.label}</span>
                          </td>
                          <td>
                            <div className="channel-toggles">
                              {channels.map((c) => (
                                <button
                                  key={c.mappingId}
                                  type="button"
                                  className={`channel-toggle ${c.isAvailable ? "on" : "off"}`}
                                  onClick={() => toggleMapping(c.mappingId, !c.isAvailable, c.version)}
                                  title={`${c.channel}: click to ${c.isAvailable ? "turn off" : "turn on"}`}
                                >
                                  {c.channel}: {c.isAvailable ? "ON" : "OFF"}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {!loading && !loadError && items.length > 0 && filteredRows.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📡</span>
                  <h3>No items match the current filter</h3>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <style jsx>{`
        .channel-app {
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
          background: #eff6ff;
          color: #1e40af;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
        }
        .outlet-dot {
          width: 6px;
          height: 6px;
          background: #3b82f6;
          border-radius: 50%;
        }
        .topbar-right {
          display: flex;
          align-items: center;
        }
        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .avatar-circle {
          width: 32px;
          height: 32px;
          background: #eff6ff;
          color: #1e40af;
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
          color: #0f172a;
        }
        .channel-content {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .channel-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tab-btn {
          padding: 8px 18px;
          border-radius: 9999px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
        }
        .tab-btn.active {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .no-channels-hint {
          font-size: 12px;
          color: #94a3b8;
          margin-left: 8px;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .kpi-icon-square {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .kpi-icon-square.green {
          background: #ecfdf5;
          color: #10b981;
        }
        .kpi-icon-square.blue {
          background: #eff6ff;
          color: #3b82f6;
        }
        .kpi-icon-square.amber {
          background: #fffbeb;
          color: #f59e0b;
        }
        .kpi-icon-square.purple {
          background: #fef2f2;
          color: #ef4444;
        }
        .kpi-label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.5px;
        }
        .kpi-value {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 2px 0 0 0;
        }
        .toolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          background: #ffffff;
          padding: 12px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 12px;
          flex: 1;
          min-width: 200px;
          max-width: 400px;
        }
        .search-field {
          border: none;
          background: transparent;
          outline: none;
          font-size: 13px;
          width: 100%;
          color: #0f172a;
        }
        .cat-select {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }
        .status-pill-group {
          display: flex;
          gap: 6px;
        }
        .status-pill {
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
        }
        .status-pill.active {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .bulk-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }
        .bulk-count {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
        }
        .bulk-btn {
          padding: 7px 14px;
          border-radius: 8px;
          border: none;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .bulk-btn.on {
          background: #ecfdf5;
          color: #065f46;
        }
        .bulk-btn.off {
          background: #fef2f2;
          color: #991b1b;
        }
        .bulk-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .items-table-wrap {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          overflow-x: auto;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .items-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          vertical-align: middle;
        }
        .select-col {
          width: 36px;
        }
        .item-name {
          font-weight: 700;
          color: #0f172a;
        }
        .item-name-orig {
          font-size: 11px;
          color: #94a3b8;
          margin-top: 2px;
        }
        .item-category {
          color: #64748b;
        }
        .status-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
        }
        .status-badge.on {
          background: #ecfdf5;
          color: #065f46;
        }
        .status-badge.off {
          background: #fef2f2;
          color: #991b1b;
        }
        .status-badge.partial {
          background: #fffbeb;
          color: #92400e;
        }
        .channel-toggles {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .channel-toggle {
          padding: 5px 10px;
          border-radius: 6px;
          border: none;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .channel-toggle.on {
          background: #ecfdf5;
          color: #065f46;
        }
        .channel-toggle.off {
          background: #fef2f2;
          color: #991b1b;
        }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
        }
        .empty-icon {
          font-size: 40px;
          display: block;
          margin-bottom: 12px;
        }
      `}</style>
      </div>
      </div>
    </div>
  );
}
