import React, { useState } from "react";

interface CartItem {
  cartItemId: string;
  item: { name: string; priceMinor: number };
  quantity: number;
  itemTotalMinor: number;
}

interface BillSplitModalProps {
  cart: CartItem[];
  totalMinor: number;
  onClose: () => void;
  onConfirmSplit: (splitDetails: any) => void;
}

export default function BillSplitModal({
  cart,
  totalMinor,
  onClose,
  onConfirmSplit,
}: BillSplitModalProps) {
  const [splitType, setSplitType] = useState<"EQUAL" | "BY_ITEM">("EQUAL");
  const [numGuests, setNumGuests] = useState(2);

  const perGuestMinor = Math.floor(totalMinor / (numGuests || 1));

  return (
    <div className="split-modal-backdrop" onClick={onClose}>
      <div className="split-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="split-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.25rem", color: "#2563eb" }}>✂️</span>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Split Bill</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
          <button
            type="button"
            className={`tab-pill ${splitType === "EQUAL" ? "active" : ""}`}
            onClick={() => setSplitType("EQUAL")}
          >
            Equal Split
          </button>
          <button
            type="button"
            className={`tab-pill ${splitType === "BY_ITEM" ? "active" : ""}`}
            onClick={() => setSplitType("BY_ITEM")}
          >
            Split By Items
          </button>
        </div>

        {splitType === "EQUAL" ? (
          <div style={{ marginTop: "16px" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
              Number of Guests / Payers:
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setNumGuests(Math.max(2, numGuests - 1))}
              >
                -
              </button>
              <span style={{ fontSize: "1.2rem", fontWeight: 800, minWidth: "30px", textAlign: "center" }}>
                {numGuests}
              </span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setNumGuests(numGuests + 1)}
              >
                +
              </button>
            </div>

            <div style={{ marginTop: "16px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#64748b" }}>
                <span>Total Bill:</span>
                <span>₹{(totalMinor / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 800, color: "#16a34a", marginTop: "8px" }}>
                <span>Amount Per Guest:</span>
                <span>₹{(perGuestMinor / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: "16px", maxHeight: "220px", overflowY: "auto" }}>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0 0 8px 0" }}>
              Select item allocation for individual receipts:
            </p>
            {cart.map((item) => (
              <div key={item.cartItemId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.8125rem" }}>
                <span>{item.quantity}x {item.item.name}</span>
                <span style={{ fontWeight: 600 }}>₹{(item.itemTotalMinor / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "24px" }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              onConfirmSplit({ splitType, numGuests, perGuestMinor });
              onClose();
            }}
          >
            Apply Split
          </button>
        </div>
      </div>

      <style jsx>{`
        .split-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.5);
          z-index: 150;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .split-modal-card {
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          width: 90%;
          max-width: 440px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .split-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
        }
        .tab-pill {
          flex: 1;
          padding: 8px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
        .tab-pill.active {
          background: #2563eb;
          color: #fff;
          border-color: #2563eb;
        }
        .qty-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-secondary {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-primary {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
