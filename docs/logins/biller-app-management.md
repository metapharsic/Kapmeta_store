# Biller App (Management screen)

## What this actually is
`apps/pos-web/pages/management/biller-app.tsx` is **not itself a login persona** — it is an
Admin/Owner-only management screen for administering the *accounts* behind several
tablet/app-based staff personas. It is documented separately here because it's the real place
those personas' user records are created, viewed, edited, and (de)activated, and because it
makes explicit that this app's "roles" are free text, not fixed codes.

## Entry point
`apps/pos-web/pages/management/biller-app.tsx`, reachable from the admin dashboard.

## Authentication
Standard email + password login, same as Admin/Owner. `biller-app.tsx:62` calls
`useAuthGuard("users.manage")` — i.e. only accounts with user-management rights (typically
Admin/Owner) can open this screen at all. It is not a login page for billers/captains/waiters
themselves.

## Gating permission
`users.manage` (`biller-app.tsx:62`). The comment at the top of the file underlines the
free-text nature of roles in this app (`biller-app.tsx:7-9`): *"Real roles in this app are
free-text, so each tab searches by plain-English substring rather than a fake role code — a tab
with no matching real users is an honest empty state, not a bug to paper over."*

## Real UI concept: five tabs, five substring queries
`TABS` (`biller-app.tsx:32-38`) — each tab calls `GET /management/biller-app?role=<roleQuery>`
with a plain substring, matched against whatever a `Role.name` / `userRoles[].roleName` string
actually contains server-side:

| Tab label | `roleQuery` substring |
|---|---|
| Biller App | `"biller"` |
| Captain App | `"captain"` |
| Delivery Boy App | `"delivery"` |
| Waiter App | `"waiter"` |
| Order Acceptance App | `"order acceptance"` |

These are real, working UI concepts — five genuinely different staff-facing app surfaces this
POS system's ecosystem targets — but they are **not backed by five fixed role enum values**.
Whether any given tab shows rows depends entirely on whether real `Role.name` strings in the
database happen to contain that substring. If no role was ever named with "delivery" in it, the
Delivery Boy App tab will legitimately show zero rows without that being a bug.

## What Admin/Owner can do here
Create, edit, activate/deactivate, and (per the file header comment) "sync-code" user accounts
for these app surfaces, via real endpoints on `apps/api/src/routes/management.ts`
(POST/PUT/PUT-isActive/POST .../sync-code), described in the file's own comment
(`biller-app.tsx:10-14`) as using "the same mechanism as Management > User Management's own
create-user form, not local-only UI state" — i.e. this is a real `users` table CRUD surface, not
a mock.

## Data scope
Same outlet-scoping rules as every persona (see README) — the created accounts are
`UserRole`-linked to whichever outlet the managing Admin/Owner is currently scoped to (or
explicitly assigned, depending on the create form — not traced further here).

## Open questions / unclear from code
- The create form (`FormState { name, username, password }`, `biller-app.tsx:53-57`) does not
  visibly capture a role-name string, a PIN, or an outlet selector — how a newly created biller/
  captain/waiter/delivery-boy/order-acceptance account gets its free-text role name and, for PIN
  -login personas, its `pinHash` set, was not confirmed by reading this file alone; the
  `management.ts` API routes it posts to would need to be read to confirm.
- Whether "Order Acceptance App" corresponds to any guarded `pos-web` page in this repo (no
  `useAuthGuard` call matching an order-acceptance-specific permission was found) is unclear —
  it may be an external/separate app this back office merely provisions accounts for.
