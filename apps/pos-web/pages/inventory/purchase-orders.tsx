import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import InventorySidebar from "../../components/inventory/InventorySidebar";
import InventoryHeader from "../../components/inventory/InventoryHeader";
import A2aAgentStatusDrawer from "../../components/A2aAgentStatusDrawer";

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  vendor: {
    id: string;
    name: string;
    phone?: string;
  };
  items: {
    id: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    ingredient: {
      id: string;
      name: string;
      unitOfMeasure: string;
    };
  }[];
}

interface Vendor {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
  unitOfMeasure: string;
  unitCost: number;
}

export default function PurchaseOrderListPage() {
  const { me, loading: authLoading } = useAuthGuard("inventory.read");
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (Matching Screenshot 5)
  const [startDate, setStartDate] = useState("2026-08-26");
  const [endDate, setEndDate] = useState("2026-09-02");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [poQuery, setPoQuery] = useState("");

  // Create PO Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalVendorId, setModalVendorId] = useState("");
  const [modalLines, setModalLines] = useState<{ ingredientId: string; quantity: number; unitPrice: number }[]>([
    { ingredientId: "", quantity: 10, unitPrice: 50 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Receiving PO (GRN)
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/inventory/purchase-orders");
      if (res.ok) {
        const data = await res.json();
        let list: PurchaseOrder[] = Array.isArray(data) ? data : [];
        if (selectedVendor && selectedVendor !== "All") {
          list = list.filter((p) => p.vendor?.id === selectedVendor);
        }
        if (poQuery) {
          list = list.filter((p) => p.poNumber.toLowerCase().includes(poQuery.toLowerCase()));
        }
        setOrders(list);
      }
    } catch (e) {
      console.error("Error fetching purchase orders:", e);
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
          setModalLines([{ ingredientId: iData[0].id, quantity: 10, unitPrice: iData[0].unitCost || 50 }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPOs();
    fetchMetadata();
  }, []);

  const handleCreatePo = async () => {
    if (!modalVendorId || modalLines.length === 0) {
      alert("Please select vendor and add items");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch("/inventory/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          vendorId: modalVendorId,
          items: modalLines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        fetchPOs();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create PO");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveGoods = async (poId: string) => {
    setReceivingPoId(poId);
    try {
      const res = await authedFetch(`/inventory/purchase-orders/${poId}/receive`, {
        method: "POST",
      });
      if (res.ok) {
        fetchPOs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReceivingPoId(null);
    }
  };

  const handleCancelPo = async (poId: string) => {
    if (!confirm("Are you sure you want to cancel this purchase order?")) return;
    try {
      const res = await authedFetch(`/inventory/purchase-orders/${poId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        fetchPOs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={styles.pageLayout}>
      <Head>
        <title>Purchase Order List — PetPooja POSS</title>
      </Head>

      <InventorySidebar onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

      <div style={styles.mainWrapper}>
        <InventoryHeader onOpenAgentStatus={() => setIsAgentModalOpen(true)} />

        <main style={styles.content}>
          {/* Header Bar */}
          <div style={styles.headerBar}>
            <h1 style={styles.pageTitle}>Purchase Order List</h1>
            <div style={styles.headerActions}>
              <button style={styles.exportBtn}>
                <span>Export</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button onClick={() => setShowCreateModal(true)} style={styles.primaryAddBtn}>
                + Create PO
              </button>
            </div>
          </div>

          {/* Filter Bar (Matching Screenshot 5) */}
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
              <label style={styles.filterLabel}>To</label>
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
              <label style={styles.filterLabel}>PO Number</label>
              <input
                type="text"
                placeholder="Enter PO Number"
                value={poQuery}
                onChange={(e) => setPoQuery(e.target.value)}
                style={styles.textFilterInput}
              />
            </div>

            <button style={styles.moreFiltersBtn}>More Filters</button>
            <button onClick={fetchPOs} style={styles.searchBtn}>
              Search
            </button>
            <button
              onClick={() => {
                setStartDate("2026-08-26");
                setEndDate("2026-09-02");
                setSelectedVendor("All");
                setPoQuery("");
                fetchPOs();
              }}
              style={styles.clearBtn}
            >
              Clear
            </button>
          </div>

          {/* Main Table / Empty State */}
          <div style={styles.tableCard}>
            {loading ? (
              <div style={styles.loadingBox}>
                <div style={styles.spinner} />
                <span>Loading purchase orders…</span>
              </div>
            ) : orders.length === 0 ? (
              /* Empty state matching Screenshot 5 */
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
                <button onClick={() => setShowCreateModal(true)} style={styles.emptyActionBtn}>
                  + Create First Purchase Order
                </button>
              </div>
            ) : (
              /* PO Data Table */
              <table style={styles.table}>
                <thead>
                  <tr style={styles.theadRow}>
                    <th style={styles.th}>PO Number</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Supplier</th>
                    <th style={styles.th}>Items Count</th>
                    <th style={styles.th}>Total Amount</th>
                    <th style={styles.th}>Stage / Status</th>
                    <th style={styles.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => (
                    <tr key={po.id} style={styles.tr}>
                      <td style={styles.tdPoNum}>{po.poNumber}</td>
                      <td style={styles.td}>{po.createdAt ? new Date(po.createdAt).toLocaleDateString("en-IN") : ""}</td>
                      <td style={styles.tdBold}>{po.vendor?.name}</td>
                      <td style={styles.td}>{po.items?.length || 0} items</td>
                      <td style={styles.tdAmount}>₹{Number(po.totalAmount || 0).toFixed(2)}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor:
                              po.status === "COMPLETED" || po.status === "RECEIVED"
                                ? "#f0fdf4"
                                : po.status === "DRAFT"
                                ? "#eff6ff"
                                : "#fef2f2",
                            color:
                              po.status === "COMPLETED" || po.status === "RECEIVED"
                                ? "#16a34a"
                                : po.status === "DRAFT"
                                ? "#2563eb"
                                : "#dc2626",
                          }}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td style={styles.tdRight}>
                        {po.status !== "COMPLETED" && po.status !== "CANCELLED" && (
                          <button
                            onClick={() => handleReceiveGoods(po.id)}
                            disabled={receivingPoId === po.id}
                            style={styles.receiveBtn}
                          >
                            {receivingPoId === po.id ? "Receiving…" : "Receive GRN"}
                          </button>
                        )}
                        {po.status === "DRAFT" && (
                          <button onClick={() => handleCancelPo(po.id)} style={styles.cancelActionBtn}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Create New Purchase Order</h3>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
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

              {/* Items Section */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={styles.inputLabel}>Order Items</label>
                  <button
                    onClick={() =>
                      setModalLines([
                        ...modalLines,
                        { ingredientId: ingredients[0]?.id || "", quantity: 10, unitPrice: 50 },
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
                          if (found) updated[idx].unitPrice = found.unitCost || 50;
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
                        placeholder="Unit Price (₹)"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const updated = [...modalLines];
                          updated[idx].unitPrice = parseFloat(e.target.value) || 0;
                          setModalLines(updated);
                        }}
                        style={styles.costBox}
                      />

                      <span style={styles.lineTotal}>
                        ₹{(line.quantity * line.unitPrice).toFixed(2)}
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
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleCreatePo} disabled={submitting} style={styles.confirmBtn}>
                {submitting ? "Creating PO..." : "Issue Purchase Order"}
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
  tdPoNum: {
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
  receiveBtn: {
    padding: "5px 12px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#16a34a",
    color: "#ffffff",
    fontSize: "0.78rem",
    fontWeight: 700,
    cursor: "pointer",
    marginRight: 6,
  },
  cancelActionBtn: {
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid #fecaca",
    backgroundColor: "#ffffff",
    color: "#dc2626",
    fontSize: "0.78rem",
    fontWeight: 600,
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
    width: 650,
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
  inputLabel: {
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
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
};
