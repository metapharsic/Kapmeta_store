// Stock Purchase console.
//
// Backed by apps/api/src/routes/inventory.ts:
//   GET  /inventory/purchases?startDate=&endDate=&vendorId=&invoiceNumber=&paymentStatus=
//        -> PurchaseRow[] (no pagination -- the route returns the full
//        filtered set in one array, ordered by invoice date desc)
//   POST /inventory/purchases  { vendorId, invoiceNumber, invoiceDate,
//        paymentStatus, paidAmountMinor?, paymentMode, purchaseOrderId?,
//        notes?, items: [{ ingredientId, quantity, unitCostMinor, taxPercent? }] }
//        -> { id, invoiceNumber, totalAmountFormatted }
//   GET  /inventory/purchases/:id -> PurchaseDetail (vendor + line items)
//   GET  /inventory/vendors     -> VendorApi[] (no pagination)
//   GET  /inventory/ingredients -> IngredientApi[] (no pagination)
//
// Money crosses the wire as BigInt-serialised-to-string minor units. Never
// hand-roll `/100` on a raw field -- go through the shared helpers in
// ../../components/orders-shared (minorToMajor / formatCurrency / formatMinor),
// same convention as AllOrdersView.tsx and admin.tsx.
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import InventorySidebar from "../../components/inventory/InventorySidebar";
import { downloadCsv, formatCurrency, minorToMajor, type BadgeTone } from "../../components/orders-shared";

const PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING"] as const;
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const PAYMENT_MODES = ["BANK_TRANSFER", "CASH", "UPI", "CHEQUE", "CARD"] as const;

interface PurchaseRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountMinor: string;
  totalAmountFormatted: string;
  paidAmountMinor: string;
  paymentStatus: string;
  paymentMode: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  itemsCount: number;
  notes: string | null;
  createdAt: string;
}

interface VendorApi {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  paymentTerms: string | null;
}

interface IngredientApi {
  id: string;
  name: string;
  unitOfMeasure: string;
  reorderLevel: number;
  unitCost: number;
  currentStock: number;
  createdAt: string;
}

interface PurchaseDetailItem {
  id: string;
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCostMinor: string;
  unitCostFormatted: string;
  totalMinor: string;
  totalFormatted: string;
}

interface PurchaseDetail {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountMinor: string;
  totalAmountFormatted: string;
  paidAmountMinor: string;
  paymentStatus: string;
  paymentMode: string;
  notes: string | null;
  vendor: { id: string; name: string; phone: string | null; email: string | null };
  items: PurchaseDetailItem[];
}

interface DraftItem {
  key: string;
  ingredientId: string;
  quantity: string;
  unitCost: string; // rupees, as typed
}

function emptyDraftItem(key: string): DraftItem {
  return { key, ingredientId: "", quantity: "", unitCost: "" };
}

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// PAID/PARTIAL/PENDING each get a distinct tone from the badge system --
// statusTone() in orders-shared only distinguishes PAID from "everything
// else", so payment status needs its own mapping onto the same tone tokens.
function paymentStatusTone(status: string): BadgeTone {
  if (status === "PAID") return "accent";
  if (status === "PARTIAL") return "warning";
  if (status === "PENDING") return "danger";
  return "neutral";
}

function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export default function StockPurchasePage() {
  const { me, loading: authLoading } = useAuthGuard("inventory.read");
  const canWrite = me?.permissions.includes("inventory.write") ?? false;

  const [vendors, setVendors] = useState<VendorApi[]>([]);
  const [ingredients, setIngredients] = useState<IngredientApi[]>([]);

  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // Export dropdown
  const [exportOpen, setExportOpen] = useState(false);

  // New Purchase modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createVendorId, setCreateVendorId] = useState("");
  const [createInvoiceNumber, setCreateInvoiceNumber] = useState("");
  const [createInvoiceDate, setCreateInvoiceDate] = useState(todayInputValue());
  const [createPaymentStatus, setCreatePaymentStatus] = useState<PaymentStatus>("PAID");
  const [createPaymentMode, setCreatePaymentMode] = useState<string>("BANK_TRANSFER");
  const [createPaidAmount, setCreatePaidAmount] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createItems, setCreateItems] = useState<DraftItem[]>([emptyDraftItem("item-0")]);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [itemKeySeq, setItemKeySeq] = useState(1);

  // Detail modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadPurchases = (
    filters: { startDate: string; endDate: string; vendorId: string; invoiceNumber: string; paymentStatus: string }
  ) => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.vendorId && filters.vendorId !== "All") params.set("vendorId", filters.vendorId);
    if (filters.invoiceNumber.trim()) params.set("invoiceNumber", filters.invoiceNumber.trim());
    if (filters.paymentStatus && filters.paymentStatus !== "All") params.set("paymentStatus", filters.paymentStatus);

    authedFetch(`/inventory/purchases?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = (await res.json()) as PurchaseRow[];
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load purchases");
        setRows([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (authLoading || !me) return;
    loadPurchases({ startDate: "", endDate: "", vendorId: "All", invoiceNumber: "", paymentStatus: "All" });

    authedFetch("/inventory/vendors")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVendors(Array.isArray(data) ? data : []))
      .catch(() => setVendors([]));

    authedFetch("/inventory/ingredients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setIngredients(Array.isArray(data) ? data : []))
      .catch(() => setIngredients([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me]);

  const runSearch = () => {
    loadPurchases({
      startDate,
      endDate,
      vendorId: vendorFilter,
      invoiceNumber: invoiceFilter,
      paymentStatus: statusFilter,
    });
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setVendorFilter("All");
    setInvoiceFilter("");
    setStatusFilter("All");
    loadPurchases({ startDate: "", endDate: "", vendorId: "All", invoiceNumber: "", paymentStatus: "All" });
  };

  const exportCsv = () => {
    setExportOpen(false);
    downloadCsv(
      `stock-purchases-${startDate || "start"}_${endDate || "today"}.csv`,
      ["Invoice No", "Date", "Vendor", "Amount", "Payment Status", "Payment Mode", "Items"],
      rows.map((r) => [
        r.invoiceNumber,
        r.invoiceDate,
        r.vendorName,
        minorToMajor(r.totalAmountMinor).toFixed(2),
        r.paymentStatus,
        r.paymentMode,
        r.itemsCount,
      ])
    );
  };

  // ---- New Purchase modal ----

  const openCreate = () => {
    setCreateVendorId("");
    setCreateInvoiceNumber("");
    setCreateInvoiceDate(todayInputValue());
    setCreatePaymentStatus("PAID");
    setCreatePaymentMode("BANK_TRANSFER");
    setCreatePaidAmount("");
    setCreateNotes("");
    setCreateItems([emptyDraftItem("item-0")]);
    setItemKeySeq(1);
    setCreateError(null);
    setCreateOpen(true);
  };

  const addDraftItem = () => {
    setCreateItems((prev) => [...prev, emptyDraftItem(`item-${itemKeySeq}`)]);
    setItemKeySeq((n) => n + 1);
  };

  const removeDraftItem = (key: string) => {
    setCreateItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const updateDraftItem = (key: string, patch: Partial<DraftItem>) => {
    setCreateItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const lineTotal = (it: DraftItem): number => {
    const qty = Number(it.quantity);
    const cost = Number(it.unitCost);
    if (!Number.isFinite(qty) || !Number.isFinite(cost)) return 0;
    return qty * cost;
  };

  const createRunningTotal = useMemo(
    () => createItems.reduce((sum, it) => sum + lineTotal(it), 0),
    [createItems]
  );

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createVendorId) {
      setCreateError("Select a vendor.");
      return;
    }
    if (!createInvoiceNumber.trim()) {
      setCreateError("Invoice number is required.");
      return;
    }
    if (!createInvoiceDate) {
      setCreateError("Invoice date is required.");
      return;
    }

    const preparedItems: { ingredientId: string; quantity: number; unitCostMinor: number }[] = [];
    for (const it of createItems) {
      if (!it.ingredientId) {
        setCreateError("Every line item needs an ingredient.");
        return;
      }
      const qty = Number(it.quantity);
      const cost = Number(it.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) {
        setCreateError("Every line item needs a quantity greater than 0.");
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        setCreateError("Every line item needs a valid unit cost.");
        return;
      }
      preparedItems.push({
        ingredientId: it.ingredientId,
        quantity: qty,
        unitCostMinor: Math.round(cost * 100),
      });
    }
    if (preparedItems.length === 0) {
      setCreateError("Add at least one line item.");
      return;
    }

    let paidAmountMinor: number | undefined;
    if (createPaymentStatus === "PARTIAL") {
      const paid = Number(createPaidAmount);
      if (!Number.isFinite(paid) || paid <= 0 || paid >= createRunningTotal) {
        setCreateError("Paid amount must be greater than 0 and less than the invoice total for a partial payment.");
        return;
      }
      paidAmountMinor = Math.round(paid * 100);
    }

    const body: Record<string, unknown> = {
      vendorId: createVendorId,
      invoiceNumber: createInvoiceNumber.trim(),
      invoiceDate: createInvoiceDate,
      paymentStatus: createPaymentStatus,
      paymentMode: createPaymentMode,
      items: preparedItems,
    };
    if (paidAmountMinor !== undefined) body.paidAmountMinor = paidAmountMinor;
    if (createNotes.trim()) body.notes = createNotes.trim();

    setCreateSaving(true);
    authedFetch("/inventory/purchases", { method: "POST", body: JSON.stringify(body) })
      .then(async (res) => {
        if (!res.ok) {
          const respBody = await res.json().catch(() => ({}));
          throw new Error(respBody.error || "HTTP error " + res.status);
        }
        const data = await res.json();
        setCreateOpen(false);
        setCreateSaving(false);
        setActionError(null);
        setActionNotice(
          `Purchase ${data.invoiceNumber || createInvoiceNumber} recorded (${data.totalAmountFormatted || formatCurrency(createRunningTotal)}).`
        );
        loadPurchases({
          startDate,
          endDate,
          vendorId: vendorFilter,
          invoiceNumber: invoiceFilter,
          paymentStatus: statusFilter,
        });
      })
      .catch((err) => {
        setCreateError(err instanceof Error ? err.message : "Failed to create purchase");
        setCreateSaving(false);
      });
  };

  // ---- Detail modal ----

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    authedFetch(`/inventory/purchases/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "HTTP error " + res.status);
        }
        const data = (await res.json()) as PurchaseDetail;
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((err) => {
        setDetailError(err instanceof Error ? err.message : "Failed to load purchase detail");
        setDetailLoading(false);
      });
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
  };

  return (
    <div className="purchase-app">
      <Head>
        <title>KapMeta POS - Stock Purchase</title>
        <meta name="description" content="Record and review supplier stock purchase invoices." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <InventorySidebar currentOutletName={me?.outlet?.name} />

        <div className="main-col">
          {authLoading && (
            <div className="empty-state-card">
              <span className="empty-icon">🔐</span>
              <h3>Checking access...</h3>
            </div>
          )}

          {!authLoading && (
            <main className="dashboard-body">
              <section className="topbar-row">
                <div>
                  <span className="breadcrumb-line">Inventory &gt; Purchase &gt; Stock Purchase</span>
                  <h1 className="greeting-title">Purchase List</h1>
                </div>
                <div className="topbar-actions">
                  <div className="export-dropdown">
                    <button type="button" className="secondary-btn" onClick={() => setExportOpen((v) => !v)}>
                      Export ▾
                    </button>
                    {exportOpen && (
                      <div className="export-menu">
                        <button type="button" onClick={exportCsv} disabled={rows.length === 0}>
                          Export as CSV
                        </button>
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <button type="button" className="primary-btn" onClick={openCreate}>
                      + New Purchase
                    </button>
                  )}
                </div>
              </section>

              {actionNotice && (
                <div className="notice-card">
                  <span className="empty-icon">✅</span>
                  <p>{actionNotice}</p>
                </div>
              )}
              {actionError && (
                <div className="notice-card notice-card-error">
                  <span className="empty-icon">⚠️</span>
                  <p>{actionError}</p>
                </div>
              )}

              <section className="panel-card">
                <form
                  className="filter-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runSearch();
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
                      <option value="All">All Suppliers</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-field">
                    <label>Invoice No.</label>
                    <input
                      type="text"
                      placeholder="Search invoice no."
                      value={invoiceFilter}
                      onChange={(e) => setInvoiceFilter(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="more-filters-toggle"
                    onClick={() => setMoreFiltersOpen((v) => !v)}
                  >
                    {moreFiltersOpen ? "Fewer Filters ▲" : "More Filters ▾"}
                  </button>

                  {moreFiltersOpen && (
                    <div className="filter-field">
                      <label>Payment Status</label>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="All">All Statuses</option>
                        {PAYMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="filter-actions">
                    <button type="submit" className="primary-btn" disabled={loading}>
                      {loading ? "Searching..." : "Search"}
                    </button>
                    <button type="button" className="secondary-btn" onClick={clearFilters} disabled={loading}>
                      Clear
                    </button>
                  </div>
                </form>
              </section>

              <section className="panel-card">
                {loading && (
                  <div className="empty-state-card">
                    <span className="empty-icon">⏳</span>
                    <h3>Loading purchases...</h3>
                  </div>
                )}

                {!loading && loadError && (
                  <div className="empty-state-card error-card">
                    <span className="empty-icon">⚠️</span>
                    <h3>Could not load purchases</h3>
                    <p>{loadError}</p>
                  </div>
                )}

                {!loading && !loadError && rows.length === 0 && (
                  <div className="empty-state-card">
                    <span className="empty-icon">🧾</span>
                    <h3>No Purchase Found</h3>
                    <p>Try adjusting your filters, or record a new purchase invoice.</p>
                  </div>
                )}

                {!loading && !loadError && rows.length > 0 && (
                  <div className="directory-table-wrap">
                    <table className="dense-table">
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Date</th>
                          <th>Vendor</th>
                          <th className="col-num">Amount</th>
                          <th>Payment Status</th>
                          <th className="col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.invoiceNumber}</td>
                            <td>{formatDateDisplay(r.invoiceDate)}</td>
                            <td>{r.vendorName}</td>
                            <td className="col-num num-cell">{formatCurrency(minorToMajor(r.totalAmountMinor))}</td>
                            <td>
                              <span className={`badge tone-${paymentStatusTone(r.paymentStatus)}`}>
                                {r.paymentStatus}
                              </span>
                            </td>
                            <td className="col-actions">
                              <button type="button" className="row-action-btn" onClick={() => openDetail(r.id)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && !loadError && rows.length > 0 && (
                  <div className="directory-pagination">
                    <span className="panel-sub">{rows.length} purchase{rows.length === 1 ? "" : "s"}</span>
                  </div>
                )}
              </section>
            </main>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="modal-overlay" onClick={() => !createSaving && setCreateOpen(false)}>
          <div className="modal-content modal-content-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>New Purchase</h4>
              <button className="close-modal-btn" onClick={() => !createSaving && setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={submitCreate} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Vendor *</label>
                  <select value={createVendorId} onChange={(e) => setCreateVendorId(e.target.value)} required>
                    <option value="">Select vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Invoice Number *</label>
                  <input
                    type="text"
                    required
                    value={createInvoiceNumber}
                    onChange={(e) => setCreateInvoiceNumber(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={createInvoiceDate}
                    onChange={(e) => setCreateInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select value={createPaymentMode} onChange={(e) => setCreatePaymentMode(e.target.value)}>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Line Items *</label>
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Ingredient</th>
                        <th className="col-num">Quantity</th>
                        <th className="col-num">Unit Cost (₹)</th>
                        <th className="col-num">Line Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {createItems.map((it) => (
                        <tr key={it.key}>
                          <td>
                            <select
                              value={it.ingredientId}
                              onChange={(e) => updateDraftItem(it.key, { ingredientId: e.target.value })}
                              required
                            >
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
                              value={it.quantity}
                              onChange={(e) => updateDraftItem(it.key, { quantity: e.target.value })}
                              required
                            />
                          </td>
                          <td className="col-num">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={it.unitCost}
                              onChange={(e) => updateDraftItem(it.key, { unitCost: e.target.value })}
                              required
                            />
                          </td>
                          <td className="col-num num-cell">{formatCurrency(lineTotal(it))}</td>
                          <td className="col-actions">
                            <button
                              type="button"
                              className="row-action-btn"
                              onClick={() => removeDraftItem(it.key)}
                              disabled={createItems.length === 1}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="secondary-btn add-item-btn" onClick={addDraftItem}>
                  + Add Item
                </button>
              </div>

              <div className="running-total-row">
                <span>Running Total</span>
                <strong>{formatCurrency(createRunningTotal)}</strong>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Payment Status *</label>
                  <select
                    value={createPaymentStatus}
                    onChange={(e) => setCreatePaymentStatus(e.target.value as PaymentStatus)}
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Paid Amount (₹) {createPaymentStatus === "PARTIAL" ? "*" : ""}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={createPaymentStatus === "PARTIAL" ? createPaidAmount : ""}
                    placeholder={
                      createPaymentStatus === "PAID"
                        ? formatCurrency(createRunningTotal)
                        : createPaymentStatus === "PENDING"
                        ? "₹0.00"
                        : "Enter amount paid"
                    }
                    disabled={createPaymentStatus !== "PARTIAL"}
                    onChange={(e) => setCreatePaidAmount(e.target.value)}
                    required={createPaymentStatus === "PARTIAL"}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  rows={2}
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {createError && <p className="form-error">{createError}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-modal-btn"
                  onClick={() => !createSaving && setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-modal-btn" disabled={createSaving}>
                  {createSaving ? "Saving..." : "Save Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailId && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content modal-content-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Purchase Detail</h4>
              <button className="close-modal-btn" onClick={closeDetail}>
                ✕
              </button>
            </div>

            {detailLoading && (
              <div className="empty-state-card">
                <span className="empty-icon">⏳</span>
                <h3>Loading...</h3>
              </div>
            )}
            {!detailLoading && detailError && (
              <div className="empty-state-card error-card">
                <span className="empty-icon">⚠️</span>
                <p>{detailError}</p>
              </div>
            )}
            {!detailLoading && !detailError && detail && (
              <div className="detail-body">
                <div className="detail-header-row">
                  <div>
                    <div className="detail-invoice">{detail.invoiceNumber}</div>
                    <div className="panel-sub">{formatDateDisplay(detail.invoiceDate)}</div>
                  </div>
                  <span className={`badge tone-${paymentStatusTone(detail.paymentStatus)}`}>
                    {detail.paymentStatus}
                  </span>
                </div>

                <div className="detail-grid">
                  <div>
                    <span className="panel-sub">Vendor</span>
                    <div>{detail.vendor.name}</div>
                    {detail.vendor.phone && <div className="panel-sub">{detail.vendor.phone}</div>}
                  </div>
                  <div>
                    <span className="panel-sub">Payment Mode</span>
                    <div>{detail.paymentMode}</div>
                  </div>
                  <div>
                    <span className="panel-sub">Paid</span>
                    <div>{formatCurrency(minorToMajor(detail.paidAmountMinor))}</div>
                  </div>
                  <div>
                    <span className="panel-sub">Total</span>
                    <div>{detail.totalAmountFormatted}</div>
                  </div>
                </div>

                {detail.notes && (
                  <div className="detail-notes">
                    <span className="panel-sub">Notes</span>
                    <p>{detail.notes}</p>
                  </div>
                )}

                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Ingredient</th>
                        <th className="col-num">Qty</th>
                        <th className="col-num">Unit Cost</th>
                        <th className="col-num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id}>
                          <td>
                            {it.name} <span className="panel-sub">({it.unit})</span>
                          </td>
                          <td className="col-num num-cell">{it.quantity}</td>
                          <td className="col-num num-cell">{it.unitCostFormatted}</td>
                          <td className="col-num num-cell">{it.totalFormatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .purchase-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100%;
          background-color: #f8fafc;
          color: #0f172a;
        }
        .main-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }

        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }

        .topbar-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .breadcrumb-line {
          font-size: 0.75rem; color: #94a3b8; font-weight: 600;
          letter-spacing: 0.5px; text-transform: uppercase;
        }
        .greeting-title { margin: 4px 0 0 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .topbar-actions { display: flex; align-items: center; gap: 10px; }

        .primary-btn {
          padding: 9px 18px;
          background: #0f172a;
          color: #fff;
          border: none;
          border-radius: 999px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
          white-space: nowrap;
        }
        .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .secondary-btn {
          padding: 9px 18px;
          background: #fff;
          color: #334155;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          min-height: 38px;
          white-space: nowrap;
        }
        .secondary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .export-dropdown { position: relative; }
        .export-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.12);
          min-width: 160px;
          z-index: 40;
          overflow: hidden;
        }
        .export-menu button {
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          border: none;
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          color: #334155;
        }
        .export-menu button:hover { background: #f1f5f9; }
        .export-menu button:disabled { opacity: 0.5; cursor: not-allowed; }

        .notice-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 12px;
          color: #065f46;
          font-size: 0.8125rem;
        }
        .notice-card p { margin: 0; }
        .notice-card-error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }

        .panel-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .filter-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; }
        .filter-field { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
        .filter-field label {
          font-size: 0.6875rem; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        .filter-field input, .filter-field select {
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.8125rem;
          background: #fff;
          color: #0f172a;
          min-height: 36px;
        }
        .more-filters-toggle {
          border: none;
          background: transparent;
          color: #2563eb;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          padding: 8px 0;
          align-self: center;
        }
        .filter-actions { display: flex; gap: 8px; margin-left: auto; }

        .empty-state-card {
          text-align: center;
          padding: 56px 20px;
          background: #fff;
          border: 1px dashed #e2e8f0;
          border-radius: 14px;
        }
        .empty-state-card.error-card { border-color: #fca5a5; }
        .empty-state-card h3 { margin: 8px 0 4px 0; font-size: 15px; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: #64748b; }
        .empty-icon { font-size: 34px; display: block; }

        .directory-table-wrap { overflow-x: auto; }
        .dense-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .dense-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
        }
        .dense-table td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .dense-table .col-num { text-align: right; }
        .dense-table .num-cell { font-variant-numeric: tabular-nums; }
        .dense-table .col-actions { text-align: right; white-space: nowrap; }

        .directory-pagination { display: flex; justify-content: flex-end; }
        .panel-sub { font-size: 0.75rem; color: #64748b; }

        .badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.6875rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .tone-neutral { background: #f1f5f9; color: #475569; }
        .tone-accent { background: #dcfce7; color: #15803d; }
        .tone-warning { background: #fef3c7; color: #b45309; }
        .tone-danger { background: #fee2e2; color: #b91c1c; }
        .tone-info { background: #dbeafe; color: #1d4ed8; }
        .tone-purple { background: #ede9fe; color: #6d28d9; }

        .row-action-btn {
          border: 1px solid #e2e8f0;
          background: #fff;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 5px 10px;
          cursor: pointer;
          color: #334155;
        }
        .row-action-btn:hover { background: #f8fafc; }
        .row-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
          padding: 20px;
        }
        .modal-content {
          background: #fff;
          border-radius: 16px;
          width: 440px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.25);
        }
        .modal-content-lg { width: 720px; }

        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 12px; margin-bottom: 16px;
        }
        .modal-header h4 { margin: 0; font-size: 1.125rem; font-weight: 800; }
        .close-modal-btn { border: none; background: transparent; font-size: 1.125rem; cursor: pointer; color: #94a3b8; }

        .modal-form { display: flex; flex-direction: column; gap: 16px; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-group label { font-size: 0.6875rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }
        .form-group input, .form-group select, .form-group textarea {
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.875rem;
          background: #fff;
          color: #0f172a;
          font-family: inherit;
        }
        .form-error { margin: 0; font-size: 0.8125rem; color: #b91c1c; }

        .items-table-wrap { overflow-x: auto; border: 1px solid #f1f5f9; border-radius: 10px; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; min-width: 560px; }
        .items-table th {
          text-align: left; padding: 8px 10px; font-size: 0.6875rem; font-weight: 700;
          color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
        }
        .items-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .items-table select, .items-table input {
          width: 100%; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8125rem;
        }
        .items-table .col-num { text-align: right; }
        .items-table .num-cell { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .items-table .col-actions { text-align: right; white-space: nowrap; }
        .add-item-btn { margin-top: 8px; }

        .running-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px; background: #f8fafc; border-radius: 10px; font-size: 0.875rem;
        }

        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
        .cancel-modal-btn {
          padding: 8px 16px; border: 1px solid #e2e8f0; background: transparent;
          border-radius: 999px; font-size: 0.8125rem; font-weight: 700;
          cursor: pointer; color: #334155;
        }
        .submit-modal-btn {
          padding: 8px 16px; background: #0f172a; color: #fff; border: none;
          border-radius: 999px; font-size: 0.8125rem; font-weight: 700; cursor: pointer;
        }
        .submit-modal-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .detail-body { display: flex; flex-direction: column; gap: 16px; }
        .detail-header-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .detail-invoice { font-size: 1.0625rem; font-weight: 800; }
        .detail-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px;
          padding: 14px; background: #f8fafc; border-radius: 12px; font-size: 0.875rem;
        }
        .detail-notes p { margin: 4px 0 0 0; font-size: 0.8125rem; }
      ` }} />
    </div>
  );
}
