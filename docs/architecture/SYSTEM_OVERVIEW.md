# System Overview (Current State)

Cross-reference: `docs/03-architecture/` for the original R1 design intent.
This file is the current-state map after this session's work.

## Top-level components

- **`apps/api`** — the API gateway. Express routes under
  `apps/api/src/routes/*` (26 route files this session, e.g. `orders.ts`,
  `kitchen.ts`, `menu.ts`, `tables.ts`, `finance.ts`, `inventory.ts`,
  `public-order.ts`, `management.ts`, `admin.ts`, `commission.ts`,
  `virtual-outlets.ts`, `waiters.ts`). Also owns `apps/api/src/
  websockets.ts` (the real-time push channel, see
  `docs/adr/0011-polling-not-websocket-for-live-sync.md`) and
  `apps/api/src/index.ts` (process entrypoint, wires HTTP + WS upgrade).
- **`apps/pos-web`** — the touch-first POS/KDS/waiter web app (port 4444
  per `agents/AGENT_REGISTRY.json:39`). Key pages: `pages/kitchen.tsx`
  (KDS board), `pages/waiter.tsx` (waiter tablet), `pages/admin.tsx`
  (executive/admin hub), `pages/reporting.tsx`. `lib/useKapmetaSocket.ts`
  is the shared WebSocket client hook.
- **`apps/admin-web`** — a separate admin web app (port 4445 per the same
  registry entry) alongside `pos-web`'s own `/admin` route — the registry
  domain string groups both under one "Frontend UI Agent" scope.
- **`services/*`** — domain service packages, one directory per bounded
  context, each with its own `src`/`test`/`package.json`: `menu`,
  `orders`, `kitchen`, `finance`, `inventory`, `purchase`, `tables`,
  `tax`, `printing`, `marketing`, `crm`, `notifications`, `aggregator`,
  `integration`, `integration-hub`, `reporting`, `settings`, `auth`,
  `admin`, `shared`. `services/orders/src/order-service.ts` (pricing,
  order lifecycle) and `packages/shared-types/kitchen.ts` (KOT state
  machine contract) are the two most load-bearing files found this
  session — see `docs/brain/BUSINESS_RULES.md`.
- **DB layer** — `kapmeta/schema.prisma` (Prisma schema, ~85 models) plus
  `db/migrations/` (55 numbered SQL migrations + `BLOCKED-MIGRATIONS.md`
  and a `README.md`). `scripts/inspect-db-v2.js` is the live-DB ground-
  truth diagnostic tool written this session — see
  `docs/adr/0009-text-ids-not-uuid.md`. Full convention notes in
  `docs/architecture/DATABASE.md`.
- **Public customer-order surface** — `apps/api/src/routes/
  public-order.ts`: unauthenticated (no `requireAuth`) endpoints
  `GET /public/tables/:tableId/menu`, `GET /public/outlets/
  :outletSlugOrId/menu`, `POST /public/tables/:tableId/order`, and
  `POST /public/outlets/:outletSlugOrId/order` (lines 53, 85, 128, 195) —
  this is the QR-code-at-the-table / online-ordering entry point that
  lets a guest place an order without a POS login, distinct from every
  other route file which sits behind `requireAuth`.

## Real data flow: POS terminal order -> KOT -> kitchen board

1. A terminal (or the public-order surface) creates an order via the
   orders route, which calls into `services/orders/src/order-service.ts`.
   `priceOrder()` (line 164) computes `subtotalMinor`/`taxTotalMinor` per
   line from tax-inclusive `MenuItem.price`, producing a `PricedOrder`.
2. `OrderRepository.createOrder(id, input, priced, orderNumber)`
   (interface at `order-service.ts:32-37`) persists the `Order` +
   `OrderItem` rows, with `orderNumber` obtained atomically from
   `nextOrderNumber(outletId)` (gapless, per-outlet, per-day — line 28-30).
3. Firing a KOT (`apps/api/src/routes/kitchen.ts`, using `createKot` from
   `@kapmeta/kitchen`) creates a `KOTTicket` (status `QUEUED`) plus its
   `KOTItem` rows, each optionally linked back to the `OrderItem` that
   generated it (`KOTItem.orderItemId`, nullable — `kapmeta/
   schema.prisma:574`). The ticket is routed to a `Station` via
   `MenuItem.station_id` -> `KOTTicket.stationId`.
4. `transitionKot` (also from `@kapmeta/kitchen`, imported at
   `kitchen.ts:3`) enforces `KOT_TRANSITIONS`
   (`packages/shared-types/kitchen.ts:9-17`) — `QUEUED -> PREPARING ->
   READY -> SERVED`, rejecting illegal jumps. Every transition is recorded
   in `KOTStatusHistory` (`kapmeta/schema.prisma:596-606`).
5. The kitchen board (`apps/pos-web/pages/kitchen.tsx`) receives the new/
   updated ticket over the WebSocket (`useKapmetaSocket`,
   `kot.created`/`kot.status_updated` topics — `lib/
   useKapmetaSocket.ts:11-12`) and re-fetches via `fetchTickets()`; a
   30-second `setInterval` backstops any missed socket event
   (`kitchen.tsx:88`, see `docs/adr/0011-polling-not-websocket-for-live-sync.md` for why both exist).
6. When the ticket reaches `SERVED` and a bill is printed,
   `KOTTicket.billPrintedAt` is set (migration 0039) — the UI shows "Used
   In Bill" for `SERVED` + `billPrintedAt` non-null, not a distinct
   status (documented in-schema at `kapmeta/schema.prisma:502-547`).
7. Payment is recorded via `Payment` (`kapmeta/schema.prisma:669`),
   scoped to `outletId`/`orderId`, optionally per-seat
   (`seatNumber`/`seatId`/`orderSeatBillId`) for split bills.

## Not directly traced this session

The `services/*` packages' internal wiring into `apps/api` routes was
confirmed by import (`@kapmeta/kitchen`, `@kapmeta/orders` imported in
`apps/api/src/routes/kitchen.ts`), but not every route file was read in
full — this overview reflects the KOT/order/kitchen path traced above plus
the directory-level component map, not a line-by-line audit of every
service package.
