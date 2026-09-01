import React, { useState, useEffect } from "react";
import { posAudio } from "../lib/posAudio";

export interface HeldOrderData {
  id: string;
  tableNumber: string;
  orderType: string;
  itemCount: number;
  totalMinor: number;
  heldAt: string;
  customerPhone?: string | null;
  customerName?: string | null;
  cart: any[];
}

interface HeldOrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRecallOrder: (heldOrder: HeldOrderData) => void;
}

export default function HeldOrdersDrawer({
  isOpen,
  onClose,
  onRecallOrder,
}: HeldOrdersDrawerProps) {
  const [heldOrders, setHeldOrders] = useState<HeldOrderData[]>([]);

  const loadHeldOrders = () => {
    try {
      const stored = localStorage.getItem("kapmeta_held_orders");
      if (stored) {
        setHeldOrders(JSON.parse(stored));
      } else {
        setHeldOrders([]);
      }
    } catch {
      setHeldOrders([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHeldOrders();
    }
  }, [isOpen]);

  const handleDiscard = (id: string) => {
    if (!confirm("Are you sure you want to discard this held cart?")) return;
    try {
      const updated = heldOrders.filter((o) => o.id !== id);
      localStorage.setItem("kapmeta_held_orders", JSON.stringify(updated));
      setHeldOrders(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecall = (order: HeldOrderData) => {
    try {
      const updated = heldOrders.filter((o) => o.id !== order.id);
      localStorage.setItem("kapmeta_held_orders", JSON.stringify(updated));
      setHeldOrders(updated);
      posAudio.playItemAdd();
      onRecallOrder(order);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  const getElapsedTime = (isoStr: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const mins = Math.floor(diffSec / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    } catch {
      return "Recently";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="held-drawer-backdrop" onClick={onClose}>
      <div className="held-drawer-card" onClick={(e) => e.stopPropagation()}>
        <div className="held-drawer-header">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "1.4rem" }}>⏸️</span>
            <div>
              <h3>Parked / Held Orders</h3>
              <p>{heldOrders.length} cart{heldOrders.length === 1 ? "" : "s"} currently on hold</p>
            </div>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose}>✕</button>
        </div>

        <div className="held-orders-list">
          {heldOrders.length === 0 ? (
            <div className="held-empty-state">
              <span style={{ fontSize: "2.5rem" }}>🛒</span>
              <h4>No Held Orders</h4>
              <p>Press <strong>F2</strong> or click <strong>Hold</strong> in the billing cart to park orders for customers who step aside.</p>
            </div>
          ) : (
            heldOrders.map((order) => (
              <div key={order.id} className="held-order-item-card">
                <div className="held-card-top">
                  <div className="held-table-badge">
                    <span className="tbl-icon">🪑</span>
                    <strong className="tbl-title">{order.tableNumber || "Quick Bill"}</strong>
                    <span className="order-type-chip">{order.orderType}</span>
                  </div>
                  <span className="held-time-badge">⏱ {getElapsedTime(order.heldAt)}</span>
                </div>

                <div className="held-card-body">
                  <div className="held-item-preview">
                    <span>Items ({order.itemCount}):</span>
                    <strong className="items-summary-text">
                      {order.cart.map((c: any) => `${c.quantity}x ${c.item?.name || "Item"}`).slice(0, 3).join(", ")}
                      {order.cart.length > 3 ? ` +${order.cart.length - 3} more` : ""}
                    </strong>
                  </div>
                  <div className="held-amount-preview">
                    <span>Total Amount:</span>
                    <strong className="amount-num">₹{(order.totalMinor / 100).toFixed(2)}</strong>
                  </div>
                </div>

                <div className="held-card-actions">
                  <button
                    type="button"
                    className="btn-discard-held"
                    onClick={() => handleDiscard(order.id)}
                  >
                    🗑 Discard
                  </button>
                  <button
                    type="button"
                    className="btn-recall-held"
                    onClick={() => handleRecall(order)}
                  >
                    ▶ Recall to Register
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="held-drawer-footer">
          <span className="shortcut-hint">Tip: Press <strong>F3</strong> anytime in POS to open parked bills.</span>
          <button type="button" className="btn-close-modal" onClick={onClose}>Close</button>
        </div>
      </div>

      <style jsx>{`
        .held-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          z-index: 100000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.15s ease-out;
        }
        .held-drawer-card {
          width: 480px;
          max-width: 95vw;
          height: 100vh;
          background: #ffffff;
          box-shadow: -10px 0 25px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .held-drawer-header {
          padding: 18px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .held-drawer-header h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          color: #0f172a;
        }
        .held-drawer-header p {
          margin: 2px 0 0;
          font-size: 0.75rem;
          color: #64748b;
        }
        .btn-close-drawer {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .btn-close-drawer:hover {
          color: #0f172a;
          background: #e2e8f0;
        }
        .held-orders-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .held-empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #64748b;
        }
        .held-empty-state h4 {
          margin: 12px 0 6px;
          font-size: 1rem;
          color: #1e293b;
        }
        .held-empty-state p {
          font-size: 0.8rem;
          max-width: 300px;
          margin: 0 auto;
          line-height: 1.4;
        }
        .held-order-item-card {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 14px 16px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color 0.15s;
        }
        .held-order-item-card:hover {
          border-color: #94a3b8;
        }
        .held-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .held-table-badge {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tbl-title {
          font-size: 0.95rem;
          color: #0f172a;
        }
        .order-type-chip {
          font-size: 0.68rem;
          background: #f1f5f9;
          color: #475569;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 700;
        }
        .held-time-badge {
          font-size: 0.72rem;
          color: #64748b;
          font-weight: 600;
        }
        .held-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #f8fafc;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 0.78rem;
        }
        .held-item-preview, .held-amount-preview {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .items-summary-text {
          color: #334155;
          font-size: 0.75rem;
          text-align: right;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .amount-num {
          font-size: 0.95rem;
          color: #047857;
        }
        .held-card-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .btn-discard-held {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-discard-held:hover {
          background: #fee2e2;
        }
        .btn-recall-held {
          background: #10b981;
          color: #ffffff;
          border: none;
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }
        .btn-recall-held:hover {
          background: #059669;
        }
        .held-drawer-footer {
          padding: 14px 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .shortcut-hint {
          font-size: 0.72rem;
          color: #64748b;
        }
        .btn-close-modal {
          background: #e2e8f0;
          border: none;
          color: #334155;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
