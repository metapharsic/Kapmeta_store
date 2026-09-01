# Artifact 02 — New Order / Billing Screen: Feature Build Plan

Status: Draft for engineering handoff
Related docs: DB Schema draft, API Contracts draft, Sync Architecture draft, Business Logic Rules draft, Decision Register (DEC-013..024)
Owner screen: Order Entry / Billing ("New Order" screen), outlet-local application, LAN-first with cloud sync

---

## 0. Scope note

This document covers exactly one screen: the order-taking and billing screen used by cashiers/waiters to build an order (Dine In, Delivery, or Pick Up), apply discounts, view live tax/charge math, and either save/print (KOT + bill) or hold the order as a draft. It does not cover the KOT-printer-config screen, the outlet settings/admin screens, or payment collection screen (referenced but treated as the next screen in the flow) — those are addressed in their own artifacts, though this doc specifies the API and data contracts this screen shares with them.

All references to menu items, categories, tax rates, and charges assume they are sourced from the DB tables named in the schema draft (`menu_items`, `menu_categories`, `taxes`, `outlet_billing_settings`, `outlet_print_settings`, `payment_type_master`) and/or the admin UI that manages them. Per project rule, nothing tenant-specific is hardcoded in this screen's source — every label, category, item, price, tax rate, and charge toggle is read from the DB at runtime.

---

## 1. Purpose & user story

### 1.1 Purpose

The Order Entry / Billing screen is the primary point-of-sale surface where staff convert a customer's spoken or written order into a structured, priced, tax-computed order record, then commit it (send KOT to kitchen, print bill, or both) or hold it for later. It is the highest-traffic screen in the whole application and the one most sensitive to billing correctness — every discrepancy here is a cash-handling or tax-filing problem.

### 1.2 Actors

- **Cashier** — usually owns billing/payment finalization, has discount and void authority per outlet policy.
- **Waiter/Captain** — usually takes the order table-side (on a phone/tablet build of the same screen), sends KOT, may not have discount or bill-print authority.
- **Manager/Owner** — full authority, plus can override the above roles' restrictions (see Section 8).

### 1.3 User stories

**Dine In**
1. Waiter opens New Order screen, selects "Dine In" tab.
2. Selects a table from a table-picker (or table is pre-selected because the waiter tapped "New Order" from a table-map screen — out of scope here, but this screen must accept an incoming `table_id` + `session_id` from that flow).
3. Browses categories in the left rail, taps items into the cart (right panel ticket).
4. Adjusts quantities, adds item-level notes if needed (e.g. "no onion") — see open question on notes in Section 10.
5. Sends KOT (Kitchen Order Ticket) to the kitchen printer/KDS. Order status moves from `draft` to `kot_sent` (or is split into multiple KOT rounds if items are added later — see Section 6.1).
6. Continues to add more items across the meal (second round of KOT), or proceeds to close the ticket.
7. At close-out, applies any discount, reviews the tax/charge breakdown, taps "Total", chooses payment type(s) (possibly split payment — out of scope, handled by payment screen), taps "Print & E-Bill".
8. Order status moves to `billed` / `closed`, table session is freed (or marked for cleanup) once payment settles.

**Delivery**
1. Cashier selects "Delivery" tab.
2. Customer fields become visible and required: Mobile (primary lookup key), Name, Address, Locality.
3. Cashier enters mobile number first; system attempts a lookup against past customers (by phone) and auto-fills Name/Address/Locality if found (multi-address customers show an address picker — see Section 10).
4. Items are added the same way as Dine In.
5. Delivery charge is computed automatically per `outlet_billing_settings` (flat or distance/locality-based — see Section 4.5).
6. Order can be sent to kitchen immediately (KOT) and simultaneously queued for a delivery-partner assignment (out of scope screen), or held as an "Advance Order" for a future time slot (Section 2.6).
7. Cashier finalizes billing and prints the bill/invoice for the delivery rider or for the customer's e-bill (SMS/WhatsApp link).

**Pick Up**
Same as Delivery minus delivery charge and minus rider assignment; Address/Locality fields are optional or hidden (see Section 2.2 visibility table) since the customer collects in person. Advance Order (schedule a future pickup time) is a common use case here.

---

## 2. UI spec

### 2.1 Screen layout (from reference screenshots)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Dine In] [Delivery] [Pick Up]                    outlet/table info │
├───────────────┬─────────────────────────────┬───────────────────────┤
│  Category rail │  Search box                  │  Customer fields      │
│  - Breakfast   │  ┌───┐┌───┐┌───┐┌───┐        │  (conditional)        │
│  - Meal Box    │  │Itm││Itm││Itm││Itm│        ├───────────────────────┤
│    (Online)    │  └───┘└───┘└───┘└───┘        │  Items | Qty | Price   │
│  - Cold/Hot Bev│  ┌───┐┌───┐┌───┐┌───┐        │  ---------------------│
│  - Soup Veg    │  │Itm││Itm││Itm││Itm│        │  line items...         │
│  - Soup NonVeg │  └───┘└───┘└───┘└───┘        │                        │
│  - Meals       │  ... (scrollable grid)        ├───────────────────────┤
│  - Chinese...  │                               │  Subtotal              │
│  - Tandoori... │                               │  Discount               │
│  - Curries...  │                               │  Tax (CGST/SGST)        │
│  - Roti        │                               │  Container/Delivery/Svc │
│  ...           │                               │  Grand Total            │
│                │                               ├───────────────────────┤
│                │                               │ [Split][Advance][Total]│
│                │                               │        [Print & E-Bill]│
│                │                               ├───────────────────────┤
│                │                               │ icon rail (see 2.7)    │
└───────────────┴─────────────────────────────┴───────────────────────┘
```

### 2.2 Order-type tabs and conditional field visibility

Order type is a first-class enum on the order: `dine_in | delivery | pickup`. Switching tabs mid-build (before any item is added) simply re-tags the draft order type. Once at least one item is added, switching tabs shows a confirm dialog ("Switching order type will recompute tax and charges — continue?") because tax mode and charge toggles are channel-dependent (see Section 4).

Customer field visibility (resolves the screenshot ambiguity — flagged for stakeholder confirmation in Section 10, but this is the proposed default pending confirmation):

| Field | Dine In | Delivery | Pick Up |
|---|---|---|---|
| Mobile | Optional (for loyalty/receipt) | Required | Required |
| Name | Optional | Required | Optional (nice-to-have for calling out order) |
| Address | Hidden | Required | Hidden |
| Locality | Hidden | Required (drives delivery-charge slab if locality-based) | Hidden |
| Table No. | Required (picker) | Hidden | Hidden |

This is configurable per outlet via a new `require_customer_details_dine_in` boolean in `outlet_billing_settings` (some outlets want mobile capture even for dine-in for CRM/loyalty). Field-level requiredness itself (mobile required for delivery) is not tenant-configurable — treated as a business rule, not tenant data.

### 2.3 Category rail behavior

- Rendered from `menu_categories` for the active outlet, filtered by `is_active = true`, ordered by `display_order`.
- Category labels are tenant data (e.g. "Meal Box (Online)") — never hardcoded; loaded via `GET /api/v1/outlets/{outlet_id}/menu/categories`.
- A category may be flagged `channel_visibility` (e.g. "Meal Box (Online)" only meaningful/visible when order type = Delivery/Pickup, or always visible but items within filtered) — see DEC-020 style channel-gating pattern already established for container charges; propose reusing the same pattern: `menu_categories.visible_channels` (array/bitmask of dine_in/delivery/pickup) with default "all channels" so existing tenants are unaffected.
- Selecting a category filters the item grid to that category's items; the rail keeps single-select highlight state.
- Rail supports vertical scroll; no drag-reorder in this screen (that belongs to the admin UI).
- A category with zero active items still shows in the rail (so it doesn't look broken) but the grid shows an empty-state message "No items in this category."

### 2.4 Item grid / tile design

- Tiles are name-only per the reference screenshots (no image, no price shown on the tile itself) — this is a deliberate density choice by the reference app; propose keeping it but adding a low-contrast price caption under the name as a build option gated by a new outlet-level `show_price_on_item_tile` boolean (many single-price-list outlets omit it because price varies by variant, but tenants using this as a self-serve kiosk later will want it). Off by default to match reference exactly.
- Tile shows: item name, and a small badge for veg/non-veg (colored dot square, standard Indian POS convention: green square = veg, red/brown square = non-veg, egg symbol if applicable) sourced from `menu_items.food_type` (enum: veg/non_veg/egg).
- Tile shows an "out of stock" visual state (greyed, diagonal strike or "86'd" label) when `menu_items.is_available = false` or a stock-tracking flag is exhausted (see Section 6.5).
- Tapping a tile:
  - If item has no variants/modifiers: adds qty 1 directly to the cart, or increments existing line by 1.
  - If item has variants (e.g. size) or is a combo/must prompt add-ons: opens a modifier/variant picker modal before adding to cart. (Variant/modifier data model is out of scope for this doc but the API contract in Section 5.2 accounts for an optional `variant_id` / `modifier_selections[]` payload on add-line.)
- Long-press / secondary tap on a tile: quick "view item details" (price, description) without adding to cart — nice-to-have, not blocking for v1.

### 2.5 Search box

- Positioned above the item grid, placeholder "Search items".
- Client-side incremental filter against the currently-loaded menu (menu for an outlet is small enough — typically hundreds of items — to load once into memory on screen entry and filter client-side for zero-latency search; no server round-trip per keystroke).
- Search matches item name (primary), and optionally a `search_keywords`/alias field on `menu_items` for common misspellings/abbreviations (tenant-configurable via admin item form).
- Search results ignore category rail selection and instead show a flat "Search Results" pseudo-category; clearing the search box returns to the previously selected category.
- Debounce: 150ms, matches on substring (not just prefix), case-insensitive.

### 2.6 Right panel — order ticket

- **Header**: customer fields per Section 2.2, table selector for Dine In (opens table-map/picker if not already bound).
- **Line item list** columns: Item name / Check-items indicator (a small icon meaning "this item has been sent in a KOT already, cannot silently delete" — this resolves the screenshot's "Check Items" column, proposed meaning below) / Qty (+/- stepper, tap-to-type) / Price (line total = unit price × qty, post variant/modifier adjustment, pre discount/tax).
  - "Check Items" column proposed meaning: a checkbox/marker letting staff select specific line items as the target of an action (delete, move to KOT-recall, or item-wise split-bill assignment in Section 2.8). This is the most sensible reading of a column literally between "Items" and "Qty" that isn't itself a data field — it's a selection affordance. Flagged for stakeholder confirmation in Section 10 since the reference screenshots don't make its behavior fully legible.
- **Footer computed rows**: Subtotal, Discount (amount + basis, e.g. "Discount (10% on Core): -₹45.00"), Tax breakdown (CGST amount, SGST amount, shown as two lines or one combined "Tax" line expandable to show the split — recommend two lines always visible, matching how Indian GST invoices are typically read by customers), Container Charge (if applicable to channel), Delivery Charge (delivery only), Service Charge (if enabled), **Grand Total** (bold, largest text).
  - "My Amount" is NOT shown as a separate visible field on this screen by default, per the ambiguity flagged in DEC-016 — this screen treats "Grand Total" as the sole customer-facing total. Where the reference app's "My Amount" concept refers to net restaurant receivable (post aggregator commission, e.g. for online orders), that is out of scope for this screen and belongs to a reporting/reconciliation view. Flagged again in Section 10 for explicit stakeholder sign-off given DEC-016 marked this unresolved.
- **Footer action buttons**:
  - **Split** — opens split-bill flow (Section 2.8).
  - **Advance Order** — opens a date/time picker to schedule the order (Section 2.9).
  - **Total** — recomputes and reveals/expands the full computed breakdown if collapsed (on smaller screens the breakdown rows may be collapsed by default with only Grand Total showing; tapping "Total" expands them). On larger/desktop layouts all rows are always visible and this button instead acts as a "recalculate" affirmation button that also locks in the discount entered.
  - **Print & E-Bill** — finalizes: sends KOT for any un-sent lines, prints the physical bill per `outlet_print_settings`, and generates/sends the e-bill (SMS/WhatsApp/email link with digital receipt) if configured. This is the terminal action of the happy path.

### 2.7 Icon rail

The reference screenshots show an ambiguous vertical icon rail next to the footer. Proposed interpretation, to be confirmed with stakeholder (Section 10), based on standard KapMeta-class POS feature parity:

| Icon (proposed) | Action | Notes |
|---|---|---|
| Copy/duplicate | Duplicate this order as a new draft | Useful for repeat regulars |
| Save (floppy disk) | Save order as draft / "Hold" without sending KOT | Distinct from Print & E-Bill; leaves order in `draft` or `held` status |
| Delete/trash | Cancel/void the entire order | Requires manager PIN if any KOT already sent (Section 8) |
| Assign waiter | Attach/change the `served_by_staff_id` on the order | Relevant mainly for Dine In |
| Notes | Add an order-level note (e.g. "birthday, bring candle") | Stored on `orders.order_note` |

Each icon action is implemented as its own affordance so it can be independently permission-gated (Section 8) and independently confirmed with the stakeholder without blocking the rest of the build.

### 2.8 Split-bill flow

Triggered from the **Split** button. Two modes, both must be supported:

1. **Even split (N-way)**: user enters a number of ways (e.g. 3); the Grand Total (or optionally, the pre-charge subtotal — configurable) is divided evenly across N sub-bills, each rounded to the nearest currency unit with the remainder cents allocated to the first sub-bill so totals reconcile exactly. Produces N `order_payments`-linked "split segments" that together sum to the original Grand Total.
2. **Item-wise split**: user assigns each line item (using the "Check Items" selection column, Section 2.6) to one of N buckets (e.g. "Guest A", "Guest B"). Shared items (e.g. a shared starter) can be marked "split evenly across all buckets" rather than assigned to one bucket. Once assignment is complete, per-bucket subtotal/discount/tax/charges are recomputed independently using the same calculation engine (Section 4) applied per bucket, OR (configurable, since discount/charges are typically order-level, not biddable per split) charges/discount are computed once on the whole order then apportioned pro-rata to each bucket by that bucket's share of subtotal. Recommend pro-rata apportionment as the default (matches standard restaurant practice; per-bucket independent tax computation is not needed since tax rate is uniform across an order's channel) — this keeps the tax math simple and consistent with Section 4's per-order-then-apportioned model.
- Once split, the original order is not destroyed; it gains N `order_split_segments` rows (see Section 3.5), and payment collection (a downstream screen) is done against each segment.
- Splitting after KOT has been sent is allowed (splitting is a billing-only operation, doesn't affect kitchen); splitting after full payment is not allowed (must void payment first).

### 2.9 Advance Order flow

Triggered from **Advance Order** button. Opens a modal to pick a future date + time slot. On confirm:
- Order is saved with `orders.status = 'advance_scheduled'` and `orders.scheduled_for` timestamp populated.
- Order does NOT appear in the active kitchen queue and does NOT send a KOT at creation time.
- A background job (outlet-local, since this is a LAN-first architecture — see Sync Architecture doc) polls/watches for `scheduled_for` reaching a configurable lead time (e.g. 15 minutes before) and promotes the order to `draft`/`confirmed`, surfacing it in the active orders list and optionally auto-printing the KOT at that trigger point (configurable: auto-fire KOT vs just notify staff to review first). See Section 6.3 for full edge-case handling.
- Advance orders are most relevant for Delivery/Pick Up but the UI does not hard-block Dine In advance bookings (e.g. reserved table for a set time) — kept generic.

---

## 3. Data model

This section proposes additions/confirmations to the `orders` and `order_items` tables from the DB schema draft, sized specifically for what this screen needs to read and write. Column names are proposals; align naming convention with whatever prefix/casing convention the schema draft already uses (assumed `snake_case` here).

### 3.1 `orders` table (additive/confirmed columns for this screen)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigint PK | |
| `outlet_id` | FK | tenant/outlet scope |
| `order_number` | string | human-readable sequence, outlet-scoped, generated at first commit (not at draft creation, to avoid gaps from abandoned drafts — see 3.4) |
| `order_type` | enum(`dine_in`,`delivery`,`pickup`) | drives tax branch and charge gating |
| `status` | enum(`draft`,`held`,`kot_sent`,`confirmed`,`advance_scheduled`,`billed`,`closed`,`cancelled`) | |
| `table_id` | FK nullable | dine-in only |
| `table_session_id` | FK nullable | links to `table_sessions` |
| `customer_id` | FK nullable | resolved via mobile lookup |
| `customer_mobile` | string nullable | denormalized snapshot at order time (customer record may change later) |
| `customer_name` | string nullable | snapshot |
| `customer_address` | text nullable | snapshot, delivery/pickup |
| `customer_locality` | string nullable | snapshot, drives delivery charge slab |
| `served_by_staff_id` | FK nullable | waiter assignment |
| `created_by_staff_id` | FK | who opened the order |
| `subtotal_amount` | decimal(12,2) | sum of line item totals pre discount/tax |
| `discount_basis` | enum(`total`,`core`) | snapshot of `outlet_billing_settings.discount_calc_basis` at order time |
| `discount_type` | enum(`percent`,`flat`) | |
| `discount_value` | decimal(12,2) | raw entered value (e.g. 10 for 10%, or 45.00 flat) |
| `discount_amount` | decimal(12,2) | computed currency amount actually applied |
| `taxable_amount` | decimal(12,2) | amount tax is computed on, after discount/before-discount per `tax_before_discount` flag |
| `tax_mode` | enum(`backward`,`forward`) | snapshot, derived from channel per Business Logic Rules doc |
| `cgst_rate` | decimal(5,2) | snapshot of rate used, e.g. 2.5000 |
| `sgst_rate` | decimal(5,2) | snapshot |
| `cgst_amount` | decimal(12,2) | |
| `sgst_amount` | decimal(12,2) | |
| `container_charge_mode` | enum(`item_wise`,`order_wise`,`fix_per_item`,`none`) | snapshot |
| `container_charge_amount` | decimal(12,2) | |
| `delivery_charge_amount` | decimal(12,2) | delivery only, 0 otherwise |
| `service_charge_rate` | decimal(5,2) nullable | snapshot if enabled |
| `service_charge_amount` | decimal(12,2) | 0 if disabled |
| `round_off_amount` | decimal(6,2) | +/- rounding adjustment to reach a clean grand total, per outlet rounding policy |
| `grand_total_amount` | decimal(12,2) | final customer-facing total — the only "total" concept surfaced on this screen (see DEC-016 note in 2.6) |
| `payment_type_id` | FK nullable | set at Print & E-Bill / payment step; nullable while still a draft |
| `order_note` | text nullable | order-level free text (icon rail "notes") |
| `scheduled_for` | timestamptz nullable | advance order trigger time |
| `kot_rounds_count` | int default 0 | how many times KOT has been sent (incremented per Section 6.1) |
| `is_split_parent` | boolean default false | true if this order has been split |
| `channel_source` | enum(`pos`,`online_aggregator`,...) | needed for the "(Online)" category / forward-tax distinction; distinct from `order_type` — a Delivery order can be POS-originated or aggregator-originated, and tax mode may depend on this too per Business Logic Rules doc — confirm interaction with `order_type` when wiring the tax-mode resolver (Section 4.3) |
| `created_at`, `updated_at`, `billed_at`, `cancelled_at` | timestamptz | lifecycle timestamps |
| `sync_version`, `origin_node_id` | per Sync Architecture doc | LAN/cloud conflict resolution fields |

Note: `grand_total_amount` is the single field this screen calls "Total" / "Grand Total". If a distinct "My Amount" concept (net-of-commission receivable) is required per DEC-016's resolution, it should live as a separate reporting-only column (e.g. `net_receivable_amount`) populated by a reconciliation job, not computed or shown on this screen — flagged in Section 10 pending that decision's final resolution.

### 3.2 `order_items` table (additive/confirmed columns for this screen)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigint PK | |
| `order_id` | FK | |
| `menu_item_id` | FK | |
| `item_name_snapshot` | string | menu item name at time of order, so historical bills don't change if the item is later renamed |
| `variant_id` | FK nullable | if item has size/variant |
| `variant_name_snapshot` | string nullable | |
| `unit_price_snapshot` | decimal(10,2) | price at time of order, immune to later price-list changes |
| `quantity` | int | |
| `modifier_selections_json` | jsonb nullable | add-ons/modifiers chosen, each with its own price snapshot |
| `line_subtotal_amount` | decimal(12,2) | (unit_price + modifiers) × qty |
| `line_discount_amount` | decimal(12,2) | apportioned share of order-level discount, for reporting/split purposes (computed, not independently entered, unless item-level discount is separately supported — out of scope v1) |
| `line_taxable_amount` | decimal(12,2) | |
| `line_cgst_amount` | decimal(12,2) | |
| `line_sgst_amount` | decimal(12,2) | |
| `line_container_charge_amount` | decimal(12,2) | populated only when `container_charge_mode = item_wise` |
| `food_type_snapshot` | enum | veg/non_veg/egg, for KOT categorization and reporting even if item is later reclassified |
| `kot_status` | enum(`pending`,`sent`,`cancelled_pre_kot`,`cancelled_post_kot`) | drives the "Print Deleted Items" behavior (Section 6.2) |
| `kot_round_number` | int nullable | which KOT send batch this line belongs to |
| `is_complimentary` | boolean default false | comped item, excluded from revenue but shown on KOT |
| `line_note` | text nullable | e.g. "no onion" |
| `split_segment_id` | FK nullable | populated once the parent order is split (Section 3.5) |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft-delete for post-KOT removals (never hard-delete a line once a KOT has been printed, for audit trail via `order_audit_log`) |

### 3.3 Charge/tax storage philosophy: per-line vs per-order

Both are stored: line-level tax/charge fields exist for item-wise modes (container charge item-wise, tax computed per line then summed) and for reporting/analytics (item-level margin/tax reporting). Order-level fields are the authoritative totals actually printed on the bill and used for payment reconciliation. The calculation engine (Section 4) always computes line-level first and sums to order-level, ensuring the two never drift — order-level fields are derived, never independently edited except by the discount/round-off adjustment steps which are inherently order-level operations.

### 3.4 Draft/held order representation

A "draft" is not a separate table — it is an `orders` row with `status = 'draft'` (before first KOT) or `'held'` (explicitly saved without sending KOT, via the icon-rail Save action). This avoids duplicating schema/logic between draft and committed orders and means:
- Autosave: the client persists the draft to the outlet-local server on every line-item mutation (debounced ~1s) so a crash/reload doesn't lose the in-progress order. This is why `order_number` is NOT assigned at draft creation — assigning it only at first KOT-send or Print & E-Bill avoids burning sequence numbers on abandoned drafts, which matters because `order_number` sequences are often legally/audit relevant (no gaps expected in some jurisdictions' invoice numbering — confirm with stakeholder if strict gapless numbering is required, in which case this policy would need revisiting).
- A draft has no `order_items.kot_status = 'sent'` rows yet; once any KOT is sent, status moves to `kot_sent` and the order is no longer freely discardable (see Section 6.1/6.4).
- Table sessions: for Dine In, `table_sessions` is created/attached when a table is selected, independent of the order's own draft/committed state, so the table shows as "occupied" as soon as a waiter starts an order on it, even before the first KOT.

### 3.5 `order_split_segments` (new table, needed for Section 2.8)

| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `order_id` | FK | parent order |
| `segment_label` | string | e.g. "Guest A" or "Split 1" |
| `segment_subtotal_amount` | decimal | |
| `segment_discount_amount` | decimal | apportioned |
| `segment_tax_amount` | decimal | apportioned (cgst+sgst combined or split into two columns, matching order-level pattern) |
| `segment_charge_amount` | decimal | apportioned container/delivery/service charges |
| `segment_grand_total_amount` | decimal | |
| `payment_status` | enum(`unpaid`,`paid`) | |
| `payment_type_id` | FK nullable | |
| `created_at` | timestamptz | |

---

## 4. Billing calculation engine spec

### 4.1 Design principle

The calculation engine is a pure function of `(order_type, channel_source, line_items[], outlet_billing_settings, taxes, current_time)` → a fully populated set of order-level and line-level amount fields. It must be a single shared module (not duplicated between screen-side live preview and server-side authoritative commit) so the number shown on screen during editing is guaranteed identical to what gets persisted and printed. The client may run a local copy of this engine (same outlet-local server, per Sync Architecture doc, so no real network round-trip is needed for live recompute on every tap) but the server-side commit endpoint (Section 5) always re-runs the same computation authoritatively and rejects/corrects any client-submitted totals that don't match, logging a mismatch to `order_audit_log` if one is ever seen (should never happen if both sides use the same module, but this is the safety net).

### 4.2 Step-by-step order of operations

1. **Line subtotal**: for each line, `line_subtotal = (unit_price_snapshot + sum(modifier prices)) × quantity`. Sum all lines → `subtotal_amount`.
2. **Discount basis resolution**: read `outlet_billing_settings.discount_calc_basis` (`total` vs `core`, per Business Logic Rules doc). "Core" basis excludes certain charge-bearing components (definition per that doc — assumed here to mean discount is computed against `subtotal_amount` only, before any charges are added, i.e. never against delivery/service/container charges regardless of basis setting; "Total" basis for this engine is interpreted as still meaning subtotal, since charges are added after discount in this engine's order of operations — see 4.6 note on this ambiguity). Compute `discount_amount` from `discount_type`/`discount_value` against the resolved basis amount.
3. **Taxable amount resolution**: read `outlet_billing_settings.tax_before_discount` (or equivalently named flag from the schema draft). If tax is computed before discount, `taxable_amount = subtotal_amount`. If after discount, `taxable_amount = subtotal_amount - discount_amount`.
4. **Tax mode resolution**: determine `tax_mode` from `order_type`/`channel_source` per Business Logic Rules doc: Dine In → Backward Tax (CGST+SGST 2.5%+2.5%, tax-inclusive-of-price semantics — i.e. the item price is treated as tax-inclusive and CGST/SGST are extracted from within `taxable_amount`, not added on top); Delivery/Pickup-as-online-channel → Forward Tax (CGST[Online]+SGST[Online] 2.5%+2.5%, tax-exclusive semantics — added on top of `taxable_amount`).
   - **Backward tax formula**: `cgst_amount = taxable_amount × (cgst_rate / (100 + cgst_rate + sgst_rate))`; `sgst_amount` symmetric. (Standard GST-inclusive extraction formula.)
   - **Forward tax formula**: `cgst_amount = taxable_amount × (cgst_rate / 100)`; `sgst_amount` symmetric; these are added on top, not extracted.
5. **Container charge** (channel-gated, per the three independent per-channel toggles in `outlet_billing_settings`): check whether container charge is enabled for the current `order_type`. If enabled, compute per `container_charge_mode`:
   - `item_wise`: sum a per-line container charge (each qualifying line item has its own configured container charge amount × quantity).
   - `order_wise`: a single flat amount applied once to the whole order.
   - `fix_per_item`: a flat amount × total item quantity across the order (distinct from item_wise in that it's a uniform per-unit amount rather than an item-specific configured amount — confirm this distinction against the Business Logic Rules doc's exact definition during implementation).
6. **Delivery charge** (delivery order_type only): resolve from `outlet_billing_settings` — either a flat amount, or a locality-based slab keyed by `customer_locality`, or a distance-based calculation (if integrated with a mapping service — likely out of scope v1, default to flat/locality-slab).
7. **Service charge** (if enabled at outlet level): `service_charge_amount = taxable_amount × service_charge_rate / 100` (or configurable basis — confirm whether service charge is itself taxable, i.e. whether GST applies on top of service charge; if so this requires a secondary small tax pass — flag for Business Logic Rules doc cross-check, treated as an open question in Section 10 if not already resolved there).
8. **Sum and round**: `grand_total_raw = taxable_amount(or subtotal, depending on before/after-discount tax setting — see note in 4.3) + tax_amount(cgst+sgst, added only if forward mode; backward mode tax is already inside taxable_amount so not re-added) + container_charge_amount + delivery_charge_amount + service_charge_amount`. Apply outlet rounding policy (nearest ₹1, ₹0.50, or none) to get `grand_total_amount`; the difference is stored in `round_off_amount`.
9. **Persist**: write all snapshot fields (rates, modes, basis) alongside computed amounts, per Section 3.1/3.2, so the order is fully self-describing and immune to later changes in outlet configuration.

### 4.3 Important sequencing caveat to confirm

Steps 5-7 (container/delivery/service charges) are modeled here as added AFTER tax computation, i.e. these charges are not themselves taxed. This matches common practice but must be explicitly confirmed against the Business Logic Rules doc, since some outlets do apply GST on top of service charge, and container charges are sometimes themselves taxable line items rather than flat additions. This engine spec assumes charges are non-taxable additions unless the Business Logic Rules doc states otherwise — flagged in Section 10.

### 4.4 Worked numeric example (Dine In, Backward Tax)

Order: Dine In, 2 line items, container charge enabled for dine-in in `item_wise` mode at ₹5/unit, discount 10% flat-percent on subtotal (basis = Total/subtotal), tax-after-discount, no service charge, rounding to nearest ₹1.

| Line | Unit price (tax-inclusive) | Qty | Line subtotal | Container charge (item-wise, ₹5/unit) |
|---|---|---|---|---|
| Veg Manchurian | ₹220.00 | 2 | ₹440.00 | ₹10.00 |
| Butter Naan | ₹60.00 | 4 | ₹240.00 | ₹20.00 |

1. `subtotal_amount` = 440.00 + 240.00 = **₹680.00**
2. Discount basis = subtotal → `discount_amount` = 680.00 × 10% = **₹68.00**
3. Tax-after-discount → `taxable_amount` = 680.00 − 68.00 = **₹612.00**
4. Backward tax, CGST 2.5% + SGST 2.5% (total 5% embedded in price):
   - `cgst_amount` = 612.00 × (2.5 / 105) = **₹14.5714...** → round to ₹14.57
   - `sgst_amount` = same = **₹14.57**
   - (Sanity check: 612.00 already includes this tax; the pre-tax base is 612.00 − 14.57 − 14.57 = 582.86, and 582.86 × 1.05 = 612.00 ✓.)
5. Container charge (item-wise, dine-in enabled) = 10.00 + 20.00 = **₹20.00** (order-level sum of line-level container charges)
6. Delivery charge: N/A (dine-in) = ₹0.00
7. Service charge: disabled = ₹0.00
8. `grand_total_raw` = taxable_amount (612.00, tax already embedded, not re-added since backward mode) + container_charge (20.00) + delivery (0) + service (0) = **₹632.00**
9. Rounding to nearest ₹1: 632.00 is already whole → `round_off_amount` = 0.00, `grand_total_amount` = **₹632.00**

**Printed bill breakdown:**
```
Subtotal                         680.00
Discount (10% on Total)          -68.00
                                  ------
Taxable Amount                   612.00
CGST @ 2.5% (incl.)               14.57
SGST @ 2.5% (incl.)               14.57
Container Charge                  20.00
                                  ------
Grand Total                      632.00
```

This exact table is the golden test fixture referenced in Section 9.

### 4.5 Worked numeric example variant (Delivery, Forward Tax) — for contrast in test plan

Same two items, same discount, but order_type = Delivery, forward tax (CGST[Online] 2.5% + SGST[Online] 2.5% added on top), delivery charge flat ₹40, container charge for delivery channel toggled OFF in this example to isolate the delivery-charge math:

1. `subtotal_amount` = ₹680.00
2. `discount_amount` (10% on subtotal) = ₹68.00
3. `taxable_amount` (tax after discount) = ₹612.00
4. Forward tax: `cgst_amount` = 612.00 × 2.5% = ₹15.30; `sgst_amount` = ₹15.30 (added on top, not extracted)
5. Container charge: ₹0.00 (disabled for delivery in this example)
6. Delivery charge: ₹40.00 flat
7. Service charge: ₹0.00
8. `grand_total_raw` = 612.00 + 15.30 + 15.30 + 0.00 + 40.00 + 0.00 = **₹682.60**
9. Rounding to nearest ₹1: round to **₹683.00**, `round_off_amount` = +0.40

This demonstrates the same item set producing a different tax treatment and a different grand total purely from channel — the core assertion the Business Logic Rules doc's tax-branching exists to enforce, and the primary regression risk for this screen.

---

## 5. API endpoints

All endpoints are served by the outlet-local server (per Sync Architecture doc) and sync to cloud asynchronously; this screen never talks to the cloud directly for order mutation, only for read-through fallback if the local server is unreachable (out of scope detail, covered in Sync Architecture doc).

Auth: bearer token per staff session; role claims (`cashier`, `waiter`, `manager`, `owner`) checked per endpoint per Section 8.

### 5.1 `POST /api/v1/orders/draft`
Create a new draft order.
Request:
```json
{
  "outlet_id": "uuid",
  "order_type": "dine_in",
  "table_id": "uuid|null",
  "created_by_staff_id": "uuid"
}
```
Response: `201` with full `order` object (status `draft`, `id`, no `order_number` yet).
Role: cashier, waiter, manager, owner.

### 5.2 `POST /api/v1/orders/{order_id}/items`
Add a line item.
Request:
```json
{
  "menu_item_id": "uuid",
  "variant_id": "uuid|null",
  "modifier_selections": [{"modifier_id": "uuid", "option_id": "uuid"}],
  "quantity": 2,
  "line_note": "no onion"
}
```
Response: `201` with the created `order_item` AND the recomputed `order` totals object (engine re-runs on every mutation server-side; client should treat the response as the source of truth even though it likely already showed an optimistic local computation).
Role: cashier, waiter, manager, owner. Rejects (409) if `menu_items.is_available = false` unless caller has an `allow_out_of_stock_override` permission (Section 6.5).

### 5.3 `PATCH /api/v1/orders/{order_id}/items/{item_id}`
Update quantity, note, or modifiers on an existing line (only while `kot_status = pending`; once `sent`, this endpoint 409s and the client must use the delete+re-add flow so the removal is auditable — see 6.2).
Request: `{ "quantity": 3 }` (partial).
Response: updated `order_item` + recomputed `order` totals.

### 5.4 `DELETE /api/v1/orders/{order_id}/items/{item_id}`
Remove a line item.
- If `kot_status = pending`: hard removal allowed for waiter/cashier.
- If `kot_status = sent`: requires manager/owner role OR a manager-PIN override captured in the request body (`{"override_pin": "1234", "reason": "customer changed mind"}`); soft-deletes (`deleted_at` set, `kot_status → cancelled_post_kot`), writes an `order_audit_log` entry, and is surfaced on the "Print Deleted Items" report per print settings (Section 6.2).
Response: `200` with recomputed `order` totals.

### 5.5 `POST /api/v1/orders/{order_id}/discount`
Apply/update order-level discount.
Request:
```json
{ "discount_type": "percent", "discount_value": 10, "applied_by_staff_id": "uuid", "override_pin": "optional" }
```
Role: per Section 8 — manual discount typically requires manager PIN unless the acting staff has a `can_apply_discount` permission flag.
Response: recomputed `order` totals.

### 5.6 `POST /api/v1/orders/{order_id}/kot`
Send KOT for all currently-`pending` lines. Increments `kot_rounds_count`, sets those lines' `kot_status = sent` and `kot_round_number`, triggers the print/KDS job (handled by print-settings-driven subsystem, out of scope here), and assigns `order_number` if this is the first KOT send on the order.
Response: `order` with updated line statuses.

### 5.7 `POST /api/v1/orders/{order_id}/split`
Request:
```json
{
  "mode": "even" | "item_wise",
  "segments": 3,
  "assignments": [ { "order_item_id": "uuid", "segment_label": "Guest A", "shared": false } ]
}
```
(`assignments` only used/required for `item_wise` mode; `segments` count only used for `even` mode.)
Response: `order` plus `split_segments[]` array per Section 3.5 schema.
Role: cashier, manager, owner (typically not plain waiters — Section 8).

### 5.8 `POST /api/v1/orders/{order_id}/advance-schedule`
Request: `{ "scheduled_for": "2026-08-22T18:30:00+05:30", "auto_fire_kot": false }`
Sets `status = advance_scheduled`. Response: updated `order`.

### 5.9 `POST /api/v1/orders/{order_id}/finalize`
The "Print & E-Bill" action. Sends any remaining pending-line KOTs, locks in final totals (re-runs the engine once more authoritatively), sets `status = billed`, `billed_at = now()`, triggers physical bill print and e-bill dispatch (SMS/WhatsApp/email — delegated to a notification subsystem, out of scope), and (if `payment_type_id` was already selected in this call) also records payment.
Request:
```json
{ "payment_type_id": "uuid|null", "send_ebill": true, "ebill_channel": "sms|whatsapp|email|null" }
```
Response: final `order` object, `status = billed`, plus a `print_job_id` / `ebill_dispatch_id` for status tracking.
Role: cashier, manager, owner (waiters generally cannot finalize billing — Section 8).

### 5.10 `GET /api/v1/orders/{order_id}`
Full order fetch (for reload/recovery of an in-progress draft after client restart). Standard resource read, all roles.

### 5.11 `POST /api/v1/orders/{order_id}/hold`
Icon-rail "Save" action — sets `status = held` without sending KOT. Distinct from draft autosave in that it's an explicit user action signaling "I'm stepping away from this order intentionally." Response: `order`.

### 5.12 `GET /api/v1/customers/lookup?mobile={mobile}`
Used by the Delivery/Pick Up customer-field autofill. Response: matching customer record(s) with saved addresses, or `404` if new customer (client then just uses the typed-in fields as a fresh snapshot; a new `customers` row is created at order finalize time if it doesn't already exist — customer-record schema itself is out of scope for this doc).

---

## 6. Business logic / edge cases

### 6.1 Editing an order after KOT is printed — multi-round KOT

An order is not "locked" after its first KOT; staff routinely add more items across a meal (a second round of drinks, dessert added later). The engine handles this via `kot_round_number` on `order_items`: each `POST .../kot` call only sends lines currently `kot_status = pending`, tagging them with the next round number and incrementing `orders.kot_rounds_count`. Totals recompute across ALL non-cancelled lines regardless of round — the bill is always for the whole order, KOT rounds only affect what gets printed to the kitchen and when. Print settings (per `outlet_print_settings`, out of scope doc) determine whether each KOT round prints as a fresh ticket or an incremental "addition" ticket.

### 6.2 Deleting an item after KOT sent

Per Section 5.4, a post-KOT delete is a soft-delete requiring elevated permission and is never silently invisible. Whether it must appear on a physical "Print Deleted Items" slip is governed by `outlet_print_settings` (a flag documented in that draft, e.g. `print_deleted_items_on_kot_change`); this screen's responsibility is only to ensure the `order_audit_log` entry and the `order_items.deleted_at`/`kot_status = cancelled_post_kot` state exist so that print subsystem has what it needs — this screen does not itself decide whether to print, it emits the event/state and the print subsystem consumes it. The deleted line still shows in the order ticket UI but visually struck-through with a "Removed" tag and is excluded from all totals from the moment of deletion onward (never edits historical totals of an already-billed order, only affects a still-open order's live recompute).

### 6.3 Advance order becoming a real order at trigger time

Handled by an outlet-local background scheduler (not a client-side timer — the New Order screen may not even be open when the trigger fires). At `scheduled_for - lead_time`:
- Order transitions `advance_scheduled → confirmed` (or directly to `draft`/active-queue visibility).
- If `auto_fire_kot = true` (set at scheduling time, Section 5.8), the scheduler calls the same `POST .../kot` endpoint the screen would call.
- If `auto_fire_kot = false`, the order simply becomes visible in the active-orders list/queue for a human to review and manually send KOT — this is the safer default given item availability/pricing may have changed since scheduling (see interaction with 6.5).
- If the scheduled time arrives while the outlet-local server was offline (edge case in a LAN-first architecture, e.g. server restarted overnight), the scheduler must catch up on missed triggers on next boot by scanning for `advance_scheduled` orders whose `scheduled_for - lead_time` is already in the past, rather than silently missing them.
- Cancelling an advance order before it triggers is a normal `DELETE`/cancel action, no special handling beyond standard order cancellation (Section 8 permission-gated).

### 6.4 Order cancellation policy

Cancelling a whole order (icon-rail trash icon) before any KOT: unrestricted, any role that can create orders. After any KOT has been sent: requires manager/owner or PIN override, mirrors the per-line post-KOT deletion rule, and cancellation is logged to `order_audit_log` with a required `cancellation_reason` field. A cancelled order retains its row (`status = cancelled`) for audit purposes — never hard-deleted.

### 6.5 Out-of-stock item added to cart

Two layers:
- **Prevention**: item tiles for `is_available = false` items are visually disabled and tapping them shows a toast ("Currently unavailable") rather than adding to cart, for standard cashier/waiter roles.
- **Override**: manager/owner (or a role with `allow_out_of_stock_override` permission) can still force-add via a long-press → "Add anyway" path, which calls `POST .../items` with an explicit `override_stock_check: true` flag; this is logged to `order_audit_log` since it represents a deliberate exception (e.g. "we have one portion left even though the counter shows zero"). This addresses the case where stock tracking is approximate/manual and staff know better than the system in the moment.
- If an item becomes unavailable AFTER it's already in an open draft cart (another order consumed the last unit concurrently — realistic on a LAN with multiple terminals), the next recompute call from the server should flag the affected line (`order_items` gains a soft `stock_conflict` transient flag, not persisted, returned in the API response) so the UI can highlight it for the cashier to resolve before finalizing, rather than blocking silently.

### 6.6 Discount basis interaction with container/delivery/service charges

As noted in Section 4.6, discount is applied to `subtotal_amount` (pre-charges) regardless of the Total/Core basis toggle in this engine's proposed reading — the Total vs Core distinction (per Business Logic Rules doc) needs to be re-confirmed against this screen's implementation once that doc's exact "Core" definition is nailed down, since "Core" might mean something narrower than "subtotal" (e.g. excluding certain item categories). Flagged in Section 10.

### 6.7 Split-bill and post-split editing

Once an order `is_split_parent = true`, adding/removing line items is blocked (409) until the split is undone (a "merge back" action reverses `order_split_segments` and clears the flag) — prevents an inconsistent state where new items exist but aren't assigned to any segment. This is a deliberate simplification for v1; a more sophisticated "add item mid-split, prompt for which segment" flow could be a v2 enhancement.

### 6.8 Table session interaction

For Dine In, this screen does not own table-session lifecycle (that's a table-map screen's job) but must correctly attach to an existing `table_sessions` row when arriving from that screen, and must not close the session itself — session closure happens only after payment is fully collected (a downstream concern), even though this screen's `finalize` action is often the trigger that kicks off that closure elsewhere in the system.

---

## 7. Admin/config dependency

This screen has zero authority to create or edit menu/category/pricing/tax data — it is strictly a consumer. All of the following must exist and be reachable via admin UI + DB before this screen can be meaningfully tested against a real tenant:

- **`menu_categories` CRUD** — admin UI screen (separate artifact) for name, display order, active flag, channel visibility. This screen only reads via `GET /api/v1/outlets/{outlet_id}/menu/categories`.
- **`menu_items` CRUD** — admin UI for name, category assignment, price, food_type, is_available, variants/modifiers, search keywords. This screen only reads via `GET /api/v1/outlets/{outlet_id}/menu/items` (paginated or full-load per Section 2.5's client-side-search rationale).
- **`taxes` config** — CGST/SGST/CGST[Online]/SGST[Online] rates are admin-configured, not hardcoded constants in the calculation engine; the engine (Section 4) reads current rates from `taxes` at commit time and snapshots them onto the order (Section 3.1) so historical orders remain correct even if rates change later.
- **`outlet_billing_settings`** — single-row-per-outlet config table driving: `discount_calc_basis`, `tax_before_discount`, container-charge toggles × 3 channels + calc mode, delivery charge model (flat/slab), service charge enable/rate, rounding policy, `require_customer_details_dine_in`, default order type, default payment type, default table number (see below).
- **`outlet_print_settings`** — drives KOT/bill print formatting and the deleted-items-print behavior referenced in Section 6.2; this screen doesn't render print settings but its actions (KOT send, finalize) are the triggers consumed by that subsystem.
- **`payment_type_master`** — tenant-configurable list of accepted payment types (Cash, Card, UPI, aggregator-specific types); this screen's finalize step and the Split flow's segment payment-type selector both read this list, never hardcode a payment type set.

### 7.1 Pre-fill behavior from `outlet_billing_settings`

- **Default Order Type**: on screen entry (fresh "New Order" tap, not arriving from a table-map with an implied Dine In context), the tab selection defaults to `outlet_billing_settings.default_order_type` rather than always defaulting to Dine In — some outlets are delivery-only "cloud kitchen" style and would want Delivery pre-selected.
- **Default Payment Type**: pre-selects `payment_type_id` in the finalize step's payment selector, editable before confirming.
- **Default Table No.**: only relevant if the outlet has a fixed small table count or a "counter" pseudo-table convention; if set, pre-fills `table_id` for Dine In drafts started without an explicit table-map selection (e.g. quick-service counter orders where "table" really just means "order slot").

---

## 8. Permissions

Roles referenced: `waiter`, `cashier`, `manager`, `owner` (exact role model and RBAC table to be confirmed against whatever the auth/roles doc defines; this section assumes a 4-tier model consistent with the rest of the drafts and should be reconciled if the actual role taxonomy differs).

| Action | Waiter | Cashier | Manager/Owner |
|---|---|---|---|
| Create draft order | Yes | Yes | Yes |
| Add/edit/remove line item (pre-KOT) | Yes | Yes | Yes |
| Send KOT | Yes | Yes | Yes |
| Remove line item (post-KOT) | No (blocked) | PIN override required | Yes, no PIN needed |
| Apply manual discount | No | PIN override required, unless `can_apply_discount` flag granted | Yes, no PIN needed |
| Split bill | No | Yes | Yes |
| Cancel whole order (pre-KOT) | Yes | Yes | Yes |
| Cancel whole order (post-KOT) | No | PIN override required | Yes |
| Finalize / Print & E-Bill (collect payment) | No (typical FOH policy; configurable) | Yes | Yes |
| Advance order scheduling | Yes | Yes | Yes |
| Out-of-stock override add | No | No (unless flagged) | Yes |
| Assign/reassign waiter | Yes (self) | Yes | Yes |

All PIN-override actions are logged to `order_audit_log` with the overriding staff member's ID, the acting staff member's ID (if different), timestamp, and reason where applicable (Sections 5.4, 5.5, 6.4). Exact per-outlet role customization (some tenants may want cashiers to have full manager-equivalent discount authority) should be modeled as granular boolean permission flags on the staff/role record (`can_apply_discount`, `can_void_post_kot`, `can_finalize_bill`, `can_split_bill`, `can_override_stock`) rather than hardcoded per named role, so admin can tune this per outlet without a code change — consistent with the no-hardcode project rule extended sensibly to permission policy, not just menu data.

---

## 9. Test plan

### 9.1 Golden billing tests (from Section 4 worked examples)

- **T-BILL-01 (Dine In / Backward Tax golden case)**: Build the exact order in Section 4.4 (Veg Manchurian ×2 @ ₹220, Butter Naan ×4 @ ₹60, 10% discount, item-wise container charge ₹5/unit, tax-after-discount). Assert: `subtotal_amount = 680.00`, `discount_amount = 68.00`, `taxable_amount = 612.00`, `cgst_amount = 14.57`, `sgst_amount = 14.57`, `container_charge_amount = 20.00`, `grand_total_amount = 632.00`.
- **T-BILL-02 (Delivery / Forward Tax contrast case)**: Same two items and discount but `order_type = delivery`, container charge off, delivery charge ₹40 flat. Assert per Section 4.5: `cgst_amount = 15.30`, `sgst_amount = 15.30`, `delivery_charge_amount = 40.00`, `grand_total_raw = 682.60`, `round_off_amount = 0.40`, `grand_total_amount = 683.00`.
- **T-BILL-03 (Pick Up, no delivery charge)**: Same items, `order_type = pickup`; assert `delivery_charge_amount = 0.00` even though channel is forward-tax like delivery (isolates delivery-charge gating from tax-mode gating — these are independent toggles and must be tested independently).
- **T-BILL-04 (tax-before-discount variant)**: Re-run T-BILL-01 with `outlet_billing_settings.tax_before_discount = true`; assert tax is computed on ₹680.00 instead of ₹612.00 and totals shift accordingly — confirms the flag actually branches the engine.
- **T-BILL-05 (container charge mode matrix)**: Same base order run three times with `container_charge_mode = item_wise / order_wise / fix_per_item` respectively (fixed order-wise amount and fix-per-item unit amount defined in test fixtures); assert each produces a distinct, correctly-computed `container_charge_amount`.
- **T-BILL-06 (per-channel container charge toggle independence)**: Same order, container charge enabled for Dine In but disabled for Delivery and Pick Up in `outlet_billing_settings`; run the identical item set under all three `order_type`s; assert charge is present only for Dine In.
- **T-BILL-07 (rounding policy variants)**: Feed an order that produces a non-integer grand total under each supported rounding policy (nearest ₹1, nearest ₹0.50, none); assert `round_off_amount` and `grand_total_amount` correctly reflect each policy.

### 9.2 Split-bill tests

- **T-SPLIT-01 (even split, exact division)**: Order with grand total ₹600.00 split 3 ways; assert three segments of ₹200.00 each, sum reconciles exactly to ₹600.00.
- **T-SPLIT-02 (even split, remainder allocation)**: Order with grand total ₹632.00 split 3 ways (631.99.../3 doesn't divide evenly in paise); assert segments sum exactly to ₹632.00 with the remainder allocated to segment 1 per the documented rule (Section 2.8), and no segment differs from another by more than the smallest currency unit.
- **T-SPLIT-03 (item-wise split with a shared item)**: 2 buckets, one item marked "shared across all buckets," remaining items assigned individually; assert per-bucket subtotal reflects half the shared item's value plus its own assigned items, and pro-rata discount/tax/charge apportionment sums back to the original order-level totals exactly (no leakage/rounding drift beyond the smallest currency unit tolerance).
- **T-SPLIT-04 (split blocked mid-item-edit)**: Attempt to add a line item to an order with `is_split_parent = true`; assert `409`.
- **T-SPLIT-05 (split after full payment blocked)**: Attempt `POST .../split` on an order where all segments/payment already show `paid`; assert rejection.

### 9.3 Tax-branch tests (dine-in vs online, same items)

- **T-TAX-01**: Identical cart (same items, quantities, no discount) run once as Dine In and once as Delivery; assert Dine In's `cgst_amount`/`sgst_amount` reflect backward/inclusive extraction while Delivery's reflect forward/exclusive addition, and that Delivery's `grand_total_amount` is higher than Dine In's by exactly the difference between forward-added tax and backward-extracted tax (a precise, computable delta given the worked examples' rate structure) plus any delivery/container charge differential — this is the core regression test protecting the tax-branching business rule end to end on this screen.
- **T-TAX-02 (switching order type mid-build)**: Start a Dine In draft, add items, switch tab to Delivery before any KOT sent; assert the confirm-dialog fires (Section 2.2) and, on confirm, totals recompute under the new channel's tax mode with no stale backward-tax figures left over.

### 9.4 Other functional test cases

- **T-UI-01**: Category rail shows only categories with `is_active = true`; toggling a category inactive in admin removes it from the rail on next load without requiring an app restart (or documents the cache-invalidation/refresh trigger if not instant).
- **T-UI-02**: Search box filters case-insensitively and by substring; typing a `search_keywords` alias also surfaces the item.
- **T-UI-03**: Customer fields visibility toggles correctly across all three tabs per the Section 2.2 table, including the `require_customer_details_dine_in` override behavior.
- **T-EDGE-01**: Post-KOT delete by a cashier without override permission is rejected with `403`; the same call with a valid manager PIN succeeds and produces an `order_audit_log` row.
- **T-EDGE-02**: Out-of-stock item add is blocked for waiter role, succeeds for manager role with `override_stock_check: true`, and both paths are exercised.
- **T-EDGE-03**: Advance order scheduled for a time in the past at creation (clock skew/typo) is rejected client-side and server-side with a clear validation error.
- **T-EDGE-04**: Outlet-local server restart between an advance order's scheduled trigger time and its actual firing; on restart, the scheduler catch-up scan promotes the missed order correctly (Section 6.3).
- **T-PERF-01**: Menu of 500+ items loads and search remains responsive (<100ms filter) on target hardware — a non-functional but explicitly testable requirement given the client-side-search design decision in Section 2.5.

---

## 10. Open questions / flags for stakeholder

1. **"Check Items" column meaning** (Section 2.6): the proposed reading (a line-item selection affordance for delete/split targeting) is a best-effort interpretation of the reference screenshot's column header; needs direct confirmation, ideally by asking whoever captured the reference screenshots to exercise that control in the live KapMeta app.
2. **Icon rail meaning** (Section 2.7): all five proposed icons (duplicate, save/hold, delete, assign waiter, notes) are inferred from standard POS feature parity, not confirmed from the screenshots themselves (icons alone are not conclusively legible per the task brief). Needs either a clearer screenshot/tooltip capture or direct confirmation from a KapMeta reference session.
3. **Customer fields on Dine In** (Section 2.2): the plan defaults to hiding Address/Locality and making Mobile/Name optional for Dine In, with an outlet-level override (`require_customer_details_dine_in`) for tenants who want loyalty capture at the table. Needs confirmation this matches actual KapMeta behavior and whether the override should be outlet-level or always-on.
4. **My Amount vs Grand Total (ties to DEC-016)**: this doc's working assumption is that this screen shows only `grand_total_amount` and never surfaces a "My Amount" concept, deferring any net-of-commission receivable calculation to a separate reporting view. This needs explicit sign-off since DEC-016 marked the glossary itself unresolved — if "My Amount" turns out to mean something this screen must display (e.g. a cashier-facing expected-cash-in-drawer figure distinct from Grand Total for split/partial-payment scenarios), the data model in Section 3.1 and the footer layout in Section 2.6 both need revision.
5. **Charge taxability** (Section 4.3/4.6): whether container charge, delivery charge, and service charge are themselves subject to GST is assumed "no" (flat additions after tax) pending confirmation against the Business Logic Rules doc; if any of the three should be taxed, the calculation engine needs an additional tax sub-pass per charge type.
6. **Discount "Core" basis exact definition** (Section 6.6): this doc treats "Core" and "Total" as both resolving to `subtotal_amount` for purposes of this screen's engine (i.e., discount never applies to charges either way), which may be too narrow a reading of whatever distinction the Business Logic Rules doc intends by "Core" vs "Total" — needs a worked example from that doc's author to disambiguate, ideally added as a third worked-example row alongside Sections 4.4/4.5.
7. **Gapless order numbering requirement**: Section 3.4 assumes `order_number` may have gaps (assigned only at first KOT/finalize, not at draft creation) to avoid burning sequence numbers on abandoned drafts. If the target jurisdiction/tenant requires strictly gapless invoice numbering for tax compliance, this policy needs revisiting (likely requiring numbers to be assigned at `billed`/finalize time only, never at KOT time, with KOT tickets using a separate non-fiscal ticket number).
8. **Item-level notes/modifiers depth**: this doc treats free-text line notes and structured variant/modifier selections as in-scope inputs to the cart but does not fully specify the modifier data model (that likely belongs to a menu-management artifact); flagged so that artifact's author confirms the `modifier_selections_json` shape assumed in Section 3.2/5.2 matches what's actually being built.
9. **Split-bill charge apportionment method**: Section 2.8 recommends pro-rata apportionment of order-level discount/charges across split segments (rather than independently recomputing each segment through the full engine); confirm this matches expected cashier-facing behavior, since pro-rata rounding can occasionally produce a one-paise mismatch that needs a documented tie-breaking rule (proposed: allocate any residual paise to segment 1, consistent with the even-split remainder rule).
10. **Waiter finalize/payment authority**: Section 8's table assumes waiters cannot finalize billing/collect payment by default; confirm this matches the target outlets' actual floor policy, since some quick-service formats have waiters both take and settle orders at the table.
