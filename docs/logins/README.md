# Login / Persona Guide

This is an index of every real login surface / persona this app actually has, confirmed by
grepping `apps/pos-web/pages` for `useAuthGuard(<permission>)` calls, `apps/api/src/routes`
for enforced permission strings, and `db/seeds/seed_permissions.sql` for the real permission
catalog — not a fixed, assumed persona list.

## Auth architecture (real, grounded in code)

**Mechanism:** JWT bearer tokens, issued by `apps/api/src/routes/auth.ts`.

- `POST /auth/login` — email + password + `outletId` → `PrismaUserRepository.verifyCredentials`.
  On success, issues an access token (15 min TTL, `ACCESS_TOKEN_TTL_SECONDS = 900`) and a
  refresh token (30 day TTL), and creates a `Session` row via `PrismaSessionStore`.
- `POST /auth/pin-login` — 4-digit PIN + `outletId` (+ `userId` or `email` to identify the
  user) → verifies `User.pinHash` with `verifyPassword`. This is the **real** fast-login path
  for floor staff (waiters/captains) on shared tablets — see `apps/pos-web/components/
  CaptainPinLoginModal.tsx`, which first calls `GET /auth/staff-profiles?outletId=...` to list
  active staff for that outlet, then `POST /auth/pin-login`. Both paths mint the same kind of
  access token.
- `POST /auth/verify-pin` — for an *already-authenticated* session, checks a PIN against the
  current user's own `pinHash` (terminal re-lock/unlock use, not a login path).
- `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/outlets/mine`,
  `GET /auth/outlets` (public outlet picker), `POST /auth/switch-outlet` (re-validates the
  caller's real `UserRole` grant server-side and mints a fresh token scoped to a different
  outlet, without re-prompting for a password).

**JWT claims (`apps/api/src/routes/auth.ts`, signed via `signAccessToken`):**
`{ sub: <userId>, outletIds: [<outletId>], sessionId: <session.id> }`.

**Server-side enforcement** (`apps/api/src/middleware/require-auth.ts`):
- `requireAuth` verifies the bearer token, and sets `req.auth = { userId, outletId }` where
  `outletId = claims.outletIds[0]` — i.e. **outlet scope always comes from the signed JWT,
  never from a request body or header** (`X-Outlet-Id` is sent by the client as a hint but the
  route layer reads `req.auth.outletId`, per the comment at require-auth.ts:26-28).
- `requirePermission(...actions)` re-checks the permission against real `RolePermission` rows
  via `PrismaRbacChecker.checkPermission`, accepting any of several actions (e.g.
  `kot.read` OR `kitchen.kds.view`) and 403ing otherwise.

**Client-side gate** (`apps/pos-web/lib/auth.ts`, `useAuthGuard(permission)`):
- Redirects to `/login` if there's no stored session.
- Calls `GET /auth/me` (returns `{ roles: string[], permissions: string[], outlet }`) and:
  - If `roles` includes `"SUPER_ADMIN"`, `"SUPERADMIN"`, or `"OWNER"` → full access to every
    guarded page (super-admin bypass), **or**
  - If `permissions` includes the page's required permission string → access, **or**
  - Otherwise, redirects to that user's "primary domain screen" based on whichever permission
    they *do* have (`order.create` → `/`, `kot.read` → `/kitchen`,
    `inventory.stock.adjust`/`inventory.read` → `/inventory`,
    `menu.category.manage`/`report.read` → `/admin`).
- This is client-side UX routing only — the real authorization boundary is always the API's
  `requirePermission` middleware.

**Roles are free text, not fixed codes.** `db/seeds/seed_permissions.sql` seeds one hardcoded
role row, `ADMIN` (code `'ADMIN'`), and grants it every permission in the catalog — that is the
only role the seed data fixes. Elsewhere in the app (e.g. `apps/pos-web/pages/management/
biller-app.tsx`), "roles" like Biller/Captain/Delivery Boy/Waiter/Order Acceptance are **not**
enum codes — the biller-app page queries `GET /management/biller-app?role=<substring>` and
matches staff by a plain-English substring against whatever a `Role.name` or `userRoles[].
roleName` string actually contains (biller-app.tsx:8-16, 32-37). A tab with zero matching real
users is a legitimate empty state, not a broken feature. Real access control never depends on
these role-name strings — it always depends on the `permissions[]` array `GET /auth/me`
returns, which is derived from real `RolePermission` rows via `PrismaRbacChecker`.

**Permission catalog** (`db/seeds/seed_permissions.sql`): ~45 permission codes across modules
`order`, `kot`, `table`, `bill`, `payment`, `menu`, `inventory`, `report`, `finance`, `crm`,
`settings`, `users`, `outlets`, `roles`, `integration`, `audit` (e.g. `order.create`,
`kot.read`, `menu.category.manage`, `users.manage`, `report.read`, `settings.manage`). Some
permission strings enforced in route code (e.g. `kitchen.kds.view`, `order.void`,
`inventory.stock.deduct`) are not present in this particular seed file — the seed is a
bootstrap/dev fixture, not a guaranteed exhaustive live catalog; treat it as representative,
not complete.

**Outlet scoping:** every authenticated user is scoped to the outlet(s) they hold a `UserRole`
grant for. A `UserRole` row with `outletId = null` is an org-wide grant (super admin) giving
access to every active outlet (`auth.ts`, `GET /auth/outlets/mine`); otherwise the user only
sees the specific outlet(s) they have rows for. Every API route that touches outlet-scoped data
reads `req.auth.outletId` (from the signed token), never a client-supplied value.

## Personas (confirmed real via grep)

| File | Entry page(s) | Auth mechanism | Primary gating permission |
|---|---|---|---|
| [admin-owner.md](./admin-owner.md) | `/admin` | password login (JWT) | `report.read` (+ super-admin role bypass) |
| [cashier-pos-terminal.md](./cashier-pos-terminal.md) | `/`, `/table-view` | password login (JWT), optional PIN unlock | `order.create` |
| [waiter.md](./waiter.md) | `/waiter` | password login **or** fast PIN login (JWT) | `order.create` |
| [chef-kitchen.md](./chef-kitchen.md) | `/kitchen` | password login (JWT) | `kot.read` (or `kitchen.kds.view`) |
| [biller-app-management.md](./biller-app-management.md) | `/management/biller-app` | password login (JWT) | `users.manage` |
| [customer-public.md](./customer-public.md) | `/order`, `/order/[tableId]` | none — unauthenticated | n/a (no `useAuthGuard`) |

Every persona above corresponds to an actual `useAuthGuard(...)` call found in
`apps/pos-web/pages/**`; there is no separate fixed "role" concept beyond that guard and the
free-text role labels described above. Pages not covered here (inventory, menu, CRM, finance,
marketing, settings, reports, integrations, etc.) are real too, but are sub-areas reachable
*within* the Admin/Owner persona's `report.read`/`settings.manage`/`menu.read`-class
permissions rather than distinct login personas.
