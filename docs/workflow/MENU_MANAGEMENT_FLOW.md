# Menu Management Flow

Real trace of an admin editing the menu and that change propagating (or, in
the bug this documents, failing to propagate) to the waiter app and the
public customer menu. Centers on the CP-24 fix (commit `95acacb`).

## 1. Admin edits — `apps/pos-web/pages/menu.tsx`

The admin-facing menu console (item CRUD landed in CP-11's `TSK-008g`: edit
modal, delete-with-confirm, and a Status toggle wired to a versioned PATCH
on availability). Toggling an item's availability ("86-ing" it) calls
through to the `item_availability` table via the menu/availability routes
in `services/menu/src/availability-service.ts` and
`services/menu/src/stores/prisma-availability-repository.ts`.

## 2. The propagation surfaces

Three different consumers are supposed to agree on whether an item is
available:
- **Admin** (`menu.tsx`) — reads/writes `item_availability` directly via
  the availability service; this path was always correct.
- **Waiter app** (`apps/pos-web/pages/waiter.tsx`) — reads the item catalog
  via `GET /menu/items`.
- **Public QR order menu** (`public-order.ts`'s `GET /public/.../menu`,
  `PublicOrderMenu` component) — also reads via the same catalog listing
  path, `GET /menu/items`.

## 3. The bug (user report: "Chef, waiter and admin all of them menu are not in sync")

Root cause, in `services/menu/src/menu-catalog-repository.ts`
(`PrismaMenuCatalogRepository`): `listAllItems` and `listByCategory` — the
two functions backing `GET /menu/items` and therefore feeding both
`waiter.tsx` and the public QR menu — referenced `row.availabilities`, a
Prisma relation that **does not exist** on the `MenuItem` model. Because
that relation was never real, both functions always fell back to a
hardcoded stub:

```ts
{ isStocked: true, stockQty: 100 }
```

(comment in the file, lines ~147-165, left in place documenting the fix)

So every consumer of `listAllItems`/`listByCategory` — waiter app, public
QR ordering — always saw every item as available, no matter what an admin
had actually 86'd. This was a genuinely different bug class from the DB
schema-drift bugs found elsewhere this session (CP-19/CP-20): the
`item_availability` table itself existed and was correctly populated; the
*query reading it* was silently broken and had been falling back to a fake
stub the whole time.

Notably, `GET /menu/availability` (a separate endpoint, used by the admin
console) computed availability correctly — this is why the admin side
looked fine while waiter/public did not.

## 4. The fix

`menu-catalog-repository.ts` gained a real lookup,
`loadAvailabilityByItem(outletId)` (line 156), which queries the actual
`item_availability` table directly (`(this.prisma as any).item_availability.findMany`
— cast because Prisma client regeneration is blocked in the sandbox, same
constraint noted throughout this session) and builds a `Map` keyed by item
id: `isStocked: row.state !== "OFF"`. `listAllItems`/`listByCategory` now
join against this real map instead of the `row.availabilities` stub.

## 5. The second half of the fix: staleness, not just wrongness

Even with the query fixed, `waiter.tsx` and `menu.tsx` (admin) each only
fetched the menu once on page mount — no periodic refresh. An admin's live
86-toggle would not show up on an already-open waiter screen until a full
reload. Fixed by:
- Adding menu refresh to `waiter.tsx`'s existing 15-second poll loop — the
  same polling pattern `kitchen.tsx` already used for KOT tickets (see
  `DINE_IN_ORDER_FLOW.md` §5).
- Adding a silent 15-second poll on the admin side (`menu.tsx`) as well, so
  two admins editing concurrently also converge.

`kitchen.tsx` was explicitly checked and confirmed out of scope for this
fix — it renders immutable KOT snapshots (what was ordered, not live catalog
state), so menu availability changes have nothing to propagate to there.

## 6. Verification

Diff reviewed: 3 files touched, +56/-17 lines. `tsc` clean on both
`apps/api` and `apps/pos-web`. Committed as `95acacb` ("Fix menu desync:
chef/waiter/admin now agree on availability + refresh live").

## 7. Known follow-up, not fixed in this pass

`MenuItem`/`modifier_*` models in `kapmeta/schema.prisma` still carry
`@db.Uuid` annotations that (per the CP-20 amendment-2 finding that this
entire database's ids are TEXT, not UUID) are likely wrong — flagged as
`TSK-044`, the same bug class already tracked separately as `TSK-028`
(a wider `@db.Uuid` audit across models this session never got to). Not a
blocker for the availability fix itself, since nothing in this path
constructs a raw SQL UUID cast, but a real landmine for whoever touches
these models next.
