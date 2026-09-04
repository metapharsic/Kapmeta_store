# Chef / Kitchen

## Entry point
`apps/pos-web/pages/kitchen.tsx` — the Kitchen Display System (KDS). Serves two real UI modes
on one route: `/kitchen` (live card board, `KapMetaKotView`) and `/kitchen?view=list`
(historical KOT report table, `KotHistoryView`) — per the comment at `kitchen.tsx:40-43`, these
are treated as "two different products on the same data" sharing one route rather than two
separate guarded pages.

## Authentication
Standard email + password login (`POST /auth/login`) — no kitchen-specific login route was
found. `kitchen.tsx:39` calls `useAuthGuard("kot.read")`.

## Gating permission
`kot.read` (`kitchen.tsx:39`). Server-side, the kitchen API routes in
`apps/api/src/routes/kitchen.ts` accept either of two permission strings interchangeably via
`requirePermission("kot.read", "kitchen.kds.view")`:
- `GET /kitchen/stations` (kitchen.ts:14)
- `GET /kitchen/kot` (kitchen.ts:70)
- `GET /kitchen/kot/history` (kitchen.ts:217)
- `POST /kitchen/kot/:kotTicketId/recall` uses a different pair:
  `requirePermission("kot.status.update", "kitchen.kot.status")` (kitchen.ts:439)

Note `kitchen.kds.view`, `kitchen.kot.status`, and `kot.status.update` do not appear in
`db/seeds/seed_permissions.sql`'s seeded catalog (which has `kot.create`, `kot.read`,
`kot.update`, `kot.recall`, `kot.manage` instead) — the seed file is a bootstrap fixture, not
necessarily kept in lockstep with every permission string the route code actually checks; treat
the seed list as representative of the permission *namespace* (`kot.*`) rather than a complete,
current enumeration.

## What they can / can't do
Sees KOT tickets (`KOTTicket`: ticket number, station, status QUEUED/PREPARING/READY/SERVED,
items with quantity/notes/course, SLA warning/breach timers) for the outlet, grouped by
kitchen station. Can view live tickets and (via `?view=list`) historical KOT records. Can recall
a KOT ticket if the account's role also grants `kot.status.update` or `kitchen.kot.status`
(separate from plain `kot.read`) — a kitchen account with only `kot.read` can view but not
recall/update ticket status server-side, even though the client route doesn't itself
distinguish the two in the guard.

## Data scope
Outlet-scoped via `req.auth.outletId` from the JWT, identically to every other persona — a
Chef/Kitchen account only sees KOT tickets and stations for the outlet(s) their `UserRole`
grants cover.

## Example flow (traced against real code)
1. Kitchen staff logs in with email/password → session stored.
2. Loads `/kitchen` → `useAuthGuard("kot.read")` passes → page opens a real-time channel via
   `useKapmetaSocket` (the same hook `waiter.tsx` uses) and polls/subscribes for new KOTs.
3. When a waiter fires an order, the resulting KOT ticket appears on the board (`QUEUED`) and
   progresses through `PREPARING` → `READY` → `SERVED` as kitchen staff update it (subject to
   the account holding the status-update permission).
4. Switching to `/kitchen?view=list` shows the same outlet's historical KOT report instead of
   the live board.

## Open questions / unclear from code
- The exact server route(s) kitchen staff call to transition a ticket between QUEUED /
  PREPARING / READY / SERVED (as opposed to the `recall` endpoint, which was confirmed) were
  not traced in this pass — only `kitchen.ts`'s `stations`, `kot`, `kot/history`, and `recall`
  routes were read directly.
