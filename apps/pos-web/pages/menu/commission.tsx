// Set Menu Commission console. Real, server-paginated data against
// apps/api/src/routes/commission.ts:
//   GET /commission/items?page=&limit=&search=   -> { items, total, page, limit }
//   PUT /commission/items/:menuItemId             -> { menuItemId, commissionType, commissionValue }
//   GET /commission/addons?page=&limit=&search=   -> { items, total, page, limit }
//   PUT /commission/addons/:addonItemId            -> { addonItemId, commissionType, commissionValue }
//
// Both GET endpoints respond with the same row shape under an "items" key
// (menuItemId is present for the items tab, addonItemId for the addons tab)
// and both already carry categoryName (the item's real category for the
// Item tab, the modifier group name for the Addon tab), so one table
// renders both tabs. itemPrice is the item/addon's priceMinor (BigInt
// serialized as a string) -- divide by 100 to display, same convention as
// pages/menu.tsx's formatPriceMinor. commissionValue is a Decimal(10,2) --
// already a plain rupee/percent number, never minor units, so it is NOT
// divided by 100.
//
// Per the commission.ts header comment, ItemCommission/AddonCommission
// queries go through `(prisma as any)` and degrade to a 503
// SCHEMA_OUT_OF_SYNC via sendServerError if the migration/generated client
// is behind -- that response still carries a human `error` message, which
// the fetch error handling below surfaces directly in the error banner.
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";

type CommissionTab = "items" | "addons";
const COMMISSION_TYPES = ["PERCENTAGE", "FLAT"] as const;
const PAGE_SIZE = 50;

interface CommissionRow {
  menuItemId?: string;
  addonItemId?: string;
  itemName: string;
  categoryId: string;
  categoryName: string;
  itemPrice: string; // priceMinor, BigInt serialized as string
  commissionType: string | null;
  commissionValue: string | null; // Decimal(10,2) serialized as string
  configured: boolean;
}

function rowId(row: CommissionRow): string {
  return row.menuItemId ?? row.addonItemId ?? "";
}

function formatPriceMinor(priceMinor: string): string {
  const rupees = Number(BigInt(priceMinor || "0")) / 100;
  return `₹${rupees.toFixed(2)}`;
}

function formatCommissionValue(row: CommissionRow): string {
  if (!row.commissionType || row.commissionValue == null) return "Not Configured";
  const value = Number(row.commissionValue);
  return row.commissionType === "PERCENTAGE" ? `${value}%` : `₹${value.toFixed(2)}`;
}

export default function CommissionPage() {
  // GET /commission/items and /commission/addons both require "menu.read";
  // PUT requires "menu.item.manage" -- gate the page on the read
  // permission (same canWrite pattern as pages/crm.tsx) and only show the
  // Edit action when the caller also holds the write permission.
  const { me, loading: authLoading } = useAuthGuard("menu.read");
  const canWrite = me?.permissions.includes("menu.item.manage") ?? false;

  const [activeTab, setActiveTab] = useState<CommissionTab>("items");
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [editingRow, setEditingRow] = useState<CommissionRow | null>(null);
  const [editType, setEditType] = useState<string>("PERCENTAGE");
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const initials = me?.name
    ? me.name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase()
    : "?";

  const loadRows = (tab: CommissionTab, pageToLoad: number, searchValue: string) => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    params.set("page", String(pageToLoad));
    params.set("limit", String(PAGE_SIZE));
    if (searchValue.trim()) params.set("search", searchValue.trim());
    const endpoint = tab === "items" ? "/commission/items" : "/commission/addons";
    authedFetch(`${endpoint}?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = (await res.json()) as { items: CommissionRow[]; total: number; page: number; limit: number };
        setRows(Array.isArray(data.items) ? data.items : []);
        setTotal(data.total || 0);
        setPage(data.page || pageToLoad);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load commission data");
        setRows([]);
        setTotal(0);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!authLoading && me) loadRows(activeTab, 1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me, activeTab]);

  const switchTab = (tab: CommissionTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSearch("");
    setActionError(null);
    setActionNotice(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  const openEdit = (row: CommissionRow) => {
    setEditingRow(row);
    setEditType(row.commissionType ?? "PERCENTAGE");
    setEditValue(row.commissionValue ?? "");
    setEditError(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    const numericValue = Number(editValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setEditError("Commission value must be a non-negative number");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const id = rowId(editingRow);
    const endpoint = activeTab === "items" ? `/commission/items/${id}` : `/commission/addons/${id}`;
    authedFetch(endpoint, {
      method: "PUT",
      body: JSON.stringify({ commissionType: editType, commissionValue: numericValue }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        setEditingRow(null);
        setEditSaving(false);
        setActionNotice(`Commission saved for "${editingRow.itemName}".`);
        setActionError(null);
        loadRows(activeTab, page, search);
      })
      .catch((err) => {
        setEditError(err instanceof Error ? err.message : "Failed to save commission");
        setEditSaving(false);
      });
  };

  return (
    <div className="admin-app">
      <Head>
        <title>KapMeta POS - Set Menu Commission</title>
        <meta name="description" content="Configure per-item and per-addon commission rates." />
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
                    <span className="breadcrumb-line">Menu &gt; Set Menu Commission</span>
                    <h1 className="greeting-title">Set Menu Commission</h1>
                    <p className="greeting-subtitle">
                      Configure per-item and per-addon commission rates for aggregator/partner
                      payouts. Backed by GET/PUT /commission/items and /commission/addons.
                    </p>
                  </div>
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
                  <div className="tab-row">
                    <button
                      type="button"
                      className={`tab-btn ${activeTab === "items" ? "tab-btn-active" : ""}`}
                      onClick={() => switchTab("items")}
                    >
                      Item Commission
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${activeTab === "addons" ? "tab-btn-active" : ""}`}
                      onClick={() => switchTab("addons")}
                    >
                      Addon Item Commission
                    </button>
                  </div>

                  <div className="panel-header">
                    <div>
                      <h3>{activeTab === "items" ? "Menu Items" : "Addon Items"}</h3>
                      <p className="panel-sub">
                        From GET /commission/{activeTab === "items" ? "items" : "addons"}
                      </p>
                    </div>
                    <span className="total-badge">{total} records</span>
                  </div>

                  <form
                    className="lookup-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      loadRows(activeTab, 1, search);
                    }}
                  >
                    <input
                      type="text"
                      className="text-input"
                      placeholder={activeTab === "items" ? "Search item name" : "Search addon name"}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button type="submit" className="export-btn" disabled={loading}>
                      {loading ? "Searching..." : "Search"}
                    </button>
                  </form>

                  {loading && (
                    <div className="empty-state-card">
                      <span className="empty-icon">⏳</span>
                      <h3>Loading commission data...</h3>
                    </div>
                  )}

                  {!loading && loadError && (
                    <div className="not-available-box">
                      <p>{loadError}</p>
                    </div>
                  )}

                  {!loading && !loadError && rows.length === 0 && (
                    <div className="not-available-box">
                      <p>No {activeTab === "items" ? "items" : "addon items"} found.</p>
                    </div>
                  )}

                  {!loading && !loadError && rows.length > 0 && (
                    <>
                      <div className="directory-table-wrap">
                        <table className="dense-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Category</th>
                              <th className="col-num">Item Price</th>
                              <th>Commission Type</th>
                              <th className="col-num">Commission Value</th>
                              {canWrite && <th className="col-actions">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={rowId(row)}>
                                <td>{row.itemName}</td>
                                <td>{row.categoryName}</td>
                                <td className="col-num num-cell">{formatPriceMinor(row.itemPrice)}</td>
                                <td>
                                  {row.commissionType ? (
                                    <span
                                      className={`status-pill ${
                                        row.commissionType === "PERCENTAGE" ? "status-pill-blue" : "status-pill-purple"
                                      }`}
                                    >
                                      {row.commissionType}
                                    </span>
                                  ) : (
                                    <span className="status-pill status-pill-no">Not Configured</span>
                                  )}
                                </td>
                                <td className="col-num num-cell">{formatCommissionValue(row)}</td>
                                {canWrite && (
                                  <td className="col-actions">
                                    <button type="button" className="row-action-btn" onClick={() => openEdit(row)}>
                                      {row.configured ? "Edit" : "Set Commission"}
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
                          Showing {pageStart} to {pageEnd} of {total} records
                        </span>
                        <div className="directory-pagination-btns">
                          <button
                            type="button"
                            className="export-btn"
                            disabled={loading || page <= 1}
                            onClick={() => loadRows(activeTab, Math.max(1, page - 1), search)}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className="export-btn"
                            disabled={loading || page >= totalPages}
                            onClick={() => loadRows(activeTab, Math.min(totalPages, page + 1), search)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {editingRow && (
                  <div className="modal-overlay">
                    <div className="modal-content">
                      <div className="modal-header">
                        <h4>Set Commission — {editingRow.itemName}</h4>
                        <button className="close-modal-btn" onClick={() => setEditingRow(null)}>✕</button>
                      </div>
                      <form onSubmit={submitEdit} className="modal-form">
                        <div className="form-group">
                          <label>Commission Type *</label>
                          <div className="radio-row">
                            {COMMISSION_TYPES.map((t) => (
                              <label key={t} className="radio-option">
                                <input
                                  type="radio"
                                  name="commissionType"
                                  value={t}
                                  checked={editType === t}
                                  onChange={() => setEditType(t)}
                                />
                                {t === "PERCENTAGE" ? "Percentage" : "Flat Amount"}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Commission Value * {editType === "PERCENTAGE" ? "(%)" : "(₹)"}</label>
                          <input
                            type="number"
                            required
                            min={0}
                            step="0.01"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                          />
                        </div>
                        {editError && <p className="form-error">{editError}</p>}
                        <div className="modal-actions">
                          <button type="button" className="cancel-modal-btn" onClick={() => setEditingRow(null)}>Cancel</button>
                          <button type="submit" className="submit-modal-btn" disabled={editSaving}>
                            {editSaving ? "Saving..." : "Save Commission"}
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

        .tab-row {
          display: flex;
          gap: 4px;
          background: var(--bg-subtle);
          padding: 4px;
          border-radius: var(--radius-pill);
          width: fit-content;
        }
        .tab-btn {
          border: none;
          background: transparent;
          padding: 8px 18px;
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .tab-btn-active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
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
        .dense-table .col-num { text-align: right; }
        .dense-table .num-cell { font-variant-numeric: tabular-nums; }
        .dense-table .col-actions { text-align: right; white-space: nowrap; }

        .status-pill {
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.75rem;
          font-weight: 700;
          display: inline-block;
        }
        .status-pill-blue { background: var(--blue-subtle); color: var(--blue-text); }
        .status-pill-purple { background: var(--purple-subtle); color: var(--purple-text); }
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
        }
        .row-action-btn:hover { background: var(--bg-subtle); }

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
        .radio-row { display: flex; gap: 16px; }
        .radio-option {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.8125rem; font-weight: 600; color: var(--text-primary);
          text-transform: none;
          cursor: pointer;
        }
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
