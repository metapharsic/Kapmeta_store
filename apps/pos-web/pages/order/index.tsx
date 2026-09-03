import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import PublicOrderMenu, {
  Centered,
  Spinner,
  usePublicCart,
  type PublicMenuItemApi,
} from "../../components/order/PublicOrderMenu";

// Tableless, public / unauthenticated entry point for customers who did NOT
// scan a table QR code — e.g. arriving from a link or QR at the counter/on
// packaging, wanting Delivery or Pickup. Dine In is deliberately NOT offered
// as a real option here: dine-in requires a physical table, so this page
// only explains that and points the customer at a table QR.
//
// Contract note (confirmed against apps/api/src/routes/public-order.ts):
//   GET  /public/outlets/:outletSlugOrId/menu
//   POST /public/outlets/:outletSlugOrId/order
//        body: { idempotencyKey, orderType: "DINE_IN" | "DELIVERY" | "PICKUP"
//                 (also accepts "TAKEAWAY", normalized to "PICKUP"), lines }
// :outletSlugOrId accepts either the Outlet's id or its human-facing `code`
// column — this page reads that value from an `?outlet=<idOrCode>` query
// param, meant to come from a per-outlet delivery/pickup QR or link (there's
// no other outlet-discovery mechanism yet). The server has no dedicated
// customer phone/address field, so those are folded into each line's
// `notes` (see submitOrder below) rather than sent as fields the server
// would silently ignore.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4001";

type Mode = "PICK" | "DINE_IN_INFO" | "DELIVERY" | "PICKUP";

interface OutletMenuResponse {
  outletName: string | null;
  outletId: string;
  categories: { id: string; name: string }[];
  items: PublicMenuItemApi[];
}

export default function TablelessOrderEntryPage() {
  const router = useRouter();
  const [outletId, setOutletId] = useState<string | null>(null);

  useEffect(() => {
    const q = router.query.outlet;
    if (typeof q === "string" && q) setOutletId(q);
  }, [router.query.outlet]);

  const [mode, setMode] = useState<Mode>("PICK");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);

  const [menu, setMenu] = useState<OutletMenuResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cartState = usePublicCart();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ orderNumber: string | null } | null>(null);

  useEffect(() => {
    if (!detailsConfirmed || !outletId || (mode !== "DELIVERY" && mode !== "PICKUP")) return;
    setLoading(true);
    setLoadError(null);
    fetch(`${API_BASE}/public/outlets/${outletId}/menu`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Could not load this outlet's menu.");
        }
        return res.json();
      })
      .then((data: OutletMenuResponse) => setMenu(data))
      .catch((err) => setLoadError(err.message || "Failed to load menu"))
      .finally(() => setLoading(false));
  }, [detailsConfirmed, outletId, mode]);

  const submitOrder = async () => {
    if (!menu || !outletId || cartState.cartLines.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const idempotencyKey = `${mode.toLowerCase()}-${outletId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // The server's POST /public/outlets/:outletSlugOrId/order (see
      // apps/api/src/routes/public-order.ts) reads idempotencyKey, orderType
      // and lines — it has no dedicated customer phone/address field
      // (createOrder's CreateOrderInput doesn't carry one). So the contact
      // details are folded into each line's notes, the one free-text field
      // that does reach the kitchen/staff, rather than being silently
      // dropped by sending fields the server ignores.
      const contactPrefix =
        mode === "DELIVERY" ? `Deliver to: ${address} | Ph: ${phone}` : `Pickup — Ph: ${phone}`;
      const combinedNotes = notes ? `${contactPrefix} | ${notes}` : contactPrefix;
      const res = await fetch(`${API_BASE}/public/outlets/${outletId}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          orderType: mode,
          lines: cartState.cartLines.map((l) => ({
            menuItemId: l.item.id,
            quantity: l.quantity,
            modifierOptionIds: [],
            notes: combinedNotes,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          data.error ||
            (res.status === 404
              ? "Online ordering for delivery/pickup isn't available yet — please call the outlet."
              : "Failed to place order. Please try again.")
        );
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

  // --- Step 1: mode picker -------------------------------------------------
  if (mode === "PICK") {
    return (
      <Centered>
        <Head>
          <title>Order Online</title>
        </Head>
        <h1 className="text-xl font-extrabold text-slate-900 mb-1">How would you like to order?</h1>
        <p className="text-slate-500 text-sm mb-6">Choose one to get started.</p>
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <ModeCard
            emoji="🍽️"
            label="Dine In"
            desc="Scan the QR code on your table to order for dine-in."
            onClick={() => setMode("DINE_IN_INFO")}
          />
          <ModeCard
            emoji="🛵"
            label="Delivery"
            desc="Get food delivered to your address."
            onClick={() => setMode("DELIVERY")}
          />
          <ModeCard
            emoji="🛍️"
            label="Pick Up"
            desc="Order ahead and collect it yourself."
            onClick={() => setMode("PICKUP")}
          />
        </div>
      </Centered>
    );
  }

  // --- Dine-in tapped from a tableless link: explain, don't fake it -------
  if (mode === "DINE_IN_INFO") {
    return (
      <Centered>
        <Head>
          <title>Dine In</title>
        </Head>
        <div className="text-4xl mb-3">🍽️</div>
        <h1 className="text-lg font-extrabold text-slate-900 mb-1">Dine In needs a table</h1>
        <p className="text-slate-500 text-sm mb-6 max-w-xs">
          Dine-in orders are tied to your table so the kitchen knows where to send your food. Please scan the QR
          code printed on your table to start a dine-in order.
        </p>
        <button
          type="button"
          onClick={() => setMode("PICK")}
          className="text-indigo-600 text-sm font-bold"
        >
          ← Back
        </button>
      </Centered>
    );
  }

  // --- Step 2: collect phone (+ address for delivery) ----------------------
  if (!detailsConfirmed) {
    const isDelivery = mode === "DELIVERY";
    const canContinue = phone.trim().length >= 7 && (!isDelivery || address.trim().length >= 5) && !!outletId;
    return (
      <Centered>
        <Head>
          <title>{isDelivery ? "Delivery" : "Pick Up"} Details</title>
        </Head>
        <div className="text-4xl mb-3">{isDelivery ? "🛵" : "🛍️"}</div>
        <h1 className="text-lg font-extrabold text-slate-900 mb-1">
          {isDelivery ? "🛵 Delivery" : "🛍️ Pick Up"} details
        </h1>
        <p className="text-slate-500 text-sm mb-5 max-w-xs">
          {isDelivery
            ? "We need your phone number and delivery address."
            : "We need your phone number so we can text you when it's ready."}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-sm text-left">
          {!outletId && (
            <p className="text-rose-600 text-xs font-semibold bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              This link is missing the outlet — please use the delivery/pickup QR code or link provided by the
              outlet.
            </p>
          )}
          <label className="text-xs font-semibold text-slate-600 block">
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 98765 43210"
              className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </label>
          {isDelivery && (
            <label className="text-xs font-semibold text-slate-600 block">
              Delivery address
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder="Flat / street / landmark"
                className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </label>
          )}
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setDetailsConfirmed(true)}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition"
          >
            Continue to menu
          </button>
          <button type="button" onClick={() => setMode("PICK")} className="text-indigo-600 text-xs font-bold">
            ← Back
          </button>
        </div>
      </Centered>
    );
  }

  // --- Step 3: menu / cart / checkout, via the shared component -----------
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
        <p className="text-slate-700 font-semibold">{loadError || "Menu unavailable"}</p>
        <p className="text-slate-500 text-sm mt-1">Please try again shortly, or call the outlet directly.</p>
        <button
          type="button"
          onClick={() => setDetailsConfirmed(false)}
          className="text-indigo-600 text-sm font-bold mt-4"
        >
          ← Back
        </button>
      </Centered>
    );
  }

  const isDelivery = mode === "DELIVERY";

  return (
    <>
      <Head>
        <title>{isDelivery ? "Delivery" : "Pick Up"} Order</title>
      </Head>
      <PublicOrderMenu
        outletName={menu.outletName}
        headerBadge={isDelivery ? "🛵 Delivery" : "🛍️ Pick Up"}
        headerSubtitle={isDelivery ? `Delivering to: ${address}` : `Pickup · ${phone}`}
        items={menu.items}
        cartState={cartState}
        notes={notes}
        onNotesChange={setNotes}
        submitting={submitting}
        submitError={submitError}
        onSubmit={submitOrder}
        submitLabel={isDelivery ? "Place Delivery Order" : "Place Pickup Order"}
        confirmation={confirmation}
        onOrderMore={() => setConfirmation(null)}
        confirmationHeading={isDelivery ? "Order placed!" : "Order placed!"}
        confirmationSubtext={
          isDelivery ? "We'll deliver it to your address shortly." : "We'll text you when it's ready for pickup."
        }
      />
    </>
  );
}

function ModeCard({
  emoji,
  label,
  desc,
  onClick,
}: {
  emoji: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md rounded-2xl p-4 flex items-center gap-3 text-left transition shadow-sm"
    >
      <span className="text-3xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block font-extrabold text-sm text-slate-900">
          {emoji} {label}
        </span>
        <span className="block text-xs text-slate-500 mt-0.5">{desc}</span>
      </span>
    </button>
  );
}
