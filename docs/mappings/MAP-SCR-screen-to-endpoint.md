# MAP-SCR — Screen to Endpoint

**ID:** MAP-SCR · **Status:** DRAFT · **Owner:** Frontend Lead · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** MAP-SRC, UX-SCREEN-INVENTORY · **Traced by:** CI consistency check

Every screen, the endpoints it calls, the permission it requires, the realtime channel it subscribes to.

A screen with no endpoint is a mockup. An endpoint with no screen and no integration consumer is dead code.

---

## POS App (`apps/pos-web`)

| UX ID | Screen | Endpoints | Permission | Realtime | Offline behavior |
|-------|--------|-----------|-----------|----------|-----------------|
| `UX-SCR-10` | Login / outlet select | `POST /auth/login`, `GET /outlets/mine` | public | — | DEC-002 |
| `UX-SCR-11` | Shift start / PIN switch | `POST /auth/shift`, `POST /auth/pin-verify` | `shift.open` | — | DEC-002 |
| `UX-SCR-12` | Order entry / cart | `GET /menu/items`, `POST /orders`, `PATCH /orders/{id}` | `orders.create` | menu availability | DEC-002 |
| `UX-SCR-13` | Modifier picker | `GET /menu/items/{id}/modifiers` | `orders.create` | — | cached |
| `UX-SCR-02` | Live Orders | `GET /orders?status=active` | `orders.read` | `order.status_changed` | read-only |
| `UX-SCR-05` | KOT board | `GET /kot/tickets`, `PATCH /kot/tickets/{id}` | `kot.update` | `kot.created` | queue writes |
| `UX-SCR-14` | Payment / settle | `POST /orders/{id}/payments`, `POST /payments/{id}/capture` | `payments.capture` | — | **blocked, DEC-002/005** |
| `UX-SCR-15` | Invoice / receipt | `GET /invoices/{id}`, `POST /invoices/{id}/print` | `invoices.read` | — | cached |
| `UX-SCR-16` | Cancellation / void | `POST /orders/{id}/cancel` | `orders.cancel` (elevated) | — | blocked |
| `UX-SCR-17` | Cash drawer / shift close | `POST /shifts/{id}/close` | `shift.close` | — | blocked |

---

## Admin App (`apps/admin-web`)

| UX ID | Screen | Endpoints | Permission | Realtime |
|-------|--------|-----------|-----------|----------|
| `UX-SCR-01` | Dashboard | `GET /reports/kpi`, `GET /reports/summary` | `reports.read` | KPI refresh |
| `UX-SCR-03` | All Orders | `GET /orders`, `GET /orders/{id}` | `orders.read` | — |
| `UX-SCR-04` | Online Orders | `GET /orders?channel=aggregator`, `POST /integration/retry/{id}` | `orders.read`, `integration.retry` | `channel.sync_failed` |
| `UX-SCR-06` | Menu Management | `GET/PATCH /menu/items`, `PATCH /menu/items/{id}/availability` | `menu.write` | sync status |
| `UX-SCR-07` | Menu Catalogue browse | `GET /menu/categories`, `GET /menu/items` | `menu.read` | — |
| `UX-SCR-18` | Channel sync status | `GET /integration/sync-jobs`, `POST /integration/sync` | `integration.read` | `channel.sync_failed` |
| `UX-SCR-19` | User & role admin | `GET/POST /users`, `POST /users/{id}/roles` | `admin.users` | — |
| `UX-SCR-20` | Reports | `GET /reports/{type}` | `reports.read` | — |
| `UX-SCR-21` | Outlet configuration | `GET/PATCH /outlets/{id}` | `admin.outlet` | — |
| `UX-SCR-22` | Audit log viewer | `GET /audit-logs` | `audit.read` | — |
| `UX-SCR-23` | Inventory (R2) | `GET /inventory/stock`, `POST /inventory/adjustments` | `inventory.write` | — |
| `UX-SCR-24` | Purchase orders (R2) | `GET/POST /purchase-orders` | `purchase.write` | — |
| `UX-SCR-25` | Customers / CRM (R3) | `GET /customers` | `crm.read` | — |

---

## Rules

1. **Every endpoint call passes `X-Outlet-Id`.** The server validates it against session grants — it never trusts it.
2. **Permission column is advisory to the UI only.** The server re-checks. UI hiding is cosmetic (ENGINEERING-PROTOCOL rule 3).
3. **Every screen implements all six states**: empty, loading, success, validation error, server error, permission denied. See `UX-STATE-CATALOGUE`.
4. **Realtime is an enhancement, never the only path.** Every realtime screen degrades to polling.
5. Offline column stays provisional until DEC-002 closes.

---

## Unmapped

| Item | Issue |
|------|-------|
| CRM screens beyond `UX-SCR-25` | No requirement detail (source: nav bar only) |
| Offline queue UI | Blocked on DEC-002 |
| Printer configuration screen | Blocked on DEC-006 |
