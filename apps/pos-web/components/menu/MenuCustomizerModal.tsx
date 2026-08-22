import React, { useState } from "react";
import { MenuItemData } from "./AttractiveMenuItemCard";

export interface CustomizedItemSelection {
  portion: "REGULAR" | "HALF" | "FULL";
  portionMultiplier: number;
  spiceLevel: "MILD" | "MEDIUM" | "SPICY" | "EXTRA_HOT";
  addons: Array<{ name: string; priceMinor: number }>;
  specialInstructions: string;
  finalPriceMinor: number;
}

interface MenuCustomizerModalProps {
  isOpen: boolean;
  item: MenuItemData | null;
  onClose: () => void;
  onConfirm: (item: MenuItemData, customization: CustomizedItemSelection) => void;
}

export default function MenuCustomizerModal({
  isOpen,
  item,
  onClose,
  onConfirm,
}: MenuCustomizerModalProps) {
  const [portion, setPortion] = useState<"REGULAR" | "HALF" | "FULL">("REGULAR");
  const [spiceLevel, setSpiceLevel] = useState<"MILD" | "MEDIUM" | "SPICY" | "EXTRA_HOT">("MEDIUM");
  const [selectedAddons, setSelectedAddons] = useState<Array<{ name: string; priceMinor: number }>>([]);
  const [notes, setNotes] = useState("");

  if (!isOpen || !item) return null;

  const basePrice = Number(item.priceMinor);

  // Portion multiplier calculation
  const portionMultiplier = portion === "HALF" ? 0.65 : portion === "FULL" ? 1.4 : 1.0;
  const portionAdjustedBase = Math.round(basePrice * portionMultiplier);

  // Available addons
  const availableAddons = [
    { name: "Extra Pure Ghee", priceMinor: 2500 },
    { name: "Extra Amul Butter", priceMinor: 2000 },
    { name: "Extra Sambar Cup", priceMinor: 1500 },
    { name: "Grated Cheese Topping", priceMinor: 3000 },
    { name: "Jain Style (No Onion/Garlic)", priceMinor: 0 },
  ];

  const toggleAddon = (addon: { name: string; priceMinor: number }) => {
    setSelectedAddons((prev) => {
      const exists = prev.some((a) => a.name === addon.name);
      if (exists) return prev.filter((a) => a.name !== addon.name);
      return [...prev, addon];
    });
  };

  const addonsTotalMinor = selectedAddons.reduce((sum, a) => sum + a.priceMinor, 0);
  const finalPriceMinor = portionAdjustedBase + addonsTotalMinor;

  const handleApply = () => {
    onConfirm(item, {
      portion,
      portionMultiplier,
      spiceLevel,
      addons: selectedAddons,
      specialInstructions: notes,
      finalPriceMinor,
    });
    onClose();
  };

  return (
    <div className="customizer-backdrop" onClick={onClose}>
      <div className="customizer-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="customizer-header">
          <div className="title-group">
            <div className="item-badge-title">
              <span className={`fssai-indicator ${item.isVeg ? "veg" : "non-veg"}`}>●</span>
              <h3 className="item-name-heading">{item.name}</h3>
            </div>
            <span className="base-price-tag">Base: ₹{(basePrice / 100).toFixed(2)}</span>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="customizer-body-scroll">
          {/* 1. Portion Size */}
          <div className="customizer-section">
            <label className="section-label">1. Choose Portion Size</label>
            <div className="portion-grid">
              <button
                type="button"
                className={`portion-chip ${portion === "HALF" ? "active" : ""}`}
                onClick={() => setPortion("HALF")}
              >
                <span>Half Portion</span>
                <span className="portion-price">₹{((basePrice * 0.65) / 100).toFixed(0)}</span>
              </button>
              <button
                type="button"
                className={`portion-chip ${portion === "REGULAR" ? "active" : ""}`}
                onClick={() => setPortion("REGULAR")}
              >
                <span>Regular (Standard)</span>
                <span className="portion-price">₹{(basePrice / 100).toFixed(0)}</span>
              </button>
              <button
                type="button"
                className={`portion-chip ${portion === "FULL" ? "active" : ""}`}
                onClick={() => setPortion("FULL")}
              >
                <span>Full / Large</span>
                <span className="portion-price">₹{((basePrice * 1.4) / 100).toFixed(0)}</span>
              </button>
            </div>
          </div>

          {/* 2. Spice Level */}
          <div className="customizer-section">
            <label className="section-label">2. Spice Level</label>
            <div className="spice-grid">
              {[
                { key: "MILD", label: "Mild 🟢" },
                { key: "MEDIUM", label: "Medium 🟡" },
                { key: "SPICY", label: "Spicy 🌶️" },
                { key: "EXTRA_HOT", label: "Extra Hot 🔥" },
              ].map((sp) => (
                <button
                  key={sp.key}
                  type="button"
                  className={`spice-chip ${spiceLevel === sp.key ? "active" : ""}`}
                  onClick={() => setSpiceLevel(sp.key as any)}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Add-on Extras */}
          <div className="customizer-section">
            <label className="section-label">3. Add-on Extras</label>
            <div className="addons-list">
              {availableAddons.map((addon) => {
                const isChecked = selectedAddons.some((a) => a.name === addon.name);
                return (
                  <div
                    key={addon.name}
                    className={`addon-row ${isChecked ? "active" : ""}`}
                    onClick={() => toggleAddon(addon)}
                  >
                    <div className="addon-info">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="addon-checkbox"
                      />
                      <span className="addon-name">{addon.name}</span>
                    </div>
                    <span className="addon-price">
                      {addon.priceMinor === 0 ? "Free" : `+₹${(addon.priceMinor / 100).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Special Kitchen Note */}
          <div className="customizer-section">
            <label className="section-label">4. Special Instructions (KOT Note)</label>
            <input
              type="text"
              placeholder="e.g. Crispy texture, less oil, separate chutney..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="notes-input"
            />
          </div>
        </div>

        {/* Footer with Total and Add to Cart Button */}
        <div className="customizer-footer">
          <div className="footer-total-box">
            <span className="footer-total-label">Customized Total:</span>
            <strong className="footer-total-price">₹{(finalPriceMinor / 100).toFixed(2)}</strong>
          </div>
          <button type="button" className="btn-confirm-add" onClick={handleApply}>
            Add Customized Item →
          </button>
        </div>
      </div>

      <style jsx>{`
        .customizer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }

        .customizer-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 20px 24px;
          width: 90%;
          max-width: 520px;
          max-height: 90vh;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
        }

        .customizer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 12px;
        }

        .item-badge-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .fssai-indicator {
          font-size: 1.1rem;
        }
        .fssai-indicator.veg { color: #16a34a; }
        .fssai-indicator.non-veg { color: #dc2626; }

        .item-name-heading {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 800;
          color: #0f172a;
        }

        .base-price-tag {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 600;
        }

        .btn-close {
          background: transparent;
          border: none;
          font-size: 1.2rem;
          color: #64748b;
          cursor: pointer;
        }

        .customizer-body-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 14px 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .customizer-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-label {
          font-size: 0.8125rem;
          font-weight: 800;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .portion-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .portion-chip {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #334155;
          cursor: pointer;
        }
        .portion-chip.active {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1e40af;
          box-shadow: 0 0 0 1px #2563eb;
        }
        .portion-price {
          font-size: 0.875rem;
          font-weight: 900;
          color: #0f172a;
        }

        .spice-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }
        .spice-chip {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 4px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #334155;
          cursor: pointer;
          text-align: center;
        }
        .spice-chip.active {
          border-color: #f97316;
          background: #fff7ed;
          color: #c2410c;
          box-shadow: 0 0 0 1px #f97316;
        }

        .addons-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .addon-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.8125rem;
          transition: background 0.1s;
        }
        .addon-row.active {
          background: #f0fdf4;
          border-color: #86efac;
        }
        .addon-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .addon-name {
          font-weight: 600;
          color: #334155;
        }
        .addon-price {
          font-weight: 700;
          color: #0f172a;
        }

        .notes-input {
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-family: inherit;
        }

        .customizer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #e2e8f0;
          padding-top: 14px;
        }
        .footer-total-box {
          display: flex;
          flex-direction: column;
        }
        .footer-total-label {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 600;
        }
        .footer-total-price {
          font-size: 1.25rem;
          font-weight: 900;
          color: #0f172a;
        }

        .btn-confirm-add {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 800;
          font-size: 0.875rem;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
        }
      `}</style>
    </div>
  );
}
