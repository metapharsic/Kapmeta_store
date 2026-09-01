# Feature Build Plan — Current Order / Order History List

**Doc ID:** BUILD-PLAN-05
**Screen:** Order History / Current Order List (Order tab table view with filters, search, sort, and per-row actions)
**Depends on:** DB schema doc (orders, order_items, order_payments, order_audit_log, sales_returns), API-contracts doc, sync-architecture doc, business-logic-rules doc, decision-register addendum (DEC-013..024)
**Status:** Draft for engineering kickoff
**Author:** Kapmeta platform team
**Last updated:** 2026-08-21

---

## 1. Purpose & User Story

### 1.1 Purpose

This screen is the primary operational log for everything that has happened to orders at an outlet on a given day (or date range). It serves three overlapping jobs:

1. **Lookup / audit** — a cashier or manager finds a specific order (by order number, customer phone, or customer name) to check its status, items, and payment breakdown.
2. **Reprint** — regenerate a bill or KOT (kitchen order ticket) for a customer who lost their copy, or for kitchen re-fire, while keeping a clear record that a duplicate was produced.
3. **Correction** — a manager fixes a Grand Total that was entered or computed incorrectly (discount applied wrong, rounding dispute, complimentary adjustment) through a controlled, audited edit flow.

This is not the order-taking screen. No new items are added here, and no order is created here — it is a read-and-correct surface over orders that already exist in the `orders` table.

### 1.2 User stories

- **As a cashier**, I want to filter today's orders by type (Dine In / Delivery / Pick Up) and search by phone number, so I can quickly find an order a customer is asking about at the counter.
- **As a cashier**, I want to reprint a bill for an order I already closed, so I can hand a customer a second copy without re-running the whole billing flow.
- **As a manager**, I want to see the payment type and Grand Total of every order today, sorted by latest first, so I can reconcile the till at end of shift.
- **As a manager**, I want to correct a Grand Total that was mis-keyed, with a mandatory reason and my own approval, so there is an auditable trail of who changed what and why.
- **As an outlet owner**, I want cashiers to only see their own shift's orders by default, while managers can see the full day/outlet, so staff cannot browse each other's transactions without cause.

### 1.3 Out of scope for this screen

- Creating new orders or editing line items (that is the order-taking / cart screen).
- Processing refunds beyond what `sales_returns` already models (this screen surfaces the return status but return capture happens elsewhere).
- Configuring payment types or print templates (admin/config screens; this screen only *consumes* that config — see Section 7).

---

## 2. UI Spec

### 2.1 Layout overview

```
[All] [Dine In] [Delivery] [Pick Up]         [Search: phone / name / order#]   [Sort By: Latest Date ▾]
------------------------------------------------------------------------------------------------------
Legend:  ● Saved   ● Printed   ● Cancelled   ● Paid
------------------------------------------------------------------------------------------------------
Order No | Order Type      | Phone       | Customer Name | Payment Type | My Amount | Tax  | Discount | Grand Total ✎ | Created            | ⌕ 🖶
------------------------------------------------------------------------------------------------------
```

### 2.2 Filter tabs

| Tab | Filter applied | Notes |
|---|---|---|
| All | no `order_type` filter | default tab on load |
| Dine In | `order_type = 'DINE_IN'` | sub-label shows table no. (e.g. "Table 12") |
| Delivery | `order_type = 'DELIVERY'` | sub-label shows aggregator/channel (e.g. "Zomato", "Own Delivery") |
| Pick Up | `order_type = 'PICKUP'` | sub-label shows channel if applicable (e.g. "Swiggy Pickup", "Walk-in") |

Filters are combinable with the date range (default: today) and with search — tabs, date range, and search are ANDed together.

### 2.3 Search

Single search box, debounced (300ms), searches across three fields simultaneously with OR logic:

- `orders.order_no` (exact or prefix match)
- `orders.customer_phone` (prefix or full match, digits only — strip formatting before compare)
- `orders.customer_name` (case-insensitive substring match)

Implementation note: this requires either a combined trigram/ILIKE index strategy or a search-optimized column (`search_blob` — see Section 3.4) to keep the query fast once order volume grows. Do not implement as three separate `LIKE '%...%'` clauses on unindexed columns in production — acceptable for MVP only if table size stays under roughly 50k rows per outlet.

### 2.4 Sort

Dropdown "Sort By" — default value **Latest Date** (i.e. `created_at DESC`). Other options to support at launch:

| Label | Sort key |
|---|---|
| Latest Date (default) | `created_at DESC` |
| Oldest Date | `created_at ASC` |
| Grand Total: High to Low | `grand_total DESC` |
| Grand Total: Low to High | `grand_total ASC` |
| Order No | `order_no DESC` |

Sort is a single-column control (not multi-sort) for MVP. Ties broken by `created_at DESC` as secondary key always, to keep pagination stable.

### 2.5 Status legend and color reconciliation (ties to DEC-021)

The reference app (and Kapmeta's own Table View screen, built earlier) each used ad hoc color-to-status mappings that were never unified. DEC-021 mandates one canonical `order_status` enum used everywhere. This screen's legend must be redrawn against that canonical enum rather than reinventing a fifth color scheme.

**Canonical `order_status` enum (per DEC-021):**

```
DRAFT           -- order started, not yet sent to kitchen/billed
SAVED           -- order held/parked, not yet printed or paid
PRINTED         -- bill printed at least once, not yet paid
PARTIALLY_PAID  -- one or more payments recorded, balance still due
PAID            -- fully settled
CANCELLED       -- voided before settlement
REFUNDED        -- settled then reversed via sales_returns
```

**Order History legend → canonical enum mapping:**

| Legend label shown on this screen | Canonical `order_status` value(s) it represents | Color (proposed, tenant-themeable token) |
|---|---|---|
| Saved | `DRAFT`, `SAVED` | Grey `--status-saved` |
| Printed | `PRINTED`, `PARTIALLY_PAID` | Amber `--status-printed` |
| Cancelled | `CANCELLED` | Red `--status-cancelled` |
| Paid | `PAID` | Green `--status-paid` |

**Reconciliation with Table View's legacy colors (audit for this doc):**

| Table View legacy label | Table View legacy color | Maps to canonical `order_status` | Notes |
|---|---|---|---|
| "Available" | (no dot — used table occupancy, not order status) | n/a | Table View conflates table occupancy with order status; this is a *separate* dimension (`tables.occupancy_state`), not part of `order_status`. Flag for stakeholder — see Section 10. |
| "Running" | Blue | `SAVED` / `PRINTED` (order open, not yet paid) | Table View's "Running" spans two canonical states; if Table View needs finer granularity it should read `order_status` directly rather than keep its own enum. |
| "Billed" | Amber | `PRINTED` | Same semantic as this screen's "Printed" — colors should be unified, not just semantically mapped. Recommend Table View adopt `--status-printed` amber to match. |
| "Paid" | Green | `PAID` | Direct match, no change needed. |
| "Cancelled" | Grey (was previously grey in Table View, conflicting with this screen's grey-for-Saved) | `CANCELLED` | **Color conflict**: Table View used grey for cancelled, this screen proposes grey for saved. Recommend standardizing on red for `CANCELLED` everywhere and grey exclusively for `SAVED`/`DRAFT`, and updating Table View to match as part of this rollout. |

Action item: this mapping table must be signed off and then implemented as one shared CSS/token set (`--status-*` custom properties) consumed by both screens, plus one shared `getStatusColor(order_status)` helper function — not per-screen literals. No screen should have its own copy of status→color logic.

### 2.6 Table columns

| Column | Source | Notes |
|---|---|---|
| Order No | `orders.order_no` | Tenant-configurable prefix/numbering (per outlet numbering-scheme config, out of scope here) |
| Order Type | `orders.order_type` + sub-label | Sub-label: table no. for Dine In (`orders.table_no` / joined from `tables`), channel name for Delivery/Pickup (`orders.channel_name` or resolved from `orders.aggregator_id`) |
| Customer Phone | `orders.customer_phone` | Masked per permission (see Section 8.4) |
| Customer Name | `orders.customer_name` | |
| Payment Type | resolved via `order_payments` + `payment_type_master` | See Section 3.3 and Section 7 for multi-payment handling |
| My Amount (₹) | `orders.merchant_net_amount` (proposed new/confirmed column) | See Section 3.2 for exact definition |
| Tax (₹) | `orders.tax_total` | Sum of applicable taxes on the order |
| Discount (₹) | `orders.discount_total` | Sum of item + order-level discounts |
| Grand Total (₹) ✎ | `orders.grand_total` | Editable via pencil icon — see Section 4 |
| Created | `orders.created_at` | Outlet-local timezone, displayed as `DD MMM, hh:mm A` |

Row actions:
- **Eye icon** — opens read-only order detail (view/reprint preview modal): full item list, tax breakup, payment(s), audit history summary.
- **Printer icon** — triggers reprint of the bill (see Section 5.3 and Section 6.2 for duplicate-counter behavior).
- **Pop-out icon** (seen on one row in reference screenshots, meaning unconfirmed) — see Section 10 flag; provisionally treated as "open in new tab / external order view" (e.g. for orders that originated from an aggregator, opening the aggregator's own order record). Not implemented until confirmed.

---

## 3. Data Model

### 3.1 Confirming existing columns

Assumed already present per DB schema doc (confirm during implementation against the live schema file):

- `orders.id`, `orders.order_no`, `orders.outlet_id`, `orders.order_type`, `orders.status` (to be renamed/aligned to canonical `order_status` per DEC-021 if not already), `orders.customer_phone`, `orders.customer_name`, `orders.created_at`, `orders.created_by_user_id`, `orders.table_no` (nullable), `orders.channel_name`/`orders.aggregator_id` (nullable)
- `order_payments.id`, `order_payments.order_id`, `order_payments.payment_type_id`, `order_payments.amount`, `order_payments.recorded_at`
- `order_audit_log.id`, `order_audit_log.order_id`, `order_audit_log.actor_user_id`, `order_audit_log.action`, `order_audit_log.before_json`, `order_audit_log.after_json`, `order_audit_log.reason`, `order_audit_log.created_at`

### 3.2 Resolving DEC-016: My Amount vs Grand Total vs item Total

DEC-016 flagged this as ambiguous. This doc proposes the following resolution for sign-off:

**Recommended definitions:**

- **item Total** — the sum of `order_items.line_total` before order-level discount/tax, i.e. the raw cart subtotal. Stored/derivable as `orders.subtotal`.
- **Grand Total** — the final amount charged to/collected from the customer: `subtotal - discount_total + tax_total + service_charge + rounding_adjustment`. This is what appears on the printed bill as "Total" and is what the customer pays or is owed. Stored as `orders.grand_total`.
- **My Amount** — the amount the *merchant* actually nets from this order after third-party deductions, specifically aggregator/payment-gateway commission and any platform fees. For a Dine In or direct order with no aggregator, `My Amount = Grand Total` (no deduction applies). For an aggregator-sourced order (Zomato/Swiggy etc.), `My Amount = Grand Total - aggregator_commission - payment_gateway_fee`. Stored as a new/confirmed column `orders.merchant_net_amount`.

**Justification:**

KapMeta's own usage of "My Amount" in restaurant-facing reports consistently refers to the restaurant's net receivable, distinct from what the customer was billed — this is the number restaurant owners care about for reconciliation, since aggregators remit less than the bill amount. Treating "My Amount" as merely a synonym for Grand Total would make the column redundant (it would just duplicate Grand Total for the common case and mislead for the aggregator case). Making it explicitly "net after commission" gives it a distinct, useful meaning and matches how the reference app's numbers diverge from Grand Total specifically on aggregator orders in the source screenshots.

**Computation source:** `merchant_net_amount = grand_total - COALESCE(aggregator_commission, 0) - COALESCE(payment_gateway_fee, 0)`. `aggregator_commission` is sourced from the aggregator integration config (commission % per channel, applied at order-sync time) — out of scope for this doc but must be a field on `orders` (`orders.aggregator_commission`) populated at order ingestion, not computed live on this screen.

**Required schema addition (flag for DB-schema doc update):**

```
orders.merchant_net_amount   numeric(12,2)   -- "My Amount" column, computed at write time
orders.aggregator_commission numeric(12,2)   default 0
orders.payment_gateway_fee   numeric(12,2)   default 0
orders.subtotal              numeric(12,2)   -- "item Total", confirm exists
orders.tax_total             numeric(12,2)   -- confirm exists
orders.discount_total        numeric(12,2)   -- confirm exists
orders.grand_total           numeric(12,2)   -- confirm exists, becomes editable field (Section 4)
orders.rounding_adjustment   numeric(6,2)    default 0
```

This resolution must be formally signed off as the closure of DEC-016 (see Section 10).

### 3.3 Payment Type column — multi-payment orders

An order may have more than one row in `order_payments` (split payment: part cash, part card). Display logic:

- If exactly one `order_payments` row exists → show that payment type's label directly (e.g. "Cash").
- If multiple → show "Split" with a tooltip/expandable breakdown (e.g. "Cash ₹200 + Card ₹350"), sourced by joining `order_payments` to `payment_type_master` for the label.
- If zero (order not yet settled, status `SAVED`/`PRINTED`) → show "—" (em dash), not blank, to distinguish "no payment yet" from a data error.

### 3.4 Search support column (optional but recommended)

To keep the multi-field search in Section 2.3 performant at scale, add a generated/maintained column:

```
orders.search_blob  text  -- lower(order_no || ' ' || customer_phone || ' ' || coalesce(customer_name,''))
```

with a trigram GIN index (`pg_trgm`) on `search_blob`. This is an implementation optimization, not a hard requirement for MVP, but should be scoped now so the migration lands before order volume makes retrofitting painful.

---

## 4. Grand-Total Manual Edit Spec (ties to DEC-022)

### 4.1 Trigger

The pencil icon next to Grand Total is visible on every row where the acting user has the `order.edit_grand_total` permission (Section 8.3). Clicking it opens an inline edit affordance (or a small modal) showing:

- Current Grand Total (read-only reference)
- New Grand Total (numeric input, required)
- Reason code (required dropdown — see 4.2)
- Free-text note (optional, becomes mandatory when reason code = "Other")

### 4.2 Reason codes (proposed enum, tenant-extensible list stored in config, not hardcoded per project rule)

```
PRICE_CORRECTION        -- keying error on original bill
DISCOUNT_ADJUSTMENT      -- discount applied incorrectly, corrected after the fact
COMPLIMENTARY            -- goodwill adjustment
ROUNDING_DISPUTE         -- customer dispute over rounding
TAX_CORRECTION           -- tax miscalculated
OTHER                    -- requires free-text note
```

This list lives in a config table (e.g. `grand_total_edit_reason_master`), not hardcoded in source, per the project-wide rule against hardcoding business data. Seed values above are defaults inserted at outlet setup, editable by admin.

### 4.3 Validation rules

1. **New Grand Total must be a positive number**, at most 2 decimal places.
2. **New Grand Total cannot be less than the sum of `order_payments.amount` already recorded against this order.** Rationale: you cannot retroactively make the bill smaller than what has already been collected without also reversing a payment, which is a separate flow (refund/`sales_returns`), not a Grand-Total edit. If the manager's intent is a refund, the UI should redirect them to the refund flow instead of allowing an inconsistent edit.
3. **Order must not be `CANCELLED` or `REFUNDED`.** Grand Total edits are blocked on terminal/reversed orders — those require a new order or a return entry instead.
4. **Reason code is mandatory** for every edit, regardless of pre/post-settlement state (Section 4.4) — DEC-022 requires a reason on all edits, not just post-settlement ones; approval requirement varies by state, but the audit reason does not.
5. Edit must recompute and persist correctly: if the edit changes Grand Total independent of the tax/discount lines (a manual override rather than a recalculation), the system must store `orders.grand_total_is_manual_override = true` so downstream reports know this order's total does not reconcile mechanically from its line items — this flag matters for finance reconciliation and must not be silently dropped.

### 4.4 Approval policy (recommended resolution for DEC-022)

DEC-022 asks for a concrete policy on when manager approval is required. Recommended:

| Order state | Approval required? | Reason required? |
|---|---|---|
| Pre-settlement (`status` in `DRAFT`, `SAVED`, `PRINTED`, `PARTIALLY_PAID` with `sum(payments) = 0`) | No — any user with edit permission can apply directly | Yes, always |
| Post-settlement (`status = PAID`, or `PARTIALLY_PAID` with `sum(payments) > 0`) | **Yes** — requires manager PIN approval at time of edit, even if the editing user is a manager themself (self-approval not allowed; see 4.5) | Yes, always, and free-text note becomes mandatory (not just for "Other") |

Rationale: before money has changed hands, correcting a total is routine order management and gating it behind approval only slows down cashiers for low-risk changes. Once payment has been recorded (cash drawer opened, card charged), changing the total after the fact is exactly the scenario DEC-022 exists to control — it can mask till shortages or unauthorized discounts — so it must require a second authority and a durable reason.

### 4.5 Manager PIN / approval gate design

- For post-settlement edits, the UI presents a PIN-entry modal after the reason/note are filled in but before submission.
- The PIN belongs to a user holding the `order.approve_grand_total_edit` permission (Section 8.3), distinct from `order.edit_grand_total`. A user can hold both, but the **approving PIN entry must belong to a different `user_id` than the editor** (self-approval prohibited) unless the tenant config explicitly enables self-approval for single-manager outlets (`outlet_settings.allow_self_approval_grand_total = true`, default `false`).
- PIN is verified server-side against the approving user's credential; the API call carries both `editor_user_id` (from session) and `approver_user_id` + `approver_pin` (from the modal). The server re-derives the approver's identity from the PIN check — the client never asserts "this PIN belongs to user X," the server looks it up.
- On PIN failure: standard lockout policy (reuse whatever lockout config exists for login PINs elsewhere in the system — do not implement a separate one-off lockout here).

### 4.6 What gets written to `order_audit_log`

One row per edit, written atomically with the `orders.grand_total` update (same DB transaction):

| Field | Value |
|---|---|
| `order_audit_log.order_id` | the order's id |
| `order_audit_log.action` | `GRAND_TOTAL_MANUAL_EDIT` |
| `order_audit_log.actor_user_id` | the editing user (not the approver) |
| `order_audit_log.approver_user_id` | nullable; populated only for post-settlement edits |
| `order_audit_log.reason_code` | from the mandatory dropdown |
| `order_audit_log.reason` | free-text note (mandatory post-settlement, optional-unless-"Other" pre-settlement) |
| `order_audit_log.before_json` | full snapshot: `{ "grand_total": ..., "tax_total": ..., "discount_total": ..., "subtotal": ..., "merchant_net_amount": ..., "status": ... }` |
| `order_audit_log.after_json` | same shape, post-edit values |
| `order_audit_log.created_at` | server timestamp (UTC), independent of client clock |

### 4.7 Worked example

**Scenario:** Order `KM-0F231`, Dine In, Table 6. Original bill: subtotal ₹850, discount ₹0, tax (5%) ₹42.50, Grand Total ₹892.50. Order already marked `PAID` with one cash payment of ₹892.50 recorded. Manager later discovers a 10% loyalty discount should have been applied and needs to correct the total to ₹803.25 (i.e., ₹850 × 0.9 = ₹765 subtotal-equivalent... for this example we keep it simple and treat it as a direct total override rather than recomputing tax on the discounted base, since the cashier already closed the register).

- New Grand Total entered: **₹803.25**
- Validation check: sum of `order_payments.amount` for this order = ₹892.50. New Grand Total (₹803.25) is *less* than payments already recorded → **this actually fails validation rule 2** (Section 4.3) because it implies money must be refunded, not just a total correction.
- Correct system behavior: the UI blocks the raw edit and surfaces: *"New Grand Total is less than the amount already collected (₹892.50). To reduce the amount owed, process a refund of ₹89.25 via Sales Return, or increase the Grand Total instead."* This is a deliberate example showing the validation rule firing, not a bug.

**Revised scenario (edit that succeeds):** Same order, but the correction goes the other direction — the cashier forgot to add a ₹50 service charge, and Grand Total should be ₹942.50, with an additional ₹50 cash payment to be collected separately (payment adjustment handled outside this screen).

- New Grand Total entered: **₹942.50**
- Sum of payments already recorded: ₹892.50 → ₹942.50 ≥ ₹892.50, validation passes.
- Order status: `PAID` → post-settlement → approval required.
- Editor: cashier `user_id=U204` (Priya). Reason code: `TAX_CORRECTION`... actually here it's `PRICE_CORRECTION` since a line was omitted; note: "Missed adding ₹50 service charge, customer confirmed and paid separately at counter."
- Approver: manager `user_id=U101` (Rahul) enters PIN, verified server-side.
- Resulting `order_audit_log` row:

```json
{
  "order_id": "ord_9f21ac",
  "action": "GRAND_TOTAL_MANUAL_EDIT",
  "actor_user_id": "U204",
  "approver_user_id": "U101",
  "reason_code": "PRICE_CORRECTION",
  "reason": "Missed adding ₹50 service charge, customer confirmed and paid separately at counter.",
  "before_json": {
    "grand_total": 892.50,
    "tax_total": 42.50,
    "discount_total": 0.00,
    "subtotal": 850.00,
    "merchant_net_amount": 892.50,
    "status": "PAID"
  },
  "after_json": {
    "grand_total": 942.50,
    "tax_total": 42.50,
    "discount_total": 0.00,
    "subtotal": 850.00,
    "merchant_net_amount": 942.50,
    "status": "PAID",
    "grand_total_is_manual_override": true
  },
  "created_at": "2026-08-21T11:42:07Z"
}
```

---

## 5. API Endpoints

All endpoints are scoped to the authenticated user's tenant/outlet via session context; `outlet_id` is never accepted as a raw client-supplied filter without server-side verification the user belongs to that outlet.

### 5.1 `GET /api/v1/orders`

List orders, paginated, filtered, sorted.

Query params:
- `order_type` (optional: `DINE_IN` | `DELIVERY` | `PICKUP`; omit for "All")
- `search` (optional string; matched against order_no/phone/name per Section 2.3)
- `date_from`, `date_to` (optional, default = today, outlet-local)
- `sort` (optional enum: `created_desc` (default) | `created_asc` | `grand_total_desc` | `grand_total_asc` | `order_no_desc`)
- `page`, `page_size` (default `page_size=25`, max `100`)
- `status` (optional, canonical `order_status` value or comma-separated list, for future status-filter chips)

Response: paginated envelope with `items[]` (one row per table row spec in Section 2.6, including resolved `payment_type_label`, `order_status_canonical`, `order_status_legend_color`) and `total_count`, `page`, `page_size`.

### 5.2 `GET /api/v1/orders/{order_id}`

Full order detail for the eye-icon view: items, taxes, discounts, payments (all rows), audit history (all `order_audit_log` rows for this order, newest first), current status, print history summary (count of prints, last printed at).

### 5.3 `POST /api/v1/orders/{order_id}/reprint`

Body: `{ "document_type": "BILL" | "KOT" }`

Server-side effect: increments `orders.print_count` (or a per-document-type counter — see Section 6.2), writes an `order_audit_log` row with `action = "REPRINT"` and `after_json = { "document_type": ..., "print_count": N }`, returns a render payload (or a print-job reference) that includes whether the "duplicate" marker should be shown, per `outlet_print_settings.show_duplicate_on_bill`.

### 5.4 `POST /api/v1/orders/{order_id}/grand-total`

Body:
```json
{
  "new_grand_total": 942.50,
  "reason_code": "PRICE_CORRECTION",
  "reason_note": "Missed adding ₹50 service charge...",
  "approver_pin": "1234"   // required only when order is post-settlement; omitted pre-settlement
}
```

Server performs: permission check, validation (Section 4.3), approval-gate check (Section 4.4/4.5), transactional update + audit log write (Section 4.6). Returns updated order summary or a `422` with a structured error (`INSUFFICIENT_PAYMENT_COVERAGE`, `APPROVAL_REQUIRED`, `INVALID_PIN`, `ORDER_LOCKED`) so the client can render the correct inline message (e.g. the refund-redirect message in the worked example).

### 5.5 `GET /api/v1/orders/export`

Same filter params as 5.1 (no pagination — server enforces a max row cap, e.g. 10,000, and returns `413` beyond that, prompting the user to narrow the date range). Returns a CSV or XLSX generation job reference (async, per sync-architecture doc's job pattern) with columns matching Section 2.6 exactly, plus `My Amount`, `Aggregator Commission`, and `Status (canonical)` for finance use.

---

## 6. Business Logic / Edge Cases

### 6.1 Cancelling an already-printed order

- If an order has been printed (`status = PRINTED`) but **not yet paid**, cancelling it transitions `status → CANCELLED` directly. No `sales_returns` entry is created, because no money changed hands — nothing to return.
- If an order has been **paid** (`status = PAID` or `PARTIALLY_PAID` with payments > 0) and the operator wants to void it, the system must **not** allow a bare status flip to `CANCELLED`. Instead this must go through the Sales Return flow: a `sales_returns` row is created referencing the order, the payment is reversed (or flagged for reversal), and only once the return is processed does the order's canonical status move to `REFUNDED`. `CANCELLED` is reserved for orders where no payment was ever collected.
- This screen enforces the rule at the UI level (cancel action on a paid order routes to the Sales Return screen instead of a plain confirm-dialog) and the API enforces it server-side regardless of UI (reject a direct cancel-after-payment with `409 REQUIRES_SALES_RETURN`).

### 6.2 Reprint / duplicate-print counter

- `orders.print_count` (or `orders.bill_print_count` / `orders.kot_print_count` if bill and KOT are tracked separately — recommended, since KOT reprints matter to the kitchen independently of bill reprints) increments on every successful reprint call.
- `outlet_print_settings.show_duplicate_on_bill` (boolean, per-outlet config) controls whether the printed output includes a "DUPLICATE" watermark/label once `print_count > 1` for the bill. First print never shows the marker regardless of setting; second and subsequent prints show it only if the setting is `true`.
- Reprint of a KOT does not affect `order_status`; reprint of a bill likewise does not change status (a `PRINTED` order that gets reprinted stays `PRINTED`, or stays `PAID` if already paid — reprint is a side action, not a state transition).

### 6.3 Search across phone/name/order-no simultaneously

Covered in Section 2.3 / 3.4. Edge cases to test explicitly:
- Search term is purely numeric and matches both a partial phone number and a partial order number (e.g. "091" appears in both) → both should surface, ranked with exact/prefix matches first.
- Search term contains spaces (customer full name) → must match against `customer_name` with normalized whitespace, not fail due to double-spacing in stored data.
- Empty search after a non-empty search → must reset to the full filtered/sorted list without a full-page reload (params reset should be a pure client-state or query-param change).

### 6.4 Split-payment display truncation

When "Split" is shown per Section 3.3, the tooltip breakdown must handle 3+ payment types gracefully (not just the 2-type example) — e.g. "Cash ₹200 + Card ₹350 + Wallet ₹100", with the list capped at showing all rows (no arbitrary truncation) since reconciliation depends on seeing every payment line.

### 6.5 Timezone consistency

`Created` column and all date-range filtering must use outlet-local time consistently, not server/UTC time, since a manager filtering "today" expects the outlet's business day, not UTC midnight. This should reuse whatever outlet-timezone resolution mechanism the sync-architecture doc already defines — do not introduce a second one here.

---

## 7. Admin/Config Dependency

This screen is a **read-only consumer** of the following config tables; it must never hardcode any of the values below in source, per project rule.

### 7.1 `outlet_print_settings`

- `show_duplicate_on_bill` (boolean) — controls duplicate marker on reprint (Section 6.2).
- Any other print-layout fields already defined in that table are out of scope for this screen but the reprint endpoint must read this row live at print time, not cache it indefinitely (a config change should take effect on the next print without requiring app restart).

### 7.2 `payment_type_master`

- Used to resolve `order_payments.payment_type_id → label` for the Payment Type column and the split-payment tooltip.
- Must support tenant-custom payment types beyond the defaults (e.g. "Room Service", "Corporate Account", "UPI - Paytm") — the column renders whatever label is configured, with no assumption of a fixed enum in the UI layer.
- If a `payment_type_id` referenced by an old `order_payments` row has since been deactivated (soft-deleted) in `payment_type_master`, the screen must still render its historical label (join must not silently drop the row) — use `payment_type_master.label` from the row even if `is_active = false`, and do not filter the join on `is_active`.

### 7.3 `grand_total_edit_reason_master`

New config table proposed in Section 4.2, admin-editable, tenant-scoped, seeded with defaults but not hardcoded in application code.

---

## 8. Permissions

### 8.1 Roles referenced (assumed already defined elsewhere; this section specifies only this screen's use of them)

- `cashier`
- `shift_manager`
- `outlet_manager`
- `owner` / `admin`

### 8.2 View scope

| Role | Default visible order set on this screen |
|---|---|
| `cashier` | Only orders created during their own currently-open shift (`orders.shift_id = current_user_active_shift_id`) |
| `shift_manager` | All orders for the current day at their outlet, across all shifts |
| `outlet_manager` / `owner` / `admin` | All orders for their outlet(s), full date-range access (bounded by the date filter, no default restriction) |

A cashier must not be able to widen their own view by manipulating query params — the server enforces the shift-scoping regardless of client-sent filters; `date_from`/`date_to` sent outside the cashier's current shift window are ignored or return `403`, not silently expanded.

### 8.3 Action permissions

| Permission key | Grants | Default roles |
|---|---|---|
| `order.view_all` | See all orders at outlet, not just own shift | `shift_manager`, `outlet_manager`, `owner`, `admin` |
| `order.reprint` | Trigger reprint (bill/KOT) | `cashier`, `shift_manager`, `outlet_manager`, `owner`, `admin` |
| `order.edit_grand_total` | Initiate a Grand Total edit (pre-settlement, no approval; post-settlement, subject to 4.5) | `shift_manager`, `outlet_manager`, `owner`, `admin` (not base `cashier` by default — tenant may opt cashiers in via role config) |
| `order.approve_grand_total_edit` | Provide the approval PIN for a post-settlement edit | `outlet_manager`, `owner`, `admin` |
| `order.export` | Use the export endpoint (Section 5.5) | `outlet_manager`, `owner`, `admin` |

### 8.4 Data masking

- `customer_phone` is shown in full to `shift_manager` and above. For a `cashier`, whether the phone is masked (e.g. last 4 digits only) is a tenant privacy-policy setting (`outlet_settings.mask_customer_phone_for_cashiers`), default `false` at launch but the field must exist so tenants with stricter privacy needs can enable it without a schema change.

---

## 9. Test Plan

### 9.1 Filter/search/sort

- Each of the four filter tabs returns only orders of the matching `order_type`; "All" returns the union.
- Search by full order number returns exactly that order.
- Search by partial phone number returns all orders whose phone contains that substring, correctly excluding unrelated orders that merely share digits with the order number.
- Search by customer name is case-insensitive and tolerant of extra internal whitespace.
- Sort "Latest Date" (default) returns strictly non-increasing `created_at`; ties broken consistently across paginated requests (no duplicate or skipped rows across pages when sorted by a non-unique key).
- Sort "Grand Total: High to Low" correctly orders rows including orders with `grand_total = 0` (fully complimentary orders) at the bottom.

### 9.2 Status legend / unification (golden test)

- For each canonical `order_status` value, the API response's `order_status_legend_color` matches the Section 2.5 mapping table exactly.
- Regression test: an order whose legacy `status` field (pre-DEC-021 migration) was `"BILLED"` is correctly migrated/mapped to canonical `PRINTED` and renders the amber "Printed" dot, not left in a null/unmapped state.
- Cross-screen consistency test: the same order fetched via this screen's API and via the Table View screen's API returns the identical `order_status` canonical value and identical color token — this is the core regression guard for the color-unification work in Section 2.5.

### 9.3 Grand-Total edit (golden test — full audit trail)

- **Pre-settlement edit, no payments recorded:** editing Grand Total succeeds without a PIN prompt; `order_audit_log` row is written with `approver_user_id = null`, correct `before_json`/`after_json`, and correct `reason_code`.
- **Post-settlement edit, valid increase:** matches the worked example in Section 4.7 — PIN prompt appears, edit succeeds only after valid PIN, audit row includes non-null `approver_user_id`, and `actor_user_id` ≠ `approver_user_id` unless self-approval is explicitly enabled for that outlet.
- **Post-settlement edit, invalid decrease below payments collected:** request is rejected with `422 INSUFFICIENT_PAYMENT_COVERAGE`; no `orders` row mutation occurs; no `order_audit_log` row is written (a rejected attempt must not silently mutate the audit trail — verify zero new audit rows, not just verify the grand_total value is unchanged).
- **Self-approval attempt where tenant setting disallows it:** approver PIN belonging to the same user as the editor is rejected with `403`, even if the PIN itself is valid, when `outlet_settings.allow_self_approval_grand_total = false`.
- **Edit on a `CANCELLED` order:** rejected with `409 ORDER_LOCKED`, pencil icon is not rendered/actionable in the UI for cancelled rows in the first place (defense in depth — test both the UI disabling and the API-level block independently, since a client-side-only guard is not sufficient).
- **Reason-code "Other" without free-text note:** rejected client-side and server-side with a validation error; free-text note is mandatory whenever `reason_code = OTHER`.

### 9.4 Reprint / duplicate counter

- First reprint of a bill for an order with `outlet_print_settings.show_duplicate_on_bill = true`: rendered output does **not** show the duplicate marker (it's the first print, `print_count` was 0 → becomes 1).
- Second reprint of the same bill with the setting `true`: output **does** show the duplicate marker, `print_count` becomes 2.
- Second reprint with the setting `false`: no duplicate marker regardless of `print_count`.
- KOT and bill print counters are independent — reprinting a KOT does not affect the bill's `print_count` or vice versa (assuming the separate-counter design from Section 6.2 is adopted).
- Each reprint writes an `order_audit_log` row with `action = "REPRINT"` and the correct `document_type` and resulting `print_count` in `after_json`.

### 9.5 Cancellation edge case

- Cancelling a `PRINTED`, unpaid order transitions it to `CANCELLED` directly with no `sales_returns` row created.
- Attempting to cancel a `PAID` order via the same code path returns `409 REQUIRES_SALES_RETURN` and creates no `CANCELLED` state change; a subsequent Sales Return flow correctly moves the order to `REFUNDED` afterward (integration test spanning both screens).

### 9.6 Permission/visibility

- A `cashier` account querying `GET /api/v1/orders` with a date range spanning before their shift start receives only their own shift's orders, not an error and not the full day.
- A `cashier` without `order.edit_grand_total` does not see the pencil icon, and a direct API call to `POST /orders/{id}/grand-total` from that account returns `403`.
- Phone masking setting, when enabled, is enforced server-side (the API response itself contains the masked value for a `cashier` role), not just hidden by client-side CSS/JS.

---

## 10. Open Questions / Flags for Stakeholder

1. **Unclear pop-out icon.** One row in the reference screenshots shows an extra icon beyond eye/printer whose function is not documented. This plan provisionally treats it as "open external/aggregator order record in new tab" for orders sourced from an integrated channel, but this is a guess. **Needs a decision from whoever captured the reference screenshots** (or a fresh screenshot showing the icon's tooltip/behavior in the source app) before implementation. Until resolved, recommend building the screen with the icon's slot reserved but hidden, so the two confirmed actions (eye, printer) ship without being blocked on this.

2. **DEC-016 sign-off.** Section 3.2 proposes a concrete resolution: My Amount = merchant net receivable after aggregator commission/gateway fees; Grand Total = customer-facing charged total; item Total = raw subtotal. This needs to be ratified as the closing decision on DEC-016 (or amended) before the `orders.merchant_net_amount` column and its computation are finalized in the schema doc — other screens that display these three figures should be checked for consistency with this definition once it's approved.

3. **DEC-022 sign-off.** Section 4.4 proposes: no approval pre-settlement, mandatory manager PIN + mandatory note post-settlement, self-approval disallowed by default with an opt-in outlet setting. Needs explicit approval as the closing decision on DEC-022, including confirmation that "settlement" is defined as "any payment recorded," not "status = PAID" alone (this matters for partially-paid orders, which this doc treats as post-settlement — confirm that's the intended line).

4. **Table View color/status conflict.** Section 2.5 surfaces a real conflict (grey used for both "cancelled" in Table View and "saved" here). This needs a decision on the unified palette before both screens ship, since retrofitting a color change after users have learned the old colors is more disruptive than fixing it now.

5. **Separate bill/KOT print counters vs single counter.** Section 6.2 recommends splitting `print_count` into bill and KOT counters. Confirm this against how the reference app's "duplicate" logic actually behaves (does duplicate marking apply per document type, or is there one combined counter?) — if the reference app uses one counter, simplify accordingly rather than over-building.

6. **Export row cap and format.** Section 5.5 proposes a 10,000-row cap and CSV/XLSX. Confirm whether finance/ops actually need larger exports (e.g. monthly reconciliation across an outlet's full order history), which would require a different (background job + email/download-link) delivery pattern rather than a synchronous-feeling capped export.
