# Business Rules (Enforced in Code)

Each rule below is something actually enforced in code found this session,
cited file:line, not an aspirational spec.

## 1. Multi-tenancy: `outlet_id NOT NULL` on operational tables

Every operational model in `kapmeta/schema.prisma` carries `outletId`/
`outlet_id` as a required column: `Outlet` itself (`:133`), `Station`
(`:163`), `MenuItem` (`:369`), `Order` (`:411`), `OrderItem` (`:457`),
`KOTTicket` (`:549`), `KOTItem` (`:576`), `Payment` (`:670`),
`DiningTable` (`:196`), `table_seats`/`table_merge_groups`/
`order_seat_bills` (`:275`-`:342`). This mirrors ADR-0007
(`docs/adr/0007-tenancy-and-outlet-scoping.md`) which mandated outlet
scoping from migration 001 onward specifically to avoid a costly retrofit.
`services/orders/src/order-service.ts` methods on `OrderRepository`
consistently take `outletId` as the first parameter (e.g. `nextOrderNumber
(outletId)`, `addItems(outletId, orderId, ...)`,
`voidItem(outletId, orderId, ...)` — lines 30, 45, 51) rather than trusting
a bare `orderId`, so every write path is outlet-scoped at the call-site
signature, not just at the schema level.

## 2. Currency is `BigInt` minor units everywhere

Every money-bearing column in the schema is `BigInt`, never `Float`/
`Decimal`: `Order.subtotal/discountTotal/taxTotal/grandTotal/
serviceChargeTotal/tipTotal/roundOffMinor/depositMinor`
(`kapmeta/schema.prisma:417-430`), `OrderItem.unitPrice/subtotal`
(`:463-464`), `Payment.amount` (`:672`), `order_seat_bills.*_total`
(`:301-307`), `OrderItemModifier.price_delta_minor` (`:487`). The naming
convention itself documents the unit: `depositMinor`, `roundOffMinor`,
`price_delta_minor` all name minor units (paise) explicitly.
`services/orders/src/order-service.ts` `priceOrder()` (line 164) operates
exclusively in `bigint` — `let subtotalMinor = 0n`, `unitPrice = BigInt(...)`,
`qty = BigInt(...)` (lines 170, 194, 196) — so no floating-point rounding
ever enters a pricing calculation.

## 3. Tax-inclusive pricing convention

`priceOrder()` in `services/orders/src/order-service.ts` (lines 164-201)
treats `MenuItem.price` (and the modifier surcharge) as **tax-inclusive**:
it computes the line subtotal first from the inclusive unit price
(`lineSubtotalMinor = (unitPrice + surcharge) * qty`, line 197), then backs
the tax **out** of that inclusive amount rather than adding tax on top:

```
lineTaxMinor = lineSubtotalMinor - (lineSubtotalMinor * 10000n) / (10000n + taxRateBasisPoints)
```

(line 201). This is the standard "extract tax from a GST-inclusive MRP"
formula (basis points at 10000 = 100.00%), confirming menu prices shown to
guests already include tax — the system does not add tax on top at
checkout. `MenuItem.taxRate` defaults to `5.00` (`Decimal(5,2)`,
`kapmeta/schema.prisma:372`).

## 4. KOT state machine: QUEUED -> PREPARING -> READY -> SERVED

`packages/shared-types/kitchen.ts` defines `KOT_TRANSITIONS` (lines 9-17)
as the single source of truth for legal KOT status transitions:

```
QUEUED:    [PREPARING, CANCELLED, MODIFIED, SHIFTED]
PREPARING: [READY, CANCELLED, MODIFIED, SHIFTED]
READY:     [SERVED, CANCELLED, MODIFIED, SHIFTED]
SERVED:    []   // true terminal, no further transitions
CANCELLED/MODIFIED/SHIFTED: []
```

`isKotTransitionLegal(from, to)` (line 20) is the guard function. The
comment at lines 11-13 clarifies CANCELLED/MODIFIED/SHIFTED are
"leakage-tracking terminal-ish statuses" any active ticket can be diverted
into, while SERVED is the only true terminal state. `apps/pos-web/pages/
kitchen.tsx` (around the KOT_TRANSITIONS comment near its status-advance
handler) explicitly notes the API rejects an illegal jump (e.g. QUEUED
straight to READY) with HTTP 409 — advance is always exactly one step. The
in-schema doc comment above `model KOTTicket`
(`kapmeta/schema.prisma:502-547`) additionally documents legacy status
aliases still tolerated on read in `apps/api/src/routes/tables.ts`
(`KOT_CREATED`/`PENDING` -> `QUEUED`, `IN_PREPARATION`/`COOKING` ->
`PREPARINF`) and that "Used In Bill" in the reference UI is not its own
status — it's `SERVED` plus `billPrintedAt` non-null.

## 5. IDs are TEXT, not UUID — including where the schema still says `@db.Uuid`

Confirmed live (not merely declared) via `scripts/inspect-db-v2.js`: the
script's header comment (lines 1-6) states "outlets.id is TEXT live despite
every migration file declaring UUID" and that this was discovered from a
`42804` FK type-mismatch failure (uuid vs text) in a real migration run.
Every table the script checks is TEXT except
`integrations`/`channel_accounts.integration_id` (script comment, lines
38-41). `management_lists.id` / `management_settings.id` /
`management_activity_logs.id` (`kapmeta/schema.prisma:1738, 1754, 1765`)
default via `gen_random_uuid()::text` — generating a UUID and immediately
casting it to `text`, which is the concrete Prisma-level expression of the
TEXT convention. Migration `0047_repair_seat_and_merge_uuid_text_mismatch.sql`
and the in-schema comments on `table_merge_groups`, `table_merge_members`,
`table_seats`, `order_seat_bills`, `order_item_seat_shares`, `KOTItem`,
and `Customer` (each: "id/outlet_id/etc were @db.Uuid; removed 2026-09-03
(migration 0047/0046) ... matching the confirmed universal live convention")
record this repair. This is not yet complete: TSK-028 and TSK-044 in
`agents/task-board.json` are the still-open audit debt — see
`docs/brain/KNOWN_GAPS.md`.

## 6. Order numbers are gapless, per-outlet, per-day, and atomic

`OrderRepository.nextOrderNumber(outletId)`
(`services/orders/src/order-service.ts:28-30`) is documented in its own
comment as returning "Gapless, outlet-scoped, per-day order number (e.g.
"20260810-0007") — atomic at the DB level so two concurrent checkouts
can't collide." This is a real concurrency guarantee, not app-level
best-effort numbering.

## 7. Modifier price is frozen at order time

`OrderItemModifier.price_delta_minor` (`kapmeta/schema.prisma:487`) stores
the modifier's price delta as it was when the line was ordered, separate
from the live `modifier_options` price. `priceOrder()` likewise resolves
modifier prices once at pricing time via a `Map<string, bigint>` passed in
(`services/orders/src/order-service.ts:167, 183-192`) rather than joining
against the current modifier price at read time — so a later modifier
price change never retroactively changes an already-placed order's total.
