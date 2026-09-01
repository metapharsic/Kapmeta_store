# Admin pipeline wiring master plan

**Date:** 2026-08-30  
**Scope:** Admin workstream in `apps/pos-web` (there is no running `apps/admin-web`). Admin is complete only when a dine-in order on the floor updates kitchen, inventory, finance, CRM, occupancy, GST, invoices, and leakage from the **same committed facts**.

## Execution status (verified 2026-08-30)

| Phase | Status | What landed | Live check |
|---|---|---|---|
| 1 Unified settle | Done | `settleOrderCommand` is the only settler for POS settle, BILL create, and `POST /finance/settle`. Writes `invoices`, `settled_at`, vacates table, BOM once, loyalty from `outlets.loyalty_paise_per_point`, cash session, outbox. Gated `bill.settle`. | `/finance` Z-report ₹510 / 1 invoice today |
| 2 Consumption ledger | Done | Unique `(order_item_id, ingredient_id, recipe_id)`. Kitchen/table deduct removed. No `Math.max(0)`. Auto-86 writes `item_availability`. `onOrderCompleted` / `consumeForOrderLine` removed. | `/inventory` 60 ingredients, 56 recipes, 15 POs |
| 3 KOT duplication | Done | `onOrderConfirmed` only tickets order items not already on `kot_items.order_item_id`. | `/kitchen/stations` 200 |
| 4 Outbox | Done | `outbox_events` + processor started from API listen. | API listen starts processor |
| 5 Advance orders | Done | `scheduled_fire_at` / `promised_at` / `deposit_minor` / `advance_status`. GET `/orders/advance` filters those. Fire-advance marks `FIRED`. | Create order path writes fields |
| 6 Cash drawer | Done | GET/open/petty/close use `cash_drawer_sessions` + `petty_cash_ledger`. One OPEN session; close writes actual + discrepancy. | `/finance/cash-drawer` 200 |
| 7 Z-report | Done | Window from `outlets.day_start_time`. `grandTotal` = sum of `orders.total_minor`, not subtotal+tax. | `/finance` Z-report loaded |
| 8 + 8a Reporting | Done | `/reporting/revenue-trend`. Sales/GST/TTA/invoices use `settled_at`. Leakage reads invoices. Unbilled KOT excludes billed/COMPLETED. Occupancy includes `HANDED_OVER`. Admin `Promise.allSettled` + 15s poll + invoice date range. | `/admin` ₹1,02,058.40 / 112 orders; occupancy 70.8%; 25 invoices |
| 9 Inventory / PO | Done | GRN supports partial `received_qty` and `PARTIALLY_RECEIVED`. Recipe `version`. | Inventory 86 + BOM tabs load |
| 10 Held / split / merge | Done | `POST /orders/:id/hold` (DRAFT). Split payments on settle. Table merge writes audit. Payments no longer vacate without complete. | Header Hold + Merge Tables on POS |
| 11 CRM / channel | Done | Loyalty rate from outlet column. Store pause blocks aggregator webhooks. 86 + Online Item Status both use `item_availability`. | `/crm` directory; `/channel-availability` 26 items (no 500) |
| 12 Cleanup | Done | Duplicate mounts gone. All `apps/api` routes + auth middleware use shared `apps/api/src/prisma.ts`. `EADDRINUSE` listen handler. Finance nav gated on `report.read` (live DB has no `finance.report` row). | Sidebar shows Finance |

**Ops:** Migration `0022` applied. Prisma client generated. API `:4001` and POS `:4444` serving.

**Remaining (not phase blockers):** T.T.A can look huge when an old `createdAt` order is settled much later (one qualifying dine-in = 2240 min). Connect Delivery Apps lists 0 channel accounts until staff connects Swiggy/Zomato. Hourly/item/payment summary tables still unused (P2).

Sections 2–5 below are the **pre-fix audit**. Do not treat them as current behavior.

---

This plan supersedes the earlier wiring audit for execution. Keep that audit for history.

---

## 1. Intended E2E pipeline (definition of done)

One dine-in cover must produce **one** of each, in this order:

1. Table `OCCUPIED` + order `CONFIRMED` / `KOT_CREATED`
2. One KOT ticket for **new** lines only (add-items does not reprint old lines)
3. KDS status `PREPARING` → `READY` → `SERVED` updates **order** via `transitionOrder` (not raw `prisma.order.update`)
4. Occupancy on `/admin` and `/table-management` agrees with table + live order status
5. Settle **once**: payment row, invoice row, order `COMPLETED`, table `VACANT`, BOM deduct **once**, loyalty **once**, cash-drawer session increment, websocket events
6. `/finance` cash drawer expected cash equals session + payments + petty cash ledger
7. `/admin` KPIs, GST, invoices, T.T.A, occupancy, leakage all read settle-time facts (not `createdAt`, not every KOT as unbilled)
8. `/inventory` remaining stock equals consumption ledger
9. `/crm` points equal `loyalty_accounts` (configurable rate)
10. Store pause blocks aggregator ingest; 86 on POS, inventory, and channels share one availability authority

Until those ten hold after a real table order, admin is not complete.

---

## 2. What the code does today (spine)

```
Table click (POS / waiter)
  POST /orders  action=KOT     → onOrderConfirmed → createKot(ALL lines)
  POST /orders/:id/items       → onOrderConfirmed AGAIN (duplicate KOT risk)
KDS PATCH /kitchen/kot/:id/status SERVED
  raw order.status = HANDED_OVER
  deductBomStockForOrder(KOT_SERVED)
Table serve (tables.ts)
  raw order.status = SERVED
  deductBomStockForOrder(TABLE_SERVED)
POS Print & E-Bill
  POST /orders/:id/settle      → FSM walk + payment + vacate
                               → deductBomStockForOrder(ORDER_SETTLED)  [third deduct]
                               → loyalty Math.floor(total/10000)
                               → cash_drawer_sessions increment (if OPEN)
                               → daily_sales_summary upsert with NO amounts
  broadcast finance.order_settled  (/admin does not subscribe)
Takeaway BILL create
  POST /orders action=BILL     → FSM to COMPLETED + payment
                               → NO BOM, NO KOT, NO loyalty, NO drawer
Finance POST /finance/settle   → SettlementEngine (unused by POS)
                               → fake invoice number, raw COMPLETED, no vacate
Reporting /admin
  sales/tax window = Order.createdAt
  T.T.A settledAt hardcoded null → always 0
  unbilled KOTs = every KOT with a parent order
  invoices = synthesized from COMPLETED orders, ignore dashboard date range
  occupancy live statuses omit HANDED_OVER
```

---

## 3. Phase 1 leftover (do not restart from zero)

| Item | Status | Evidence |
|---|---|---|
| Delete duplicate `POST /orders/:id/settle` on `handleRecordPayment` | **Done** | Payments at `orders.ts:400`; settle at `:480` |
| Fallback `payment.create` includes `paymentId` | **Done** | `orders.ts:533-541` uses `crypto.randomUUID()` |
| `BigInt.prototype.toJSON` as String | **Done** | `app.ts:27-29` |
| Cancel uses `transitionOrder` + block COMPLETED | **Done** | `orders.ts:680-689` |
| Header 86 uses real PATCH | **Done** | `ItemToggleModal.tsx:56-62` |
| Store toggle PATCH `/settings/store-status` | **Partial** | Writes `outlet_status`; **nobody else reads it** |
| Direct `status: COMPLETED` in settle handler | **Partial** | Settle uses `transitionOrder` chain; kitchen SERVED, table SERVED, and `SettlementEngine` still raw-update |
| Unified transactional settlement command | **Not done** | Settle is sequential try/continue; side effects after payment, each `.catch(() => {})` |
| BILL create side effects | **Not done** | `orders.ts:128-149` skips BOM, KOT, loyalty, drawer |
| `POST /orders/:id/settle` permission `bill.settle` | **Not done** | `requireAuth` only |

---

## 4. Original phases 1–12 (still required)

Keep the user’s 12-phase list. Amendments:

- **Phase 1** must also fold BILL-create into the same settlement command, kill or wire `POST /finance/settle` / `SettlementEngine` so there is one settler, emit `invoice.settled`, persist a real Invoice row, require `bill.settle`.
- **Phase 2** is confirmed: `kitchen.ts:196`, `tables.ts:261`, `orders.ts:598` plus dead `onOrderCompleted` / `consumeForOrderLine` (imported, never called).
- **Phase 6** tables already exist (`0020` + Prisma `petty_cash_ledger`). Routes still write `AuditLog`. Settle increments `cash_drawer_sessions`; `GET /finance/cash-drawer` ignores sessions.
- **Phase 8** must fix T.T.A `settledAt: null` and leakage “all KOTs unbilled”, not only revenue-trend URL.

---

## 5. Additional gaps (24+) not in the original 23

Numbering continues from the user’s table.

| # | Severity | Location | Gap | Admin screen that lies |
|---|---|---|---|---|
| 24 | P0 | `orders.ts:128-149` + `PosBillingView.tsx:458-478` | BILL / `isPaid` create walks FSM to COMPLETED, records payment, skips BOM, KOT, loyalty, drawer | `/inventory`, `/crm`, `/kitchen-analytics`, `/finance` |
| 25 | P0 | `prisma-reporting-repository.ts:93-98` | T.T.A always `settledAt: null` | `/admin` turnaround always 0 |
| 26 | P0 | `prisma-reporting-repository.ts:120-150` | Invoice leakage returns `[]`; unbilled KOTs = every KOT with a parent order | `/admin` leakage |
| 27 | P0 | `kitchen.ts:191-209` vs `tables.ts:309` | KDS SERVED writes `HANDED_OVER` (raw). Occupancy live set is DRAFT…SERVED only | `/admin` occupancy after KDS serve |
| 28 | P0 | `finance.ts:99-204` + no Invoice model | Reprint/waive target missing Prisma `Invoice`. Reporting synthesizes `INV-${orderNumber}` | `/finance` reprint; `/admin` leakage reprints |
| 29 | P0 | `settings.ts:42-54` vs webhooks | Store pause writes `outlet_status.is_online`. Inbound aggregators never check it | Header Store vs `/integrations` |
| 30 | P0 | `admin.tsx:464-468` | Dashboard poll only on `timeRange`. Ignores `finance.order_settled` / `table.status_updated` | `/admin` stale until Day/Month click |
| 31 | P1 | `admin.tsx:430` | Invoices `?limit=25` no date range; sort by `orderNumber`; `createdAt` is open time | `/admin` recent invoices vs KPI window |
| 32 | P1 | `prisma-reporting-repository.ts:22,157` | Sales/GST window = `Order.createdAt` not settle time | `/admin` vs `/finance` Z-report |
| 33 | P1 | `orders.ts:375-386` | `POST /orders/:id/payments` vacates table without completing order | Occupancy vs floor |
| 34 | P1 | `orders.ts:545-561` vs `finance.ts:303-400` | Settle bumps session expected cash; GET recomputes from Payment + audit petty cash | `/finance` expected cash |
| 35 | P1 | `orders.ts:564-581` | `daily_sales_summary` upsert with no amount columns; reporting never reads it | Dead write |
| 36 | P1 | `menu.ts:293-340` | 86 = `MenuItem.isActive`; `item_availability` unused; version always 1; stockQty always 100 | `/inventory` vs `/menu` vs POS |
| 37 | P1 | `order-lifecycle.ts:50-76` | `onOrderCompleted` never called from routes | Dual inventory story; only `deductBomStockForOrder` runs |
| 38 | P1 | `events/index.ts` + `app.ts` | `LoyaltyEngine.start` / `StockDeductionWorker.start` never mounted. POS settle does not `emitOrderSettled` | `/crm` vs engine transactions |
| 39 | P1 | `settlement-engine.ts:43-65` | Unused by POS; still raw COMPLETED; `payment.create` may lack `paymentId`; random invoice number | Split-brain if anything calls `/finance/settle` |
| 40 | P1 | `orders.ts:480` | Settle not gated on `bill.settle` | RBAC hole |
| 41 | P1 | `admin.tsx:397-461` | `Promise.all` still all-or-nothing on leakage 403 | Whole dashboard blank |
| 42 | P2 | Summary tables (`hourly_sales_summary`, `item_sales_summary`, `payment_summary`, `kot_performance`) | Never populated | Future admin charts |
| 43 | P2 | `KapMetaHeader` store PATCH fail | Local toggle no rollback | Header vs DB |
| 44 | P2 | Admin pages no WS | `/finance`, `/inventory`, `/crm`, `/table-management` refetch on date/mount only | Stale ops |

---

## 6. Single source of truth (lock these)

| Fact | Authority table | Forbidden substitutes |
|---|---|---|
| Order status | `orders.status` via `transitionOrder` only | Raw `prisma.order.update` in kitchen/tables/SettlementEngine |
| Payment | `order_payments` | Fallback create without going through `recordPayment` after Phase 1 command exists |
| Invoice | new `invoices` row written in same txn as COMPLETED | Synthesized `INV-${orderNumber}`; in-memory SettlementEngine invoice |
| KOT lines | `kot_items.order_item_id` unique | Recreate all lines on add-items |
| Stock | `ingredients.current_stock_qty` + `inventory_consumption_log` unique `(order_item_id, ingredient_id, recipe_id)` | AuditLog `INVENTORY_*`; triple deduct |
| 86 | `item_availability` (or one column, not both) | `MenuItem.isActive` as 86; audit `MENU_ITEM_86` as store |
| Channel 86 | `ChannelItemMapping` | Synthetic `itemId-swiggy` |
| Cash | `cash_drawer_sessions` + `petty_cash_ledger` | AuditLog `FINANCE_PETTY_CASH`; hardcoded 200000 |
| Loyalty | `loyalty_accounts` + transaction rows; rate in outlet settings | `Math.floor(total/10000)` |
| Occupancy | dining table status **and** live orders including `HANDED_OVER` until COMPLETED | Table flag alone |
| Store open | `outlet_status` **and** channel pause | Header `useState` only |

---

## 7. Execution order (admin-complete, not API-200)

Do in this order so each phase makes a later admin screen true.

1. **Phase 1+** One settlement command (existing + BILL path + kill/wire finance settler + Invoice row + `bill.settle` + no silent catch)
2. **Phase 3** KOT diff on add-items (kitchen must be correct before occupancy/analytics)
3. **Phase 2** Consumption ledger; remove kitchen/table deduct; shortage event; auto-86 writes availability authority
4. **Phase 4** Outbox for KOT/inventory/loyalty after status commit
5. **Reporting truth (new Phase 8a, before 8)** T.T.A `settledAt`, leakage billed vs unbilled, invoice date range, sales window = settle time, occupancy includes `HANDED_OVER`, dashboard fetch not `Promise.all` death, WS or short poll on `/admin`
6. **Phase 6** Cash drawer GET/POST use `0020` tables; GET reads what settle writes; configurable float; one close per session
7. **Phase 7** Z-report business day + tax-exclusive check vs `grandTotal: totalSales + totalTax`
8. **Phase 8** `/reporting/revenue-trend`; `orders.tsx` URL; invoices table as SoT
9. **Phase 5** Advance fields (can parallel after 1)
10. **Phase 9–11** Inventory PO/GRN, held orders/splits/tables, CRM/marketing/channels
11. **Phase 12** Mounts, shared Prisma, BigInt already string, typecheck, validation

Do **not** start Phase 12 cleanup before settlement and reporting truth. Duplicate mounts hide bugs; they are not the hotel-blocker.

---

## 8. Verification (per admin screen)

After Phase 1–4 + 8a, one manual cover:

1. Occupy table T-01, KOT two items → `/kitchen` one ticket, occupancy occupied
2. Add one item → **one new** KOT line, not a second full ticket of three
3. KDS SERVED → occupancy still occupied (`HANDED_OVER` or `SERVED` in live set); stock **not** deducted yet
4. Settle cash → table vacant; **one** payment; **one** invoice; stock down once; `/finance` expected cash moves; `/admin` (refresh or WS) net sales, GST, invoice list, T.T.A > 0, unbilled KOT not counting this ticket
5. Repeat settle same order → rejected (idempotent)
6. Takeaway BILL → same settle side effects as dine-in settle
7. 86 item on inventory → POS grid and channel status agree; Menu admin still lists it as 86 not vanished
8. Store pause → aggregator webhook 503/reject, not a new order

Automated: extend `tests/e2e/02-dine-in-order-lifecycle.spec.ts` to assert KOT count, consumption_log row count = 1, occupancy, reporting T.T.A qualifying > 0, leakage unbilled excludes settled order.

HTTP 200 smoke (`scratch/run_full_platform_e2e_dry_run.js`) is **not** done.

---

## 9. Files that move together

Settlement: `apps/api/src/routes/orders.ts`, `services/finance/src/settlement-engine.ts`, `apps/pos-web/components/PosBillingView.tsx`  
KOT: `apps/api/src/orchestration/order-lifecycle.ts`, `services/kitchen`, add-items route  
BOM: `apps/api/src/orchestration/inventory-depletion.ts`, `kitchen.ts`, `tables.ts`  
Admin numbers: `services/reporting/src/stores/prisma-reporting-repository.ts`, `apps/pos-web/pages/admin.tsx`, `apps/api/src/routes/tables.ts` occupancy  
Cash: `apps/api/src/routes/finance.ts`, Prisma models for `0020`  
86/store: `apps/api/src/routes/menu.ts`, `settings.ts`, integration webhooks
