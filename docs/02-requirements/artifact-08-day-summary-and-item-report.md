# Feature Build Plan — Artifact 08: Day-End Summary & Item Report

Status: Draft for engineering handoff
Depends on: DB schema doc, API-contracts doc, sync-architecture doc, business-logic-rules doc, decision-register addendum (DEC-013..024)
Related decisions: DEC-014 (Sales Return Orders section cut off, needs re-capture), DEC-016 (My-Amount / Grand-Total / Total money-column glossary)

This document specifies two reporting screens: **Part A — Day-End / Sales Summary (Payment Type Report)** and **Part B — Item Report**. Both are read-only reporting surfaces over already-committed order data; neither screen writes to the transactional tables (`orders`, `order_items`, `order_payments`).

---

## Part A: Day-End Payment Summary

### A.1 Purpose & User Story

**Purpose.** At the end of a shift or business day, the outlet manager or accountant needs a single screen that reconciles "how much money did we take in, broken down by tender type" against the cash drawer and card/UPI settlement batches, and that surfaces exceptions (complimentary orders, sales returns) that explain any gap between gross sales and collected payments.

**User story.**
> As an outlet manager closing the day, I want to see total collections broken down by payment type (Cash, Card, UPI, Due, and any tenant-specific tender types), plus a summary of complimentary orders and sales returns, so that I can reconcile the cash drawer and card settlement report against the POS, and so I can explain any variance to the owner or auditor.

**Secondary users.** Owner/accountant reviewing multiple outlets' day-end reports; auditor reconciling a historical date range.

### A.2 UI Spec

**Page header**
- Outlet selector (if the tenant operates multiple outlets; single-outlet tenants skip this).
- Date range picker — see A.2.1.
- "Generate" / auto-refresh on date change.

**A.2.1 Date range picker.** The source screenshot only shows a single business date. This report needs to support a range for accountant use (week-end, month-end reconciliation), so the picker must expose:
- From date, To date (both required; default To = From, i.e., a single-day report, replicating the captured screen).
- Presets: Today, Yesterday, This Week, Last Week, This Month, Last Month, Custom.
- Business-day boundary: use the outlet's configured day-close time (e.g., 4:00 AM) rather than midnight, if such a setting exists in the outlet-config table; flag as **open question** if no such setting currently exists (see A.10).

**A.2.2 Payment Type table.** One row per payment type that has nonzero activity in the selected range (see A.10 for zero-activity display rule), columns:

| Column | Description |
|---|---|
| Payment Type | `payment_type_master.label` — tenant-configurable, never hardcoded (see A.7) |
| Total (₹) | Sum of `order_payments.amount` for that payment type, in range, for the outlet, excluding voided/cancelled orders |

Captured data for 21-08-2026 (single day), used as the canonical worked example throughout this doc:

| Payment Type | Total (₹) |
|---|---|
| Not Paid | 119.00 |
| Cash | 14,805.00 |
| Card | 198.00 |
| Due Payment | 4,578.00 |
| Other (Room Service) | 435.00 |
| Swiggy - Online | 7,503.00 |
| Zomato - Online | 9,169.00 |
| UPI | 19,913.00 |
| **Grand Total** | **56,720.00** |

A **Grand Total** row is appended below the payment-type rows, summing the column. This is the "Total" per the DEC-016 glossary (not "My Amount", which per that decision refers to a per-cashier collection figure elsewhere in the app, out of scope here).

**A.2.3 Complimentary Orders block.** A distinct summary block below the payment table:

| Field | Value |
|---|---|
| Count | integer count of complimentary orders in range |
| Amount | sum of the would-be bill value of those orders (menu value, not a payment — complimentary orders have no corresponding `order_payments` row, or have one flagged `is_complimentary`, see A.4.2) |

**A.2.4 Sales Return Orders block.** A table, columns per the captured (but truncated) screenshot: **Order** (order number/reference) and **Total** (₹ returned). Per DEC-014, the capture was cut off mid-scroll and the full column list is unconfirmed. This doc proposes a complete data model in A.3.2 and flags it explicitly as inferred, pending re-capture.

**A.2.5 Interactions.** Clicking a payment-type row, the Complimentary block, or the Sales Return block should drill into a filtered order list (see A.10 — flagged as an open question whether this is in scope for this release or a future one).

**A.2.6 Print / Export.** Print button producing a print-formatted version of the same summary (no export-Excel requirement was captured for this screen; Part B has it explicitly — treat Part A print as printer-friendly HTML/PDF only, do not assume Excel export unless later confirmed).

### A.3 Data Model

Part A is a **computed report**, not a stored transactional table. Two approaches are viable; recommend starting with (a) and moving to (b) only if performance requires it:

**(a) On-demand aggregate query** at request time over `order_payments` joined to `payment_type_master` and `orders`, filtered by outlet + date range + non-voided status. Simplest, always-correct, and avoids a second source of truth. Given expected order volumes (a single outlet doing a few hundred orders/day), this is performant enough without materialization.

**(b) Materialized/summary table** (`day_end_payment_summary`) refreshed nightly or on-demand, for tenants/outlets with very high order volume or when the report needs to support long historical ranges (e.g., a full year) without re-scanning `order_payments`. Proposed schema if adopted later:

```
day_end_payment_summary
  id                  bigint PK
  outlet_id           bigint FK -> outlets.id
  business_date       date
  payment_type_id     bigint FK -> payment_type_master.id
  total_amount        numeric(12,2)
  order_count         int
  computed_at         timestamptz
  UNIQUE (outlet_id, business_date, payment_type_id)
```

This is explicitly a derived/cache table; it must be rebuildable from `order_payments` at any time and must never be the sole system of record.

**A.3.1 Complimentary order identification.** Requires a boolean flag distinguishing complimentary orders. Recommend `orders.is_complimentary boolean default false` (order-level, since a complimentary order is typically the whole bill waived, not a partial line-item comp — partial comps would live as a discount on `order_items`, out of scope here). A complimentary order should still create an `orders` row (for KOT/kitchen tracking and audit) but should not create a settling `order_payments` row, or if a placeholder row is created for workflow reasons, it must be excluded from the payment-type sums by filtering `orders.is_complimentary = false` in the Part A queries.

**A.3.2 Sales Returns — proposed full schema (inferred, pending DEC-014).**

The existing DB schema doc lists a `sales_returns` table but the captured screenshot that would confirm its exact columns cut off mid-scroll. The columns visibly captured are only **Order** and **Total**. To support a real return workflow (partial-item returns, refund method tracking, approval trail), propose the following full schema; this must be validated against a re-capture per DEC-014 before implementation:

```
sales_returns
  id                  bigint PK
  outlet_id           bigint FK -> outlets.id
  order_id            bigint FK -> orders.id            -- the original sale
  order_item_id       bigint FK -> order_items.id NULL  -- NULL = whole-order return
  qty                 numeric(10,2)                     -- quantity returned (item-level)
  amount              numeric(12,2)                     -- ₹ value returned
  reason              text NULL                          -- free text or reason-code FK
  refund_method       varchar FK -> payment_type_master.id NULL -- how refunded (cash, card reversal, etc.)
  approved_by         bigint FK -> users.id NULL         -- manager approval, if required
  returned_at         timestamptz
  created_at          timestamptz
```

Design intent behind each inferred column:
- `order_item_id` nullable to support both whole-order returns (matches the captured "Order / Total" grain) and future partial/line-item returns.
- `refund_method` reuses `payment_type_master` so a return-to-card vs return-as-cash-refund can itself be reported per tender type — important because a Cash return should reduce the Cash total, not silently vanish.
- `approved_by` anticipates a manager-approval workflow common in POS return flows (prevents cashier-initiated silent refunds); confirm whether Kapmeta v1 requires this or defers it.
- `reason` as free text for v1; a `return_reasons` lookup table is a plausible v2 enhancement, not required now.

**Explicit flag:** every field above except `order_id` and `amount` (or a close analog) is an inference, not a confirmed capture. Do not build against this schema without either (1) a corrected screenshot resolving DEC-014, or (2) explicit stakeholder sign-off that this proposed shape is acceptable to build against now with a migration-friendly design (nullable columns, no hard constraints that would break if the real UI turns out simpler).

### A.4 Report Computation Spec

**A.4.1 Payment-type breakdown — SQL shape:**

```sql
SELECT ptm.label AS payment_type,
       SUM(op.amount) AS total
FROM order_payments op
JOIN payment_type_master ptm ON ptm.id = op.payment_type_id
JOIN orders o ON o.id = op.order_id
WHERE o.outlet_id = :outlet_id
  AND o.business_date BETWEEN :from_date AND :to_date
  AND o.status NOT IN ('voided', 'cancelled')
  AND o.is_complimentary = false
GROUP BY ptm.label
ORDER BY ptm.display_order;  -- or ptm.id; avoid alphabetical, preserve tenant-configured ordering
```

Grand Total row = `SUM(op.amount)` across all rows above, computed either as a second query or as a client-side sum of the returned rows — recommend server-side for correctness/rounding consistency.

**A.4.2 Complimentary block:**

```sql
SELECT COUNT(*) AS comp_count,
       SUM(o.bill_amount) AS comp_amount   -- bill_amount = pre-payment order value
FROM orders o
WHERE o.outlet_id = :outlet_id
  AND o.business_date BETWEEN :from_date AND :to_date
  AND o.status NOT IN ('voided', 'cancelled')
  AND o.is_complimentary = true;
```

Complimentary orders are **excluded** from the payment-type table (A.4.1 filters them out) because they generate no real tender collection, and are **reported separately** so the day's total sales value (complimentary + paid) can still be understood by management even though it doesn't appear in the cash/card reconciliation.

**A.4.3 Sales returns block:**

```sql
SELECT sr.order_id, o.order_number, SUM(sr.amount) AS total
FROM sales_returns sr
JOIN orders o ON o.id = sr.order_id
WHERE o.outlet_id = :outlet_id
  AND sr.returned_at::date BETWEEN :from_date AND :to_date
GROUP BY sr.order_id, o.order_number;
```

Note: returns are grouped by `returned_at` (the day the return happened), not the original order's business date — see A.6.2 for the rationale.

**A.4.4 Worked reconciliation example (business date 21-08-2026).**

Step 1 — sum the payment-type table (excludes complimentary by construction):

```
  Not Paid                119.00
  Cash                 14,805.00
  Card                    198.00
  Due Payment            4,578.00
  Other (Room Service)    435.00
  Swiggy - Online       7,503.00
  Zomato - Online       9,169.00
  UPI                  19,913.00
  --------------------------------
  Grand Total (collected) 56,720.00
```

Step 2 — add complimentary value to get **total sales value served** (informational, not part of the collected-cash reconciliation):

```
  Grand Total (collected)     56,720.00
  + Complimentary Amount       [example] 850.00  (Count: 3)
  --------------------------------------------
  = Total Sales Value Served   57,570.00
```

Step 3 — apply same-day sales returns to get **net collected**, since a return typically pays cash/card back out of the drawer or reverses a card charge:

```
  Grand Total (collected)      56,720.00
  - Sales Returns (same day)    [example] 320.00
  --------------------------------------------
  = Net Collected (drawer target)  56,400.00
```

This three-step ladder — **Collected total → + Complimentary = Sales value served → − Returns = Net collected** — is the reconciliation an accountant performs against the physical drawer count and settlement batch reports. The report screen should display Grand Total, Complimentary, and Sales Returns as three clearly separated blocks (per the captured UI) rather than auto-netting them, so each number remains independently auditable; a footnote or tooltip may show the netted figure for convenience but must not replace the itemized blocks.

"Not Paid" and "Due Payment" are included in the Grand Total (collected) row above deliberately — see A.6.1 for why they are *not* excluded even though no cash has physically moved for "Due" as of that day.

### A.5 API Endpoints

```
GET /api/v1/reports/day-summary
  Query: outlet_id, from_date, to_date
  Returns: { payment_types: [{label, total}], grand_total,
             complimentary: {count, amount},
             sales_returns: [{order_id, order_number, total}], sales_returns_total }

GET /api/v1/reports/day-summary/complimentary
  Query: outlet_id, from_date, to_date
  Returns: [{order_id, order_number, bill_amount, comped_at, comped_by}]
  -- drill-down detail list backing the Complimentary block

GET /api/v1/reports/day-summary/sales-returns
  Query: outlet_id, from_date, to_date
  Returns: [{order_id, order_number, order_item_id, item_name, qty, amount,
             reason, refund_method, approved_by, returned_at}]
  -- drill-down detail list backing the Sales Return block; field list mirrors
     the proposed schema in A.3.2 and is subject to change per DEC-014
```

### A.6 Business Logic / Edge Cases

**A.6.1 Due Payment later collected — does it move between Due and Cash retroactively?**

Recommendation: **No — the origin day keeps the amount under Due Payment permanently.** When a customer later pays off an outstanding due, that is a *separate collection event* recorded against an outstanding-dues ledger (a table such as `due_settlements` tracking `order_id`, `amount_collected`, `collected_via` payment type, `collected_at`), not a mutation of the original `order_payments` row or the original day's report.

Rationale: historical day-end reports must be immutable and re-runnable — an accountant who reconciled 21-08-2026's report against that day's drawer count must always get the same numbers back. If a due collected three days later silently moved ₹500 from "Due Payment" to "Cash" on the *original* day, the original day's report would no longer match the signed-off reconciliation, and the day it was actually collected in cash would show no corresponding cash inflow (understating that day's drawer count).

Worked example:
- 21-08-2026: customer orders ₹500, pays nothing, order recorded with `payment_type = Due Payment`. Day-end report for 21-08 shows Due Payment total including this ₹500, permanently.
- 24-08-2026: customer pays the ₹500 in cash. This creates a `due_settlements` row for 24-08, `collected_via = Cash`, amount 500. It does **not** touch `order_payments` for the original order, and it does **not** appear in the 24-08 Payment Type table's Cash row (that table is scoped to *orders placed* that day, not dues collected that day) — instead it appears in a separate "Due Collections" panel/report (out of scope for this document's two screens, but referenced here so the data model doesn't paint the project into a corner). Flag this as a related-but-separate report to scope later.

**A.6.2 Which day does a sales return affect — the return day or the original sale day?**

Recommendation: **The return affects the day it happened on** (`sales_returns.returned_at`), cross-referenced to the original order for context, not the original sale's business date. A return processed on 23-08 against an order placed on 21-08 appears in the 23-08 report's Sales Return block, referencing `order_id` back to the 21-08 order.

Rationale: matches A.6.1's immutability principle — the 21-08 report, once closed and reconciled, should not change when something happens three days later. The drawer impact of a refund happens on the day cash actually leaves the drawer, so that's the day it must be visible for reconciliation purposes.

**A.6.3 Voided/cancelled orders.** Must be excluded entirely from both the payment-type table and the complimentary block (they represent no real transaction), regardless of whether a payment row was transiently created before cancellation. Confirm the exact status taxonomy against the orders schema doc.

**A.6.4 Split-tender orders.** An order paid partly Cash, partly Card produces two `order_payments` rows against one `orders` row; the aggregate query in A.4.1 is written to sum `order_payments.amount`, not `orders.bill_amount`, specifically so split tenders are counted correctly under each tender type rather than double-counted or misattributed to whichever payment type happened to be recorded first.

### A.7 Admin/Config Dependency

Per project rule (CLAUDE.md), payment type labels are tenant/business data and must never be hardcoded — proven necessary by the captured "Other (Room Service)" custom label. Required admin screen:

**Payment Type Master — admin CRUD**
- List view: label, internal code, display order, active/inactive toggle, "system default" flag (Cash/Card/UPI/Due Payment/Not Paid ship as system defaults, not deletable — only deactivatable; Swiggy/Zomato-style delivery-channel types and any custom label like "Other (Room Service)" are tenant-added and fully editable/deletable).
- Create/Edit form: label (required, unique per outlet or per tenant depending on whether payment types are outlet-scoped — confirm scope), display order (drag-reorder or numeric), active toggle.
- Delete: soft-delete only (`is_active = false`) — a payment type referenced by historical `order_payments` rows must never be hard-deleted, or historical reports break. Enforce via FK with no cascade, plus an application-level check blocking hard delete when references exist.
- This same table backs both the day-end report's row set (A.4.1's `ptm.label`) and the checkout/payment-collection UI elsewhere in the POS, so a new tenant-defined tender type immediately appears in both places with no code change.

### A.8 Permissions

- **View report:** Manager, Owner, Accountant roles. Recommend excluding plain Cashier role from this report by default — cashiers see their own shift totals via a different, narrower screen (out of scope here), not the full day-end reconciliation, which can reveal other cashiers' collections and store-wide totals.
- **Export/Print:** Same roles as view; no additional restriction proposed unless the tenant later asks for print-only-no-export tiers.
- **Drill-down into Complimentary/Sales Return detail:** Manager/Owner/Accountant; comping an order in the first place (a separate, write-side permission) should already be Manager-gated elsewhere and is out of scope for this read-only report doc.
- Enforce via the same role-based middleware already defined in the API-contracts doc; this doc does not introduce a new permission model, only specifies which existing roles map to these two read endpoints.

### A.9 Test Plan

1. **Golden reconciliation test** — seed exactly the captured order/payment data (Not Paid 119, Cash 14805, Card 198, Due Payment 4578, Other (Room Service) 435, Swiggy-Online 7503, Zomato-Online 9169, UPI 19913) for outlet X on 21-08-2026; assert the report returns each row exactly and Grand Total = 56,720.00.
2. **Complimentary exclusion test** — seed one complimentary order with bill value 500; assert it does NOT appear in any payment-type row or the Grand Total, and DOES appear in the Complimentary block with count 1, amount 500.00.
3. **Split-tender test** — seed one order paid 300 Cash + 200 UPI; assert Cash total includes the 300 and UPI total includes the 200, and Grand Total includes the full 500 exactly once.
4. **Voided order exclusion test** — seed a voided order with a payment row; assert it is fully excluded from all blocks.
5. **Due-payment immutability test (A.6.1)** — seed a Due Payment order on day 1, then a `due_settlements` collection event on day 3; assert day 1's report is unchanged after the day-3 event, and day 3's Payment Type table does not include the settled amount under Cash.
6. **Sales return day-attribution test (A.6.2)** — seed an order on day 1, a return against it on day 3; assert the return appears in day 3's Sales Return block referencing the day-1 order, and does not alter day 1's payment-type totals.
7. **Date range test** — request a 3-day range spanning the seeded data; assert totals sum correctly across days and match the per-day golden totals summed.
8. **Tenant-custom payment type test** — create a new payment type "Cheque" via the admin CRUD, seed one order paid via it, assert it appears as its own row in the report with no code change required (regression guard against re-hardcoding).
9. **Zero-outlet-activity test** — outlet with no orders in range returns an empty/zero report without error.
10. **Permission test** — Cashier-role user is denied (403) on both `GET /reports/day-summary` and its two detail endpoints; Manager/Owner/Accountant succeed.

### A.10 Open Questions / Flags for Stakeholder

1. **DEC-014 — Sales Return Orders full field list.** The proposed schema in A.3.2 (qty, order_item_id, reason, refund_method, approved_by) is inferred, not confirmed. Needs a re-capture of the full, unscrolled screen (and ideally the return-detail/drill-down screen if one exists) before this section is implemented as-is.
2. **Zero-activity payment types.** Should a payment type with ₹0 activity in the selected range be hidden (as the captured data implies — no type shows unless it has a nonzero total) or shown as a 0.00 row for completeness/consistency of column layout? Recommend hide-if-zero, matching the captured screenshot, but confirm.
3. **Drill-down detail screens.** Is clicking into a payment-type row, the Complimentary block, or the Sales Return block (to see the underlying order list) in scope for this release, or is the summary-only view sufficient for v1? The two detail API endpoints in A.5 are specified either way since they're needed for the Sales Return / Complimentary blocks' own internal rendering regardless, but a full order-list drill-down UI is a separate scoping question.
4. **Outlet business-day boundary.** Does the outlet have a configured day-close time (e.g., orders after midnight but before 4 AM count as the previous business date)? If yes, `orders.business_date` must be set at write-time using that logic, not `created_at::date`, for both this report and Part B.
5. **Complimentary approval workflow.** Does comping an order require manager approval / a reason code? Not required for this report's read side, but affects whether A.4.2's detail endpoint should also surface `comped_by`/`comp_reason` fields.
6. **Due Payment collection ledger.** Confirmed out of scope for this document (see A.6.1) but should be scoped as its own follow-up report/screen — flagging so it isn't lost.

---

## Part B: Item Report

### B.1 Purpose & User Story

**Purpose.** Gives managers and menu planners item-level sales visibility — which dishes sell, in what quantity, for what revenue, grouped by menu category — to support menu engineering (promote/cut items), inventory planning, and category-level performance review over a date range.

**User story.**
> As an outlet manager or owner, I want to see, for any date range, how many units and how much revenue each menu item generated, grouped by category with subtotals, so that I can identify best- and worst-performing items and adjust the menu, pricing, or promotions accordingly.

### B.2 UI Spec

**Page header**
- Report title: "Item Report : From 21-08-2026" style label reflecting the active date range.
- Date range picker (see B.2.1).
- Toolbar: **Search** (item name/code filter), **Configure Column** (see B.2.3), **Time Wise** toggle (see B.2.4), **Print**, **Export Excel**, and a **Print Configuration** link (see B.2.5).

**B.2.1 Date range picker.** Same component as Part A (B.2 mirrors A.2.1): From/To dates, presets (Today, Yesterday, This Week, This Month, Custom). The captured label "Item Report : From 21-08-2026" implies at minimum a From date is shown; a To date must exist even for a single-day report (From = To in that case) — this is a UI-completeness gap in the capture, not a genuine single-date-only design, and should be built as a proper range picker.

**B.2.2 Report table.**

Grand-total header row, always visible above the category groups:

| Item | Code | Qty | Total (₹) |
|---|---|---|---|
| – | – | 716.00 | 60,332.02 |

(Item/Code show "–" at the page-total row since it aggregates across all items.)

Below it, **collapsible category groups**, each showing:
- Category header (e.g., "Fresh Juice") — collapsed/expanded toggle.
- Item rows: Item name, Code, Qty, Total (₹). Example: Pineapple Juice / 107 / 3.00 / ₹145.24.
- Sub Total row per category, summing Qty and Total (₹) for that category's items.

Categories should default to expanded or collapsed per a sensible default (recommend: expanded if the result set is small, e.g., <5 categories, else collapsed by default) — flag as a UX nicety, not a hard requirement, and confirm with design.

**B.2.3 Configure Column.** Opens a picker letting the user choose which columns are visible (from the full available set: Item, Code, Category, Qty, Total, and any others such as Rate/Average Price, % of Total Sales, Tax Amount, Discount Amount, if those exist in the underlying data) and their display order. The selection is **persisted per user** so it's remembered on next visit (see B.4.2 for the storage model). Item and Total are recommended as non-hideable "always shown" columns since the report is meaningless without them; Code and Qty likely toggleable.

**B.2.4 "Time Wise" toggle.** Exact meaning was not directly captured. **Proposed interpretation, flagged for confirmation:** when enabled, breaks each item's (or the whole report's) totals down by hour-of-day (or by a configurable time bucket — hour, or meal period like Breakfast/Lunch/Dinner) within the selected date range, useful for identifying peak-selling windows per item. Design the toggle's data contract so it degrades gracefully if the real meaning turns out to be date-wise-breakdown-across-a-multi-day-range instead (i.e., keep the API param generic — `group_by_time: none|hour|date` — rather than hardcoding an hour-only assumption). **This must be confirmed with the stakeholder before final implementation**; build the UI toggle and API param now, but treat the exact bucket definition as provisional.

**B.2.5 Print Configuration link.** A separate settings link, presumably controlling print layout/paper size/columns-in-print independent of the on-screen Configure Column setting (e.g., a thermal-printer-friendly abbreviated layout vs. a full-page A4 layout for the on-screen report). Recommend this opens a distinct settings panel from Configure Column, since "print configuration" as a labeled, separate link implies a separate concern (paper/layout) rather than duplicating column selection. Flag as needing confirmation of exact scope.

**B.2.6 Search.** Free-text filter across Item name and Code, live-filtering the currently loaded report client-side (if result set is reasonably small) or server-side with debounce (if large/paginated). Should filter within category groups and hide empty categories rather than flattening the grouped structure.

### B.3 Data Model

Base data comes from `order_items` joined to a menu catalog. Since the DB schema doc as summarized does not list `menu_items`/`menu_categories` explicitly, this section assumes their existence (standard for any POS) and specifies the join shape needed; confirm exact table/column names against the actual schema doc before implementation.

**B.3.1 On-demand aggregate query** (baseline approach, same reasoning as Part A):

```sql
SELECT mc.name AS category_name,
       mi.name AS item_name,
       mi.code AS item_code,
       SUM(oi.qty) AS qty,
       SUM(oi.line_total) AS total
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN menu_categories mc ON mc.id = mi.category_id
WHERE o.outlet_id = :outlet_id
  AND o.business_date BETWEEN :from_date AND :to_date
  AND o.status NOT IN ('voided', 'cancelled')
GROUP BY mc.id, mc.name, mi.id, mi.name, mi.code
ORDER BY mc.display_order, mi.name;
```

Category Sub Totals and the page Grand Total are computed as roll-ups over the same result set (SQL `GROUPING SETS`/`ROLLUP`, or summed in the application layer after fetching the item-level rows — either is acceptable; `ROLLUP` reduces round trips at some added query complexity).

**B.3.2 Materialized view for scale — `mv_item_sales_daily`.** For tenants with high order volume or when the UI needs fast repeated re-aggregation (toggling Time Wise, changing columns, searching) without re-scanning `order_items` each time, propose a daily-grain materialized view, refreshed nightly (or incrementally on order close):

```
mv_item_sales_daily
  outlet_id          bigint
  business_date      date
  hour_of_day         smallint      -- 0-23, supports Time Wise hour bucketing; NULL-safe design: store it always, aggregate away when not needed
  menu_item_id        bigint FK -> menu_items.id
  category_id         bigint FK -> menu_categories.id
  qty                 numeric(10,2)
  total_amount        numeric(12,2)
  PRIMARY KEY (outlet_id, business_date, hour_of_day, menu_item_id)
```

Report queries then aggregate over this narrower, pre-grouped table instead of raw `order_items`, which is materially cheaper at scale and makes the Time Wise toggle a simple additional GROUP BY on `hour_of_day` rather than a fresh full-table scan. Recommend building the on-demand query first (B.3.1) and introducing this view only once real data volume or latency justifies it — do not build it speculatively.

**B.3.3 Configure Column persisted preference — data model.**

```
user_report_preferences
  id             bigint PK
  user_id        bigint FK -> users.id
  report_key     varchar          -- e.g. 'item_report'
  columns_json   jsonb            -- ordered list of visible column keys, e.g. ["item","code","qty","total"]
  updated_at     timestamptz
  UNIQUE (user_id, report_key)
```

Generic (`report_key` + `columns_json`) so the same table can later back Configure-Column-style preferences on other reports without a schema change per report.

### B.4 Report Computation Spec

**B.4.1 Category-grouped rollup logic.**
1. Run the aggregate query (B.3.1), grouped by category then item.
2. For each category, compute Sub Total: `Sub Total.qty = SUM(item.qty in category)`, `Sub Total.total = SUM(item.total in category)`.
3. Grand Total = `SUM(Sub Total.qty across all categories)`, `SUM(Sub Total.total across all categories)`. This must equal a direct `SUM(order_items.line_total)` over the same filter with no category grouping — that equivalence is the basis for the rollup test in B.9.
4. Column selection (B.2.3) affects only which columns are *rendered*; it must never affect which rows are included or how sums are computed — Configure Column is a display-layer concern, computed server-side once, columns filtered at the response-shaping or client-render layer.

**B.4.2 Configure Column persistence.** On save, upsert into `user_report_preferences` keyed by `(user_id, 'item_report')`. On report load, fetch the user's saved `columns_json`; if none exists, fall back to a system default column set (Item, Code, Qty, Total).

**B.4.3 Time Wise breakdown (provisional, pending B.2.4 confirmation).** When enabled, the query in B.3.1 adds `EXTRACT(HOUR FROM o.created_at) AS hour_of_day` (or a meal-period bucket) to the GROUP BY, and the UI renders either an additional column or a nested sub-breakdown per item. Exact rendering shape is deferred pending stakeholder confirmation of the toggle's true meaning.

### B.5 API Endpoints

```
GET /api/v1/reports/item-report
  Query: outlet_id, from_date, to_date, group_by_time (none|hour|date, default none),
         search (optional), columns (optional, overrides saved preference for this request)
  Returns: { grand_total: {qty, total},
             categories: [{ category_name, sub_total: {qty, total},
                             items: [{item_name, item_code, qty, total}] }] }

POST /api/v1/reports/item-report/export
  Body: { outlet_id, from_date, to_date, columns, group_by_time }
  Returns: a generated .xlsx file (or a job id + polling/download URL if export is async for large ranges)

GET /api/v1/reports/item-report/print-configuration
  Returns/points to: the print-layout settings panel (paper size, columns-in-print, etc.)
  -- exact behavior pending confirmation per B.2.5; may resolve to a settings page route
     rather than a data endpoint if "Print Configuration" is purely a client-side navigation link

GET/PUT /api/v1/reports/preferences/item-report
  GET: current user's saved column configuration
  PUT: body { columns: ["item","code","qty","total"] } — upserts user_report_preferences
```

### B.6 Business Logic / Edge Cases

**B.6.1 Item with zero sales in the period.** Excluded from the report by default (matches the pattern of Part A's zero-activity payment types, and matches the captured screenshot which only lists items with actual sales). Do not show as a 0-row line; that would make the report unbounded in size (every menu item ever created would appear every time) and defeats its purpose as a sales-activity view. If a "show all menu items including zero-sales" mode is wanted later (useful for spotting completely dead items), it should be an explicit opt-in filter, not the default.

**B.6.2 Deleted/discontinued menu items still appearing in historical reports.** `menu_items` must **never be hard-deleted**. Use `menu_items.is_active boolean` for soft-delete/discontinuation. Rationale: a historical Item Report for August must still show "Pineapple Juice" and its correct sales even if that item was removed from the menu in September — hard-deleting the row (or worse, reusing its id for a new item) would corrupt historical reports and violate the immutability principle established in Part A (A.6.1/A.6.2). The report query (B.3.1) joins to `menu_items` by id regardless of `is_active`, so historical rows resolve correctly; only the *live menu/ordering* screens filter on `is_active = true`. Category deletion follows the same rule — `menu_categories.is_active`, never hard-deleted.

**B.6.3 Item renamed or recategorized mid-range.** If an item's name or category changes partway through a selected date range, the report will show the item under its *current* name/category for the whole range (since the query joins live `menu_items`/`menu_categories`, not a historical snapshot). Flag this as a known limitation; a fully historically-accurate report would require either an audit/versioning table for menu items or storing `item_name_snapshot`/`category_name_snapshot` on `order_items` at order time. Recommend checking whether `order_items` already stores such a snapshot (common in POS systems, since the receipt must show the name as it was at sale time) — if it does, prefer joining/reporting from that snapshot rather than the live `menu_items` table, which would also make B.6.2's soft-delete concern moot for reporting purposes. This is worth resolving early since it changes the join in B.3.1.

**B.6.4 Voided/cancelled orders and refunded/returned items.** Excluded from Item Report totals via the same `status NOT IN ('voided','cancelled')` filter as Part A. Whether *returned* items (via Part A's `sales_returns`) should reduce the Item Report's Qty/Total for the day they were returned, or whether Item Report reflects gross sales only (with returns tracked purely in Part A) needs a decision — recommend Item Report shows gross sales as sold (simpler, matches "how much did we sell" framing) and returns remain a Part A concept only, but flag for confirmation since a menu-engineering view arguably wants net-of-returns figures too.

### B.7 Admin/Config Dependency

- **Report column configuration** is a lightweight per-user setting (B.3.3's `user_report_preferences`), not a tenant-wide admin screen — no admin CRUD needed beyond the report's own Configure Column UI writing to that table via the PUT endpoint in B.5.
- **Menu categories/items** are managed via the existing (out-of-scope-for-this-doc) menu management admin screens; this report only consumes that data, read-only, and depends on those screens enforcing soft-delete (B.6.2) rather than hard-delete.
- **Print Configuration** (B.2.5) may need its own lightweight per-user or per-outlet settings row (e.g., `print_paper_size`, `print_columns_json`) — model identically to `user_report_preferences` if it turns out to be a genuinely separate setting; confirm scope first (see B.10).

### B.8 Permissions

- **View report:** Manager, Owner, Accountant. Recommend also allowing a "Kitchen/Menu Planner" role if one exists in the tenant's role model, since item-level sales data is directly useful for menu planning and carries less financial-exposure sensitivity than Part A's cash/tender breakdown. Confirm role list against the existing permissions doc.
- **Export Excel:** Same view-permitted roles; no extra tier proposed unless requested.
- **Configure Column / Print Configuration:** Any user who can view the report can configure their own column preferences (it's a personal display setting, not a data-sensitivity concern).

### B.9 Test Plan

1. **Golden rollup test** — seed order_items producing the captured Fresh Juice category example (Pineapple Juice, code 107, qty 3.00, total ₹145.24) alongside enough other categories/items to sum to the captured Grand Total (qty 716.00, total ₹60,332.02); assert the report returns the exact category breakdown and the exact Grand Total.
2. **Subtotal-sums-to-grand-total test** — for an arbitrary seeded dataset spanning N categories, assert `SUM(category.sub_total.qty for all categories) == grand_total.qty` and the equivalent for `.total`, for every test run (not just the golden fixture) — this is the core rollup-integrity test.
3. **Direct-sum equivalence test** — assert the report's Grand Total exactly equals a raw `SUM(order_items.line_total)` computed independently over the same filter, with no category grouping involved, catching any double-counting or filter-mismatch bug.
4. **Zero-sales item exclusion test** — seed a menu item with no orders in range; assert it does not appear in the report.
5. **Soft-deleted item historical visibility test (B.6.2)** — seed sales for an item, then set `menu_items.is_active = false`; assert the historical report for that date range still shows the item correctly, and the live menu (separate screen/query) no longer lists it.
6. **Configure Column persistence test** — user saves a column config via the PUT preferences endpoint; assert a subsequent GET (simulating next visit/session) returns the same saved config; assert a different user's config is independent (no cross-user leakage).
7. **Configure Column non-effect on totals test** — assert that changing visible columns never changes the underlying Qty/Total figures returned by the report query (display-layer isolation, per B.4.1 point 4).
8. **Search filter test** — search for a partial item name/code; assert only matching items (and their parent categories, with non-matching sibling items hidden) are returned, and category-level Sub Totals in a filtered view either recompute over the filtered set or are clearly not shown — decide and encode expected behavior explicitly in this test.
9. **Voided order exclusion test** — mirrors Part A's equivalent test, for `order_items` tied to voided orders.
10. **Time Wise toggle smoke test** — once B.2.4's exact meaning is confirmed, add a test asserting hour/date bucketed sums reconcile to the same Grand Total as the non-bucketed report (sum-across-buckets invariant).
11. **Export Excel test** — request export for a seeded dataset; assert the generated file's totals match the on-screen report's totals exactly (no rounding drift between the two code paths).
12. **Permission test** — a role not permitted to view (e.g., Cashier, if excluded per B.8) receives 403 on the report and export endpoints.

### B.10 Open Questions / Flags for Stakeholder

1. **"Time Wise" toggle exact meaning (B.2.4).** Confirm whether it means hour-of-day breakdown, meal-period breakdown, or per-date breakdown across a multi-day range, before finalizing B.4.3 and the `group_by_time` API contract.
2. **"Print Configuration" scope (B.2.5).** Confirm whether this is a distinct print-layout settings panel or effectively a synonym/shortcut into Configure Column for print purposes.
3. **Full available column set for Configure Column.** Only Item/Code/Qty/Total were captured. Confirm whether Rate, % of total, tax, discount, or other columns exist in the real screen so B.2.3's "full available set" can be finalized rather than assumed.
4. **Historical name/category snapshotting (B.6.3).** Determine whether `order_items` already stores a name/category snapshot at time of sale; this materially affects whether B.6.2's soft-delete-only rule is sufficient on its own or whether a snapshot-based join is required for full historical accuracy.
5. **Net-of-returns vs gross sales in Item Report (B.6.4).** Confirm whether menu-engineering stakeholders want Item Report figures net of sales returns, which would require joining `sales_returns` into B.3.1 — currently out of scope, gross-only, by default recommendation.
6. **Role list for view permission.** Confirm the exact role set for both Part A and Part B (this doc assumes Manager/Owner/Accountant view both; Kitchen/Menu Planner optionally views Part B) against the tenant's actual role/permission model.
7. **Outlet business-day boundary** — shared open question with Part A (A.10.4); affects both reports' date filtering identically and should be resolved once, not twice.
