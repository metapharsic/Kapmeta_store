# Waiter (/ Captain)

## Entry point
`apps/pos-web/pages/waiter.tsx` (2634 lines — floor plan, cart, KOT firing, captain nav
drawer). The biller-app management screen's "Captain App" and "Waiter App" tabs
(`management/biller-app.tsx`) manage the underlying user accounts for this persona; see
`biller-app-management.md`.

## Authentication
Two real paths, both ending in the same kind of JWT session:

1. **Standard password login** — `POST /auth/login`, same as every other persona.
2. **Fast PIN login for shared floor tablets** — `apps/pos-web/components/
   CaptainPinLoginModal.tsx`. This modal:
   - Calls `GET /auth/staff-profiles?outletId=<id>` to list active staff for the outlet
     (`apps/api/src/routes/auth.ts` — returns `{ id, name, role, email, avatar }` per distinct
     user, derived from real `UserRole`+`User` rows, with an emoji avatar chosen by substring-
     matching the free-text role name, e.g. `"WAITER"`/`"CAPTAIN"` → 🧑‍🍳).
   - On selecting a staff member and entering a 4-digit PIN, calls
     `POST /auth/pin-login` with `{ pin, userId, outletId }`
     (`CaptainPinLoginModal.tsx:90`), which server-side verifies `User.pinHash` with
     `verifyPassword`, confirms the user is active and holds a `UserRole` grant for that outlet
     (or an org-wide `outletId: null` grant), then mints a normal access/refresh token pair
     exactly like `/auth/login` (`apps/api/src/routes/auth.ts` `router.post("/pin-login", ...)`).
   - `waiter.tsx:1542-1544` exposes a "Fast PIN Switch Staff" button (🧑‍🍳 PIN) that opens this
     modal, letting one shared tablet be handed between waiters quickly without a full
     email/password re-login.

`waiter.tsx:427` gates the page itself with `useAuthGuard("order.create")` (standard
password-session guard) — the PIN-login modal is a *within-app* staff-switch mechanism used
once already inside the app, not a bypass of the page's own guard.

## Gating permission
`order.create` (`waiter.tsx:427`) — same permission as the Cashier/POS Terminal persona. There
is no separate `waiter.*`-namespaced permission in `db/seeds/seed_permissions.sql`; a Waiter
account is distinguished from a Cashier account by which permissions its real `Role` actually
grants (e.g. a waiter's role might carry `order.create` + `kot.create` but not `bill.settle` or
`settings.manage`), not by a fixed "WAITER" permission or role code — see README's "Roles are
free text" section.

## What they can / can't do
`waiter.tsx` renders a floor plan (`DiningTable[]` with `status`, `kitchenStage`, merge/split
state), a menu browser with category/dietary filters (`AttractiveMenuItemCard`,
`MenuCustomizerModal`), a per-table cart with course assignment (STARTER/MAIN/DESSERT/BEVERAGE
via the `Course` type), and KOT-related actions (`MoveKotModal`, `UnsuccessfulKotModal`). It
also includes a `WaiterCashTipsCalculator` component and a `CaptainNavDrawer`. Real capability
beyond page-render is still gated by the specific permission the account's role grants — e.g.
firing a KOT requires whatever the order/KOT creation endpoint checks server-side
(`order.create` for the order; KOT tickets are created as part of that per
`apps/api/src/routes/orders.ts`), and settling a bill requires `bill.settle` regardless of
whether the waiter UI exposes that action.

## Data scope
Outlet-scoped identically to every persona — `req.auth.outletId` from the JWT. `POST
/auth/pin-login` explicitly re-validates that the selected staff member holds a `UserRole`
grant for the outlet passed in the request (`auth.ts`: `prisma.userRole.findFirst({ where: {
userId: user.id, OR: [{ outletId }, { outletId: null }] } })`) before issuing a token — a PIN
alone does not grant cross-outlet access.

## Example flow (traced against real code)
1. A logged-in host/manager session opens `/waiter`, or the tablet is already sitting on it.
2. Waiter taps "🧑‍🍳 PIN" → `CaptainPinLoginModal` opens → fetches `GET
   /auth/staff-profiles?outletId=...` → shows the real active staff roster for this outlet.
3. Waiter selects their name, enters their 4-digit PIN → `POST /auth/pin-login` → on success,
   a fresh session is stored and the page now operates as that waiter.
4. Waiter selects a table on the floor plan, adds items to the cart (course-tagged), and fires
   the order — creating an order (and its KOT ticket) via the order-creation endpoint gated by
   `order.create`.
5. The fired KOT becomes visible on `/kitchen` (Chef/Kitchen persona) via the real-time socket
   channel (`useKapmetaSocket`, used by both `waiter.tsx` and `kitchen.tsx`).

## Open questions / unclear from code
- The exact mechanism by which a specific waiter's PIN (`User.pinHash`) is originally set —
  whether that happens through `management/biller-app.tsx`'s create/edit form, through
  `user-management.tsx`, or elsewhere — was not confirmed in this pass; `biller-app.tsx`'s form
  (`FormState { name, username, password }`) does not visibly expose a PIN field, so where PINs
  are provisioned for PIN-login accounts is unclear and should not be assumed.
- Whether "Waiter" vs "Captain" are functionally different in the app beyond the free-text role
  label (both map to the same 🧑‍🍳 avatar heuristic in `/auth/staff-profiles`, and both surface
  as separate tabs with separate `roleQuery` substrings in `biller-app.tsx`) was not confirmed
  to have any behavioral difference in `waiter.tsx` itself.
