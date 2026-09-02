// Purchase Order List — apps/pos-web/pages/inventory/purchase-orders.tsx
//
// Backed entirely by the EXISTING, already-wired raw-SQL/Prisma CRUD in
// apps/api/src/routes/inventory.ts (the same endpoints pages/inventory.tsx's
// PROCUREMENT tab already calls):
//   GET    /inventory/purchase-orders            -> full outlet PO list (no
//                                                    query params supported
//                                                    server-side — every
//                                                    filter below is applied
//                                                    client-side against the
//                                                    fetched array)
//   POST   /inventory/purchase-orders             body { vendorId, items:
//                                                    [{ ingredientId,
//                                                    quantity, unitPrice }] }
//   POST   /inventory/purchase-orders/:id/receive  body { items?: [{
//                                                    ingredientId, quantity
//                                                    }] } — omit items (or
//                                                    send {}) to auto-receive
//                                                    the full remaining
//                                                    quantity of every line
//   POST   /inventory/purchase-orders/:id/cancel   only legal from DRAFT
//   GET    /inventory/vendors, GET /inventory/ingredients (pickers)
//
// There is a second, separate purchase-order implementation at
// apps/api/src/routes/purchase.ts / services/purchase (state-machine
// guarded, POST-only creation, /goods-received-notes, PATCH
// /purchase-orders/:id/status — no confirmed list/GET). This screen
// deliberately does NOT call it, to avoid a third parallel PO
// implementation; that duplication is pre-existing technical debt for a
// future consolidation decision, not something fixed here.
//
// Real status values (from the schema/route, not assumed): DRAFT (default
// on create) -> PARTIALLY_RECEIVED | RECEIVED (set by /receive depending on
// whether every line was fully covered) or CANCELLED (set by /cancel, only
// legal while still DRAFT). There is no APPROVED/SENT/PENDING_APPROVAL
// status anywhere in this route or its Prisma writes, and PATCH
// /purchase-orders/:id only edits vendor/items on a DRAFT order — it does
// not accept or drive a status transition. So there is no real
// "Approve" transition to wire up here; that row action is intentionally
// omitted rather than calling something that doesn't exist. Row actions:
//   Receive Goods -> shown for DRAFT and PARTIALLY_RECEIVED (not yet fully
//                     received, not cancelled)
//   Cancel        -> shown only for DRAFT (the route 400s anything else)
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import InventorySidebar from "../../components/inventory/InventorySidebar";

type PoStatus = "DRAFT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

interface PoLineItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  items: PoLineItem[];
  totalAmount: number;
  status: PoStatus;
  createdAt: string;
}

interface Vendor {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  paymentTerms: string | null;
}

interface Ingredient {
  id: string;
  name: string;
  unitOfMeasure: string;
  unitCost: number;
  currentStock: number;
}

interface CreateLine {
  key: number;
  ingredientId: string;
  quantity: string;
  unitPrice: string;
}

const STATUS_OPTIONS: PoStatus[] = ["DRAFT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

function statusPillClass(status: PoStatus): string {
  switch (status) {
    case "DRAFT":
      return "status-pill status-pill-warning";
    case "PARTIALLY_RECEIVED":
      return "status-pill status-pill-blue";
    case "RECEIVED":
      return "status-pill status-pill-green";
    case "CANCELLED":
      return "status-pill status-pill-red";
    default:
      return "status-pill";
  }
}

function statusLabel(status: PoStatus): string {
  return status === "PARTIALLY_RECEIVED" ? "Partially Received" : status.charAt(0) + status.slice(1).toLowerCase();
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

let lineKeySeq = 1;
function newLine(): CreateLine {
  return { key: lineKeySeq++, ingredientId: "", quantity: "", unitPrice: "" };
}

export default function PurchaseOrdersPage() {
  const { me, loading: authLoading } = useAuthGuard("inventory.read");
  const canWrite = me?.permissions?.includes("inventory.write") ?? false;

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters — applied client-side; GET /inventory/purchase-orders takes no
  // query params, so there is nothing to send to the server here.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [poNumberFilter, setPoNumberFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: "",
    endDate: "",
    vendorId: "",
    poNumber: "",
    status: "",
  });

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Create PO modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createVendorId, setCreateVendorId] = useState("");
  const [createLines, setCreateLines] = useState<CreateLine[]>([newLine()]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Receive Goods modal
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiveFull, setReceiveFull] = useState(true);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      authedFetch("/inventory/purchase-orders"),
      authedFetch("/inventory/vendors"),
      authedFetch("/inventory/ingredients"),
    ])
      .then(async ([poRes, vendorRes, ingredientRes]) => {
        if (!poRes.ok) {
          const body = await poRes.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load purchase orders (HTTP ${poRes.status})`);
        }
        if (!vendorRes.ok) {
          const body = await vendorRes.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load vendors (HTTP ${vendorRes.status})`);
        }
        if (!ingredientRes.ok) {
          const body = await ingredientRes.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load ingredients (HTTP ${ingredientRes.status})`);
        }
        const [poData, vendorData, ingredientData] = await Promise.all([poRes.json(), vendorRes.json(), ingredientRes.json()]);
        setPos(Array.isArray(poData) ? poData : []);
        setVendors(Array.isArray(vendorData) ? vendorData : []);
        setIngredients(Array.isArray(ingredientData) ? ingredientData : []);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load purchase order data");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!authLoading && me) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me]);

  const applyFilters = () => {
    setAppliedFilters({
      startDate,
      endDate,
      vendorId: vendorFilter,
      poNumber: poNumberFilter.trim().toLowerCase(),
      status: statusFilter,
    });
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setVendorFilter("");
    setPoNumberFilter("");
    setStatusFilter("");
    setAppliedFilters({ startDate: "", endDate: "", vendorId: "", poNumber: "", status: "" });
  };

  const filteredRows = useMemo(() => {
    return pos.filter((po) => {
      if (appliedFilters.vendorId && po.vendorId !== appliedFilters.vendorId) return false;
      if (appliedFilters.status && po.status !== appliedFilters.status) return false;
      if (appliedFilters.poNumber && !po.poNumber.toLowerCase().includes(appliedFilters.poNumber)) return false;
      if (appliedFilters.startDate) {
        const start = new Date(appliedFilters.startDate + "T00:00:00");
        if (new Date(po.createdAt) < start) return false;
      }
      if (appliedFilters.endDate) {
        const end = new Date(appliedFilters.endDate + "T23:59:59");
        if (new Date(po.createdAt) > end) return false;
      }
      return true;
    });
  }, [pos, appliedFilters]);

  const filtersActive =
    appliedFilters.startDate || appliedFilters.endDate || appliedFilters.vendorId || appliedFilters.poNumber || appliedFilters.status;

  const handleExportCsv = () => {
    setExportMenuOpen(false);
    const header = ["PO Number", "Date", "Vendor", "Total Amount", "Status"];
    const lines = filteredRows.map((po) =>
      [po.poNumber, formatDate(po.createdAt), po.vendorName, po.totalAmount.toFixed(2), statusLabel(po.status)]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ---- Create PO ----

  const openCreate = () => {
    setCreateVendorId("");
    setCreateLines([newLine()]);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const updateLine = (key: number, patch: Partial<CreateLine>) => {
    setCreateLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const onPickIngredient = (key: number, ingredientId: string) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    updateLine(key, { ingredientId, unitPrice: ing ? String(ing.unitCost) : "" });
  };

  const addLine = () => setCreateLines((prev) => [...prev, newLine()]);
  const removeLine = (key: number) => setCreateLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const createLineTotal = (l: CreateLine): number => {
    const q = Number(l.quantity);
    const p = Number(l.unitPrice);
    return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
  };

  const createGrandTotal = useMemo(() => createLines.reduce((sum, l) => sum + createLineTotal(l), 0), [createLines]);

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createVendorId) {
      setCreateError("Select a supplier.");
      return;
    }
    const items: { ingredientId: string; quantity: number; unitPrice: number }[] = [];
    for (const l of createLines) {
      if (!l.ingredientId) continue;
      const quantity = Number(l.quantity);
      const unitPrice = Number(l.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setCreateError("Every line item needs a quantity greater than 0.");
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setCreateError("Every line item needs a valid unit cost.");
        return;
      }
      items.push({ ingredientId: l.ingredientId, quantity, unitPrice });
    }
    if (items.length === 0) {
      setCreateError("Add at least one line item.");
      return;
    }

    setCreating(true);
    authedFetch("/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify({ vendorId: createVendorId, items }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        setIsCreateOpen(false);
        setActionError(null);
        setActionNotice(`Purchase order ${data.poNumber ?? ""} created.`);
        loadAll();
      })
      .catch((err) => {
        setCreateError(err instanceof Error ? err.message : "Failed to create purchase order");
      })
      .finally(() => setCreating(false));
  };

  // ---- Receive Goods ----

  const openReceive = (po: PurchaseOrder) => {
    setReceivingPo(po);
    setReceiveFull(true);
    const initial: Record<string, string> = {};
    po.items.forEach((it) => {
      initial[it.ingredientId] = "";
    });
    setReceiveQuantities(initial);
    setReceiveError(null);
  };

  const submitReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;
    setReceiveError(null);

    let body: any = {};
    if (!receiveFull) {
      const items = Object.entries(receiveQuantities)
        .map(([ingredientId, qty]) => ({ ingredientId, quantity: Number(qty) }))
        .filter((it) => Number.isFinite(it.quantity) && it.quantity > 0);
      if (items.length === 0) {
        setReceiveError("Enter a quantity greater than 0 for at least one item, or switch to \"Receive full remaining quantity\".");
        return;
      }
      body = { items };
    }

    setReceiving(true);
    authedFetch(`/inventory/purchase-orders/${receivingPo.id}/receive`, {
      method: "POST",
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        setReceivingPo(null);
        setActionError(null);
        setActionNotice(data.message || `Goods received for ${receivingPo.poNumber}.`);
        loadAll();
      })
      .catch((err) => {
        setReceiveError(err instanceof Error ? err.message : "Failed to receive goods");
      })
      .finally(() => setReceiving(false));
  };

  // ---- Cancel ----

  const handleCancel = (po: PurchaseOrder) => {
    setCancelingId(po.id);
    authedFetch(`/inventory/purchase-orders/${po.id}/cancel`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP error ${res.status}`);
        }
        setConfirmCancelId(null);
        setActionError(null);
        setActionNotice(`${po.poNumber} cancelled.`);
        loadAll();
      })
      .catch((err) => {
        setActionError(err instanceof Error ? err.message : "Failed to cancel purchase order");
      })
      .finally(() => setCancelingId(null));
  };

  const canReceive = (status: PoStatus) => status === "DRAFT" || status === "PARTIALLY_RECEIVED";
  const canCancel = (status: PoStatus) => status === "DRAFT";

  return (
    <div className="admin-app">
      <Head>
        <title>KapMeta POS - Purchase Order List</title>
        <meta name="description" content="Create, filter, receive and cancel purchase orders." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <InventorySidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-badge">
                <span className="brand-icon">📦</span>
                <span className="brand-name">Purchase Order List</span>
              </div>
            </div>
            <div className="topbar-right">
              <div className="user-profile-badge">
                <div className="avatar-circle">
                  {(me?.name ?? "?")
                    .split(" ")
                    .map((p) => p.charAt(0))
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
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
                    <span className="breadcrumb-line">Inventory &gt; Purchase &gt; Purchase Order</span>
                    <h1 className="greeting-title">Purchase Order List</h1>
                    <p className="greeting-subtitle">
                      Create and track purchase orders against GET/POST /inventory/purchase-orders.
                    </p>
                  </div>
                  <div className="header-actions">
                    <div className="export-wrap">
                      <button type="button" className="btn-outline" onClick={() => setExportMenuOpen((v) => !v)}>
                        Export ▾
                      </button>
                      {exportMenuOpen && (
                        <div className="export-menu">
                          <button type="button" onClick={handleExportCsv}>
                            Download CSV ({filteredRows.length} rows)
                          </button>
                        </div>
                      )}
                    </div>
                    {canWrite && (
                      <button type="button" className="export-btn" onClick={openCreate}>
                        + Create PO
                      </button>
                    )}
                  </div>
                </section>

                {actionError && (
                  <div className="empty-state-card error-card notice-card">
                    <span className="empty-icon">⚠️</span>
                    <p>{actionError}</p>
                  </div>
                )}
                {actionNotice && (
                  <div className="empty-state-card notice-card">
                    <span className="empty-icon">ℹ️</span>
                    <p>{actionNotice}</p>
                  </div>
                )}

                <section className="panel-card">
                  <form
                    className="filter-bar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyFilters();
                    }}
                  >
                    <div className="filter-field">
                      <label>Start Date</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="filter-field">
                      <label>End Date</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="filter-field">
                      <label>Supplier</label>
                      <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
                        <option value="">All Suppliers</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-field">
                      <label>PO Number</label>
                      <input
                        type="text"
                        placeholder="e.g. PO-000012"
                        value={poNumberFilter}
                        onChange={(e) => setPoNumberFilter(e.target.value)}
                      />
                    </div>
                    <div className="filter-field filter-more-toggle">
                      <label>&nbsp;</label>
                      <button type="button" className="btn-outline" onClick={() => setShowMoreFilters((v) => !v)}>
                        {showMoreFilters ? "Fewer Filters" : "More Filters"}
                      </button>
                    </div>
                    {showMoreFilters && (
                      <div className="filter-field">
                        <label>Status</label>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                          <option value="">All Statuses</option>
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="filter-field filter-buttons">
                      <label>&nbsp;</label>
                      <div className="filter-buttons-row">
                        <button type="submit" className="export-btn">
                          Search
                        </button>
                        <button type="button" className="btn-outline" onClick={clearFilters}>
                          Clear
                        </button>
                      </div>
                    </div>
                  </form>
                </section>

                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading purchase orders...</h3>
                  </div>
                )}

                {!loading && loadError && (
                  <div className="empty-state-card error-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load purchase orders</h3>
                    <p>{loadError}</p>
                  </div>
                )}

                {!loading && !loadError && filteredRows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">📭</span>
                    <h3>No Purchase Order Found</h3>
                    {filtersActive ? <p>No purchase orders match the current filters.</p> : <p>Create your first purchase order to get started.</p>}
                  </div>
                )}

                {!loading && !loadError && filteredRows.length > 0 && (
                  <section className="panel-card table-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Purchase Orders</h3>
                        <p className="panel-sub">From GET /inventory/purchase-orders</p>
                      </div>
                      <span className="total-badge">{filteredRows.length} of {pos.length} records</span>
                    </div>
                    <div className="directory-table-wrap">
                      <table className="dense-table">
                        <thead>
                          <tr>
                            <th></th>
                            <th>PO Number</th>
                            <th>Date</th>
                            <th>Vendor</th>
                            <th className="col-num">Total Amount</th>
                            <th>Status</th>
                            <th className="col-actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.map((po) => (
                            <React.Fragment key={po.id}>
                              <tr>
                                <td className="col-expand">
                                  <button
                                    type="button"
                                    className="expand-btn"
                                    onClick={() => setExpandedId((cur) => (cur === po.id ? null : po.id))}
                                    aria-label="Toggle line items"
                                  >
                                    {expandedId === po.id ? "▾" : "▸"}
                                  </button>
                                </td>
                                <td>{po.poNumber}</td>
                                <td>{formatDate(po.createdAt)}</td>
                                <td>{po.vendorName}</td>
                                <td className="col-num num-cell">{formatCurrency(po.totalAmount)}</td>
                                <td>
                                  <span className={statusPillClass(po.status)}>{statusLabel(po.status)}</span>
                                </td>
                                <td className="col-actions">
                                  {canWrite ? (
                                    <div className="row-actions">
                                      {canReceive(po.status) && (
                                        <button type="button" className="row-action-btn" onClick={() => openReceive(po)}>
                                          Receive Goods
                                        </button>
                                      )}
                                      {canCancel(po.status) &&
                                        (confirmCancelId === po.id ? (
                                          <span className="confirm-row">
                                            <span className="confirm-text">Cancel PO?</span>
                                            <button
                                              type="button"
                                              className="row-action-btn danger"
                                              disabled={cancelingId === po.id}
                                              onClick={() => handleCancel(po)}
                                            >
                                              {cancelingId === po.id ? "Cancelling..." : "Yes"}
                                            </button>
                                            <button type="button" className="row-action-btn" onClick={() => setConfirmCancelId(null)}>
                                              No
                                            </button>
                                          </span>
                                        ) : (
                                          <button type="button" className="row-action-btn danger" onClick={() => setConfirmCancelId(po.id)}>
                                            Cancel
                                          </button>
                                        ))}
                                      {!canReceive(po.status) && !canCancel(po.status) && <span className="no-actions">—</span>}
                                    </div>
                                  ) : (
                                    <span className="no-actions">—</span>
                                  )}
                                </td>
                              </tr>
                              {expandedId === po.id && (
                                <tr className="expand-row">
                                  <td colSpan={7}>
                                    <table className="line-items-table">
                                      <thead>
                                        <tr>
                                          <th>Ingredient</th>
                                          <th className="col-num">Quantity</th>
                                          <th className="col-num">Unit Cost</th>
                                          <th className="col-num">Line Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {po.items.map((it) => (
                                          <tr key={it.ingredientId}>
                                            <td>{it.ingredientName}</td>
                                            <td className="col-num num-cell">{it.quantity}</td>
                                            <td className="col-num num-cell">{formatCurrency(it.unitPrice)}</td>
                                            <td className="col-num num-cell">{formatCurrency(it.total)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>

          {/* ---- Create PO Modal ---- */}
          {isCreateOpen && (
            <div className="modal-overlay">
              <div className="modal-content wide">
                <div className="modal-header">
                  <h4>Create Purchase Order</h4>
                  <button className="close-modal-btn" onClick={() => setIsCreateOpen(false)}>✕</button>
                </div>
                <form onSubmit={submitCreate} className="modal-form">
                  <div className="form-group">
                    <label>Supplier *</label>
                    <select value={createVendorId} onChange={(e) => setCreateVendorId(e.target.value)} required>
                      <option value="">Select a supplier</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="line-items-editor">
                    <div className="line-items-header-row">
                      <label>Line Items *</label>
                      <button type="button" className="btn-outline small" onClick={addLine}>
                        + Add Line
                      </button>
                    </div>
                    <div className="line-items-scroll">
                      <table className="line-edit-table">
                        <thead>
                          <tr>
                            <th>Ingredient</th>
                            <th className="col-num">Quantity</th>
                            <th className="col-num">Unit Cost</th>
                            <th className="col-num">Line Total</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {createLines.map((l) => (
                            <tr key={l.key}>
                              <td>
                                <select value={l.ingredientId} onChange={(e) => onPickIngredient(l.key, e.target.value)}>
                                  <option value="">Select ingredient</option>
                                  {ingredients.map((ing) => (
                                    <option key={ing.id} value={ing.id}>
                                      {ing.name} ({ing.unitOfMeasure})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="col-num">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="cell-input"
                                  value={l.quantity}
                                  onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                                />
                              </td>
                              <td className="col-num">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="cell-input"
                                  value={l.unitPrice}
                                  onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                                />
                              </td>
                              <td className="col-num num-cell">{formatCurrency(createLineTotal(l))}</td>
                              <td>
                                <button
                                  type="button"
                                  className="line-remove-btn"
                                  disabled={createLines.length <= 1}
                                  onClick={() => removeLine(l.key)}
                                  aria-label="Remove line"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grand-total-row">
                      <span>Total</span>
                      <span className="grand-total-value">{formatCurrency(createGrandTotal)}</span>
                    </div>
                  </div>

                  {createError && <p className="form-error">{createError}</p>}
                  <div className="modal-actions">
                    <button type="button" className="cancel-modal-btn" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="submit-modal-btn" disabled={creating}>
                      {creating ? "Creating..." : "Create Purchase Order"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ---- Receive Goods Modal ---- */}
          {receivingPo && (
            <div className="modal-overlay">
              <div className="modal-content wide">
                <div className="modal-header">
                  <h4>Receive Goods — {receivingPo.poNumber}</h4>
                  <button className="close-modal-btn" onClick={() => setReceivingPo(null)}>✕</button>
                </div>
                <form onSubmit={submitReceive} className="modal-form">
                  <div className="radio-row receive-mode-row">
                    <label className="radio-option">
                      <input type="radio" checked={receiveFull} onChange={() => setReceiveFull(true)} />
                      Receive full remaining quantity for all items
                    </label>
                    <label className="radio-option">
                      <input type="radio" checked={!receiveFull} onChange={() => setReceiveFull(false)} />
                      Enter quantities manually
                    </label>
                  </div>
                  <p className="modal-note">
                    This screen does not track how much of each line has already been received. Choosing "full
                    remaining quantity" lets the server apply whatever is still outstanding per item; entering
                    quantities manually records exactly what you type as received just now.
                  </p>

                  <div className="line-items-scroll">
                    <table className="line-edit-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th className="col-num">Ordered Qty</th>
                          {!receiveFull && <th className="col-num">Receive Now</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {receivingPo.items.map((it) => (
                          <tr key={it.ingredientId}>
                            <td>{it.ingredientName}</td>
                            <td className="col-num num-cell">{it.quantity}</td>
                            {!receiveFull && (
                              <td className="col-num">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="cell-input"
                                  value={receiveQuantities[it.ingredientId] ?? ""}
                                  onChange={(e) =>
                                    setReceiveQuantities((prev) => ({ ...prev, [it.ingredientId]: e.target.value }))
                                  }
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {receiveError && <p className="form-error">{receiveError}</p>}
                  <div className="modal-actions">
                    <button type="button" className="cancel-modal-btn" onClick={() => setReceivingPo(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="submit-modal-btn" disabled={receiving}>
                      {receiving ? "Receiving..." : "Confirm Receipt"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <style dangerouslySetInnerHTML={{ __html: `
        .admin-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100%;
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
          padding: 24px 32px 48px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }

        .dashboard-greeting-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 8px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .breadcrumb-line {
          font-size: 0.75rem; color: var(--text-muted); font-weight: 600;
          letter-spacing: 0.5px; text-transform: uppercase;
        }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); max-width: 640px; }

        .header-actions { display: flex; align-items: center; gap: 10px; }
        .export-wrap { position: relative; }
        .export-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-pop);
          z-index: 30;
          min-width: 220px;
          overflow: hidden;
        }
        .export-menu button {
          display: block; width: 100%; text-align: left; padding: 10px 14px;
          border: none; background: transparent; font-size: 0.8125rem; font-weight: 600;
          color: var(--text-primary); cursor: pointer;
        }
        .export-menu button:hover { background: var(--bg-subtle); }

        .btn-outline {
          padding: 8px 16px;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
        }
        .btn-outline:hover { background: var(--bg-subtle); }
        .btn-outline.small { padding: 6px 12px; min-height: 30px; font-size: 0.75rem; }

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
        .export-btn:hover { background: var(--dark-btn-hover); }
        .export-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .empty-state-card.notice-card { padding: 16px 20px; text-align: left; display: flex; align-items: center; gap: 10px; border-style: solid; }
        .empty-state-card.error-card { border-color: var(--destructive); }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }
        .empty-icon { font-size: 32px; display: block; margin-bottom: 8px; }
        .notice-card .empty-icon { margin-bottom: 0; font-size: 20px; }

        .panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .panel-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; }
        .panel-header h3 { margin: 0 0 2px 0; font-size: 1.0625rem; font-weight: 800; }
        .panel-sub { margin: 0; font-size: 0.75rem; color: var(--text-secondary); }
        .total-badge {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          background: var(--bg-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          white-space: nowrap;
        }

        .filter-bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
        .filter-field label { font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
        .filter-field input, .filter-field select {
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          background: var(--bg-base);
          color: var(--text-primary);
          min-height: 36px;
        }
        .filter-more-toggle, .filter-buttons { min-width: 0; }
        .filter-buttons-row { display: flex; gap: 8px; }

        .directory-table-wrap { overflow-x: auto; }
        .dense-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; min-width: 760px; }
        .dense-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }
        .dense-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle, var(--border)); vertical-align: middle; }
        .dense-table .col-num { text-align: right; }
        .dense-table .num-cell { font-variant-numeric: tabular-nums; }
        .dense-table .col-actions { text-align: right; white-space: nowrap; }
        .dense-table .col-expand { width: 28px; }
        .expand-btn { border: none; background: transparent; cursor: pointer; font-size: 0.75rem; color: var(--text-secondary); padding: 2px 6px; }
        .expand-row td { padding: 0 12px 14px; background: var(--bg-subtle); }
        .line-items-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; margin-top: 6px; }
        .line-items-table th { text-align: left; padding: 6px 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; font-size: 0.625rem; }
        .line-items-table td { padding: 6px 10px; border-top: 1px solid var(--border); }
        .line-items-table .col-num { text-align: right; }

        .status-pill { padding: 3px 10px; border-radius: var(--radius-pill); font-size: 0.75rem; font-weight: 700; display: inline-block; white-space: nowrap; }
        .status-pill-warning { background: var(--warning-subtle); color: var(--warning-text); }
        .status-pill-blue { background: var(--blue-subtle); color: var(--blue-text); }
        .status-pill-green { background: var(--accent-subtle); color: var(--accent-subtle-text); }
        .status-pill-red { background: var(--destructive-subtle); color: var(--destructive-text); }

        .row-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        .row-action-btn {
          border: 1px solid var(--border);
          background: var(--bg-card);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 5px 10px;
          cursor: pointer;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .row-action-btn:hover { background: var(--bg-subtle); }
        .row-action-btn.danger { color: var(--destructive-text); border-color: var(--destructive); }
        .row-action-btn.danger:hover { background: var(--destructive-subtle); }
        .row-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .no-actions { color: var(--text-muted); font-size: 0.8125rem; }

        .confirm-row { display: flex; align-items: center; gap: 6px; }
        .confirm-text { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }

        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
          padding: 20px;
        }
        .modal-content {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          width: 440px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
        .modal-content.wide { width: 720px; }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px; margin-bottom: 16px;
        }
        .modal-header h4 { margin: 0; font-size: 1.125rem; font-weight: 800; color: var(--text-primary); }
        .close-modal-btn { border: none; background: transparent; font-size: 1.125rem; cursor: pointer; color: var(--text-muted); }
        .modal-form { display: flex; flex-direction: column; gap: 14px; }
        .modal-note { margin: -6px 0 0; font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-subtle); padding: 10px 12px; border-radius: var(--radius-sm); }
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
        .radio-row { display: flex; gap: 16px; flex-wrap: wrap; }
        .receive-mode-row { flex-direction: column; gap: 8px; }
        .radio-option {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.8125rem; font-weight: 600; color: var(--text-primary);
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

        .line-items-editor { display: flex; flex-direction: column; gap: 8px; }
        .line-items-header-row { display: flex; justify-content: space-between; align-items: center; }
        .line-items-header-row label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
        .line-items-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
        .line-edit-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; min-width: 480px; }
        .line-edit-table th {
          text-align: left; padding: 8px 10px; font-size: 0.6875rem; font-weight: 700;
          color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border);
          background: var(--bg-subtle);
        }
        .line-edit-table td { padding: 6px 10px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
        .line-edit-table .col-num { text-align: right; }
        .line-edit-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.8125rem; background: var(--bg-base); color: var(--text-primary); }
        .cell-input { width: 90px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.8125rem; text-align: right; background: var(--bg-base); color: var(--text-primary); }
        .line-remove-btn { border: none; background: transparent; color: var(--destructive-text); cursor: pointer; font-size: 0.8125rem; }
        .line-remove-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .grand-total-row { display: flex; justify-content: flex-end; gap: 10px; align-items: baseline; padding: 4px 4px 0; font-size: 0.875rem; font-weight: 700; }
        .grand-total-value { font-size: 1.0625rem; font-weight: 800; color: var(--text-primary); }
          ` }} />
        </div>
      </div>
    </div>
  );
}
