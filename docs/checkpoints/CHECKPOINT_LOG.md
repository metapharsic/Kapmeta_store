# Checkpoint Log — CP-20 through CP-30

A readable digest of this session's operational checkpoint history, pulled
from `agents/STATUS.md` and cross-checked against `git log`. This is not a
copy of STATUS.md — it is organized one entry per gate, each with: what
broke or was requested, what was found (root cause), what was fixed, and the
real commit hash(es).

This log picks up at CP-20 (the earliest gate with a distinct "root cause
found, fix applied" shape in STATUS.md's session-history section) through
CP-30, the highest gate number present in `agents/STATUS.md` as of this
writing. Earlier gates (CP-10 through CP-19 and below) exist in the same
file and cover the seat/merge data model, full-CRUD parity, and the first
several reference-screen replication rounds — see `agents/STATUS.md`
directly for those; this log starts where the task asked it to.

Note on numbering: this session's gates (CP-10 upward, tracked in
`agents/STATUS.md`/`agents/task-board.json`) are a separate sequence from
the older phase-gate ledger in `docs/workflows/CHECKPOINTS.md` (CP-00
through CP-09, a pre-existing project-management artifact from an earlier
project phase, unrelated numbering). See `HOW_CHECKPOINTS_WORK.md` for how
the two relate.

---

## CP-20 — "Could not reach the aggregator order feed" (+ 3 amendments)

**Requested:** user-reported bug — the aggregator/channel order feed screen
would not load.

**Found:** `GET /integration/channel-items` threw `P2022` on
`channel_accounts.integration_id does not exist` — the very first query in
the handler. Root cause: the same "edited-after-applied CREATE TABLE" drift
class as an earlier `TSK-020` fix — `0007_integration.sql` runs as one
transaction, `schema_migrations` marks it applied, but the live table is
missing a column added to the file after that one successful run. A
dispatched follow-up agent then audited the *whole* aggregator pipeline
(not just the reported symptom) and found the webhook route
(`POST /webhooks/:channel`) 500'd on every call from wrong Prisma field
names (`business_date`, `item_name`, bundled `customerName`/`customerPhone`/
`otp`), that `OrderStatusHistory.create` silently failed every time
(`to_status` vs. real `status`, missing `outletId`), and that
`AuditLog.create` used a nonexistent `actor_id` with no `.catch()` guard —
meaning a successful webhook could still 500 back to the aggregator *after*
the order had already landed.

**Fixed:** migration `0044` (integrations table + `channel_accounts.integration_id`,
idempotent); `integration.ts`/`orders.ts` rewritten to use real
`schema.prisma` field names; a second drifted table (`item_availability`)
repaired via migration `0045`; hardcoded `"SWIGGY"`/`"EXT-001"` fallback
literals removed from `GET /channels`.

**Amendments** (same gate, deepened by real `db:migrate` runs the sandbox
couldn't simulate):
- Amendment 1: `0043` failed outright on a live run (`order_payments` does
  not exist, two conflicting migration lineages) — guarded behind an
  existence check.
- Amendment 2: `0045` then failed with `42804` FK type mismatch —
  `scripts/inspect-db-v2.js` proved every id column in the live DB is TEXT,
  not UUID, contradicting every migration file (and overturning an earlier
  CP-19 "fix" that had gone the wrong direction). `0045` and two Prisma
  models rewritten TEXT-consistent.
- Amendment 3: a full log-set drift sweep found a third bug class — a
  UUID-typed FK against a TEXT-typed table rolls back the *entire*
  migration transaction, including unrelated safe `ADD COLUMN` statements.
  Six repair migrations (`0046`-`0051`) landed.

**Commits:** `903e9df` (initial fix), `1a5ebc3`/`9391251` (related TSK-020
migration repair), `e6fd4f5`, `1d8bee1`, `de4c51a`, `71cea08`, `286d542`
(the amendments, in order).

---

## CP-21 — Drawer nav matched to reference sidebar screenshot

**Requested:** user supplied a reference screenshot of the real app's left
nav drawer.

**Found:** `Nav.tsx`'s `SIDEBAR_GROUPS` (built across CP-16/17) already
matched the reference's categorization and order near-exactly — this was a
targeted refinement, not a rebuild.

**Fixed:** "Menu & Discounts" header renamed to "Menu"; added
`SidebarGroupDef.alwaysExpanded`, set true only on Daily Operations so it
renders as a static always-visible group instead of a collapsible one, like
the reference; `QuickLinks.tsx` (already real, backend-wired) was only
rendered in `Nav.tsx`'s desktop variant — added to the drawer too.

**Commit:** `cd65d03` ("fix(nav): match drawer to reference sidebar
screenshot").

---

## CP-22 — Reports section rebuild

**Requested:** 5 reference screenshots showing the real app's Reports
section as a 4-item submenu (Day End Summary, Other Reports, Report
Notification, Delivery Management) — different from this app's prior flat
Reports links.

**Found:** nothing broken — a structural gap between the reference's
navigation shape and what existed.

**Fixed:** `GET /finance/day-end-summary`, `GET /finance/delivery-management`
(both real, reusing the existing z-report generator and channel-scoping
convention); new `report_notifications` table (migration `0052`) with
routes built on `$queryRaw`/`$executeRaw` since `npx prisma generate`
cannot run in this sandbox (flagged `TSK-037`); 4 new frontend pages under
`pages/reports/`; a shared `lib/report-catalog.ts` mapping ~20 real report
endpoints into the reference's 7 categories, so the 5 previously flat-linked
report pages became catalog cards instead of being orphaned.

**Commit:** `77c5ca0` ("feat(reports): rebuild Reports section to match
reference").

---

## CP-23 — Management section (+ 2 amendments)

**Requested:** 14 reference screenshots of the real app's Management nav
(Configuration / Accounting / User Management / User Logs).

**Found:** no Management section existed as a distinct nav concept yet.

**Fixed:** migration `0053` (`management_lists`, `management_settings`,
`management_activity_logs`, TEXT ids, outlet-scoped); generic CRUD
lists/settings/log-reader routes so 14 real screens could be wired without
14 bespoke backends; two-level nested Management drawer in
`Nav.tsx`/`KapMetaHeader.tsx`. Explore Products/Audit Trail/Device Mapping
left as honest coming-soon stubs (`TSK-039`, no backend spec yet).

**Amendment — Biller App:** reference showed Create/Sync Code/status-toggle
was needed, not a read-only list. Added real `users.user_code` (migration
`0054`, server-generated, no fake codes), `POST/PUT /management/biller-app`
+ sync-code regenerate reusing the existing user-management create-user
logic.

**Amendment — Accounting sub-group:** new tables `wallet_transactions`,
`expense_transactions` (migration `0055`); several tabs (reconciliation
status-mismatch/variance, payment-history swiping/MDR/hardware) honestly
stubbed in code with no fake rows, since no backing schema exists yet
(`TSK-042`).

**Commits:** `74fec3c`/`ef016e1` (management section), `7334656` (biller
app), `e01b41b` (accounting).

---

## CP-24 — Menu desync (chef/waiter/admin)

**Requested:** user report — "Chef, waiter and admin all of them menu are
not in sync."

**Found:** `listAllItems`/`listByCategory` in
`services/menu/src/menu-catalog-repository.ts` referenced
`row.availabilities`, a Prisma relation that does not exist — always fell
back to a hardcoded `{isStocked:true}` stub, so an 86'd item never actually
disappeared from `GET /menu/items` (which feeds `waiter.tsx` and the public
QR order menu) even though the admin-only `GET /menu/availability` computed
it correctly. A different bug class from the session's earlier DB-drift
bugs: the underlying `item_availability` data was fine, the query reading it
was silently broken.

**Fixed:** real `item_availability` lookup (`loadAvailabilityByItem`)
replacing the stub; `waiter.tsx` and `menu.tsx` (admin) previously only
fetched the menu once on mount — added to waiter's existing 15-second KOT
poll pattern (borrowed from `kitchen.tsx`) and a matching silent poll on
admin. `kitchen.tsx` confirmed correctly out of scope (renders immutable
KOT snapshots).

**Commit:** `95acacb` ("Fix menu desync: chef/waiter/admin now agree on
availability + refresh live"). Diff: 3 files, +56/-17. tsc clean both
projects.

---

## CP-25 — Dine In / Delivery / Pick Up on the public order app

**Requested:** enable Dine In/Delivery/Pick Up and "sync with the app."

**Found:** the POS terminal was already fully wired for all 3 order types;
the real gap was the customer-facing public QR page, which hardcoded
`DINE_IN` with no selector and no tableless entry point.

**Fixed:** `public-order.ts` gained outlet-scoped
`GET/POST /public/outlets/:idOrCode/menu|order` (table-QR route untouched,
real dine-in behavior preserved); new `pages/order/index.tsx` tableless
entry (Dine In / Delivery / Pickup cards, phone+address collection for the
latter two); `[tableId].tsx` refactored onto a shared `PublicOrderMenu`
component. No fake customer fields invented — phone/address folded into
order-line notes since no dedicated server-side field exists, documented
rather than silently dropped (see `DELIVERY_PICKUP_ORDER_FLOW.md`).

**Commit:** `f1a6460`. Note: a stale `.git/index.lock` from a timed-out
heredoc hit mid-round was cleared after confirming no live git process; the
commit was scoped only to this round's own files, leaving another session's
concurrent inventory work untouched.

---

## CP-26 — Zero Hardcoded Auth & Dynamic Database Ingestion (TSK-047)

**Requested:** part of the ongoing "kill hardcoded literals" discipline —
this round targeted login/auth.

**Found:** `login.tsx`/`CaptainPinLoginModal.tsx` used static `QUICK_ROLES`/
`STAFF_LIST` constants with hardcoded credentials and outlet ids; `/auth/me`
fell back to the literal `'Admin'` when a name was missing.

**Fixed:** `GET /auth/outlets`, `GET /auth/staff-profiles` (new, real,
outlet-scoped); frontend now fetches the active staff roster and outlet
list dynamically instead of using static arrays; `/auth/me` fallback now
derives from `user.email.split('@')[0]` instead of a literal.

**Commit:** part of `b5f7d90` ("feat(navigation, menu, inventory): ...
A2A multi-agent telemetry (CP-26, CP-27)").

---

## CP-27 — Clean Navigation Architecture & Sidebar Taxonomy

**Requested:** organize the sidebar to separate operational sales workflows
from BI/reports.

**Found/Fixed:** re-categorized the full sidebar into 10 named groups
(Dashboard, Daily Operations, Menu & Discounts, Inventory & Stock, Sales,
Reports & BI, Finance & Accounting, CRM & Marketing, Management & Settings,
Aggregator Center) — a taxonomy pass, not a bug fix; each group's real
routes are enumerated in `agents/STATUS.md`'s CP-27 entry.

**Commit:** `b5f7d90` (combined with CP-26 in the same commit).

---

## CP-28 — Shakuro Sales Analytics & Executive BI Dashboard

**Requested:** adapt the Shakuro dashboard UI/UX pattern for KapMeta's
sales analytics.

**Found/Fixed:** two-tier nav dock, executive hero cockpit (net revenue,
delta pill, comparative text), micro-KPI cards, multi-segment channel
allocation bar, platform-value/pillar bar charts, waiter leaderboard, and
live A2A telemetry wiring — all real, DB-backed, dual-deployed at
`/reporting` and `/admin?tab=analytics` with a Modern/Classic toggle.

**Commit:** part of `09d6bef`/the CP-28-CP-30 theme commit range (see below
— STATUS.md records CP-28 as complete but the visible commit range for this
date groups it with the Shakuro theme rollout).

---

## CP-29 — Shakuro design system, waiter PIN modal & login redesign

**Requested/Found/Fixed:** apply the Shakuro design system platform-wide;
redesign the waiter PIN modal and login page to match.

**Commit:** `09d6bef` ("feat(theme): apply Shakuro design system across
entire platform, redesign waiter PIN modal and login page, and log CP-29").

---

## CP-30 — Waiter Shakuro theme completion

**Requested/Found/Fixed:** complete the Shakuro theme implementation
specifically for the waiter floor view and ordering workspace (the last
surface not yet converted in CP-29).

**Commit:** `435fd3b` ("feat(waiter): complete Shakuro theme implementation
for waiter floor and ordering workspace (CP-30)"), followed by a small
unnumbered cleanup commit `67fde89` ("fix(admin): remove duplicate
KapMetaHeader causing double sidebar") — a real regression from the theme
rollout, fixed same-day.

---

## Where things stand

`67fde89` is HEAD as of this writing. `agents/STATUS.md`'s highest logged
gate is CP-30; no CP-31 entry exists yet. Several TSK items remain flagged
open across these gates (`TSK-025` closed by amendment 3, `TSK-028`/`TSK-044`
still open — the wider `@db.Uuid`-vs-TEXT audit; `TSK-033`, `TSK-037`,
`TSK-039`, `TSK-042` — all documented in-place as honest stubs rather than
fabricated data, per this session's running convention).
