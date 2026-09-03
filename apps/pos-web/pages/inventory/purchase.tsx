import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import InventorySidebar from "../../components/inventory/InventorySidebar";
import InventoryHeader from "../../components/inventory/InventoryHeader";
import A2aAgentStatusDrawer from "../../components/A2aAgentStatusDrawer";

interface StockPurchase {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountMinor: string;
  totalAmountFormatted: string;
  paidAmountMinor: string;
  paymentStatus: "PAID" | "PARTIAL" | "PENDING";
  paymentMode: string;
  vendorId: string;
  vendorName: string;
  vendorPhone?: string;
  itemsCount: number;
  notes?: string;
  createdAt: string;
}

interface Vendor {
  id: string;
  name: string;
  phone?: string;
}

interface Ingredient {
  id: string;
  name: string;
  unitOfMeasure: string;
  unitCost: number;
}

export default function StockPurchasePage() {
  const { me, loading: authLoading } = useAuthGuard("inventory.read");
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (matching Screenshot 4)
  const [startDate, setStartDate] = useState("2026-08-26");
  const [endDate, setEndDate] = useState("2026-09-02");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [invoiceQuery, setInvoiceQuery] = useState("");

  // Ingestion Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalVendorId, setModalVendorId] = useState("");
  const [modalInvoiceNo, setModalInvoiceNo] = useState("");
  const [modalInvoiceDate, setModalInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [modalPaymentStatus, setModalPaymentStatus] = useState<"PAID" | "PARTIAL" | "PENDING">("PAID");
  const [modalPaymentMode, setModalPaymentMode] = useState("BANK_TRANSFER");
  const [modalNotes, setModalNotes] = useState("");
  const [modalLines, setModalLines] = useState<{ ingredientId: string; quantity: number; unitCost: number; taxPercent: number }[]>([
    { ingredientId: "", quantity: 10, unitCost: 50, taxPercent: 5 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Detail Modal
  const [viewingPurchase, setViewingPurchase] = useState<any>(null);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      let url = `/inventory/purchases?startDate=${startDate}&endDate=${endDate}`;
      if (selectedVendor && selectedVendor !== "All") url += `&vendorId=${selectedVendor}`;
      if (invoiceQuery) url += `&invoiceNumber=${encodeURIComponent(invoiceQuery)}`;

      const res = await authedFetch(url);
      if (res.ok) {
        const data = await res.json();
        setPurchases(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Error fetching purchases:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [vRes, iRes] = await Promise.all([
        authedFetch("/inventory/vendors"),
        authedFetch("/inventory/ingredients"),
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        setVendors(Array.isArray(vData) ? vData : []);
        if (vData.length > 0) setModalVendorId(vData[0].id);
      }
      if (iRes.ok) {
        const iData = await iRes.json();
        setIngredients(Array.isArray(iData) ? iData : []);
        if (iData.length > 0) {
          setModalLines([{ ingredientId: iData[0].id, quantity: 10, unitCost: iData[0].unitCost || 50, taxPercent: 5 }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPurchases();
    fetchMetadata();
  }, []);

  const handleSearch = () => {
    fetchPurchases();
  };

  const handleClear = () => {
    setStartDate("2026-08-26");
    setEndDate("2026-09-02");
    setSelectedVendor("All");
    setInvoiceQuery("");
    fetchPurchases();
  };

  const handleCreatePurchase = async () => {
    if (!modalVendorId || !modalInvoiceNo) {
      alert("Please enter invoice number and select supplier");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch("/inventory/purchases", {
        method: "POST",
        body: JSON.stringify({
          vendorId: modalVendorId,
          invoiceNumber: modalInvoiceNo,
          invoiceDate: modalInvoiceDate,
          paymentStatus: modalPaymentStatus,
          paymentMode: modalPaymentMode,
          notes: modalNotes,
          items: modalLines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: l.quantity,
            unitCostMinor: Math.round(l.unitCost * 100),
            taxPercent: l.taxPercent,
          })),
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setModalInvoiceNo("");
        fetchPurchases();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create stock purchase");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewPurchase = async (id: string) => {
    try {
      const res = await authedFetch(`/inventory/purchases/${id}`);
      if (res.ok) {
        const detail = await res.json();
        setViewingPurchase(detail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={styles.pageLayout}>
      <Head>
        <title>Stock Purchase — KapMeta POS</title>
      </Head>

      <InventorySidebar onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

      <div style={styles.mainWrapper}>
        <InventoryHeader onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

        <main style={styles.content}>
          {/* Header Bar */}
          <div style={styles.headerBar}>
            <h1 style={styles.pageTitle}>Purchase List</h1>
            <div style={styles.headerActions}>
              <button style={styles.exportBtn}>
                <span>Export</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button onClick={() => setShowAddModal(true)} style={styles.primaryAddBtn}>
                + Ingest Purchase
              </button>
            </div>
          </div>

          {/* Filter Bar (Matching Screenshot 4) */}
          <div style={styles.filterCard}>
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Start Date</label>
              <div style={styles.dateInputWrapper}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>End Date</label>
              <div style={styles.dateInputWrapper}>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>From</label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                style={styles.selectInput}
              >
                <option value="All">All</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Invoice No.</label>
              <input
                type="text"
                placeholder="Enter Invoice No"
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
                style={styles.textFilterInput}
              />
            </div>

            <button style={styles.moreFiltersBtn}>More Filters</button>
            <button onClick={handleSearch} style={styles.searchBtn}>
              Search
            </button>
            <button onClick={handleClear} style={styles.clearBtn}>
              Clear
            </button>
          </div>

          {/* Main List / Empty State */}
          <div style={styles.tableCard}>
            {loading ? (
              <div style={styles.loadingBox}>
                <div style={styles.spinner} />
                <span>Loading purchases…</span>
              </div>
            ) : purchases.length === 0 ? (
              /* Empty state matching Screenshot 4 */
              <div style={styles.emptyContainer}>
                <div style={styles.emptyDocIconBox}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <circle cx="11" cy="14" r="3"></circle>
                    <line x1="13.2" y1="16.2" x2="16" y2="19"></line>
                  </svg>
                </div>
                <div style={styles.emptyText}>No Purchase Found</div>
                <button onClick={() => setShowAddModal(true)} style={styles.emptyActionBtn}>
                  + Record First Stock Purchase
                </button>
              </div>
            ) : (
              /* Real Data Table */
              <table style={styles.table}>
                <thead>
                  <tr style={styles.theadRow}>
                    <th style={styles.th}>Invoice No</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Supplier</th>
                    <th style={styles.th}>Items</th>
                    <th style={styles.th}>Total Amount</th>
                    <th style={styles.th}>Payment Status</th>
                    <th style={styles.th}>Payment Mode</th>
                    <th style={styles.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} style={styles.tr}>
                      <td style={styles.tdInvoice}>{p.invoiceNumber}</td>
                      <td style={styles.td}>{p.invoiceDate}</td>
                      <td style={styles.tdBold}>{p.vendorName}</td>
                      <td style={styles.td}>{p.itemsCount} items</td>
                      <td style={styles.tdAmount}>{p.totalAmountFormatted}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor:
                              p.paymentStatus === "PAID" ? "#f0fdf4" : p.paymentStatus === "PARTIAL" ? "#fffbeb" : "#fef2f2",
                            color:
                              p.paymentStatus === "PAID" ? "#16a34a" : p.paymentStatus === "PARTIAL" ? "#d97706" : "#dc2626",
                          }}
                        >
                          {p.paymentStatus}
                        </span>
                      </td>
                      <td style={styles.td}>{p.paymentMode}</td>
                      <td style={styles.tdRight}>
                        <button onClick={() => handleViewPurchase(p.id)} style={styles.viewActionBtn}>
                          View Invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Ingest / Add Purchase Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Record Stock Purchase Invoice</h3>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalGrid2}>
                <div>
                  <label style={styles.inputLabel}>Supplier / Vendor *</label>
                  <select
                    value={modalVendorId}
                    onChange={(e) => setModalVendorId(e.target.value)}
                    style={styles.modalSelect}
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.inputLabel}>Invoice Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0042"
                    value={modalInvoiceNo}
                    onChange={(e) => setModalInvoiceNo(e.target.value)}
                    style={styles.modalInput}
                  />
                </div>
              </div>

              <div style={styles.modalGrid2}>
                <div>
                  <label style={styles.inputLabel}>Invoice Date</label>
                  <input
                    type="date"
                    value={modalInvoiceDate}
                    onChange={(e) => setModalInvoiceDate(e.target.value)}
                    style={styles.modalInput}
                  />
                </div>
                <div>
                  <label style={styles.inputLabel}>Payment Status</label>
                  <select
                    value={modalPaymentStatus}
                    onChange={(e) => setModalPaymentStatus(e.target.value as any)}
                    style={styles.modalSelect}
                  >
                    <option value="PAID">PAID</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={styles.inputLabel}>Purchased Raw Materials / Items</label>
                  <button
                    onClick={() =>
                      setModalLines([
                        ...modalLines,
                        { ingredientId: ingredients[0]?.id || "", quantity: 10, unitCost: 50, taxPercent: 5 },
                      ])
                    }
                    style={styles.addLineBtn}
                  >
                    + Add Item
                  </button>
                </div>

                <div style={styles.linesContainer}>
                  {modalLines.map((line, idx) => (
                    <div key={idx} style={styles.lineRow}>
                      <select
                        value={line.ingredientId}
                        onChange={(e) => {
                          const updated = [...modalLines];
                          updated[idx].ingredientId = e.target.value;
                          const found = ingredients.find((i) => i.id === e.target.value);
                          if (found) updated[idx].unitCost = found.unitCost || 50;
                          setModalLines(updated);
                        }}
                        style={styles.lineSelect}
                      >
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unitOfMeasure})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => {
                          const updated = [...modalLines];
                          updated[idx].quantity = parseFloat(e.target.value) || 0;
                          setModalLines(updated);
                        }}
                        style={styles.qtyBox}
                      />

                      <input
                        type="number"
                        placeholder="Cost (₹)"
                        value={line.unitCost}
                        onChange={(e) => {
                          const updated = [...modalLines];
                          updated[idx].unitCost = parseFloat(e.target.value) || 0;
                          setModalLines(updated);
                        }}
                        style={styles.costBox}
                      />

                      <span style={styles.lineTotal}>
                        ₹{(line.quantity * line.unitCost).toFixed(2)}
                      </span>

                      <button
                        onClick={() => setModalLines(modalLines.filter((_, i) => i !== idx))}
                        style={styles.deleteLineBtn}
                        disabled={modalLines.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={styles.inputLabel}>Notes</label>
                <input
                  type="text"
                  placeholder="Optional delivery details or receipt notes"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  style={styles.modalInput}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowAddModal(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleCreatePurchase} disabled={submitting} style={styles.confirmBtn}>
                {submitting ? "Saving..." : "Ingest & Update Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details View Modal */}
      {viewingPurchase && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Invoice: {viewingPurchase.invoiceNumber}</h3>
                <p style={styles.modalSub}>
                  {viewingPurchase.vendor?.name} · {viewingPurchase.invoiceDate?.split("T")[0]}
                </p>
              </div>
              <button onClick={() => setViewingPurchase(null)} style={styles.closeBtn}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.theadRow}>
                    <th style={styles.th}>Item</th>
                    <th style={styles.th}>Quantity</th>
                    <th style={styles.th}>Rate</th>
                    <th style={styles.thRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPurchase.items?.map((it: any) => (
                    <tr key={it.id} style={styles.tr}>
                      <td style={styles.tdBold}>{it.name}</td>
                      <td style={styles.td}>{it.quantity} {it.unit}</td>
                      <td style={styles.td}>{it.unitCostFormatted}</td>
                      <td style={styles.tdRight}>{it.totalFormatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={styles.invoiceTotalRow}>
                <span>Grand Total:</span>
                <span style={styles.invoiceTotalBig}>{viewingPurchase.totalAmountFormatted}</span>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setViewingPurchase(null)} style={styles.cancelBtn}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <A2aAgentStatusDrawer isOpen={isAgentModalOpen} onClose={() => setIsAgentModalOpen(false)} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageLayout: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  mainWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  content: {
    padding: "24px 32px 64px",
    maxWidth: 1400,
    width: "100%",
    margin: "0 auto",
  },
  headerBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: "1.2rem",
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  },
  headerActions: {
    display: "flex",
    gap: 12,
  },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryAddBtn: {
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    padding: "16px 20px",
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    flexWrap: "wrap",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  filterLabel: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#64748b",
  },
  dateInputWrapper: {
    position: "relative",
  },
  dateInput: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: "0.82rem",
    color: "#0f172a",
    fontWeight: 600,
    outline: "none",
  },
  selectInput: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: "0.82rem",
    color: "#0f172a",
    fontWeight: 600,
    minWidth: 100,
    outline: "none",
  },
  textFilterInput: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: "0.82rem",
    color: "#0f172a",
    outline: "none",
    width: 140,
  },
  moreFiltersBtn: {
    padding: "7px 14px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  searchBtn: {
    padding: "7px 20px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  clearBtn: {
    padding: "7px 16px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#64748b",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  tableCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #edf2f7",
    overflow: "hidden",
    minHeight: 400,
  },
  emptyContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "100px 0",
  },
  emptyDocIconBox: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#64748b",
    marginBottom: 12,
  },
  emptyActionBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "0.82rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  theadRow: {
    backgroundColor: "#f8fafc",
    borderBottom: "1.5px solid #edf2f7",
  },
  th: {
    padding: "12px 18px",
    textAlign: "left",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
  },
  thRight: {
    padding: "12px 18px",
    textAlign: "right",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
  },
  td: {
    padding: "12px 18px",
    fontSize: "0.85rem",
    color: "#475569",
  },
  tdInvoice: {
    padding: "12px 18px",
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#2563eb",
  },
  tdBold: {
    padding: "12px 18px",
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  tdAmount: {
    padding: "12px 18px",
    fontSize: "0.85rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  tdRight: {
    padding: "12px 18px",
    textAlign: "right",
  },
  statusBadge: {
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: "0.72rem",
    fontWeight: 700,
  },
  viewActionBtn: {
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#2563eb",
    fontSize: "0.78rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 0",
    gap: 12,
    color: "#64748b",
  },
  spinner: {
    width: 28,
    height: 28,
    border: "3px solid #e2e8f0",
    borderTopColor: "#2563eb",
    borderRadius: "50%",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.6)",
    zIndex: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(2px)",
  },
  modalCard: {
    width: 700,
    maxHeight: "90vh",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  modalTitle: {
    fontSize: "1.1rem",
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  },
  modalSub: {
    fontSize: "0.8rem",
    color: "#64748b",
    margin: "2px 0 0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "1.2rem",
    color: "#64748b",
    cursor: "pointer",
  },
  modalBody: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
  },
  modalGrid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginBottom: 12,
  },
  inputLabel: {
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#334155",
    marginBottom: 4,
  },
  modalInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.85rem",
  },
  modalSelect: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.85rem",
    backgroundColor: "#ffffff",
  },
  addLineBtn: {
    background: "none",
    border: "none",
    color: "#2563eb",
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  linesContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  lineRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  lineSelect: {
    flex: 2,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: "0.82rem",
  },
  qtyBox: {
    width: 70,
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: "0.82rem",
  },
  costBox: {
    width: 90,
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: "0.82rem",
  },
  lineTotal: {
    width: 80,
    textAlign: "right",
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  deleteLineBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  modalFooter: {
    padding: "16px 24px",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#64748b",
    fontWeight: 600,
    cursor: "pointer",
  },
  confirmBtn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  invoiceTotalRow: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTop: "2px solid #e2e8f0",
    fontSize: "1rem",
    fontWeight: 700,
  },
  invoiceTotalBig: {
    fontSize: "1.4rem",
    fontWeight: 900,
    color: "#0f172a",
  },
};
