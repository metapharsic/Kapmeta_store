import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { authedFetch } from "../lib/auth";
import BillSplitModal from "./BillSplitModal";
import AttractiveMenuItemCard, { MenuItemData } from "./menu/AttractiveMenuItemCard";
import MenuCustomizerModal, { CustomizedItemSelection } from "./menu/MenuCustomizerModal";
import CategoryNavbar, { DietaryFilter } from "./menu/CategoryNavbar";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  priceMinor: number;
  isVeg: boolean;
  isStocked: boolean;
  stockQty: number;
  hasModifiers?: boolean;
}

interface CartItem {
  cartItemId: string;
  item: MenuItem;
  quantity: number;
  itemTotalMinor: number;
  notes?: string;
  checked?: boolean;
}

interface PosBillingViewProps {
  initialTable?: string;
  initialTableId?: string;
  initialMode?: "DINE_IN" | "DELIVERY" | "PICKUP";
  onBackToTables?: () => void;
}

export default function PosBillingView({
  initialTable = "B6",
  initialTableId = "",
  initialMode = "DINE_IN",
  onBackToTables,
}: PosBillingViewProps) {
  const router = useRouter();
  const [orderMode, setOrderMode] = useState<"DINE_IN" | "DELIVERY" | "PICKUP">(initialMode);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter>("ALL");
  const [customizingItem, setCustomizingItem] = useState<MenuItemData | null>(null);
  const [catalog, setCatalog] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Cart & Table Metadata
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [tableSection, setTableSection] = useState("Non AC");
  const [coversCount, setCoversCount] = useState(2);
  const [waiterName, setWaiterName] = useState("Captain 1");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Payment & Settlement
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "DUE" | "OTHER">("CASH");
  const [isPaidChecked, setIsPaidChecked] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [processingOrder, setProcessingOrder] = useState(false);

  // Load Menu Catalog
  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    try {
      setLoading(true);
      const res = await authedFetch("/menu/availability");
      if (res.ok) {
        const data = await res.json();
        const items: MenuItem[] = (data || []).map((it: any) => ({
          id: it.id,
          name: it.name,
          category: it.categoryName || it.category?.name || "General",
          description: it.description || "",
          priceMinor: Number(it.priceMinor || 0),
          isVeg: it.isVeg ?? true,
          isStocked: it.availability ? it.availability.isStocked : true,
          stockQty: it.availability ? it.availability.stockQty : 100,
        }));

        setCatalog(items);

        const cats = Array.from(new Set(items.map((i) => i.category))).filter(Boolean);
        setCategories(["All", ...cats]);
        if (cats.length > 0) {
          setSelectedCategory("All");
        }
      }
    } catch (err) {
      console.error("Failed to load catalog", err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    if (!item.isStocked) {
      alert(`${item.name} is currently 86'd (Out of stock).`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((c) => c.item.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const nextQty = updated[existingIndex].quantity + 1;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: nextQty,
          itemTotalMinor: nextQty * item.priceMinor,
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartItemId: `item_${Date.now()}_${Math.random()}`,
          item,
          quantity: 1,
          itemTotalMinor: item.priceMinor,
          checked: true,
        },
      ];
    });
  };

  const updateCartItemQty = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.cartItemId === cartItemId) {
            const nextQty = c.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...c,
              quantity: nextQty,
              itemTotalMinor: nextQty * c.item.priceMinor,
            };
          }
          return c;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const toggleCheckItem = (cartItemId: string) => {
    setCart((prev) =>
      prev.map((c) => (c.cartItemId === cartItemId ? { ...c, checked: !c.checked } : c))
    );
  };

  const subtotalMinor = useMemo(
    () => cart.reduce((sum, it) => sum + it.itemTotalMinor, 0),
    [cart]
  );
  const taxMinor = useMemo(() => Math.round(subtotalMinor * 0.05), [subtotalMinor]); // 5% GST
  const grandTotalMinor = subtotalMinor + taxMinor;

  const handleHoldCart = () => {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }
    const heldOrder = {
      id: `hold_${Date.now()}`,
      tableNumber,
      orderType: orderMode,
      itemCount: cart.reduce((s, c) => s + c.quantity, 0),
      totalMinor: grandTotalMinor,
      heldAt: new Date().toISOString(),
      cart,
    };
    try {
      const stored = JSON.parse(localStorage.getItem("petpooja_held_orders") || "[]");
      stored.push(heldOrder);
      localStorage.setItem("petpooja_held_orders", JSON.stringify(stored));
      setCart([]);
      alert(`Order for Table ${tableNumber} is held/parked.`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleKotAndPrint = async () => {
    if (cart.length === 0) {
      alert("Please select items to create KOT.");
      return;
    }
    setProcessingOrder(true);
    try {
      const payload = {
        orderType: orderMode,
        tableNumber,
        diningTableId: initialTableId || null,
        covers: coversCount,
        waiterName,
        items: cart.map((c) => ({
          menuItemId: c.item.id,
          quantity: c.quantity,
          unitPriceMinor: c.item.priceMinor,
          notes: c.notes || null,
        })),
        status: "ACTIVE",
      };

      const res = await authedFetch("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to send KOT");
      const data = await res.json();
      alert(`KOT Ticket sent to Kitchen for Table ${tableNumber}!`);
      if (onBackToTables) onBackToTables();
    } catch (err: any) {
      alert(err.message || "Failed to create KOT");
    } finally {
      setProcessingOrder(false);
    }
  };

  const handlePrintAndEBill = async () => {
    if (cart.length === 0) {
      alert("Please select items to print bill.");
      return;
    }
    setProcessingOrder(true);
    try {
      const payload = {
        orderType: orderMode,
        tableNumber,
        diningTableId: initialTableId || null,
        covers: coversCount,
        waiterName,
        paymentMethod,
        isPaid: isPaidChecked,
        items: cart.map((c) => ({
          menuItemId: c.item.id,
          quantity: c.quantity,
          unitPriceMinor: c.item.priceMinor,
        })),
        subtotalMinor,
        taxTotalMinor: taxMinor,
        grandTotalMinor,
      };

      const res = await authedFetch("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to generate bill");
      alert(`Tax Invoice & E-Bill generated for Table ${tableNumber}! Print job dispatched.`);
      setCart([]);
      if (onBackToTables) onBackToTables();
    } catch (err: any) {
      alert(err.message || "Failed to print bill");
    } finally {
      setProcessingOrder(false);
    }
  };

  const addCustomizedToCart = (item: MenuItemData, customization: CustomizedItemSelection) => {
    const customizedName = `${item.name} (${customization.portion === "HALF" ? "Half" : customization.portion === "FULL" ? "Full" : "Reg"}${customization.addons.length > 0 ? " + " + customization.addons.map((a) => a.name).join(", ") : ""})`;
    const customItem: MenuItem = {
      id: item.id,
      name: customizedName,
      category: item.category,
      priceMinor: customization.finalPriceMinor,
      isVeg: item.isVeg,
      isStocked: item.isStocked ?? true,
      stockQty: item.stockQty ?? 100,
    };

    setCart((prev) => [
      ...prev,
      {
        cartItemId: `item_${Date.now()}_${Math.random()}`,
        item: customItem,
        quantity: 1,
        itemTotalMinor: customization.finalPriceMinor,
        notes: customization.specialInstructions || undefined,
        checked: true,
      },
    ]);
  };

  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = { All: catalog.length };
    for (const item of catalog) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchCat = selectedCategory === "All" || item.category === selectedCategory;
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchDiet = true;
      if (dietaryFilter === "VEG_ONLY") matchDiet = item.isVeg === true;
      else if (dietaryFilter === "NON_VEG_ONLY") matchDiet = item.isVeg === false;
      else if (dietaryFilter === "BESTSELLERS_ONLY") matchDiet = (item.priceMinor > 8000 && item.priceMinor < 20000);

      return matchCat && matchSearch && matchDiet;
    });
  }, [catalog, selectedCategory, searchQuery, dietaryFilter]);

  return (
    <div className="pos-billing-container">
      {/* Mode Switcher Bar */}
      <div className="pos-mode-bar">
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${orderMode === "DINE_IN" ? "active" : ""}`}
            onClick={() => setOrderMode("DINE_IN")}
          >
            🍽️ Dine In
          </button>
          <button
            type="button"
            className={`mode-tab ${orderMode === "DELIVERY" ? "active" : ""}`}
            onClick={() => setOrderMode("DELIVERY")}
          >
            🛵 Delivery
          </button>
          <button
            type="button"
            className={`mode-tab ${orderMode === "PICKUP" ? "active" : ""}`}
            onClick={() => setOrderMode("PICKUP")}
          >
            🛍️ Pick Up
          </button>
        </div>

        {onBackToTables && (
          <button type="button" className="btn-back-tables" onClick={onBackToTables}>
            ← Back to Table View
          </button>
        )}
      </div>

      {/* Main 3-Column Layout */}
      <div className="pos-main-grid">
        {/* Column 1: Category Navigation */}
        <div className="pos-categories-sidebar">
          <CategoryNavbar
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            dietaryFilter={dietaryFilter}
            onChangeDietaryFilter={(f) => setDietaryFilter(f)}
            searchQuery={searchQuery}
            onSearchChange={(q) => setSearchQuery(q)}
            categoryItemCounts={categoryItemCounts}
            layout="vertical"
          />
        </div>

        {/* Column 2: Item Grid & Search */}
        <div className="pos-item-grid-panel">
          <div className="items-matrix-scroll">
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                Loading menu catalog...
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                No items found matching the current filters.
              </div>
            ) : (
              <div className="items-card-grid">
                {filteredCatalog.map((item) => {
                  const cartItem = cart.find((c) => c.item.id === item.id);
                  const cartQuantity = cartItem ? cartItem.quantity : 0;

                  return (
                    <AttractiveMenuItemCard
                      key={item.id}
                      item={{
                        ...item,
                        isBestseller: item.priceMinor > 8000 && item.priceMinor < 20000,
                      }}
                      cartQuantity={cartQuantity}
                      onAdd={(it) => addToCart(item)}
                      onIncrement={(it) => {
                        if (cartItem) updateCartItemQty(cartItem.cartItemId, 1);
                        else addToCart(item);
                      }}
                      onDecrement={(it) => {
                        if (cartItem) updateCartItemQty(cartItem.cartItemId, -1);
                      }}
                      onCustomize={(it) => setCustomizingItem(it)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Cart, Ticket & Settlement */}
        <div className="pos-cart-panel">
          {/* Table Header Bar */}
          <div className="cart-table-meta-bar">
            <div className="table-badge-group">
              <span className="table-tag-icon">T</span>
              <span className="table-name-label">{tableNumber}</span>
              <span className="section-badge">{tableSection}</span>
            </div>

            <div className="covers-waiter-group">
              <div className="covers-counter">
                <span>👤</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={coversCount}
                  onChange={(e) => setCoversCount(Number(e.target.value))}
                  className="covers-input"
                />
              </div>
              <div className="waiter-tag">
                <span>🧑‍🍳</span>
                <span>{waiterName}</span>
              </div>
            </div>
          </div>

          {/* Cart Table Headers */}
          <div className="cart-table-headers">
            <span className="col-item">ITEMS</span>
            <span className="col-check">CHECK ITEMS</span>
            <span className="col-qty">QTY</span>
            <span className="col-price">PRICE</span>
          </div>

          {/* Cart Items List */}
          <div className="cart-items-scroll">
            {cart.length === 0 ? (
              <div className="empty-cart-state">
                <div style={{ fontSize: "2.5rem", color: "#cbd5e1" }}>🍽️</div>
                <div style={{ fontWeight: 700, color: "#64748b", marginTop: "8px" }}>No Item Selected</div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Please Select Item from Left Menu Item Grid
                </div>
              </div>
            ) : (
              cart.map((cartItem) => (
                <div key={cartItem.cartItemId} className="cart-row">
                  <div className="cart-col-item">
                    <span className={`veg-dot ${cartItem.item.isVeg ? "veg" : "non-veg"}`}>●</span>
                    <span className="cart-item-name">{cartItem.item.name}</span>
                  </div>

                  <div className="cart-col-check">
                    <input
                      type="checkbox"
                      checked={cartItem.checked}
                      onChange={() => toggleCheckItem(cartItem.cartItemId)}
                    />
                  </div>

                  <div className="cart-col-qty">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => updateCartItemQty(cartItem.cartItemId, -1)}
                    >
                      -
                    </button>
                    <span className="qty-val">{cartItem.quantity}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => updateCartItemQty(cartItem.cartItemId, 1)}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-col-price">
                    ₹{(cartItem.itemTotalMinor / 100).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Rapid Settlement */}
          <div className="cart-settlement-footer">
            {/* Split & Tender Modes */}
            <div className="tender-action-bar">
              <button
                type="button"
                className="btn-split"
                onClick={() => setIsSplitModalOpen(true)}
              >
                Split
              </button>

              <div className="payment-pills-row">
                <label className={`payment-pill ${paymentMethod === "CASH" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="paymentMode"
                    value="CASH"
                    checked={paymentMethod === "CASH"}
                    onChange={() => setPaymentMethod("CASH")}
                  />
                  <span>Cash</span>
                </label>

                <label className={`payment-pill ${paymentMethod === "CARD" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="paymentMode"
                    value="CARD"
                    checked={paymentMethod === "CARD"}
                    onChange={() => setPaymentMethod("CARD")}
                  />
                  <span>Card</span>
                </label>

                <label className={`payment-pill ${paymentMethod === "DUE" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="paymentMode"
                    value="DUE"
                    checked={paymentMethod === "DUE"}
                    onChange={() => setPaymentMethod("DUE")}
                  />
                  <span>Due</span>
                </label>

                <label className={`payment-pill ${paymentMethod === "OTHER" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="paymentMode"
                    value="OTHER"
                    checked={paymentMethod === "OTHER"}
                    onChange={() => setPaymentMethod("OTHER")}
                  />
                  <span>Other</span>
                </label>

                <label className="paid-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPaidChecked}
                    onChange={(e) => setIsPaidChecked(e.target.checked)}
                  />
                  <span>It's Paid</span>
                </label>
              </div>

              <div className="total-display-badge">
                <span className="total-label">Total</span>
                <span className="total-value">₹{(grandTotalMinor / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Bottom Primary CTAs */}
            <div className="cart-cta-buttons">
              <button
                type="button"
                className="btn-hold-cart"
                onClick={handleHoldCart}
                title="Park / Hold Order"
              >
                ⏸ Hold
              </button>

              <button
                type="button"
                className="btn-print-ebill"
                onClick={handlePrintAndEBill}
                disabled={processingOrder}
              >
                Print & E-Bill
              </button>

              <button
                type="button"
                className="btn-kot-print"
                onClick={handleKotAndPrint}
                disabled={processingOrder}
              >
                KOT & Print
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bill Split Modal */}
      {isSplitModalOpen && (
        <BillSplitModal
          cart={cart}
          totalMinor={grandTotalMinor}
          onClose={() => setIsSplitModalOpen(false)}
          onConfirmSplit={(details) => {
            alert(`Bill configured for ${details.numGuests} guests (₹${(details.perGuestMinor / 100).toFixed(2)} each).`);
          }}
        />
      )}

      {/* Item Customizer Modal */}
      <MenuCustomizerModal
        isOpen={!!customizingItem}
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={(item, custom) => {
          addCustomizedToCart(item, custom);
          setCustomizingItem(null);
        }}
      />

      <style jsx>{`
        .pos-billing-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 48px);
          background: #f8fafc;
          font-family: inherit;
        }

        .pos-mode-bar {
          height: 38px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
        }
        .mode-tabs {
          display: flex;
          gap: 6px;
        }
        .mode-tab {
          background: transparent;
          border: none;
          padding: 6px 14px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
        }
        .mode-tab.active {
          background: #f1f5f9;
          color: #dc2626;
          box-shadow: inset 0 -2px 0 #dc2626;
        }
        .btn-back-tables {
          background: transparent;
          border: 1px solid #cbd5e1;
          padding: 3px 10px;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #475569;
          cursor: pointer;
        }

        .pos-main-grid {
          display: grid;
          grid-template-columns: 180px 1fr 380px;
          flex: 1;
          overflow: hidden;
        }

        /* Column 1: Categories */
        .pos-categories-sidebar {
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }
        .cat-sidebar-header {
          padding: 10px 14px;
          font-size: 0.75rem;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          border-bottom: 1px solid #f1f5f9;
        }
        .categories-scroll-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .category-item-btn {
          padding: 10px 14px;
          text-align: left;
          background: transparent;
          border: none;
          border-bottom: 1px solid #f8fafc;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.1s;
        }
        .category-item-btn:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .category-item-btn.active {
          background: #f1f5f9;
          color: #dc2626;
          border-left: 3px solid #dc2626;
          font-weight: 700;
        }

        /* Column 2: Item Grid */
        .pos-item-grid-panel {
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          border-right: 1px solid #e2e8f0;
        }
        .item-search-bar {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          gap: 8px;
        }
        .search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.8125rem;
          background: transparent;
        }
        .clear-search-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
        }

        .items-matrix-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .items-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
          gap: 12px;
        }
        .menu-item-tile {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 80px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .menu-item-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);
          border-color: #94a3b8;
        }
        .menu-item-tile.is-disabled {
          opacity: 0.5;
          pointer-events: none;
          background: #f1f5f9;
        }
        .tile-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .veg-dot {
          font-size: 0.75rem;
        }
        .veg-dot.veg { color: #16a34a; }
        .veg-dot.non-veg { color: #dc2626; }
        .item-price {
          font-size: 0.75rem;
          font-weight: 700;
          color: #16a34a;
        }
        .tile-item-name {
          font-size: 0.8125rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
          margin-top: 6px;
        }
        .out-of-stock-tag {
          font-size: 0.625rem;
          font-weight: 800;
          color: #dc2626;
          background: #fee2e2;
          padding: 2px 4px;
          border-radius: 3px;
          text-align: center;
          margin-top: 4px;
        }

        /* Column 3: Cart */
        .pos-cart-panel {
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }
        .cart-table-meta-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .table-badge-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .table-tag-icon {
          background: #dc2626;
          color: #ffffff;
          font-weight: 900;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .table-name-label {
          font-weight: 800;
          font-size: 0.9rem;
        }
        .section-badge {
          font-size: 0.6875rem;
          background: #e2e8f0;
          color: #475569;
          padding: 1px 6px;
          border-radius: 3px;
        }
        .covers-waiter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .covers-counter {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
        }
        .covers-input {
          width: 32px;
          padding: 2px;
          text-align: center;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .waiter-tag {
          font-size: 0.75rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .cart-table-headers {
          display: grid;
          grid-template-columns: 1.5fr 70px 70px 60px;
          padding: 6px 12px;
          background: #f1f5f9;
          font-size: 0.6875rem;
          font-weight: 800;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
        }
        .col-price { text-align: right; }
        .col-qty, .col-check { text-align: center; }

        .cart-items-scroll {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .empty-cart-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px;
          text-align: center;
        }
        .cart-row {
          display: grid;
          grid-template-columns: 1.5fr 70px 70px 60px;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.8125rem;
        }
        .cart-col-item {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow: hidden;
        }
        .cart-item-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
        }
        .cart-col-check {
          text-align: center;
        }
        .cart-col-qty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .qty-btn {
          width: 20px;
          height: 20px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }
        .qty-val {
          font-weight: 700;
          min-width: 14px;
          text-align: center;
        }
        .cart-col-price {
          text-align: right;
          font-weight: 700;
          color: #16a34a;
        }

        /* Settlement Footer */
        .cart-settlement-footer {
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tender-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 6px;
        }
        .btn-split {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.6875rem;
          font-weight: 700;
          cursor: pointer;
        }
        .payment-pills-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .payment-pill {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.6875rem;
          font-weight: 600;
          cursor: pointer;
        }
        .payment-pill input {
          margin: 0;
        }
        .paid-checkbox-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: #2563eb;
          cursor: pointer;
        }

        .total-display-badge {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .total-label {
          font-size: 0.75rem;
          color: #64748b;
        }
        .total-value {
          font-size: 1rem;
          font-weight: 900;
          color: #0f172a;
        }

        .cart-cta-buttons {
          display: flex;
          gap: 8px;
        }
        .btn-hold-cart {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .btn-print-ebill {
          flex: 1;
          background: #dc2626;
          color: #ffffff;
          border: none;
          padding: 10px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .btn-kot-print {
          flex: 1;
          background: #3b82f6;
          color: #ffffff;
          border: none;
          padding: 10px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.875rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
