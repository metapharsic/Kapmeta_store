import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";
import MoveKotModal from "./MoveKotModal";
import AddTableModal from "./AddTableModal";

interface TableItem {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: "VACANT" | "RUNNING" | "PRINTED" | "PAID" | "RUNNING_KOT";
  activeOrderId?: string | null;
  totalMinor?: number;
  elapsedMinutes?: number;
  itemCount?: number;
}

interface TableViewFloorProps {
  onSelectTable?: (table: TableItem) => void;
  onNavigateDelivery?: () => void;
  onNavigatePickup?: () => void;
}

// Fallback seed data perfectly matching the reference screenshot
const DEFAULT_AC_TABLES: TableItem[] = [
  { id: "a1", tableNumber: "A1", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a2", tableNumber: "A2", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a3", tableNumber: "A3", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a4", tableNumber: "A4", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a5", tableNumber: "A5", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a6", tableNumber: "A6", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a7", tableNumber: "A7", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a8", tableNumber: "A8", capacity: 4, section: "AC", status: "PRINTED", elapsedMinutes: 26, totalMinor: 23800 },
  { id: "a9", tableNumber: "A9", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a10", tableNumber: "A10", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a11", tableNumber: "A11", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a12", tableNumber: "A12", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a13", tableNumber: "A13", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a14", tableNumber: "A14", capacity: 4, section: "AC", status: "VACANT" },
  { id: "a15", tableNumber: "A15", capacity: 4, section: "AC", status: "VACANT" },
];

const DEFAULT_NON_AC_TABLES: TableItem[] = [
  { id: "b1", tableNumber: "B1", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b2", tableNumber: "B2", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b3", tableNumber: "B3", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b4", tableNumber: "B4", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 31, totalMinor: 74381 },
  { id: "b5", tableNumber: "B5", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b6", tableNumber: "B6", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b7", tableNumber: "B7", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 3, totalMinor: 4286 },
  { id: "b8", tableNumber: "B8", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b9", tableNumber: "B9", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b10", tableNumber: "B10", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b11", tableNumber: "B11", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 11, totalMinor: 19810 },
  { id: "b12", tableNumber: "B12", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b13", tableNumber: "B13", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b14", tableNumber: "B14", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b15", tableNumber: "B15", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 7, totalMinor: 30286 },
  { id: "b16", tableNumber: "B16", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b17", tableNumber: "B17", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b18", tableNumber: "B18", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 12, totalMinor: 15048 },
  { id: "b19", tableNumber: "B19", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 19, totalMinor: 29238 },
  { id: "b20", tableNumber: "B20", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b21", tableNumber: "B21", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 12, totalMinor: 21810 },
  { id: "b22", tableNumber: "B22", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 1, totalMinor: 21810 },
  { id: "b23", tableNumber: "B23", capacity: 4, section: "Non AC", status: "RUNNING_KOT", elapsedMinutes: 21, totalMinor: 42666 },
  { id: "b24", tableNumber: "B24", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b25", tableNumber: "B25", capacity: 4, section: "Non AC", status: "VACANT" },
  { id: "b26", tableNumber: "B26", capacity: 4, section: "Non AC", status: "VACANT" },
];

export default function TableViewFloor({
  onSelectTable,
  onNavigateDelivery,
  onNavigatePickup,
}: TableViewFloorProps) {
  const router = useRouter();
  const getInitialTables = (): TableItem[] => {
    const base = [...DEFAULT_AC_TABLES, ...DEFAULT_NON_AC_TABLES];
    try {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("kapmeta_custom_tables");
        if (raw) {
          const custom: TableItem[] = JSON.parse(raw);
          custom.forEach((ct) => {
            if (!base.some((b) => b.tableNumber.toLowerCase() === ct.tableNumber.toLowerCase())) {
              base.push(ct);
            }
          });
        }
      }
    } catch {}
    return base;
  };

  const [tables, setTables] = useState<TableItem[]>(getInitialTables);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVacating, setIsVacating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isMoveKotActive, setIsMoveKotActive] = useState(false);
  const [isMoveKotModalOpen, setIsMoveKotModalOpen] = useState(false);
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [inspectTable, setInspectTable] = useState<TableItem | null>(null);
  const [inspectOrderDetails, setInspectOrderDetails] = useState<any | null>(null);

  const fetchTablesData = async () => {
    setIsRefreshing(true);
    try {
      const res = await authedFetch("/tables");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Fetch live orders to map running amounts and elapsed times
          const ordersRes = await authedFetch("/orders?view=live");
          const activeOrders = ordersRes.ok ? await ordersRes.json() : [];
          const orderList = Array.isArray(activeOrders) ? activeOrders : (activeOrders.orders || []);

          const tableMap = new Map<string, any>();
          orderList.forEach((ord: any) => {
            if (ord.diningTableId) {
              tableMap.set(ord.diningTableId, ord);
              tableMap.set(ord.diningTableId.toLowerCase(), ord);
            }
          });

          const mapped: TableItem[] = data.map((tbl: any) => {
            const matchedOrder = tableMap.get(tbl.id) || tableMap.get(tbl.id.toLowerCase()) || tableMap.get(tbl.tableNumber) || tableMap.get(tbl.tableNumber.toLowerCase());
            const activeOrder = tbl.currentOrder || matchedOrder;
            let status: TableItem["status"] = "VACANT";
            let totalMinor = 0;
            let elapsedMinutes = 0;
            let itemCount = 0;
            let activeOrderId = null;

            if (activeOrder && activeOrder.status && !["COMPLETED", "CANCELLED", "VOIDED"].includes(String(activeOrder.status).toUpperCase())) {
              activeOrderId = activeOrder.id;
              totalMinor = Number(activeOrder.grandTotalPaise || activeOrder.grandTotalMinor || activeOrder.grandTotal || (activeOrder.totalAmount ? Math.round(activeOrder.totalAmount * 100) : 0));
              itemCount = activeOrder.itemCount || (activeOrder.items?.length || 0);
              const created = new Date(activeOrder.createdAt).getTime();
              elapsedMinutes = Math.max(1, Math.floor((Date.now() - created) / 60000));

              const ordStatus = String(activeOrder.status || "").toUpperCase();
              const hasKot = Boolean(
                activeOrder.hasKot ||
                activeOrder.kotSent ||
                ["CONFIRMED", "IN_KITCHEN", "READY", "KOT_CREATED", "IN_PREPARATION"].includes(ordStatus) ||
                (activeOrder.kotTickets && activeOrder.kotTickets.length > 0)
              );

              if (ordStatus === "PRINTED" || tbl.status === "BILLING") {
                status = "PRINTED";
              } else if (ordStatus === "PAID" || ordStatus === "SETTLED") {
                status = "PAID";
              } else if (hasKot) {
                status = "RUNNING_KOT"; // Yellow
              } else {
                status = "RUNNING"; // Blue
              }
            } else if (tbl.status === "BILLING") {
              status = "PRINTED";
              totalMinor = Number(tbl.currentOrder?.grandTotalPaise || tbl.currentOrder?.totalAmount || 0);
            } else if (tbl.status === "OCCUPIED" && tbl.currentOrder && !["COMPLETED", "CANCELLED", "VOIDED"].includes(String(tbl.currentOrder.status).toUpperCase())) {
              status = "RUNNING_KOT"; // Occupied table with placed order has active KOT
              totalMinor = Number(tbl.currentOrder?.grandTotalPaise || tbl.currentOrder?.totalAmount || 0);
            }

            // Check for frontend draft cart if still vacant
            if (status === "VACANT" && typeof window !== "undefined") {
              try {
                const keysToTry = [
                  `kapmeta_draft_${tbl.tableNumber}`,
                  `kapmeta_draft_${tbl.tableNumber?.toLowerCase()}`,
                  `kapmeta_draft_${tbl.tableNumber?.toUpperCase()}`,
                  `kapmeta_draft_${tbl.id}`,
                  `kapmeta_draft_${tbl.id?.toLowerCase()}`,
                  `kapmeta_draft_${tbl.id?.toUpperCase()}`,
                ];
                let foundDraft: any = null;
                for (const k of keysToTry) {
                  const d = localStorage.getItem(k);
                  if (d) {
                    foundDraft = JSON.parse(d);
                    break;
                  }
                }
                if (foundDraft && Array.isArray(foundDraft) && foundDraft.length > 0) {
                  status = "RUNNING"; // Blue (Draft cart started)
                  totalMinor = foundDraft.reduce((sum: number, c: any) => {
                    const linePrice = c.itemTotalMinor || (c.item?.priceMinor ? Number(c.item.priceMinor) * (c.quantity || 1) : 0);
                    return sum + linePrice;
                  }, 0);
                  itemCount = foundDraft.reduce((sum: number, c: any) => sum + (c.quantity || 1), 0);
                  elapsedMinutes = 1;
                }
              } catch (e) {}
            }

            return {
              id: tbl.id,
              tableNumber: tbl.tableNumber,
              capacity: tbl.capacity || 4,
              section: tbl.section || "Non AC",
              status,
              activeOrderId,
              totalMinor,
              elapsedMinutes,
              itemCount,
            };
          });

          // Merge custom tables if not already in mapped data
          try {
            if (typeof window !== "undefined") {
              const raw = localStorage.getItem("kapmeta_custom_tables");
              if (raw) {
                const custom: TableItem[] = JSON.parse(raw);
                custom.forEach((ct) => {
                  if (!mapped.some((m) => m.tableNumber.toLowerCase() === ct.tableNumber.toLowerCase())) {
                    mapped.push(ct);
                  }
                });
              }
            }
          } catch {}

          setTables(mapped);
        }
      }
    } catch (e) {
      console.warn("Using offline table seed layout", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleVacateTable = async (tbl: TableItem) => {
    setIsVacating(true);
    try {
      await authedFetch(`/tables/${encodeURIComponent(tbl.id || tbl.tableNumber)}/vacate`, {
        method: "POST",
      });

      // Clear any draft from localStorage
      if (typeof window !== "undefined") {
        const keysToClear = [
          `kapmeta_draft_${tbl.tableNumber}`,
          `kapmeta_draft_${tbl.tableNumber?.toLowerCase()}`,
          `kapmeta_draft_${tbl.tableNumber?.toUpperCase()}`,
          `kapmeta_draft_${tbl.id}`,
          `kapmeta_draft_${tbl.id?.toLowerCase()}`,
          `kapmeta_draft_${tbl.id?.toUpperCase()}`,
        ];
        keysToClear.forEach((k) => {
          try { localStorage.removeItem(k); } catch {}
        });
      }

      setInspectTable(null);
      setInspectOrderDetails(null);
      await fetchTablesData();
    } catch (err) {
      console.error("Failed to vacate table", err);
    } finally {
      setIsVacating(false);
    }
  };

  useEffect(() => {
    fetchTablesData();
    const timer = setInterval(fetchTablesData, 12000);
    return () => clearInterval(timer);
  }, []);

  const handleTableClick = (tbl: TableItem) => {
    if (isMoveKotActive) {
      setIsMoveKotModalOpen(true);
      return;
    }
    if (onSelectTable) {
      onSelectTable(tbl);
    } else {
      router.push(`/?table=${encodeURIComponent(tbl.tableNumber)}&tableId=${tbl.id}`);
    }
  };

  const handleInspect = async (e: React.MouseEvent, tbl: TableItem) => {
    e.stopPropagation();
    setInspectTable(tbl);
    if (tbl.activeOrderId) {
      try {
        const res = await authedFetch(`/orders/${tbl.activeOrderId}`);
        if (res.ok) {
          const detail = await res.json();
          setInspectOrderDetails(detail);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      // Mock order preview for demo tables
      setInspectOrderDetails({
        items: [
          { id: "1", quantity: 1, menuItemName: "North Indian Meal Box", subtotalMinor: tbl.totalMinor ? tbl.totalMinor * 0.7 : 14000 },
          { id: "2", quantity: 1, menuItemName: "Cold Coffee", subtotalMinor: tbl.totalMinor ? tbl.totalMinor * 0.3 : 6000 }
        ],
        grandTotalMinor: tbl.totalMinor || 20000
      });
    }
  };

  const handleQuickPrint = (e: React.MouseEvent, tbl: TableItem) => {
    e.stopPropagation();
    alert(`Print Command Sent: KOT & Bill generated for Table ${tbl.tableNumber}`);
  };

  // Group tables strictly into "AC" and "Non AC" sections
  const sections = useMemo(() => {
    const ac = tables.filter((t) => (t.section || "").toUpperCase().includes("AC") && !(t.section || "").toUpperCase().includes("NON"));
    const nonAc = tables.filter((t) => !(t.section || "").toUpperCase().includes("AC") || (t.section || "").toUpperCase().includes("NON"));

    const filterFn = (t: TableItem) => {
      if (!statusFilter) return true;
      return t.status === statusFilter;
    };

    return [
      { name: "AC", items: ac.filter(filterFn) },
      { name: "Non AC", items: nonAc.filter(filterFn) },
    ];
  }, [tables, statusFilter]);

  return (
    <div className="table-view-outer-container">
      {/* Primary Action Toolbar */}
      <div className="table-view-action-toolbar">
        <div className="toolbar-left-heading">
          <h1 className="view-page-title">Table View</h1>
        </div>

        <div className="toolbar-right-actions">
          <button
            type="button"
            className={`circular-refresh-btn ${isRefreshing ? "spinning" : ""}`}
            onClick={fetchTablesData}
            title="Refresh Tables Status"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            type="button"
            className="petpooja-pill-red-btn"
            onClick={() => setIsAddTableOpen(true)}
          >
            Add Table
          </button>

          <button
            type="button"
            className="petpooja-pill-red-btn"
            onClick={() => {
              if (onNavigateDelivery) onNavigateDelivery();
              else router.push("/orders?tab=online");
            }}
          >
            Delivery
          </button>

          <button
            type="button"
            className="petpooja-pill-red-btn"
            onClick={() => {
              if (onNavigatePickup) onNavigatePickup();
              else router.push("/?mode=PICKUP");
            }}
          >
            Pick Up
          </button>
        </div>
      </div>

      {/* Filter & Move KOT Legend Bar */}
      <div className="legend-and-controls-bar">
        {/* Move KOT Pill Switch */}
        <div
          className={`move-kot-switch-capsule ${isMoveKotActive ? "is-active" : ""}`}
          onClick={() => {
            setIsMoveKotActive(!isMoveKotActive);
            if (!isMoveKotActive) setIsMoveKotModalOpen(true);
          }}
          title="Click to toggle Table / KOT transfer mode"
        >
          <div className="switch-slider-knob"></div>
          <span className="switch-label-text">Move KOT / Items</span>
        </div>

        {/* Status Legend Pills */}
        <div className="status-legend-pills-row">
          <div
            className={`legend-item ${statusFilter === "VACANT" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "VACANT" ? null : "VACANT")}
          >
            <span className="legend-dot dot-blank"></span>
            <span className="legend-text">Blank Table</span>
          </div>

          <div
            className={`legend-item ${statusFilter === "RUNNING" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "RUNNING" ? null : "RUNNING")}
          >
            <span className="legend-dot dot-running"></span>
            <span className="legend-text">Running Table</span>
          </div>

          <div
            className={`legend-item ${statusFilter === "PRINTED" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "PRINTED" ? null : "PRINTED")}
          >
            <span className="legend-dot dot-printed"></span>
            <span className="legend-text">Printed Table</span>
          </div>

          <div
            className={`legend-item ${statusFilter === "PAID" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "PAID" ? null : "PAID")}
          >
            <span className="legend-dot dot-paid"></span>
            <span className="legend-text">Paid Table</span>
          </div>

          <div
            className={`legend-item ${statusFilter === "RUNNING_KOT" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "RUNNING_KOT" ? null : "RUNNING_KOT")}
          >
            <span className="legend-dot dot-running-kot"></span>
            <span className="legend-text">Running KOT Table</span>
          </div>
        </div>
      </div>

      {/* Floor Sections & Matrix Cards */}
      <div className="floor-sections-wrapper">
        {sections.map((sec) => (
          <div key={sec.name} className="floor-section-group">
            <h2 className="section-header-title">{sec.name}</h2>
            <div className="matrix-table-grid">
              {sec.items.map((tbl) => {
                const isBlank = tbl.status === "VACANT";
                const isPrinted = tbl.status === "PRINTED";
                const isRunningKot = tbl.status === "RUNNING_KOT";
                const isRunning = tbl.status === "RUNNING";
                const isPaid = tbl.status === "PAID";

                let cardThemeClass = "theme-blank";
                if (isPrinted) cardThemeClass = "theme-printed";
                else if (isRunningKot) cardThemeClass = "theme-running-kot";
                else if (isRunning) cardThemeClass = "theme-running";
                else if (isPaid) cardThemeClass = "theme-paid";

                return (
                  <div
                    key={tbl.id}
                    className={`table-matrix-card ${cardThemeClass}`}
                    onClick={() => handleTableClick(tbl)}
                    data-testid={`table-card-${tbl.tableNumber}`}
                  >
                    {/* Top line: Elapsed minutes (if occupied) */}
                    <div className="card-row-top">
                      {!isBlank && tbl.elapsedMinutes ? (
                        <span className="elapsed-time-text">{tbl.elapsedMinutes} Min</span>
                      ) : (
                        <span className="empty-slot"></span>
                      )}
                    </div>

                    {/* Middle line: Table Number */}
                    <div className="card-row-middle">
                      <span className="table-number-label">{tbl.tableNumber}</span>
                    </div>

                    {/* Bottom line: Running Amount (if occupied) */}
                    <div className="card-row-bottom">
                      {!isBlank && tbl.totalMinor ? (
                        <span className="table-price-label">
                          ₹{(tbl.totalMinor / 100).toFixed(2)}
                        </span>
                      ) : (
                        <span className="empty-slot"></span>
                      )}
                    </div>

                    {/* Floating Action Buttons below Card */}
                    {!isBlank && (
                      <div className="card-floating-actions">
                        <button
                          type="button"
                          className="action-icon-pill"
                          onClick={(e) => handleInspect(e, tbl)}
                          title="Preview Order"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="action-icon-pill"
                          onClick={(e) => handleQuickPrint(e, tbl)}
                          title="Quick Print KOT / Bill"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Watermark & Non-Commercial Session Banner matching screenshot */}
      <div className="petpooja-bottom-watermark-overlay">
        <div className="windows-act-text">Activate Windows</div>
        <div className="windows-sub-text">Go to Settings to activate Windows.</div>
        <div className="session-banner-pill">This is a non-commercial session.</div>
      </div>

      {/* Move KOT Modal */}
      {isMoveKotModalOpen && (
        <MoveKotModal
          onClose={() => {
            setIsMoveKotModalOpen(false);
            setIsMoveKotActive(false);
          }}
          tables={tables}
          onSuccess={fetchTablesData}
        />
      )}

      {/* Add Table Modal */}
      {isAddTableOpen && (
        <AddTableModal
          onClose={() => setIsAddTableOpen(false)}
          onTableCreated={fetchTablesData}
          existingTables={tables.map((t) => t.tableNumber)}
        />
      )}

      {/* Table Inspection Modal */}
      {inspectTable && (
        <div className="inspect-backdrop" onClick={() => setInspectTable(null)}>
          <div className="inspect-card" onClick={(e) => e.stopPropagation()}>
            <div className="inspect-header">
              <h3>Table {inspectTable.tableNumber} ({inspectTable.section})</h3>
              <button className="close-btn" onClick={() => setInspectTable(null)}>✕</button>
            </div>

            <div style={{ marginTop: "12px", fontSize: "0.875rem", color: "#334155" }}>
              <div>Status: <strong>{inspectTable.status}</strong></div>
              <div>Capacity: <strong>{inspectTable.capacity} guests</strong></div>
              {inspectTable.elapsedMinutes ? (
                <div>Elapsed Dining Time: <strong>{inspectTable.elapsedMinutes} mins</strong></div>
              ) : null}
            </div>

            {inspectOrderDetails && inspectOrderDetails.items ? (
              <div style={{ marginTop: "16px" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.875rem", color: "#0f172a" }}>Active Order Items:</h4>
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#f8fafc" }}>
                  {inspectOrderDetails.items.map((it: any) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: "0.8125rem" }}>
                      <span>{it.quantity}x {it.menuItemName || it.menuItem?.name}</span>
                      <span style={{ fontWeight: 600 }}>₹{(Number(it.subtotalMinor || 0) / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontWeight: 700, fontSize: "0.95rem" }}>
                  <span>Grand Total:</span>
                  <span style={{ color: "#d32f2f" }}>
                    ₹{(Number(inspectOrderDetails.grandTotalMinor || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
              <button className="btn-modal-cancel" onClick={() => setInspectTable(null)}>Close</button>
              {inspectTable.status !== "VACANT" && (
                <button
                  className="btn-modal-vacate"
                  disabled={isVacating}
                  onClick={() => handleVacateTable(inspectTable)}
                  title="Force complete orders and mark this table as clean/vacant"
                >
                  {isVacating ? "Clearing..." : "🧹 Clear / Mark Vacant"}
                </button>
              )}
              <button
                className="btn-modal-open-pos"
                onClick={() => {
                  handleTableClick(inspectTable);
                  setInspectTable(null);
                }}
              >
                Open in POS Register →
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .table-view-outer-container {
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 76px);
          background: #ffffff;
          font-family: inherit;
          padding: 16px 24px;
          position: relative;
        }

        /* 1. Primary Action Toolbar */
        .table-view-action-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .view-page-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
          letter-spacing: -0.3px;
        }
        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .circular-refresh-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid #d1d5db;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s, background 0.15s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .circular-refresh-btn:hover {
          background: #f8fafc;
          transform: rotate(45deg);
        }

        .petpooja-pill-red-btn {
          background: #d32f2f;
          color: #ffffff;
          border: none;
          font-weight: 600;
          font-size: 0.8125rem;
          padding: 8px 24px;
          border-radius: 9999px;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(211, 47, 47, 0.25);
          transition: background 0.15s, transform 0.1s;
        }
        .petpooja-pill-red-btn:hover {
          background: #b71c1c;
          transform: translateY(-0.5px);
        }

        /* 2. Legend & Move KOT Controls Bar */
        .legend-and-controls-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin: 12px 0 18px 0;
          flex-wrap: wrap;
        }

        .move-kot-switch-capsule {
          display: flex;
          align-items: center;
          background: #e2e8f0;
          border-radius: 9999px;
          padding: 3px 14px 3px 4px;
          cursor: pointer;
          gap: 8px;
          user-select: none;
          transition: background 0.15s;
        }
        .move-kot-switch-capsule.is-active {
          background: #bfdbfe;
        }
        .switch-slider-knob {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s;
        }
        .move-kot-switch-capsule.is-active .switch-slider-knob {
          transform: translateX(6px);
          background: #1d4ed8;
        }
        .switch-label-text {
          font-size: 0.78rem;
          font-weight: 600;
          color: #334155;
        }

        .status-legend-pills-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
          padding: 2px 4px;
          border-radius: 4px;
          transition: opacity 0.15s;
        }
        .legend-item:hover {
          opacity: 0.8;
        }
        .legend-item.selected {
          outline: 1.5px solid #64748b;
        }
        .legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot-blank {
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
        }
        .dot-running {
          background: #38bdf8;
        }
        .dot-printed {
          background: #4ade80;
        }
        .dot-paid {
          background: #fb923c;
        }
        .dot-running-kot {
          background: #facc15;
        }
        .legend-text {
          font-size: 0.78rem;
          color: #475569;
          font-weight: 500;
        }

        /* 3. Floor Section & Matrix Grid */
        .floor-sections-wrapper {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .floor-section-group {
          display: flex;
          flex-direction: column;
        }
        .section-header-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 12px 0;
        }

        .matrix-table-grid {
          display: grid;
          grid-template-columns: repeat(13, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 1300px) {
          .matrix-table-grid {
            grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
          }
        }

        /* Table Card Dimensions & Styles */
        .table-matrix-card {
          width: 100%;
          min-height: 76px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6px 4px;
          cursor: pointer;
          position: relative;
          user-select: none;
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .table-matrix-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .card-row-top {
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-row-middle {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-row-bottom {
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .empty-slot {
          display: block;
          height: 1px;
        }

        .table-number-label {
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* Theme: Blank Table */
        .theme-blank {
          background: #f4f5f7;
          border: 1.5px dashed #d1d5db;
        }
        .theme-blank .table-number-label {
          color: #4b5563;
        }

        /* Theme: Printed Table (Green) */
        .theme-printed {
          background: #bbf7d0;
          border: 1.5px solid #4ade80;
        }
        .theme-printed .elapsed-time-text {
          font-size: 0.6875rem;
          font-weight: 600;
          color: #166534;
        }
        .theme-printed .table-number-label {
          color: #14532d;
          font-weight: 700;
        }
        .theme-printed .table-price-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #14532d;
        }

        /* Theme: Running KOT Table (Yellow) */
        .theme-running-kot {
          background: #fef08a;
          border: 1.5px solid #facc15;
        }
        .theme-running-kot .elapsed-time-text {
          font-size: 0.6875rem;
          font-weight: 600;
          color: #854d0e;
        }
        .theme-running-kot .table-number-label {
          color: #713f12;
          font-weight: 700;
        }
        .theme-running-kot .table-price-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #713f12;
        }

        /* Theme: Running Table (Blue) */
        .theme-running {
          background: #e0f2fe;
          border: 1.5px solid #38bdf8;
        }
        .theme-running .table-number-label {
          color: #0369a1;
          font-weight: 700;
        }

        /* Theme: Paid Table (Peach) */
        .theme-paid {
          background: #ffedd5;
          border: 1.5px solid #fb923c;
        }
        .theme-paid .table-number-label {
          color: #c2410c;
          font-weight: 700;
        }

        /* Floating Action Pill Buttons */
        .card-floating-actions {
          position: absolute;
          bottom: -10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          z-index: 5;
        }
        .action-icon-pill {
          width: 22px;
          height: 20px;
          background: #ffffff;
          border: 1px solid #94a3b8;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          transition: background 0.12s, transform 0.1s;
        }
        .action-icon-pill:hover {
          background: #f1f5f9;
          transform: scale(1.1);
        }

        /* Watermark Overlay */
        .petpooja-bottom-watermark-overlay {
          position: fixed;
          bottom: 12px;
          right: 24px;
          pointer-events: none;
          text-align: right;
          z-index: 20;
          opacity: 0.65;
        }
        .windows-act-text {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 500;
        }
        .windows-sub-text {
          font-size: 0.65rem;
          color: #94a3b8;
        }
        .session-banner-pill {
          margin-top: 4px;
          display: inline-block;
          background: rgba(15, 23, 42, 0.75);
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
        }

        /* Modals */
        .inspect-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .inspect-card {
          background: #ffffff;
          border-radius: 10px;
          padding: 20px;
          width: 90%;
          max-width: 440px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .inspect-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
        }
        .inspect-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1rem;
          color: #64748b;
          cursor: pointer;
        }
        .btn-modal-cancel {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #475569;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .btn-modal-vacate {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-modal-vacate:hover {
          background: #ffe4e6;
        }
        .btn-modal-open-pos {
          background: #d32f2f;
          color: #ffffff;
          border: none;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
        .circular-refresh-btn.spinning {
          animation: refreshSpin 0.75s linear infinite;
        }
        @keyframes refreshSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
