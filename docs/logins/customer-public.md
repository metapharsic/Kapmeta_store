# Customer (public, unauthenticated)

## Entry points
- `apps/pos-web/pages/order/[tableId].tsx` — QR-code / tableless-URL entry scoped to a specific
  table (dine-in ordering).
- `apps/pos-web/pages/order/index.tsx` — tableless public entry (`TablelessOrderEntryPage`),
  for customers who did **not** scan a table QR (e.g. arriving from a delivery/pickup link or a
  QR on packaging/at the counter). Per the comment at `order/index.tsx:10-15`, Dine In is
  deliberately **not** offered here — it requires a physical table, so this page only explains
  that and points the customer at a table QR instead.

## Authentication
None. Neither page calls `useAuthGuard`, and the API routes they call
(`apps/api/src/routes/public-order.ts`) are not behind `requireAuth` — confirmed by contrast
with `orders.ts`, where every route explicitly imports and applies `requireAuth`/
`requirePermission`; `public-order.ts` is a separate, deliberately public router.

Real contract, per the comment block in `order/index.tsx:17-24`:
```
GET  /public/outlets/:outletSlugOrId/menu
POST /public/outlets/:outletSlugOrId/order
     body: { idempotencyKey, orderType: "DINE_IN" | "DELIVERY" | "PICKUP"
              (also accepts "TAKEAWAY", normalized to "PICKUP"), lines }
```
`:outletSlugOrId` accepts either the `Outlet.id` or its human-facing `code` column.

## What they can / can't do
- Browse a real outlet's public menu (`GET /public/outlets/:id/menu`) — no login, no session.
- Place an order with an idempotency key to avoid duplicate submits on retry/double-tap.
- On the tableless entry page: pick Delivery or Pickup mode, and enter phone/address, which are
  folded into each order line's `notes` field rather than sent as dedicated fields — per the
  comment at `order/index.tsx:22-24`, the server has no dedicated customer phone/address field
  yet, so the client works around this rather than silently dropping the data.
- Cannot: view other orders, see kitchen/staff-only data, or access anything behind
  `requireAuth` — there is no session at all for this persona, by design.

## Data scope
Not outlet-scoped by JWT (there is no JWT) — instead scoped explicitly by the
`:outletSlugOrId` path segment on every request, which the customer's link/QR code encodes.
There is, per the `order/index.tsx` comment, "no other outlet-discovery mechanism yet" for the
tableless entry page — the outlet must be known in advance from the QR/link.

## Example flow (traced against real code)
**Table QR / dine-in** (`order/[tableId].tsx`): customer scans a table's QR code → lands on
`/order/[tableId]` → page resolves the table's outlet → fetches the public menu → customer adds
items and submits → `POST /public/outlets/:id/order` with `orderType: "DINE_IN"`.

**Tableless (delivery/pickup)** (`order/index.tsx`): customer opens a link/QR carrying
`?outlet=<idOrCode>` → `TablelessOrderEntryPage` reads it into `outletId` state → customer picks
Delivery or Pickup (Dine In is explained-away, not offered) → confirms phone/address →
`usePublicCart` builds the cart → submits `POST /public/outlets/:id/order` with the chosen
`orderType` and phone/address folded into line `notes`.

## Open questions / unclear from code
- How the resulting public order becomes visible to staff (which outlet-scoped order view it
  surfaces in — presumably `orders.tsx`'s `order.read`-gated list or `waiter.tsx`'s live feed)
  was not traced from the `public-order.ts` side in this pass; only the two customer-facing
  pages and their documented API contract were confirmed.
