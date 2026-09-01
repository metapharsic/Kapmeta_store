import React, { useState } from "react";

interface PosDiscountModalProps {
  isOpen: boolean;
  subtotalMinor: number;
  currentDiscountMinor: number;
  onClose: () => void;
  onApplyDiscount: (discountMinor: number, reason: string) => void;
  onRemoveDiscount: () => void;
}

export default function PosDiscountModal({
  isOpen,
  subtotalMinor,
  currentDiscountMinor,
  onClose,
  onApplyDiscount,
  onRemoveDiscount,
}: PosDiscountModalProps) {
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [percentVal, setPercentVal] = useState<number>(10);
  const [flatRupees, setFlatRupees] = useState<number>(50);
  const [reason, setReason] = useState<string>("Manager Courtesy");

  if (!isOpen) return null;

  const calculatedDiscountMinor =
    discountType === "PERCENT"
      ? Math.round(subtotalMinor * (percentVal / 100))
      : Math.min(subtotalMinor, Math.round(flatRupees * 100));

  const postDiscountSubtotal = Math.max(0, subtotalMinor - calculatedDiscountMinor);
  const postDiscountTax = Math.round(postDiscountSubtotal * 0.05);
  const finalPayable = postDiscountSubtotal + postDiscountTax;

  const handleApply = () => {
    onApplyDiscount(calculatedDiscountMinor, reason);
    onClose();
  };

  return (
    <div className="discount-modal-backdrop" onClick={onClose}>
      <div className="discount-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="discount-modal-header">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "1.3rem" }}>🏷️</span>
            <div>
              <h3>Order Discount & Promotion</h3>
              <p>Apply manager courtesy or promotional markdown to active bill</p>
            </div>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div className="discount-modal-body">
          {/* Discount Type Toggle */}
          <div className="type-toggle-row">
            <button
              type="button"
              className={`type-btn ${discountType === "PERCENT" ? "active" : ""}`}
              onClick={() => setDiscountType("PERCENT")}
            >
              Percentage (%)
            </button>
            <button
              type="button"
              className={`type-btn ${discountType === "FLAT" ? "active" : ""}`}
              onClick={() => setDiscountType("FLAT")}
            >
              Flat Rupee Amount (₹)
            </button>
          </div>

          {/* Quick Preset Chips */}
          {discountType === "PERCENT" ? (
            <div className="preset-chips-group">
              <label>Preset Percentages:</label>
              <div className="chips-row">
                {[5, 10, 15, 20, 25, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`chip-btn ${percentVal === pct ? "selected" : ""}`}
                    onClick={() => setPercentVal(pct)}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="custom-input-box">
                <span>Custom Percentage:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={percentVal}
                  onChange={(e) => setPercentVal(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
                <span>%</span>
              </div>
            </div>
          ) : (
            <div className="preset-chips-group">
              <label>Preset Rupee Deductions:</label>
              <div className="chips-row">
                {[20, 50, 100, 200, 500].map((rs) => (
                  <button
                    key={rs}
                    type="button"
                    className={`chip-btn ${flatRupees === rs ? "selected" : ""}`}
                    onClick={() => setFlatRupees(rs)}
                  >
                    ₹{rs}
                  </button>
                ))}
              </div>
              <div className="custom-input-box">
                <span>Custom Rupee Discount:</span>
                <span>₹</span>
                <input
                  type="number"
                  min="1"
                  value={flatRupees}
                  onChange={(e) => setFlatRupees(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>
          )}

          {/* Reason Selection */}
          <div className="reason-group">
            <label>Reason for Markdown *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="Manager Courtesy">Manager Courtesy</option>
              <option value="Happy Hours Promo">Happy Hours Promo</option>
              <option value="Customer Goodwill / Delay">Customer Goodwill / Food Delay</option>
              <option value="Staff Meal Discount">Staff Meal Discount</option>
              <option value="VIP Regular Guest">VIP Regular Guest</option>
              <option value="Corporate / Event Tie-up">Corporate / Event Tie-up</option>
            </select>
          </div>

          {/* Real-time Calculation Breakdown Preview */}
          <div className="calc-breakdown-card">
            <div className="breakdown-row">
              <span>Original Subtotal:</span>
              <strong>₹{(subtotalMinor / 100).toFixed(2)}</strong>
            </div>
            <div className="breakdown-row discount-row">
              <span>Discount Deduction:</span>
              <strong className="text-emerald-600">-₹{(calculatedDiscountMinor / 100).toFixed(2)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Net Taxable:</span>
              <span>₹{(postDiscountSubtotal / 100).toFixed(2)}</span>
            </div>
            <div className="breakdown-row">
              <span>GST (5%):</span>
              <span>₹{(postDiscountTax / 100).toFixed(2)}</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-row total-row">
              <strong>Final Net Payable:</strong>
              <strong className="final-total">₹{(finalPayable / 100).toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="discount-modal-footer">
          {currentDiscountMinor > 0 && (
            <button
              type="button"
              className="btn-remove-discount"
              onClick={() => {
                onRemoveDiscount();
                onClose();
              }}
            >
              Remove Discount
            </button>
          )}
          <div className="footer-right-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-apply-discount" onClick={handleApply}>
              Apply Discount (-₹{(calculatedDiscountMinor / 100).toFixed(2)})
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .discount-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100001;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease-out;
        }
        .discount-modal-card {
          width: 480px;
          max-width: 92vw;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .discount-modal-header {
          padding: 16px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .discount-modal-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: #0f172a;
        }
        .discount-modal-header p {
          margin: 2px 0 0;
          font-size: 0.72rem;
          color: #64748b;
        }
        .btn-close-modal {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 1.2rem;
          cursor: pointer;
        }
        .discount-modal-body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .type-toggle-row {
          display: flex;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          background: #f1f5f9;
        }
        .type-btn {
          flex: 1;
          padding: 8px 0;
          border: none;
          background: transparent;
          font-size: 0.82rem;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
        }
        .type-btn.active {
          background: #2563eb;
          color: #ffffff;
        }
        .preset-chips-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .preset-chips-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
        }
        .chips-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chip-btn {
          padding: 6px 14px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.12s;
        }
        .chip-btn:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }
        .chip-btn.selected {
          background: #10b981;
          color: #ffffff;
          border-color: #10b981;
        }
        .custom-input-box {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-size: 0.8rem;
          color: #475569;
        }
        .custom-input-box input {
          width: 80px;
          padding: 5px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .reason-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .reason-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
        }
        .reason-group select {
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.82rem;
          background: #ffffff;
        }
        .calc-breakdown-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8rem;
        }
        .breakdown-row {
          display: flex;
          justify-content: space-between;
          color: #475569;
        }
        .breakdown-row.discount-row {
          color: #059669;
          font-weight: 700;
        }
        .breakdown-divider {
          height: 1px;
          background: #cbd5e1;
          margin: 6px 0;
        }
        .total-row {
          font-size: 0.95rem;
          color: #0f172a;
        }
        .final-total {
          color: #047857;
          font-size: 1.1rem;
        }
        .discount-modal-footer {
          padding: 14px 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .btn-remove-discount {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .footer-right-actions {
          display: flex;
          gap: 10px;
          margin-left: auto;
        }
        .btn-cancel {
          background: #f1f5f9;
          border: none;
          color: #475569;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-apply-discount {
          background: #10b981;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
        }
        .btn-apply-discount:hover {
          background: #059669;
        }
      `}</style>
    </div>
  );
}
