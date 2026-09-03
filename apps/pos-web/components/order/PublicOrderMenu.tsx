import React, { useMemo, useState } from "react";

// Shared cart + menu-browsing UI used by both the table-QR self-order page
// (pages/order/[tableId].tsx, DINE_IN) and the tableless entry page
// (pages/order/index.tsx, DELIVERY / PICKUP). Extracted so both flows share
// one working implementation instead of duplicating ~250 lines of JSX.

export interface PublicMenuItemApi {
  id: string;
  name: string;
  description: string | null;
  priceMinor: string;
  isVeg: boolean;
  categoryName: string;
  taxRate: string;
}

export interface CartLine {
  item: PublicMenuItemApi;
  quantity: number;
}

export interface SubmitResult {
  ok: boolean;
  orderNumber?: string | null;
  error?: string;
}

export function usePublicCart() {
  const [cart, setCart] = useState<Record<string, CartLine>>({});

  const addToCart = (item: PublicMenuItemApi) => {
    setCart((prev) => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, quantity: (existing?.quantity || 0) + 1 } };
    });
  };

  const changeQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const { [itemId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...existing, quantity: nextQty } };
    });
  };

  const clear = () => setCart({});

  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotalMinor = cartLines.reduce((sum, l) => sum + Number(l.item.priceMinor) * l.quantity, 0);

  return { cart, addToCart, changeQty, clear, cartLines, cartCount, cartTotalMinor };
}

interface PublicOrderMenuProps {
  outletName: string | null;
  /** Small badge text in the header, e.g. "📱 Self Order" or "🛵 Delivery". */
  headerBadge: string;
  /** Subtitle under the outlet name, e.g. "Table 4 · Patio" or "Delivering to ...". */
  headerSubtitle: string;
  items: PublicMenuItemApi[];
  cartState: ReturnType<typeof usePublicCart>;
  notes: string;
  onNotesChange: (v: string) => void;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  submitLabel?: string;
  /** Extra fields (e.g. phone/address) rendered above the notes box, once the cart is non-empty. */
  extraFields?: React.ReactNode;
  confirmation: { orderNumber: string | null } | null;
  onOrderMore: () => void;
  confirmationHeading?: string;
  confirmationSubtext?: string;
}

export default function PublicOrderMenu(props: PublicOrderMenuProps) {
  const {
    outletName,
    headerBadge,
    headerSubtitle,
    items,
    cartState,
    notes,
    onNotesChange,
    submitting,
    submitError,
    onSubmit,
    submitLabel = "Place Order",
    extraFields,
    confirmation,
    onOrderMore,
    confirmationHeading = "Order sent to kitchen!",
    confirmationSubtext = "Your food will be prepared shortly.",
  } = props;

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const { cart, addToCart, changeQty, cartLines, cartCount, cartTotalMinor } = cartState;

  const categories = useMemo(() => {
    const names = Array.from(new Set(items.map((i) => i.categoryName)));
    return ["All", ...names];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "All") return items;
    return items.filter((i) => i.categoryName === selectedCategory);
  }, [items, selectedCategory]);

  if (confirmation) {
    return (
      <Centered>
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-extrabold text-slate-900 mb-1">{confirmationHeading}</h1>
        {confirmation.orderNumber && (
          <p className="text-slate-600 text-sm mb-4">
            Order number <span className="font-bold text-slate-900">#{confirmation.orderNumber}</span>
          </p>
        )}
        <p className="text-slate-500 text-xs mb-6">{confirmationSubtext}</p>
        <button
          type="button"
          onClick={onOrderMore}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition"
        >
          Order More
        </button>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-32">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-extrabold text-slate-900 text-base">{outletName ?? "KapMeta POS"}</h1>
            <p className="text-xs text-slate-500">{headerSubtitle}</p>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold whitespace-nowrap">
            {headerBadge}
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4">
        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto py-3 -mx-1 px-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedCategory(c)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                selectedCategory === c
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Menu items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          {filteredItems.length === 0 && (
            <p className="text-slate-500 text-sm col-span-2 text-center py-10">No items in this category.</p>
          )}
          {filteredItems.map((item) => {
            const qty = cart[item.id]?.quantity || 0;
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={`mt-1 inline-block w-2.5 h-2.5 rounded-sm border-2 shrink-0 ${
                        item.isVeg ? "border-emerald-600" : "border-rose-600"
                      }`}
                      title={item.isVeg ? "Veg" : "Non-veg"}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-extrabold text-sm text-slate-900">
                    ₹{(Number(item.priceMinor) / 100).toFixed(2)}
                  </span>
                  {qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition"
                    >
                      Add
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-1">
                      <button
                        type="button"
                        onClick={() => changeQty(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center text-indigo-700 font-bold"
                      >
                        −
                      </button>
                      <span className="text-xs font-extrabold text-indigo-700 min-w-[16px] text-center">{qty}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center text-indigo-700 font-bold"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {cartCount > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {extraFields}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">
                Any special instructions? (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                placeholder="e.g. less spicy, no onions..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        )}

        {submitError && (
          <p className="text-rose-600 text-xs font-semibold mt-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}
      </div>

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl px-4 py-3 z-30">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">{cartCount} item{cartCount > 1 ? "s" : ""}</p>
              <p className="font-extrabold text-slate-900">₹{(cartTotalMinor / 100).toFixed(2)}</p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={onSubmit}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition"
            >
              {submitting ? "Placing order..." : submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-center px-6">
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />;
}
