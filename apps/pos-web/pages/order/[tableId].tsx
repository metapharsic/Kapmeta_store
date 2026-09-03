import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import PublicOrderMenu, {
  Centered,
  Spinner,
  usePublicCart,
  type PublicMenuItemApi,
} from "../../components/order/PublicOrderMenu";

// This page is deliberately public / unauthenticated — a customer scans a QR
// code at their table and lands here with no login. It never imports
// lib/auth or uses authedFetch; it only talks to the PUBLIC endpoints under
// apps/api/src/routes/public-order.ts.
//
// A table QR is physically a dine-in context, so this page never offers a
// Delivery/Pickup choice — that belongs on the tableless entry page at
// pages/order/index.tsx. DINE_IN stays the locked, implicit order type here.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4001";

interface MenuResponse {
  outletName: string | null;
  table: { id: string; tableNumber: string; section: string | null };
  categories: { id: string; name: string }[];
  items: PublicMenuItemApi[];
}

export default function TableSelfOrderPage() {
  const router = useRouter();
  // Prefer router.query once Next hydrates it, but fall back to parsing the
  // literal URL path — on this dev setup, automatically-statically-optimized
  // dynamic pages can leave router.query empty past hydration, and a
  // customer scanning a QR code must never get stuck on a permanent loading
  // spinner because of a routing quirk.
  const [tableId, setTableId] = useState<string | null>(null);

  useEffect(() => {
    const queryId = router.query.tableId;
    if (typeof queryId === "string" && queryId) {
      setTableId(queryId);
      return;
    }
    const match = window.location.pathname.match(/\/order\/([^/]+)/);
    if (match) setTableId(decodeURIComponent(match[1]));
  }, [router.query.tableId]);

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cartState = usePublicCart();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ orderNumber: string | null } | null>(null);

  useEffect(() => {
    if (!tableId) return;
    setLoading(true);
    setLoadError(null);
    fetch(`${API_BASE}/public/tables/${tableId}/menu`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "This table's ordering link is no longer valid.");
        }
        return res.json();
      })
      .then((data: MenuResponse) => setMenu(data))
      .catch((err) => setLoadError(err.message || "Failed to load menu"))
      .finally(() => setLoading(false));
  }, [tableId]);

  const items = menu
    ? menu.items.filter((item: any) => !item.availability || item.availability.isStocked)
    : [];

  const submitOrder = async () => {
    if (!menu || cartState.cartLines.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const idempotencyKey = `qr-${menu.table.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch(`${API_BASE}/public/tables/${menu.table.id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          // orderType is intentionally not sent — the server hardcodes
          // DINE_IN for the table-QR route regardless (see
          // apps/api/src/routes/public-order.ts), which is correct: a
          // customer scanning a physical table's QR is physically dine-in.
          lines: cartState.cartLines.map((l) => ({
            menuItemId: l.item.id,
            quantity: l.quantity,
            modifierOptionIds: [],
            notes: notes || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to place order. Please try again or ask staff for help.");
        return;
      }
      setConfirmation({ orderNumber: data.orderNumber });
      cartState.clear();
      setNotes("");
    } catch (err) {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Centered>
        <Spinner />
        <p className="text-slate-500 text-sm mt-3">Loading menu...</p>
      </Centered>
    );
  }

  if (loadError || !menu) {
    return (
      <Centered>
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-slate-700 font-semibold">{loadError || "Table not found"}</p>
        <p className="text-slate-500 text-sm mt-1">Please ask a staff member for assistance.</p>
      </Centered>
    );
  }

  return (
    <>
      <Head>
        <title>Order — Table {menu.table.tableNumber}</title>
      </Head>
      <PublicOrderMenu
        outletName={menu.outletName}
        headerBadge="📱 Self Order"
        headerSubtitle={`🍽️ Dine In (Table ${menu.table.tableNumber}${menu.table.section ? ` · ${menu.table.section}` : ""})`}
        items={items}
        cartState={cartState}
        notes={notes}
        onNotesChange={setNotes}
        submitting={submitting}
        submitError={submitError}
        onSubmit={submitOrder}
        confirmation={confirmation}
        onOrderMore={() => setConfirmation(null)}
      />
    </>
  );
}
