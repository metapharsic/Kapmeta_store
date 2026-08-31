# Wiring gaps and fix plan (runtime audit)

**Date:** 2026-08-30  
**Status:** Wave 1 shipped. Wave 2 (waiter lifecycle + captain shift) in implementation — do not start Wave 3 until waiter accept criteria pass.  
**Evidence:** Logged in as admin, POS floor `http://localhost:4444/`, live `GET /tables` + `GET /orders`, plus code traces. Waiter serve/manage bug: manage view hardcoded "Already in Kitchen" because `GET /orders/:id` had no `kitchenStatus`.

The 12 pipeline phases added **write paths** (settle, invoice row, BOM ledger, outbox). The floor, waiter tablet, kitchen, sales, finance, inventory, and CRM **read/sync surfaces** still disagree with those writes. That is why the UI looks unwired.

---

The 12 pipeline phases added **write paths** (settle, invoice row, BOM ledger, outbox). The floor, waiter tablet, kitchen, sales, finance, inventory, and CRM **read/sync surfaces** still disagree with those writes. That is why the UI looks unwired.

---

## Runtime proof (item 1)

`GET /tables` right now:

| Table | `dining_tables.status` | `currentOrder` | What the card shows |
|---|---|---|---|
| M2_6359, M2_6609, M2_8391, M2_8886, M2_9012 | `OCCUPIED` | none | Green **Serve** + fake **1 Min** |
| T-04, T-06 | `VACANT` | hidden by API | **Serve** because leftover `READY` orders still have `diningTableId` |
| T448, T907 | `VACANT` | hidden by API | **Vacant** button because leftover `SERVED` orders overlay in the UI |
| T3_7446 | `VACANT` | hidden | Live `CONFIRMED` order still linked |

24 tables: 19 `VACANT`, 5 stuck `OCCUPIED` with **zero** orders.

Root causes (both true at once):

1. **Stale occupancy.** `GET /tables` only force-clears when `status === VACANT`. If the row is `OCCUPIED` and there is no active order, it returns `OCCUPIED`. Floor Serve rule: `status === OCCUPIED` and `kitchenStage !== SERVED`. `elapsedMinutes` defaults to `1` even with no order.
2. **Two occupancy sources.** Floor also fetches `/orders?status=...SERVED,READY...` and paints badges from that list. `GET /tables` **ignores** those orders when the table row is already `VACANT`. Result: table looks empty in one API and running in the other.

---

## Code-review findings (severity order)

### P0 — floor occupancy is not a single source of truth

- `dining_tables.status` can stay `OCCUPIED` after settle/vacate fails or never ran.
- SERVED/READY/CONFIRMED orders keep `diningTableId` after the table is marked vacant.
- Serve / Vacant / 1 Min / occupancy % all read this mess.
- `GET /tables` VACANT short-circuit hides live orders from the waiter POS API while the floor overlay still sees them.

### P0 — sales / invoices / GST / T.T.A / Z-report are not live

- Settle **does** write `invoices` + `settled_at` and broadcasts `finance.order_settled`.
- **Zero** pos-web screens subscribe to `finance.order_settled` (grep: no matches).
- `/admin` polls every **15s**. `/finance` fetches **once on load** (no interval, no WebSocket).
- Occupancy on `/admin` counts `t.status === OCCUPIED` even with no order → 5 ghost occupied tables inflate occupancy.

### P0 — split bill is a stub

`PosBillingView` `onConfirmSplit` only `alert(...)`. It never POSTs `payments[]` to `/orders/:id/settle`. Backend already accepts split payments. Checkbox **It's Paid** is local state and is never read.

### P0 — inventory does not move on Serve (by current design)

BOM deducts only inside `settleOrderCommand` (`ORDER_SETTLED`). Serve (`POST /tables/:id/serve`) marks KOT SERVED and **does not** deduct. Inventory UI has **no** WebSocket for `inventory.stock_updated`. If you settle an item with no recipe BOM, stock stays unchanged. Vendors/POs receive via GRN; they are **not** tied to order consumption.

**Decision needed:** deduct on **serve** (kitchen truth) vs **settle** (paid truth). Today: settle only.

### P1 — waiter tablet vs POS floor vs kitchen not the same event set

| Surface | Listens | Misses |
|---|---|---|
| POS floor | `order/kot/table.status_updated`, `kot.created` | `table.merged`, `table.transferred`, `finance.order_settled` |
| Waiter | same four | `table.merged`, `table.transferred` |
| Kitchen | `kot.created`, `kot.status_updated` only | merge, transfer, order created, table status |
| Admin / Finance / CRM / Inventory | none | everything |

Transfer **does** broadcast `kot.status_updated`, so kitchen may refresh on full-table move. Merge does **not**. Second KOT on a merged table depends on `kot.created` (POS/waiter yes, kitchen yes, admin no).

Move KOT modal calls `/tables/transfer`. Backend `transferMode` is stored but the handler always moves the **whole order**. Per-KOT move is UI-only.

Kitchen GET uses `order.diningTable.tableNumber`, so a successful transfer is correct **after refetch**. Merge of items into the target order is implemented in `tables.ts`; UI refresh is incomplete.

### P1 — waiter petty cash / shift

- Waiter page has **no** petty-cash UI.
- `/waiters/me/shift-reconciliation` uses **calendar midnight**, not `outlet.dayStartTime`. It sums **all outlet** payments, not this waiter's.
- `/finance/reconcile-shift` closes the **outlet cash drawer**, not a waiter shift. Tips calculator can close the whole house drawer.
- Finance petty categories are hardcoded strings.

### P1 — CRM not on the order path

- `/crm` lookup/create/directory/redeem APIs work.
- `PosBillingView` never sets `customerId`. Loyalty on settle only runs if the order already has a customer.
- Lookup is by **id**, not phone. Create does not refresh directory. No visit history. No WS.

### P1 — header buttons

| Control | Reality |
|---|---|
| Item On/Off | Calls `/menu/items/:id/availability`. Hardcodes `stockQty: 100` and `expectedVersion: 1`. Works for ON/OFF, not real qty. |
| Store Open | PATCH `/settings/store-status` (real). Dine-in / Delivery / Takeaway pills are **local React state** only. |
| Live View | Toggles a CSS class. Does not start/stop sync. |
| Orders / Recent / Zomato Help | Links. Fine. |
| Hold | Drawer + `POST /orders/:id/hold`. |
| Alerts | **3 hardcoded** notifications. `GET /notifications` returns `[]`. |
| Q Bill / Q KOT | Search modal hits APIs. |
| Merge Tables | POS + waiter call `/tables/merge`. Kitchen does not follow. |
| Serve | Hits `/tables/:id/serve`. On ghost OCCUPIED tables it 404s (`Active table order not found`) with no UI error. |

### P2 — leftover / consistency

- Live ADMIN role still missing `finance.report` (nav uses `report.read` workaround).
- Channel accounts = 0 until connected.
- Login quick roles hardcode emails/passwords/outlet id.
- `PetPoojaHeader` default outlet name `Hotel Kapila`.
- Finance opening float fallback `200000`.
- GET `/tables/sections` injects fake section names if empty.
- Summary reporting tables unused.

---

## Target architecture (single flow)

```
Order placed
  → dining_tables.status = OCCUPIED only if an open order exists
  → KOT for NEW lines only
  → broadcast order.created, kot.created, table.status_updated
  → POS floor + waiter + kitchen refetch from THAT event

Serve
  → KOT/order SERVED
  → optional: reserve/deduct BOM (pending your decision)
  → broadcast; floor Serve badge only if READY food exists

Merge / transfer
  → one command updates order.diningTableId, source VACANT, target OCCUPIED
  → unlink leftover orders on source
  → broadcast table.merged / table.transferred AND kot.status_updated
  → kitchen tickets show new table number immediately

Settle (Print & E-Bill / paid)
  → payment(s) + invoice + settled_at + COMPLETED + table VACANT
  → unlink diningTableId on completed orders
  → BOM once (if not already reserved)
  → loyalty if customer attached
  → cash drawer
  → broadcast finance.order_settled, inventory.stock_updated, table.status_updated
  → admin / finance / inventory / CRM subscribe and refresh (no 15s-only)

Split
  → BillSplitModal builds payments[] and POST settle with those rows
  → invoice + Z-report paymentModes update from the same payments
```

**Occupancy rule:** a table is occupied iff there is an order in `{DRAFT, PLACED, CONFIRMED, KOT_CREATED, IN_PREPARATION, READY, SERVED}` with that `diningTableId`. `dining_tables.status` is a **projection**, never an independent truth. Serve button only if that order has a READY KOT.

---

## Fix waves (approve one at a time)

### Wave 1 — Floor occupancy + Serve (your item 1) — SHIPPED

- Recompute `GET /tables`: no order → always `VACANT` + `kitchenStage: null`; live order → derive status from order/KOT.
- Stop dual fetch override in `TableViewFloor` (or make it identical to GET /tables).
- Serve only when `kitchenStage === READY`.
- `elapsedMinutes` only when an order exists.
- Show Serve 404 as a toast, not silent.

**Accept:** M2_6359 / M2_6609 show blank, no Serve, no 1 Min.

### Wave 2 — Waiter lifecycle + POS sync + captain shift (THIS WAVE)

Absorbs original Wave 2 fan-out for floor/waiter/kitchen **and** original Wave 5 shift. Do not start Wave 3 until this wave is validated.

Waiter flow (single running session per table):

```
Vacant table
  → place KOT (POST /orders action=KOT)
  → floor badge: In kitchen / Cooking / Ready
  → Serve (POST /tables/:id/serve, READY tickets only) OR per-ticket Serve to Table
  → badge: Served · Running; manage view: Running — Served (not "Already in Kitchen")
  → Add next items (POST /orders/:id/items) → new KOT; table stays occupied
  → Bill (GET /orders/:id/bill) → pay (POST payments) → settle (POST /orders/:id/settle)
  → vacant (POST /tables/:id/vacant); unpaid vacant returns 409
Merge / transfer
  → POST /tables/merge and /tables/:id/transfer
  → WS table.merged / table.transferred → waiter + POS floor + kitchen refetch
Captain shift
  → GET /waiters/me/shift-reconciliation scoped to created_by + outlet.dayStartTime
  → Complete Shift posts POST /waiters/me/shift-handover (audit log)
  → does NOT close cash_drawer_sessions
  → finance panel GET /waiters/shift-handovers + WS finance.waiter_shift_handover
```

Code landed this wave:

- `GET /orders/:id` joins KOT ticket status onto each line as `kitchenStatus`.
- Waiter floor badges from `kitchenStage`. Serve button when READY. Manage labels per line.
- Waiter pay calls settle then vacant. Vacate unpaid is 409.
- Socket `useKapmetaSocket` on waiter, POS floor, kitchen, finance. Open manage order refetches on any floor event.
- Captain handover endpoint + finance panel. Calculator no longer hits `/finance/reconcile-shift`.
- `GET /waiters/active` tables from live orders (no hardcoded T1/B6).
- Table Serve only marks READY KOTs SERVED. Kitchen SERVED cascade does not HANDED_OVER the order while sibling tickets still cook.

**Accept (must all pass before Wave 3):**

1. Waiter KOT → kitchen READY → Serve → open table shows **Served** / **Running — Served**, never "Already in Kitchen".
2. Add next items on that table creates a new KOT; POS floor card stays occupied and updates live.
3. Bill + pay → table vacant on waiter and POS.
4. Vacate unpaid table shows 409 copy.
5. Merge two tables; POS floor and kitchen ticket table numbers update without refresh.
6. Complete Shift: finance lists handover; house cash drawer stays open.

### Wave 3 — Sales + invoices + Z-report live (items 2, 8, 10) — PARKED

- Admin + finance listen to `finance.order_settled` and refetch reporting/z-report/cash-drawer.
- Occupancy endpoint uses the Wave 1 rule.
- Wire split: `onConfirmSplit` → settle `payments[]`.
- Honor **It's Paid** or remove it.

**Accept:** settle one bill → invoice row + GST + Z-report change without waiting 15s.

### Wave 4 — Inventory BOM + vendors (item 3) — PARKED

- After Wave 0 decision A: deduct on settle; document on inventory UI.
- Inventory page listens `inventory.stock_updated`.
- Refuse settle of items with no recipe (or log skip visibly).

### Wave 5 — Waiter shift + petty cash — ABSORBED INTO WAVE 2

Waiter petty-cash UI on the tablet is still out of this wave (finance already has petty cash). Captain handover + scoped reconciliation shipped in Wave 2.

### Wave 6 — CRM (item 6) — PARKED

- Phone lookup on POS billing; attach `customerId` before settle.
- Directory refresh after create. Visit list from settled invoices.

### Wave 7 — Header / store / alerts (buttons) — PARKED

- Alerts from `/notifications` only; drop hardcoded list.
- Live View: if off, stop WS; if on, connect.
- Channel pause pills PATCH store/channel status, not local state.
- Item On/Off: send real `expectedVersion`; do not invent stock 100.

### Wave 8 — Cleanup — PARKED

- Seed `finance.report` or keep `report.read`.
- Remove hardcoded login roles / float fallback / fake sections.
- Merge leftover SERVED orders or unlink them.

---

## Wave 0 — decided

**A:** stock deducts at **settle** (paid covers). Serve never changes inventory.

Reply with Wave 3 only after Wave 2 accept criteria pass.
