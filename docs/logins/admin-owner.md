# Admin / Owner

## Entry point
`apps/pos-web/pages/admin.tsx` — the main back-office dashboard (4373 lines; the largest page
in the app). Also the fallback destination `useAuthGuard` sends a user to if they lack the
permission for whatever page they tried to load and hold `menu.category.manage` or
`report.read` (`apps/pos-web/lib/auth.ts`, the `target` selection logic in `useAuthGuard`).

## Authentication
Standard email + password login: `POST /auth/login` with `{ email, password, outletId }`
(`apps/api/src/routes/auth.ts:29`). No special admin-only login route exists — an
Admin/Owner is just a user whose `permissions[]` (from `GET /auth/me`, computed by
`PrismaRbacChecker.listPermissions`) happens to include the permissions the admin pages check,
or whose `roles[]` includes `"SUPER_ADMIN"`, `"SUPERADMIN"`, or `"OWNER"`.

**Super-admin bypass is real and literal**: `useAuthGuard` in `lib/auth.ts` checks
`result.roles.includes("SUPER_ADMIN") || result.roles.includes("SUPERADMIN") ||
result.roles.includes("OWNER")` and, if true, grants access to *any* guarded page regardless of
the page's required permission string. This is a client-side convenience only — it still
depends on the server's `roles` array being accurate, and every mutating API call is still
subject to the server-side `requirePermission` middleware independently, so a super-admin role
string alone does not bypass server checks unless the RBAC data actually grants the permission.

## Gating permission
`apps/pos-web/pages/admin.tsx:429` — `useAuthGuard("report.read")`. Other admin-area pages gate
on their own specific permissions (this is not one monolithic "admin" permission — see table
below), e.g.:

| Page | Permission required |
|---|---|
| `admin.tsx` | `report.read` |
| `finance.tsx` | `report.read` |
| `kitchen-analytics.tsx` | `report.read` |
| `reports/*.tsx` | `report.read` (or a per-report `entry.permission` override in `reports/view.tsx:161`) |
| `menu.tsx`, `menu/hub.tsx`, `table-management.tsx` | `menu.category.manage` |
| `menu/manage.tsx`, `menu/physical.tsx`, `menu/scheduling.tsx`, `menu/commission.tsx`, `menu/images-upload.tsx`, `menu/special-notes.tsx`, `inventory/classic.tsx` | `menu.read` |
| `inventory/index.tsx`, `inventory/purchase*.tsx` | `inventory.read` |
| `menu/virtual-outlets.tsx`, `management/settings.tsx`, `management/list.tsx` | `settings.manage` |
| `management/expense-management.tsx`, `management/online-reconciliation.tsx`, `management/payment-information.tsx`, `management/service-payment-history.tsx`, `management/virtual-wallet.tsx` | `settings.read` |
| `management/logs.tsx`, `management/biller-app.tsx`, `user-management.tsx` | `users.manage` |
| `crm.tsx` | `crm.read` |
| `marketing.tsx` | `crm.write` |
| `channel-availability.tsx`, `integrations.tsx` | `integration.manage` |
| `settings/company.tsx` | `settings.manage` |

A real Admin/Owner account typically holds most or all of these permissions at once (via an
`ADMIN`-coded role, or the super-admin role-name bypass above), which is why the persona reads
as one "Admin/Owner" experience even though each page checks its own narrow permission string.

## What they can / can't do
Everything behind the permission table above is reachable: reporting & analytics, finance,
menu & category management, inventory, table management, CRM/marketing, integrations, user
management (including the Biller App management screen — see `biller-app-management.md`),
settings, and company profile. What they *cannot* do is bypass the server: every mutating API
route still independently calls `requirePermission(...)` (`apps/api/src/middleware/
require-auth.ts`) against real `RolePermission` rows, so if the RBAC data doesn't actually
grant a permission, the UI may render (client bypass via super-admin role name) but the API
call will 403.

## Data scope
Outlet-scoped like every other persona: `req.auth.outletId` is resolved from the signed JWT
(`outletIds[0]` claim), never a client-supplied value. An Admin/Owner with a `UserRole` row
where `outletId IS NULL` gets an org-wide grant and can see/switch to every active outlet via
`GET /auth/outlets/mine` + `POST /auth/switch-outlet`; an Admin/Owner scoped to specific
outlets only sees those.

## Example flow (traced against real code)
1. User submits email/password on `/login` → `login()` in `lib/auth.ts` calls
   `POST /auth/login` → stores `{ accessToken, refreshToken, userId, email, outletId }` in
   `localStorage` under `kapmeta_pos_session`.
2. Navigates to `/admin` → `useAuthGuard("report.read")` fires `GET /auth/me` with the bearer
   token → server computes `{ roles, permissions }` via `PrismaRbacChecker.listPermissions`.
3. If `report.read` is present (or a super-admin role name is present), the page renders and
   begins its own data fetches via `authedFetch(...)`, which attaches
   `Authorization: Bearer <token>` and an `X-Outlet-Id` hint header automatically.
4. Every subsequent admin-area page navigated to (menu, inventory, reports, settings, ...) runs
   its own independent `useAuthGuard(<that page's permission>)` check against the same session.

## Open questions / unclear from code
- The exact criteria by which a real user is assigned the `SUPER_ADMIN`/`SUPERADMIN`/`OWNER`
  role name is not shown in the pages/routes reviewed here — it depends on how `Role.name` and
  `UserRole` rows are seeded/administered, which was not traced further for this doc.
