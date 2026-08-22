import React, { useState } from "react";
import { getDishImageUrl } from "../../lib/dish-images";

export interface MenuItemData {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  priceMinor: number | string;
  isVeg: boolean;
  isStocked?: boolean;
  stockQty?: number;
  isBestseller?: boolean;
  prepTimeMinutes?: number;
  spiceLevel?: "MILD" | "MEDIUM" | "SPICY" | "EXTRA_HOT";
  imageUrl?: string;
}

interface AttractiveMenuItemCardProps {
  item: MenuItemData;
  cartQuantity?: number;
  onAdd: (item: MenuItemData) => void;
  onIncrement?: (item: MenuItemData) => void;
  onDecrement?: (item: MenuItemData) => void;
  onCustomize?: (item: MenuItemData) => void;
  compact?: boolean;
  viewMode?: "tile" | "compact" | "row";
}

export function getCategoryEmoji(category: string): string {
  const cat = (category || "").toLowerCase();
  if (cat.includes("breakfast") || cat.includes("idly") || cat.includes("dosa")) return "🥞";
  if (cat.includes("meal") || cat.includes("thali") || cat.includes("box")) return "🍱";
  if (cat.includes("cold") || cat.includes("juice") || cat.includes("shake")) return "🥤";
  if (cat.includes("hot") || cat.includes("coffee") || cat.includes("tea")) return "☕";
  if (cat.includes("soup")) return "🍲";
  if (cat.includes("starter") || cat.includes("chinese") || cat.includes("snack")) return "🥢";
  if (cat.includes("curry") || cat.includes("curries") || cat.includes("paneer")) return "🥘";
  if (cat.includes("rice") || cat.includes("biryani") || cat.includes("pulao")) return "🍛";
  if (cat.includes("bread") || cat.includes("roti") || cat.includes("naan")) return "🫓";
  if (cat.includes("dessert") || cat.includes("sweet") || cat.includes("ice cream")) return "🍨";
  return "🍽️";
}

export default function AttractiveMenuItemCard({
  item,
  cartQuantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onCustomize,
  compact = false,
  viewMode = "tile",
}: AttractiveMenuItemCardProps) {
  const isAvailable = item.isStocked !== false && (item.stockQty === undefined || item.stockQty > 0);
  const priceRupees = (Number(item.priceMinor) / 100).toFixed(2);
  const categoryEmoji = getCategoryEmoji(item.category);
  const imageUrl = item.imageUrl || getDishImageUrl(item.name, item.category);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`attractive-menu-card mode-${viewMode} ${!isAvailable ? "card-disabled" : ""} ${cartQuantity > 0 ? "card-in-cart" : ""}`}
      onClick={() => {
        if (isAvailable) {
          if (cartQuantity === 0) onAdd(item);
          else if (onIncrement) onIncrement(item);
        }
      }}
    >
      {/* Visual Image Banner for Tile View */}
      {viewMode === "tile" && (
        <div className="card-image-container">
          {!imageError ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="dish-cover-img"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="dish-fallback-cover">
              <span className="fallback-emoji">{categoryEmoji}</span>
            </div>
          )}

          {/* Floating Badges Overlay on Image */}
          <div className="image-overlay-top">
            <div className="dietary-floating-badge">
              <div className={`fssai-symbol ${item.isVeg ? "veg" : "non-veg"}`}>
                <span className="fssai-dot" />
              </div>
            </div>

            <div className="status-badges-group">
              {item.isBestseller && <span className="bestseller-pill">⭐ Bestseller</span>}
              {item.spiceLevel === "SPICY" && <span className="spice-pill" title="Spicy">🌶️</span>}
              {item.spiceLevel === "EXTRA_HOT" && <span className="spice-pill" title="Extra Hot">🔥</span>}
              {!isAvailable && <span className="stock-pill out">86'd</span>}
              {isAvailable && item.stockQty !== undefined && item.stockQty > 0 && item.stockQty <= 5 && (
                <span className="stock-pill low">{item.stockQty} left</span>
              )}
            </div>
          </div>

          {/* Floating Quantity Tag when in cart */}
          {cartQuantity > 0 && (
            <div className="in-cart-count-badge">
              {cartQuantity} in cart
            </div>
          )}
        </div>
      )}

      {/* Card Info Content */}
      <div className="card-content-area">
        {/* Header row when NOT in tile mode */}
        {viewMode !== "tile" && (
          <div className="card-header-row">
            <div className="dietary-badge-wrapper">
              <div className={`fssai-symbol ${item.isVeg ? "veg" : "non-veg"}`}>
                <span className="fssai-dot" />
              </div>
              <span className="category-emoji-tag">{categoryEmoji}</span>
            </div>

            <div className="status-badges-group">
              {item.isBestseller && <span className="bestseller-pill">⭐ Bestseller</span>}
              {item.spiceLevel === "SPICY" && <span className="spice-pill">🌶️</span>}
              {!isAvailable && <span className="stock-pill out">86'd</span>}
            </div>
          </div>
        )}

        <div className="card-body">
          <h4 className="item-title">{item.name}</h4>
          {item.description && viewMode !== "tile" && (
            <p className="item-desc">{item.description}</p>
          )}
          {viewMode === "tile" && (
            <div className="tile-category-tag">
              <span>{categoryEmoji}</span> {item.category}
            </div>
          )}
        </div>

        {/* Footer: Price & Action */}
        <div className="card-footer-row">
          <div className="price-tag-box">
            <span className="currency-symbol">₹</span>
            <span className="price-number">{priceRupees}</span>
          </div>

          <div className="card-action-container" onClick={(e) => e.stopPropagation()}>
            {!isAvailable ? (
              <span className="unavailable-text">86'd</span>
            ) : cartQuantity === 0 ? (
              <div className="add-button-group">
                <button
                  type="button"
                  className="btn-add-primary"
                  onClick={() => onAdd(item)}
                >
                  <span>ADD</span>
                  <span className="plus-icon">+</span>
                </button>
                {onCustomize && (
                  <button
                    type="button"
                    className="btn-customize-link"
                    onClick={() => onCustomize(item)}
                    title="Customise portion and add-ons"
                  >
                    Customise ▾
                  </button>
                )}
              </div>
            ) : (
              <div className="quantity-stepper">
                <button
                  type="button"
                  className="stepper-btn minus"
                  onClick={() => onDecrement ? onDecrement(item) : null}
                >
                  −
                </button>
                <span className="stepper-count">{cartQuantity}</span>
                <button
                  type="button"
                  className="stepper-btn plus"
                  onClick={() => onIncrement ? onIncrement(item) : onAdd(item)}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .attractive-menu-card {
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          position: relative;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
          user-select: none;
          overflow: hidden;
        }

        .attractive-menu-card:hover {
          border-color: #93c5fd;
          transform: translateY(-3px);
          box-shadow: 0 10px 24px -4px rgba(37, 99, 235, 0.15);
        }

        .attractive-menu-card.card-in-cart {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px #2563eb, 0 8px 20px -2px rgba(37, 99, 235, 0.2);
        }

        .attractive-menu-card.card-disabled {
          opacity: 0.55;
          background: #f8fafc;
          border-color: #cbd5e1;
          cursor: not-allowed;
          filter: grayscale(40%);
        }

        /* Tile View Styling */
        .card-image-container {
          position: relative;
          width: 100%;
          height: 120px;
          background: #f1f5f9;
          overflow: hidden;
        }

        .dish-cover-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .attractive-menu-card:hover .dish-cover-img {
          transform: scale(1.06);
        }

        .dish-fallback-cover {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
        }
        .fallback-emoji {
          font-size: 2.5rem;
        }

        .image-overlay-top {
          position: absolute;
          top: 6px;
          left: 6px;
          right: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 2;
        }

        .dietary-floating-badge {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(4px);
          padding: 3px;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }

        .in-cart-count-badge {
          position: absolute;
          bottom: 6px;
          left: 6px;
          background: rgba(37, 99, 235, 0.9);
          color: #ffffff;
          font-size: 0.625rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
          backdrop-filter: blur(4px);
          z-index: 2;
        }

        .card-content-area {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          flex: 1;
          gap: 6px;
        }

        /* Standard Indian FSSAI Veg / Non-Veg Square Badge */
        .fssai-symbol {
          width: 14px;
          height: 14px;
          border: 1.5px solid #16a34a;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
        }
        .fssai-symbol.veg {
          border-color: #16a34a;
        }
        .fssai-symbol.veg .fssai-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #16a34a;
        }
        .fssai-symbol.non-veg {
          border-color: #dc2626;
        }
        .fssai-symbol.non-veg .fssai-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #dc2626;
        }

        .category-emoji-tag {
          font-size: 0.9375rem;
        }

        .status-badges-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .bestseller-pill {
          background: rgba(254, 243, 199, 0.95);
          color: #92400e;
          font-size: 0.5625rem;
          font-weight: 800;
          padding: 2px 5px;
          border-radius: 4px;
          backdrop-filter: blur(2px);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .spice-pill {
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.85);
          padding: 1px 3px;
          border-radius: 4px;
        }

        .stock-pill {
          font-size: 0.5625rem;
          font-weight: 800;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .stock-pill.out {
          background: rgba(254, 226, 226, 0.95);
          color: #b91c1c;
        }
        .stock-pill.low {
          background: rgba(255, 237, 213, 0.95);
          color: #c2410c;
        }

        .card-body {
          flex: 1;
        }

        .item-title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.25;
          letter-spacing: -0.2px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .tile-category-tag {
          font-size: 0.6875rem;
          color: #64748b;
          font-weight: 600;
          margin-top: 3px;
        }

        .item-desc {
          margin: 4px 0 0 0;
          font-size: 0.75rem;
          color: #64748b;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          border-top: 1px dashed #f1f5f9;
          padding-top: 6px;
        }

        .price-tag-box {
          display: flex;
          align-items: baseline;
          color: #0f172a;
        }
        .currency-symbol {
          font-size: 0.75rem;
          font-weight: 700;
          margin-right: 1px;
          color: #64748b;
        }
        .price-number {
          font-size: 1rem;
          font-weight: 900;
          letter-spacing: -0.3px;
        }

        .card-action-container {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .unavailable-text {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #94a3b8;
        }

        .add-button-group {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .btn-add-primary {
          background: #ffffff;
          border: 1.5px solid #2563eb;
          color: #2563eb;
          font-size: 0.6875rem;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 3px;
          transition: all 0.15s;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
        }
        .btn-add-primary:hover {
          background: #2563eb;
          color: #ffffff;
        }
        .plus-icon {
          font-size: 0.8125rem;
          font-weight: 900;
        }

        .btn-customize-link {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 0.5625rem;
          font-weight: 600;
          cursor: pointer;
          padding: 1px 0 0 0;
        }
        .btn-customize-link:hover {
          color: #2563eb;
          text-decoration: underline;
        }

        .quantity-stepper {
          display: flex;
          align-items: center;
          background: #2563eb;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
        }

        .stepper-btn {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 0.875rem;
          font-weight: 900;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .stepper-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .stepper-count {
          color: #ffffff;
          font-weight: 900;
          font-size: 0.75rem;
          padding: 0 4px;
          min-width: 16px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
