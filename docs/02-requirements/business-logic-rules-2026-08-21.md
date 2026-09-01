# 08 — Business Logic / Domain Rules Specification

**Status:** Draft for Phase 4–6 (Core POS) implementation
**Owners:** services/orders, services/tax, services/settings, services/menu-sync
**Source basis:** 86 validated screenshots of KapMeta desktop POS, single outlet "Hotel Kapila" (see Phase 0 discovery notes)
**Related:** docs/01-discovery/decision-register.md (blocked on sign-off — items opened by this doc are appended there, see §8)
**No-hardcode rule:** per CLAUDE.md, every numeric/label value used as an *example* in this document (2.5% CGST, ₹ amounts, "Packing Charge" label, etc.) is illustrative only. All such values MUST be sourced from DB tables (`tax_rules`, `billing_config`, `payment_types`, `print_config`, …) at runtime — none may be inlined as literals in service code. Seed/migration paths for every table referenced below are required deliverables of this phase, not optional.

---

## 0. Scope and conventions

- Pseudocode uses `snake_case` for fields/config keys, matching expected DB column naming.
- `channel` ∈ {`DINE_IN`, `PICKUP`, `DELIVERY`, `SWIGGY`, `ZOMATO`, ...other aggregators}. `ONLINE` is shorthand for "channel not in {DINE_IN, PICKUP}" i.e. any aggregator channel, unless a rule says otherwise (DELIVERY run by the outlet's own riders is treated as first-party, not ONLINE, for tax-mode purposes — see §8 open question OQ-1).
- All money fields are decimal, minimum 2dp, rounding mode configurable per outlet (default: round-half-up to paise) — rounding mode itself is a `billing_config` field, not hardcoded.
- "MUST" / "SHOULD" / "MAY" follow RFC 2119 sense.

---

## 1. Order Total Calculation Algorithm

### 1.1 Config inputs (all read from `billing_config` per outlet, some per-channel overrides)

| Key | Type | Meaning |
|---|---|---|
| `tax_mode_by_channel` | map(channel → BACKWARD\|FORWARD) | which tax record set applies |
| `calc_tax_before_discount` | bool | order of discount vs tax |
| `calc_backward_tax_after_discount` | bool | only meaningful when tax_mode = BACKWARD; ignored under FORWARD (see UI note, OQ-2) |
| `discount_basis` | TOTAL \| CORE | discount computed on grand total vs core item value |
| `container_charge` | {enabled_dine_in, enabled_pickup, enabled_delivery: bool; mode: ITEM_WISE\|ORDER_WISE\|FIX_PER_ITEM; amount; label} | packing/container charge |
| `delivery_charge` | {enabled: bool; amount} | applies only to DELIVERY |
| `service_charge` | {enabled: bool; mode; amount} | off by default |
| `default_order_type`, `default_payment_type` | enum | pre-fill only, not calculation inputs |

### 1.2 Ordered algorithm

```
function compute_order_total(order):
    cfg = load_billing_config(order.outlet_id)

    # STEP 1 — Item subtotal (core value)
    core_subtotal = sum(line.qty * line.unit_price for line in order.lines)
        # unit_price is the menu price AS STORED — under BACKWARD tax mode this
        # price is tax-inclusive; under FORWARD mode it is tax-exclusive.
        # This distinction is what makes step 5 branch, not step 1.
    addon_subtotal = sum(addon.qty * addon.unit_price for line in order.lines for addon in line.addons)
    item_subtotal = core_subtotal + addon_subtotal

    # STEP 2 — Determine discount basis value
    if cfg.discount_basis == CORE:
        discount_base = core_subtotal            # excludes addons and all charges
    else:  # TOTAL
        discount_base = item_subtotal             # includes addons; charges added later regardless

    # STEP 3 — Charges (channel-conditional; computed on item_subtotal, NOT on discount_base,
    #          unless discount_basis == TOTAL and calc_tax_before_discount pushes charges
    #          into the discount base — see OQ-3, flagged not silently assumed)
    container_charge_amt = 0
    if order.channel == DINE_IN and cfg.container_charge.enabled_dine_in: container_charge_amt = calc_container(cfg, order)
    if order.channel == PICKUP  and cfg.container_charge.enabled_pickup:  container_charge_amt = calc_container(cfg, order)
    if order.channel == DELIVERY and cfg.container_charge.enabled_delivery: container_charge_amt = calc_container(cfg, order)
        # Online (SWIGGY/ZOMATO) channels: container/packing charge is typically owned by the
        # aggregator's own billing, NOT recomputed by POS — POS records it as pass-through if present
        # on the incoming order payload; POS-side toggles above apply to DINE_IN/PICKUP/DELIVERY only.

    delivery_charge_amt = cfg.delivery_charge.amount if (order.channel == DELIVERY and cfg.delivery_charge.enabled) else 0

    service_charge_amt = 0
    if cfg.service_charge.enabled:
        service_charge_amt = calc_service_charge(cfg, item_subtotal)  # applicability-by-channel not shown in
                                                                        # source screenshots; treat as global unless
                                                                        # outlet overrides (OQ-4)

    charges_total = container_charge_amt + delivery_charge_amt + service_charge_amt

    # STEP 4 — Discount
    discount_amt = resolve_discount(order.discount_rule, discount_base)
        # discount_rule references discount % or flat amount configured via admin UI /
        # promo table (business data — no-hardcode rule applies)

    # STEP 5 — Order of discount vs tax, and Backward vs Forward tax computation
    tax_mode = cfg.tax_mode_by_channel[order.channel]

    if cfg.calc_tax_before_discount:
        # Tax computed on pre-discount value, discount applied after tax to grand total
        taxable_value = item_subtotal + charges_total
        tax_lines = compute_tax(taxable_value, tax_mode, cfg, order)
        pre_discount_total = taxable_value + sum(t.amount for t in tax_lines)
        grand_total = pre_discount_total - discount_amt
    else:
        # Discount applied first, tax computed on post-discount taxable value (default/typical POS flow)
        taxable_value = item_subtotal + charges_total - discount_amt
        tax_lines = compute_tax(taxable_value, tax_mode, cfg, order)
        grand_total = taxable_value + sum(t.amount for t in tax_lines)

    return OrderTotal(item_subtotal, charges_total, discount_amt, tax_lines, grand_total)


function compute_tax(taxable_value, tax_mode, cfg, order):
    tax_records = load_tax_records(order.outlet_id, order.channel)  # e.g. CGST/SGST rows scoped to channel
    if tax_mode == FORWARD:
        # Forward: value is tax-exclusive; tax is ADDED on top.
        lines = []
        for t in tax_records:
            lines.append(TaxLine(t.name, t.rate, amount = taxable_value * t.rate / 100))
        return lines

    if tax_mode == BACKWARD:
        # Backward: value is tax-inclusive; tax must be BACKED OUT of it.
        total_rate = sum(t.rate for t in tax_records)  # e.g. 2.5 + 2.5 = 5
        if cfg.calc_backward_tax_after_discount:
            base_for_backout = taxable_value  # already post-discount if calc_tax_before_discount == false
        else:
            base_for_backout = taxable_value  # NOTE: with tax_mode==BACKWARD this toggle only has a
                                                # distinct effect when combined with calc_tax_before_discount;
                                                # exact interaction is flagged as OQ-2/OQ-5, not silently resolved
        pre_tax_value = base_for_backout / (1 + total_rate/100)
        lines = []
        for t in tax_records:
            lines.append(TaxLine(t.name, t.rate, amount = pre_tax_value * t.rate / 100))
        return lines
```

`calc_container`, `calc_service_charge`, `resolve_discount` are helper stubs; their config (mode ITEM_WISE / ORDER_WISE / FIX_PER_ITEM, discount %/flat) is business data — DB-sourced only.

### 1.3 Worked numeric examples

Uses illustrative values only (must come from `tax_rules` table at runtime): CGST 2.5% + SGST 2.5% = 5% total, both BACKWARD (dine-in) and FORWARD (online) variants exist as **separate tax records**, per the Tax Master screenshot.

**Example A — Dine-in, Backward tax mode**
- Menu price (tax-inclusive) for 2 items @ ₹100 = `item_subtotal = ₹200`
- No charges, no discount (`calc_tax_before_discount = false`, `discount_amt = 0`)
- `taxable_value = 200`
- `pre_tax_value = 200 / 1.05 = 190.4762`
- CGST = 190.4762 × 2.5% = 4.7619; SGST = 4.7619
- `grand_total = 190.4762 + 4.7619 + 4.7619 = 200.00` (grand total unchanged from the inclusive menu price — tax is *backed out*, not added, confirming Backward semantics)

**Example B — Online (Zomato), Forward tax mode**
- Menu price (tax-exclusive online price) for 2 items @ ₹100 = `item_subtotal = ₹200`
- `taxable_value = 200`
- CGST[Online] = 200 × 2.5% = 5.00; SGST[Online] = 5.00
- `grand_total = 200 + 5.00 + 5.00 = 210.00` (tax added on top, confirming Forward semantics)

Note the two channels can show **different customer-facing totals for the "same" ₹100 item** purely because of tax-mode + differing tax-record base price — this MUST be visible/explainable in reporting, not treated as a bug.

### 1.4 Config-toggle-to-step map

| Toggle | Applies at step |
|---|---|
| `discount_basis` (Total/Core) | Step 2 |
| `container_charge.enabled_*`, mode, label | Step 3 |
| `delivery_charge.enabled` | Step 3 (DELIVERY only) |
| `service_charge.enabled` | Step 3 |
| `calc_tax_before_discount` | Step 5 (branch point) |
| `tax_mode_by_channel` | Step 5 / compute_tax |
| `calc_backward_tax_after_discount` | compute_tax, BACKWARD branch only |

---

## 2. Canonical Order Status State Machine

Table-View states {Blank, Running, Printed, Paid, Running KOT} and Order-History states {Saved, Printed, Cancelled, Paid} are merged into one enum. Table-View "Blank" is not an order state (no order exists yet) — excluded from the order enum, kept as a table-occupancy derived view.

### 2.1 Canonical enum

`OPEN → KOT_RUNNING → BILLED → PAID`, with `CANCELLED` reachable from any pre-PAID state, and `PAID` mutable via `PAID_EDITED` sub-event (not a separate state — see 2.3).

| Canonical status | Corresponds to (Table View) | Corresponds to (Order History) |
|---|---|---|
| `OPEN` | Running (blue) | Saved |
| `KOT_RUNNING` | Running KOT (yellow) | Saved |
| `BILLED` | Printed (green) | Printed |
| `PAID` | Paid (orange/tan) | Paid |
| `CANCELLED` | (table reverts to Blank) | Cancelled |

### 2.2 Transition table

| From | Event / Action | To | Triggered by | Side effects |
|---|---|---|---|---|
| (none) | New order created / table opened | `OPEN` | Staff (captain/cashier) or incoming online order | Table marked occupied; elapsed-time timer starts |
| `OPEN` | KOT sent to kitchen | `KOT_RUNNING` | Staff | KOT print job queued per print_config rules (§3); `last_kot_printed_at` set |
| `KOT_RUNNING` | Additional items + new KOT sent | `KOT_RUNNING` (self) | Staff | New KOT diffed against last-printed state if `print_only_modified_kot` set |
| `OPEN` or `KOT_RUNNING` | Bill printed | `BILLED` | Staff (cashier) | Bill print job queued; `print_kot_on_print_bill` fires a KOT print IF one has never fired for this order (first-time only — see §3.1) |
| `BILLED` | Re-print bill (same order, no edits) | `BILLED` (self) | Staff | `show_duplicate_marker` flag set on reprint; NO duplicate KOT fires |
| `BILLED` | Payment settled | `PAID` | Staff (cashier) | Payment line(s) written to `payment_ledger`; table reverts to Blank/free once vacated |
| `OPEN`, `KOT_RUNNING`, `BILLED` | Cancel | `CANCELLED` | Staff w/ manager permission (recommended; not shown in screenshots but required by engineering-rigor default) | If KOTs already printed, `print_cancelled_kot` rule may fire a cancellation KOT; table freed |
| `PAID` | Manual Grand Total edit (pencil icon) | `PAID` (self) — value mutated | Staff w/ elevated permission | **MUST write an audit record**: `{order_id, actor_id, timestamp, field: 'grand_total', before, after, reason}` to an immutable `order_audit_log` table. This is a hard requirement even though the source screenshot shows no confirm dialog — implementer MUST add a confirm step and permission gate; absence of a confirm dialog in the reference UI is not license to skip one here. |

### 2.3 Notes
- `PAID_EDITED` is modeled as an audit-logged mutation of `PAID`, not a new state, so downstream reporting (Day-End totals, §5) always reconciles against the *current* value while the audit log preserves history.
- Cancellation after payment (refund) is out of scope for this state machine — it is modeled as a **Sales Return** order-level flag (§5.2), a different lifecycle, not a backward transition out of `PAID`.
- Online orders enter `OPEN` already carrying OTP/rider fields (§4) — those fields ride alongside the state machine, they do not gate transitions, except see §4's SLA breach event which is a side-channel alert, not a state transition.

---

## 3. Print / KOT Rule Engine Spec

Design constraint (ties to no-hardcode rule): the renderer MUST be a flag-driven template engine reading `print_config` + a `document_templates` table (holding restaurant name/header/footer/custom messages as tenant-editable content) — **zero hardcoded strings** in the print pipeline, including labels like "Packing Charge", "Duplicate", "Cancelled", which must themselves be localizable/tenant-editable template strings, not literals in code.

| # | Config flag | Trigger condition | Effect on render pipeline |
|---|---|---|---|
| P1 | `print_kot_on_print_bill` | Bill print action fires AND no KOT has yet been printed for this order | Emit one KOT print job before/alongside the bill job |
| P2 | (implicit, same flag) | Bill print action fires on an order that already has `last_kot_printed_at` set (i.e., an edit/reprint) | Do NOT emit a duplicate KOT job |
| P3 | `consider_non_prepared_kot_in_bill` | Bill render assembles line items | Include items whose KOT status = NOT_PREPARED in the bill line list (rather than omitting them) |
| P4 | `print_only_modified_kot` | New KOT print triggered | Diff current order lines against `last_printed_snapshot`; render KOT containing only the delta (added/changed lines) |
| P5 | `print_only_modified_items_in_kot` | Same as P4, item-granularity variant | As P4 but diff evaluated per line-item field, not whole-KOT |
| P6 | `print_deleted_items_in_kot` | Order line removed after a KOT already printed for it | Render the removed item inline in the next KOT output, marked deleted |
| P7 | `print_deleted_items_in_separate_kot` | Same trigger as P6 | Mutually exclusive with P6 at the template-selection level (config validation MUST reject both true) — render removed items on a SEPARATE KOT document instead |
| P8 | `print_cancelled_kot` | Order transitions to `CANCELLED` and had at least one prior KOT | Emit a KOT document flagged as cancellation notice |
| P9 | `print_kot_no_on_bill_as_token_no` | Bill render | Print the KOT number as the customer-facing "Token No." field, ONLY if the KOT was generated by the local/desktop app; cloud-only KOTs (e.g. relayed from a channel without local ticket generation) have no local token — renderer MUST fall back to omitting the token field or another configured fallback, never fabricate one |
| P10 | `cwt_mode` (enum: NONE \| CATEGORY_WISE) | Bill render, tax section | Mutually exclusive radio: NONE prints a single tax summary line; CATEGORY_WISE bifurcates tax lines per item category |
| P11 | `item_price_display_mode` (enum: WITH_BACKWARD_TAX \| WITHOUT_BACKWARD_TAX) | Bill render, line-item price column | Mutually exclusive radio: choose whether the displayed unit price already nets the backed-out tax or shows the pre-tax portion; only meaningful when `tax_mode == BACKWARD` for the order's channel |
| P12 | `show_backward_tax_on_bill` | Bill render, tax section | If true, print the backed-out tax breakdown (CGST/SGST computed amounts); otherwise suppress that block |
| P13 | `show_duplicate_marker` | Any print job for an order where `print_count > 1` for that document type | Stamp a tenant-editable "Duplicate" marker (template string, not hardcoded literal) on the rendered document |
| P14 | `highlight_order_id_mode` (enum: FULL \| LAST_N_CHARS) | Bill/KOT header render | If LAST_N_CHARS, truncate/highlight only the trailing N characters of a long external/aggregator order id (N itself configurable, e.g. 4) |

Renderer implementation note: every flag above should compile to a boolean/enum lookup against `print_config` at render time; template partials (header/footer/labels) resolve from `document_templates` keyed by outlet + language, never string-literal constants in the template-engine code.

---

## 4. Online Order Lifecycle Rules

### 4.1 Field conditionality

```
function get_visible_fields(order):
    if order.channel in {SWIGGY, ZOMATO, ...other_aggregators}:
        return base_fields + {otp, rider_status, prepare_in_countdown}
    else:  # DINE_IN, PICKUP
        return base_fields   # OTP / rider_status / prepare_in MUST be null/absent, not zero-valued
```
`otp`, `rider_status` (`LOOKING_FOR_RIDER` | `ARRIVED` | others as the aggregator API defines), and `prepare_in_countdown` are channel-conditional columns/attributes — the data model MUST allow them to be null for non-online channels rather than defaulting to a sentinel, to avoid false "0" states leaking into non-online UI.

### 4.2 SLA breach ("Prepare In" countdown reaching 0 / negative)

```
function on_prepare_in_tick(order):
    if order.channel is ONLINE and order.prepare_in_remaining <= 0 and order.status in {OPEN, KOT_RUNNING}:
        if not order.sla_breach_alerted:
            emit_alert(type = "PREPARE_IN_SLA_BREACH", order_id = order.id,
                       severity = URGENT, message_template = "sla_breach_customer_may_cancel")
                       # message text itself sourced from a template, not hardcoded
            order.sla_breach_alerted = true
            escalate_to(role = "outlet_manager")  # first-class alertable/escalatable event,
                                                    # should integrate with whatever alerting/
                                                    # notification service Phase 4-6 provides
```
This is a first-class event, not just a UI color change — it MUST be loggable, queryable (e.g. "count of SLA breaches today per outlet"), and support escalation routing (config-driven recipient, not hardcoded role name — though "outlet_manager" as a permission key is structural/exempt per CLAUDE.md).

### 4.3 Mark Out of Stock (OOS) — item-level, cross-channel fan-out

```
function mark_item_out_of_stock(item_id, order_context, propagate_to_all_channels, allow_alternate_item, alternate_item_id=None):
    # STEP 1 — single source-of-truth write
    write_item_availability(item_id, channel = order_context.channel, status = OOS, source_order_id = order_context.order_id)
    log_availability_change(item_id, channel = order_context.channel, status = OOS, actor, timestamp)

    if order_context.allow_alternate and allow_alternate_item:
        record_alternate_offer(order_context.order_id, item_id, alternate_item_id)

    results = []
    if propagate_to_all_channels:
        channels = get_online_channels_where_item_listed(item_id)  # e.g. [SWIGGY, ZOMATO, ...]
                                                                     # excludes the origin channel already written above
        for ch in channels:
            if ch == order_context.channel:
                continue
            try:
                response = call_channel_availability_api(ch, item_id, status = OOS)
                write_item_availability(item_id, channel = ch, status = OOS, source = "fanout")
                log_availability_change(item_id, channel = ch, status = OOS, actor = "system:fanout", timestamp)
                results.append({channel: ch, ok: True})
            except ChannelApiError as e:
                results.append({channel: ch, ok: False, error: str(e)})
                log_availability_change(item_id, channel = ch, status = "OOS_FANOUT_FAILED", error = e, timestamp)
                # partial failure MUST NOT roll back the origin-channel write or other channels'
                # successful writes; each channel's OOS state is independently tracked (see §6)

    if any(not r.ok for r in results):
        emit_alert(type = "OOS_FANOUT_PARTIAL_FAILURE", item_id, failed_channels = [r.channel for r in results if not r.ok])

    return OOSResult(origin_write = True, fanout_results = results)
```
Key invariant: **OOS is an item-level, per-channel flag**, never an order-level field. A partial fan-out failure leaves the system in a legitimate (not corrupt) intermediate state — some channels OOS, some not — which MUST be surfaced to staff for manual follow-up, not silently retried indefinitely.

---

## 5. Payment / Reconciliation Rules

### 5.1 Day-End Payment Type summary

```
function compute_day_end_summary(outlet_id, business_date):
    payment_types = load_payment_types(outlet_id)   # includes standard (Cash, Card, UPI, Due Payment,
                                                       # Swiggy-Online, Zomato-Online) AND custom
                                                       # merchant-defined types (e.g. "Room Service")
                                                       # — all rows in a DB table, never hardcoded
    totals = {}
    for pt in payment_types:
        lines = query_payment_ledger(outlet_id, business_date, payment_type_id = pt.id)
        totals[pt.id] = { label: pt.label, count: len(lines), amount: sum(l.amount for l in lines) }

    not_paid_amt = sum(order.grand_total for order in orders_in(outlet_id, business_date) if order.status != PAID)

    complimentary = { count, amount } from orders flagged is_complimentary = true
    sales_return  = { count, amount } from orders/refund_records flagged is_sales_return = true

    return DayEndSummary(totals, not_paid_amt, complimentary, sales_return)
```
Complimentary and Sales Return are **distinct order-level flags**, not payment types — a comp bill has `grand_total` collected as ₹0 (or a defined comp amount) via no real payment line, while a sales return is a negative/refund adjustment against a previously PAID order. Neither should be blended into a `payment_type_id` bucket.

### 5.2 Reconciliation invariant (checkable formula)

```
sum(payment_ledger.amount for all payment lines on business_date, all payment_types)
    ==
sum(order.grand_total for order in orders where status == PAID on business_date)
    - sum(complimentary.amount)
    + sum(sales_return.amount)          # returns treated as a reduction of net collected cash,
                                         # added back here as a documented reconciling item
```
This invariant SHOULD be a scheduled/on-demand check (`services/orders` or a reconciliation job) that raises a discrepancy alert when it fails to hold within rounding tolerance — a concrete, automatable acceptance test for Phase 4-6.

---

## 6. Menu / Availability Rules

- **Name vs Online Display Name**: `menu_item.name` (POS-facing) and `menu_item.online_display_name` (aggregator-facing) are separate nullable-fallback columns; if `online_display_name` is null, channel sync falls back to `name`. Both are tenant-editable business data (no-hardcode rule applies — must live in `menu_items` table + admin UI).
- **Independent Item/Addon toggles**: `menu_item.availability` and `addon.availability` are tracked in a shared `item_channel_availability` table keyed by `(entity_type: ITEM|ADDON, entity_id, channel)`, so an addon can be off while its parent item is on, and vice versa, and each independently per channel (`ALL`/`SWIGGY`/`ZOMATO`/...).
- **"Recent" filter view**: implies every availability change is logged with a timestamp (`log_availability_change`, §4.3) — the "Recent" UI filter is a query over that log, not a separate data structure.
- **OOS vs channel On/Off — two distinct concepts, must not be conflated:**

| Aspect | Channel On/Off | OOS (Out of Stock) |
|---|---|---|
| Intent | Deliberate merchant listing decision ("we don't sell this on Zomato") | Temporary unavailability due to stock/ingredient shortage |
| Typical duration | Indefinite until merchant re-enables | Short-lived (hours/until restock) |
| Typical trigger | Menu management screen, planned | Mark Out of Stock action, often mid-service, reactive |
| Fan-out default | Not automatically propagated across channels (a merchant may want it off on Zomato but on Swiggy) | Optionally propagated across ALL online channels (explicit staff choice, §4.3) |
| Data field | `item_channel_availability.channel_enabled` (bool, merchant-controlled) | `item_channel_availability.oos_status` (bool, operationally-controlled, log-heavy) |

They are modeled as **two separate boolean columns on the same row**, not one shared "off" state, because an item can be OOS on a channel where it is otherwise Channel-On (the common case — temporary stockout, not delisting), and collapsing them would lose the distinction between "we chose not to sell this here" and "we ran out right now."

---

## 7. Validation / Edge-Case Checklist

1. Item marked OOS on Zomato while still On (and in-stock) on Swiggy — must be independently trackable per §6 table; verify `item_channel_availability` supports differing `oos_status` per channel for the same item.
2. `discount_basis` changed mid-day (Total → Core or vice versa) — does it apply retroactively to already-`OPEN`/`KOT_RUNNING` orders or only to orders created after the change? (See OQ-6.) Implementer must snapshot the effective config onto the order at creation time to avoid silent recalculation drift.
3. Backward-tax outlet with container/packing charge enabled — is the container charge itself taxed backward (netted out of an inclusive charge) or forward (added on top)? Not evidenced in screenshots — flag, don't assume (OQ-3).
4. Custom payment type deleted by admin — historic `payment_ledger` rows referencing it must NOT cascade-delete; soft-delete/deactivate the `payment_types` row only, preserving FK integrity and historical Day-End reports.
5. `calc_tax_before_discount = true` combined with `discount_basis = CORE` — discount is computed on core value but applied to a post-tax total; verify rounding doesn't produce a negative or non-sensical grand total on edge percentages.
6. Manual Grand Total edit on a `PAID` order that is also flagged `is_complimentary` — does the edit override the comp amount, and does §5.2's invariant recompute correctly after such an edit? Must re-run reconciliation, not just accept the edit blindly.
7. Online order whose `prepare_in_countdown` breaches SLA (§4.2) AND is then cancelled by the aggregator before staff acts — ensure the alert is auto-resolved/withdrawn, not left dangling as an open incident.
8. OOS fan-out (§4.3) where one channel API call succeeds but a second, retried automatically, double-logs the same status change — dedupe the availability log by `(item_id, channel, status, idempotency_key)`.
9. Container charge configured as `ITEM_WISE` but an order has zero taxable/chargeable items (e.g., only a comp item) — must not throw or charge on an empty base.
10. Print config has both `print_deleted_items_in_kot` and `print_deleted_items_in_separate_kot` set true simultaneously — config validation MUST reject this at write-time (mutually exclusive per §3, P6/P7).
11. `highlight_order_id_mode = LAST_N_CHARS` where the order id is *shorter* than N — renderer must gracefully show the full id, not error or pad.
12. `print_kot_no_on_bill_as_token_no` enabled but the order's KOT was generated purely server-side (cloud aggregator order with no local desktop KOT) — token field must degrade gracefully per P9, not print a null/garbage value.
13. Two tax records exist for the same channel due to a bad migration (e.g. duplicate CGST rows) — `compute_tax` must either fail loudly or the schema must enforce uniqueness on `(outlet_id, channel, tax_name)` to prevent silent double-taxation.
14. Order channel is DELIVERY fulfilled by the outlet's own staff (not an aggregator) — confirm whether `tax_mode_by_channel[DELIVERY]` is BACKWARD (grouped with dine-in/pickup) or FORWARD (grouped with online); screenshots only clearly evidence dine-in vs aggregator-online, not first-party delivery (OQ-1).
15. `service_charge.enabled` toggled on mid-service on an already-`KOT_RUNNING` order — should the charge apply when the bill is eventually printed, using config-at-bill-time or config-at-order-creation-time? Same class of question as #2; recommend a consistent policy across ALL config-snapshot-timing questions rather than deciding case by case (see OQ-6).
16. Sales Return recorded against an order that was paid via a now-deactivated custom payment type — reconciliation formula (§5.2) must still correctly net the return regardless of the origin payment type's active/inactive state.
17. Complimentary order that nonetheless has a non-zero payment line attached (e.g., partial comp) — clarify whether `is_complimentary` is boolean-exclusive or the model needs a `comp_amount` distinct from `grand_total` to represent partial comps; current spec assumes full-comp only, partial comps are unresolved (OQ-7).
18. Grand Total edit audit log (§2.2) must be append-only / immutable — verify no service path allows UPDATE or DELETE on `order_audit_log`, only INSERT.
19. Addon marked OOS while its parent item is Channel-Off entirely on that channel — fan-out logic (§4.3) should skip channels where the *item* itself isn't listed, to avoid a spurious "addon OOS" API call for an item that isn't sold there at all.
20. Rounding mode difference between BACKWARD tax back-out (division) and FORWARD tax add-on (multiplication) can produce a 1-paise mismatch between the two channel totals for a "same-priced" item — reporting/analytics comparing cross-channel item revenue must document this as expected variance, not a bug.

---

## 8. Open Questions → Decision Register

The following are appended as candidate entries to `docs/01-discovery/decision-register.md` (currently blocked on sign-off) rather than silently resolved here:

| ID | Question | Why it matters | Proposed default (non-binding) |
|---|---|---|---|
| OQ-1 | Is first-party DELIVERY (outlet's own riders) taxed BACKWARD (grouped with dine-in/pickup) or FORWARD (grouped with aggregator-online)? Screenshots evidence only a dine-in-vs-aggregator split, not first-party-delivery placement. | Directly changes Step 5 tax branch and customer-facing totals for a whole channel. | Default to BACKWARD (treat as in-house channel) unless outlet configures otherwise; expose as an explicit `tax_mode_by_channel[DELIVERY]` config key rather than inferring it. |
| OQ-2 | Exact interaction of `calc_backward_tax_after_discount` with `calc_tax_before_discount` when tax_mode = BACKWARD — the UI note "ignore this setting if using forward tax" implies the toggle's scope is BACKWARD-only, but doesn't fully specify how it composes with the separate discount-order toggle. | Affects Step 5 formula selection; wrong composition silently mis-taxes every backward-tax discounted order. | Treat as documented in §1.2: the flag only changes which value backward tax is computed against when `calc_tax_before_discount = false`; needs merchant/product confirmation. |
| OQ-3 | Is the container/packing charge itself subject to backward-tax netting, or added tax-free / forward regardless of outlet tax mode? | Determines whether Step 3 charge amount needs its own tax treatment nested inside Step 5. | Default: charge amount is included in `taxable_value` and follows the outlet's channel tax_mode like any other charge, pending confirmation. |
| OQ-4 | Does `service_charge` apply per-channel (like container charge, with 3 checkboxes) or globally? Only a single toggle was evidenced. | Determines whether services/settings needs 3 booleans or 1 for this field. | Model as global toggle now; add per-channel columns later if evidenced — schema should reserve the column names to avoid a breaking migration. |
| OQ-5 | Full worked semantics of `calc_backward_tax_after_discount = true` — literally recompute tax on (post-discount taxable_value) vs. re-deriving pre_tax_value differently — the source screenshots show the toggle exists but not a worked example. | Same order as OQ-2 but specifically the "after discount" computation path. | Pending; §1.2 pseudocode leaves both branches identical until clarified — implementer must not diverge silently from this doc without a decision-register update. |
| OQ-6 | When a `billing_config` value changes mid-day, do already-open orders use the value in effect at order-creation-time (snapshotted) or at bill/settlement-time (live lookup)? | Cross-cuts discount_basis, service_charge, container_charge, tax_mode — a single unresolved timing policy affects many fields (see checklist #2, #15). | Recommend: snapshot the full effective `billing_config` onto the order at creation, freeze it for that order's lifetime, to keep totals deterministic and auditable; requires decision-register sign-off since it's a product-behavior choice, not just an implementation detail. |
| OQ-7 | Does the data model need to support partial complimentary orders (comp portion + real payment portion), or is comp always all-or-nothing per order? | Determines whether `is_complimentary` stays a boolean or needs a `comp_amount` field, and affects §5.2's reconciliation formula. | Default to boolean/all-or-nothing until evidenced otherwise; flag as assumption. |

---

*End of specification. This document is the acceptance-criteria source of truth for services/orders, services/tax, services/settings, services/menu-sync for Phase 4-6. Any deviation from the pseudocode above (beyond resolving the OQ items) should be raised as a decision-register amendment, not implemented silently.*
