# Admin E2E wiring and synchronization report

**Date:** 2026-08-27  
**Scope:** Admin cluster inside `apps/pos-web` (there is no running `apps/admin-web`), live API in `apps/api`, Prisma in `kapmeta/schema.prisma`.  
**Method:** Code audit against CLAUDE.md, `.agents/AGENTS.md`, CHECKPOINT.md, and TASK-1..9 docs. TASK-9 “100% E2E” is HTTP 200 smoke, not UI/RBAC/persistence sync.

This report is the backlog of what still must be wired so admin, POS, aggregators, and the database share one source of truth.

---

## How admin is shaped today

Admin is not a separate app. It is:

| Shell | Pages |
|---|---|
| `Nav variant="sidebar"` | `/admin`, `/menu`, `/inventory`, `/finance`, `/crm`, `/marketing`, `/user-management`, `/channel-availability`, `/integrations`, `/kitchen-analytics`, `/waiter-monitor`, `/kitchen` |
| `KapMetaHeader` | POS `/`, `/orders`, `/table-management` |

`apps/admin-web` is a README stub. `services/admin` (bill reset, backups, machines) is **not mounted** in `apps/api/src/app.ts`. `contracts/admin.yaml` describes a third, unused surface.

---

## Screen inventory and wiring status

| Route | What it claims | Status | Evidence |
|---|---|---|---|
| `/admin` | KPIs, GST, occupancy, invoices, CSV export, leakage | **Partial** | Fetches `/reporting/*` and `/tables/occupancy` in `Promise.all`. Leakage requires `report.financial.read`; page guard is `report.read`. One 403 kills the whole dashboard. |
| `/menu` | Category/item CRUD, bulk CSV | **Wired** | `GET/POST /menu/categories`, `POST /menu/items`, `POST /menu/items/bulk-upload` |
| `/inventory` | 86, ingredients, recipes, vendors, POs | **Stub persist** | APIs read/write `AuditLog` (`INVENTORY_*`), not ingredient/recipe tables. Page guard `menu.read`; APIs `inventory.read` / `inventory.write`. 86 uses `PATCH /menu/items/:id/availability`. |
| `/finance` | Z-report, cash drawer, petty cash, ledger, refunds | **Partial** | Z-report is real. Drawer/petty cash/reconcile are audit logs. Opening float hardcoded `200000` paise. Nav permission `finance.report` vs page `report.read`. |
| `/crm` | Search, create, loyalty | **Wired with gaps** | Live paths `/crm/customers`. UI copy still says `/customers`. Birthdate not in schema (blocks marketing). |
| `/marketing` | Campaigns | **Partial** | Insert/queue/recipients exist. No send gateway. Birthday trigger documented as unavailable. Discount ID is free-text. |
| `/user-management` | Users, roles, matrix | **Partial** | Hits `/users`, `/roles`, `/permissions` (also reachable under `/user-management/*` via double mount). Gated on `menu.category.manage`. `GET /users` is **not outlet-scoped**. |
| `/table-management` | Tables + station SLAs | **Wired** | `/tables`, `/kitchen/stations`. Uses header shell, not sidebar. Guard `menu.category.manage` not `table.manage`. |
| `/channel-availability` | Per-channel ON/OFF | **Fake mapping** | Service groups rows, but repository synthesizes `itemId-swiggy` and defaults SWIGGY/ZOMATO. `ChannelItemMapping` unused. Hardcoded outlet UUID fallback on update. |
| `/integrations` | Connect aggregators | **Partial** | `GET /integration/integrations/channels`. Connect state not bound to header Store toggle. |
| `/kitchen-analytics` | Prep times | **Wired** | `/kitchen/analytics`, `/kitchen/stations`. Sidebar only. |
| `/waiter-monitor` | Active waiters | **Wired** | `/waiters/active`. Sidebar only. |
| Header Store / Alerts / Live View / Item On/Off | Ops control plane | **Client stub / broken** | Store/Live View = React state. Alerts: hardcoded samples if API empty; `POST /notifications/read-all` does not exist. Item On/Off: **wrong HTTP method/path**. |
| `apps/admin-web` | Dedicated admin | **Dead** | README only |
| `services/admin` | Destructive admin ops | **Dead** | Not in `createApp()` |

---

## P0 — breaks sync or silently no-ops

### 1. Header “Item On/Off” does not hit the 86 API

- UI: `ItemToggleModal` `PUT /menu/availability/${id}`
- API: `PATCH /menu/items/:menuItemId/availability` + `menu.86.toggle`
- Inventory page uses the correct PATCH. POS 86 and header 86 **diverge**.

### 2. `/admin` dashboard is all-or-nothing

`fetchReports` `Promise.all` includes `/reporting/leakage-report` (`report.financial.read`). Guard on the page is `report.read`. Failure blanks GST, occupancy, invoices, and KPIs together.

### 3. Finance can disappear from Nav

- `Nav.tsx`: `finance.report`
- `finance.tsx`: `useAuthGuard("report.read")`
- `db/seeds/seed_permissions.sql` does **not** include `finance.report` (it exists in `kapmeta/seed.ts`)

### 4. Inventory permission mismatch

Nav/page: `menu.read`. Ingredient APIs: `inventory.read` / `inventory.write`. 86 toggle: `menu.86.toggle`. A menu-reader can open Inventory and get empty BOM.

### 5. User management uses the wrong permission

Code comment in `user-management.ts` admits there is no dedicated gate, so it uses `menu.category.manage`. `users.manage` and `roles.manage` **are** in `seed_permissions.sql`.

### 6. Mark all alerts read is a no-op

Header: `POST /notifications/read-all`.  
API: `GET /notifications`, `PATCH /notifications/:id/read` only.

### 7. Orders admin chart is dead

`orders.tsx` calls `GET /admin/revenue-trend`. No `/admin` router is mounted.

---

## P1 — HTTP 200 but not the Prisma source of truth

These pass smoke tests and still desync the product.

| Domain | Tables that should own it | What actually stores it |
|---|---|---|
| 86 / stock | `item_availability` | `AuditLog` `MENU_ITEM_86`; default `stockQty: 100` |
| Ingredients / recipes / vendors / POs | inventory domain models | `AuditLog` `INVENTORY_*` (every create is a new “row”; GET can duplicate) |
| Channel item ON/OFF | `ChannelItemMapping` | Synthetic IDs + `CHANNEL_ITEM_AVAILABILITY` logs; fake `acc-swiggy` |
| Petty cash / shift close | cash-drawer / ledger | `FINANCE_PETTY_CASH`, `FINANCE_CASH_DRAWER_RECONCILED` |
| Ledger list | ledger entries | Last 50 **any** audit logs, mapped as expenses |
| Store online | `ChannelAccount.is_active` or a store-status row | `useState(true)` in `KapMetaHeader` |
| Alerts | `Notification` | Hardcoded Saffron / Table 4 / SW-1082 until DB has rows; dismiss is local |

**Hardcoded outlet UUID** in `PrismaChannelItemStatusRepository.updateIfVersionMatches` when the menu item is missing: `a0deb015-8ef8-4ef5-aac7-6e91c9da6b5b` (same as login defaults). Violates no-hardcode-data.

**Opening float** `200000n` in `GET /finance/cash-drawer` is business data in source.

**GET /users** lists all users in the database, not the session outlet.

**Error swallowing:** inventory list and finance ledger/refunds catch errors and return `200 []`, so the UI looks empty rather than failed.

---

## P2 — product holes and shell drift

- Marketing does not send; birthday needs a customer birthdate field; no discount catalog endpoint.
- CRM UI strings still say `/customers`.
- Login quick-roles and header defaults: `Hotel Kapila`, `R327038`, `admin@restaurant.com` / `admin123`, fixed outlet UUID.
- Topbar `NAV_LINKS` omit `/table-management`, `/waiter-monitor`, `/kitchen-analytics`, `/integrations` that the sidebar shows.
- Quick Links suggestions omit several admin pages.
- Double mounts in `app.ts` (`inventory`, `user-management`, `integration`) hide path mismatches (TASK-7 tested `/user-management/users` while the page calls `/users`).
- Two admin visual systems (sidebar Nav vs KapMetaHeader).

---

## Cross-surface sync (the real E2E)

```
POS catalog 86 ── GET /menu/availability ── AuditLog MENU_ITEM_86
Inventory 86 ── PATCH /menu/items/:id/availability ── same audit
Header Item On/Off ── PUT /menu/availability/:id ── DOES NOT MATCH
Online Item Status ── synthetic channel rows ── NOT ChannelItemMapping
                       NOT the same as dine-in 86
Store header ── React state ── NOT ChannelAccount
Inventory stock ── audit currentStock ── NOT consumed by POS order lines
/admin occupancy ── GET /tables/occupancy ── tables + live dine-in orders (OK if tables router healthy)
/admin invoices ── GET /reporting/invoices ── settled orders (OK if reporting query matches settle path)
GST card ── GET /reporting/tax-breakdown ── OK if Promise.all survives leakage
```

Until the 86, channel, inventory, cash, and RBAC rows above share tables and permission keys, “admin is operational” in older docs is overstated.

---

## What not to rebuild

Keep these; they already talk to real Prisma rows or reporting services:

- Auth session + `GET /auth/me`
- Menu category/item CRUD + bulk upload
- Reporting: sales-summary, item-performance, payment/channel/turnaround, tax-breakdown, invoices, tally-export (export UI exists)
- `GET /tables/occupancy`
- CRM create (organization_id fix) and directory
- Marketing campaign persist/queue
- User/role/permission rows (fix the gate and outlet scope)
- Tables CRUD, kitchen stations, waiter heartbeat

---

## Recommended wiring sequence

1. **RBAC alignment** — one permission per screen matching `seed_permissions.sql`; add `finance.report` to the SQL seed or change Nav to `report.read` / `report.zreport`.
2. **Single 86 API** — header, inventory, POS: same path; persist `item_availability` (or one explicit stocked column), stop using audit as the store.
3. **Inventory domain tables** — ingredients, recipes, vendors, POs; deduct stock from settled order lines.
4. **Channel status** — `ChannelItemMapping` + connected `ChannelAccount` only; remove synthetic SWIGGY/ZOMATO and hardcoded outlet id.
5. **Header ops** — persist store pause; implement `POST /notifications/read-all` or call PATCH per id; drop hardcoded alert fixtures.
6. **Cash drawer** — real table for float/count/petty cash; stop hardcoded ₹2,000; ledger from ledger rows.
7. **Dashboard resilience** — fetch leakage independently so GST/occupancy/invoices still render.
8. **Delete or mount** `services/admin` and `apps/admin-web` so contracts match the running app.

---

## Files that must move together

| Concern | Files |
|---|---|
| Header 86 | `apps/pos-web/components/ItemToggleModal.tsx`, `apps/api/src/routes/menu.ts`, `services/menu/src/stores/prisma-availability-repository.ts` |
| Dashboard | `apps/pos-web/pages/admin.tsx`, `apps/api/src/routes/reporting.ts` |
| Nav/RBAC | `apps/pos-web/components/Nav.tsx`, `apps/pos-web/pages/*.tsx` guards, `apps/api/src/routes/user-management.ts`, `db/seeds/seed_permissions.sql` |
| Inventory fake persist | `apps/api/src/routes/inventory.ts`, `apps/pos-web/pages/inventory.tsx` |
| Channel fake persist | `services/integration-hub/src/stores/prisma-channel-item-status-repository.ts`, `apps/pos-web/pages/channel-availability.tsx` |
| Store/alerts | `apps/pos-web/components/KapMetaHeader.tsx`, `apps/api/src/routes/notifications.ts` |
| Cash | `apps/api/src/routes/finance.ts`, `apps/pos-web/pages/finance.tsx` |
| Dead admin stack | `services/admin/*`, `apps/admin-web/*`, `contracts/admin.yaml` |
