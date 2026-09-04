# Delivery / Pickup Order Flow

Two independent paths exist in this codebase for a non-dine-in order: the
customer-facing public app (built out in CP-25) and the POS-side mode tabs
staff use directly. This doc traces both and documents the real gap between
them honestly, per the CP-25 STATUS.md entry.

## Path A — Public customer order app (added CP-25, commit `f1a6460`)

### Entry point: `apps/pos-web/pages/order/index.tsx` (334 lines)

Before CP-25 the only public ordering surface was a table-QR page that
hardcoded `orderType: DINE_IN`. This file is the new tableless entry point —
three cards: Dine In (explains it needs a table QR code, does not let you
order from here), Delivery, and Pickup. Choosing Delivery or Pickup walks
the customer through:

1. **Step 2 (line ~188-191):** collect `phone` (always) and `address`
   (delivery only) — `canContinue` requires `phone.trim().length >= 7` and,
   for delivery, `address.trim().length >= 5`.
2. Menu browsing via the shared `PublicOrderMenu` component (the same one
   `[tableId].tsx` was refactored onto in this round, so dine-in behavior
   was left unchanged).
3. **Submit (line ~89-107):** builds `combinedNotes` —

   ```
   Deliver to: {address} | Ph: {phone}     // DELIVERY
   Pickup — Ph: {phone}                    // PICKUP
   ```

   optionally appended with the customer's free-text notes — and sends it
   as the line-item `notes` field.

### Backend: `apps/api/src/routes/public-order.ts` (252 lines)

Two route families:
- `GET/POST /public/tables/:tableId/order` — the original table-QR path,
  untouched by CP-25, always `orderType: DINE_IN` (line 160).
- `GET/POST /public/outlets/:outletSlugOrId/menu|order` — new in CP-25,
  outlet-scoped (resolves by `outlet.id` or `outlet.code`), no table
  required. `POST /public/outlets/:outletSlugOrId/order` (line 195):
  - Resolves the outlet, validates line items server-side.
  - `normalizeOrderType(req.body?.orderType, "DINE_IN")` — same
    normalization function `orders.ts` uses, so a Delivery/Pickup order
    placed here lands with the identical `orderType` value the POS side
    would write.
  - Calls the same `createOrder` domain function POS uses
    (`PrismaMenuPriceLookup` + `PrismaOrderRepository` +
    `PrismaModifierPriceLookup`) — one order-creation code path for both
    surfaces, not a forked one.
  - Leaves `diningTableId` undefined — "same convention POS uses when
    there's no table" (comment at line ~225).
  - Prices are never accepted from the client — comment at line 114:
    "price is intentionally never accepted."

## Path B — POS-side Delivery/Pickup (`PosBillingView.tsx` mode tabs)

Staff-facing: `PosBillingView.tsx` (2263 lines) has `DINE_IN` / `DELIVERY` /
`PICKUP` / `TAKEAWAY` mode tabs, enabled end-to-end in CP-25 per that
round's STATUS.md entry ("User: enable Dine In/Delivery/Pick Up and sync
with the app. Found: POS terminal already fully wired for all 3
orderTypes."). Orders placed here go through the same `POST /orders` route
in `orders.ts` that the dine-in trace uses (see `DINE_IN_ORDER_FLOW.md`).

## The real, honest gap

Neither path has a dedicated `customer_phone` / `customer_address` column on
the `Order` model in `schema.prisma`. This was a deliberate, documented
decision in CP-25 rather than a silent drop:

> "No fake customer fields invented: phone/address folded into order line
> notes since no dedicated field exists server-side (documented, not
> silently dropped)."

Practically this means:
- A delivery order's address only exists as free text buried inside a line
  item's `notes` field — there is no structured field a reports query or
  the rider dispatch UI could reliably parse it out of.
- The public order app's phone/address collection (Step 2 above) exists
  purely for display in that combined-notes string; the backend has no
  independent knowledge that a given order needs those two fields at all.
- This is a real, load-bearing limitation, not a cosmetic one: any future
  work that wants to text a customer, or show a delivery rider a clean
  address field, needs a schema migration first (a natural follow-up to the
  `TSK-025`/`TSK-033`-style "flag it, don't fake it" pattern this session
  used repeatedly for the reconciliation/payment-history tabs in CP-23).

No fabricated rider name, ETA, or delivery-status field exists anywhere in
this flow — CP-16's audit explicitly called out and removed a fake rider
name/phone that had been hardcoded in `AggregatorOrdersView.tsx` before this
session; the same discipline applies here, which is why delivery/pickup
orders route through the same honest `notes`-folding rather than growing
invented structured fields.
