# Cashier / POS Terminal

## Entry point
`apps/pos-web/pages/index.tsx` (main POS terminal — floor plan / billing view toggle) and
`apps/pos-web/pages/table-view.tsx` (dedicated floor-plan view that hands off to `/` with a
selected table).

## Authentication
Email + password login (`POST /auth/login`), same mechanism as every other password-based
persona — there is no cashier-specific login route. `index.tsx:10` calls
`useAuthGuard("order.create")`; `table-view.tsx:10` calls the same guard.

A cashier can also re-verify their own PIN mid-shift via `POST /auth/verify-pin`
(`lib/auth.ts` `verifyPin()`), which checks the currently-authenticated user's `User.pinHash`
server-side — this is a terminal lock/unlock check, not a separate login path (no PIN value is
ever accepted client-side; every attempt round-trips to the API per the comment at
`auth.ts:...verify-pin`).

## Gating permission
`order.create` (`apps/pos-web/pages/index.tsx:10`, `apps/pos-web/pages/table-view.tsx:10`).
This is also the permission `useAuthGuard`'s fallback routing treats as the "primary domain
screen" signal for `/` (`lib/auth.ts`: `if (result.permissions.includes("order.create")) target
= "/"`), i.e. this is the app's default persona when a user's permission set doesn't match any
of the other named domains.

Related order-flow permissions enforced server-side in `apps/api/src/routes/orders.ts`:
`order.create` (create order, add items), `order.update` (status/hold/fire-advance),
`order.void` (void item / cancel order), `order.discount` (charges), `bill.settle` (record
payment).

## What they can / can't do
- `index.tsx` renders either `TableViewFloor` (floor plan) or `PosBillingView` (billing/cart)
  depending on `viewMode`, switched via the `?table=` / `?mode=` query params.
- Can create orders (dine-in/delivery/pickup), select tables, and — subject to the specific
  extra permissions above being present in their RBAC grant — update order status, void items,
  apply discounts, and settle bills. A cashier who has only `order.create` and none of
  `order.update`/`order.void`/`order.discount`/`bill.settle` will get a 403 from the API on
  those specific actions even if the UI renders the buttons.
- Cannot reach admin-only screens (reports, settings, user management, menu editing) unless
  they separately hold those pages' permissions too.

## Data scope
Outlet-scoped via `req.auth.outletId` from the JWT, same as every persona (see README). The
displayed outlet name/code on the terminal (`index.tsx:12-14`) comes from `me.outlet`, i.e. the
real outlet tied to the current session's token — not a hardcoded value (the fallback strings
`"Hotel Kapila"` / `"R327038"` only render while `me` hasn't loaded yet).

## Example flow (traced against real code)
1. Cashier logs in with email/password for a specific `outletId` → session stored.
2. Loads `/` → `useAuthGuard("order.create")` passes → `TableViewFloor` renders the floor plan
   for that outlet.
3. Selects a table → `router.push('/?table=...&tableId=...')` → `viewMode` flips to
   `"BILLING"` → `PosBillingView` renders for that table.
4. Adds items / creates the order → `POST /orders` (requires `order.create`, verified
   server-side by `requirePermission("order.create")` in `orders.ts:65`).
5. Settling later calls `POST /orders/:id/payments` (requires `bill.settle`,
   `orders.ts:821`) if the cashier's grant includes it.

## Open questions / unclear from code
- Whether "Cashier" is ever an explicit `Role.name` string in seed/admin data, versus simply
  "whoever has `order.create` and not much else," was not confirmed — roles are free text in
  this app (see README), and no seed data assigning a `"CASHIER"`-named role was found beyond
  the avatar-icon heuristic in `apps/api/src/routes/auth.ts`'s `/auth/staff-profiles` handler
  (`if (roleName.includes("CASHIER")) avatar = "💳"` — a display hint only, not an access-control
  check).
