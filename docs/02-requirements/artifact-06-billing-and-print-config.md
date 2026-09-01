# Artifact 06 — Billing & Print Configuration Screens (Build Plan)

Status: Draft for engineering review
Owner: Admin/Settings workstream
Related docs: DB schema doc (`outlet_billing_settings`, `outlet_print_settings`), API contracts doc, sync architecture doc (DEC-018), business-logic-rules doc (billing calculation order of operations), decision-register addendum (DEC-013..024)

This document plans two admin settings screens as a single unit because they are edited from the same "Outlet Configuration" area, share the same propagation model, and are both consumed at the point of order billing/printing.

- **Part A: Billing Screen Configuration** — governs default values and calculation behavior at the POS billing screen.
- **Part B: Bill/KOT Print Configuration** — governs what gets printed on the Bill and the KOT (Kitchen Order Ticket), and how.

Both screens write directly to their respective outlet-scoped settings tables (`outlet_billing_settings`, `outlet_print_settings`). No field on either screen may ever be hardcoded in application source — see section A.7/B.7 for how this satisfies the project's no-hardcode rule.

---

## PART A: Billing Screen Configuration

### A.1 Purpose & User Story

**Purpose.** The Billing Screen Configuration lets an outlet manager define the default behavior of the POS billing screen for their outlet — default order type, default payment method, and how charges (delivery, container, service) and taxes are calculated on every bill. These are outlet-level defaults; they are not negotiated per order unless the cashier explicitly overrides a default at billing time (e.g., changes order type from the default Dine In to Delivery).

**User story.** As an outlet manager, I want to set my outlet's billing defaults and charge/tax calculation rules once, so that every order rung up by any cashier, on any shift, from that point forward follows the same rules — without needing to explain policy verbally or trust cashiers to remember it.

**Actors.** Outlet manager or owner (edits). Cashier/POS billing screen (consumes, read-only). Cloud admin panel (source of truth per DEC-018).

### A.2 UI Spec

All fields below are listed exactly as they appear in the source screenshot, with control type, default, and validation.

| # | Field label | Control | Default | Validation |
|---|---|---|---|---|
| 1 | Default Order Type | Dropdown: Dine In / Delivery / Pick Up | Dine In | Required, single-select, enum-constrained |
| 2 | Default Payment Type | Dropdown: Cash / Card / UPI / … (outlet's enabled payment methods) | Cash | Required, single-select; options sourced from outlet's configured payment methods list (not hardcoded — see A.7) |
| 3 | Default Table No. | Text | empty | Optional; free text (table numbering schemes vary by outlet); max length 20; only meaningful when Default Order Type = Dine In |
| 4 | Display & Calculate Delivery Charge | Checkbox | Off | — |
| 4a | Default Delivery Charge | Number (currency) | — | **Required and must be > 0 whenever field 4 is checked**; visible/editable only when field 4 is checked; applies only to Delivery-type orders |
| 5 | Display & Calculate Container Charge | Checkbox | Off | — |
| 6 | Calculate Container Charge Automatically | 3 checkboxes: Delivery / Pick Up / Dine In | All off | Enabled/visible only when field 5 is checked; each is an independent per-channel toggle (see A.6 for interaction with field 7) |
| 7 | Container Charge (calculation mode) | Radio: Item wise / Order wise / Fix per item | Item wise | Required when field 5 is checked; single-select |
| 8 | Container Charge Label | Text | "Container Charge" | **Required when field 5 is checked**; max length 40; this is the label printed on the bill line item, not a hardcoded string (A.7) |
| 9 | Display & Calculate Service Charge | Checkbox | Off | — |
| 10 | Calculate Tax Before Discount Calculation | Checkbox | Off (i.e., default is tax-after-discount) | Mutually relevant to field 11; see A.6 worked example |
| 11 | Calculate Backward Tax after discount | Checkbox | Off | Helper text shown under this field: *"Ignore this settings if you are using forward tax configuration for your outlet."* — see A.10, flagged against DEC-017 |
| 12 | Special Discount Calculation On | Radio: Total / Core | Total | Required, single-select |

Notes on inferred defaults: where the screenshot doesn't show a pre-filled state, defaults above follow the safest/most conservative behavior (charges off by default, tax-after-discount, which is the common tax-inclusive-of-discount convention) and should be confirmed with the product owner before implementation freeze.

### A.3 Data Model — `outlet_billing_settings`

One row per outlet (`outlet_id` is both the natural key and, recommended, the primary key or a unique constraint). All columns below map 1:1 to the UI fields in A.2.

```
outlet_billing_settings
--------------------------------------------------------------
outlet_id                          BIGINT / UUID   PK, FK -> outlets.id
default_order_type                 ENUM('DINE_IN','DELIVERY','PICK_UP')  NOT NULL DEFAULT 'DINE_IN'
default_payment_type_id            BIGINT / UUID   FK -> outlet_payment_methods.id, NOT NULL
default_table_no                   VARCHAR(20)     NULL
delivery_charge_enabled            BOOLEAN         NOT NULL DEFAULT FALSE
default_delivery_charge_amount     DECIMAL(10,2)   NULL  -- NOT NULL when delivery_charge_enabled = TRUE (app-level + CHECK constraint)
container_charge_enabled           BOOLEAN         NOT NULL DEFAULT FALSE
container_charge_auto_delivery     BOOLEAN         NOT NULL DEFAULT FALSE
container_charge_auto_pickup       BOOLEAN         NOT NULL DEFAULT FALSE
container_charge_auto_dinein       BOOLEAN         NOT NULL DEFAULT FALSE
container_charge_mode              ENUM('ITEM_WISE','ORDER_WISE','FIX_PER_ITEM')  NOT NULL DEFAULT 'ITEM_WISE'
container_charge_label             VARCHAR(40)     NOT NULL DEFAULT 'Container Charge'
service_charge_enabled             BOOLEAN         NOT NULL DEFAULT FALSE
tax_before_discount                BOOLEAN         NOT NULL DEFAULT FALSE
backward_tax_after_discount        BOOLEAN         NOT NULL DEFAULT FALSE
special_discount_calc_on           ENUM('TOTAL','CORE')  NOT NULL DEFAULT 'TOTAL'
settings_version                   BIGINT          NOT NULL DEFAULT 1
updated_by_user_id                 BIGINT / UUID   NOT NULL
updated_at                         TIMESTAMPTZ     NOT NULL DEFAULT now()
created_at                         TIMESTAMPTZ     NOT NULL DEFAULT now()
--------------------------------------------------------------
CHECK (NOT delivery_charge_enabled OR default_delivery_charge_amount IS NOT NULL)
CHECK (NOT container_charge_enabled OR container_charge_label IS NOT NULL)
```

`default_payment_type_id` references the outlet's own configured payment methods table rather than an enum, since the set of enabled payment types ("Cash/Card/UPI/…") is itself outlet-configurable data, not a fixed list — consistent with the no-hardcode rule.

### A.4 Settings Propagation Spec

Per DEC-018's recommended model (cloud-admin-edits-push-down-to-outlet-server):

1. Manager edits Billing Screen Configuration in the **cloud admin panel**. This is the canonical write path; the row in `outlet_billing_settings` in the cloud database is the source of truth.
2. On save, the cloud service increments `settings_version` for that outlet's billing settings row and publishes a change event (e.g., `billing_settings.updated { outlet_id, settings_version }`) to the outlet-server sync channel already defined in the sync-architecture doc.
3. The outlet-server (running locally at the restaurant) receives the event, or on its next poll/heartbeat detects `settings_version` is stale, and pulls the full updated row via the GET endpoint (A.5).
4. The outlet-server persists the new settings locally (its own local cache/replica of `outlet_billing_settings`, keyed by `outlet_id`) and bumps its local `settings_version` to match.
5. The POS billing screen reads settings from the local outlet-server (not the cloud directly) so that billing keeps working during a cloud/network outage — it always uses whatever `settings_version` is currently cached locally.

**Local edit path:** flagged open question in A.10 — whether the outlet-server admin UI should allow local-only edits of billing settings (e.g., for connectivity-loss emergencies) is not yet decided; this doc assumes cloud-only edit for the initial build, per DEC-018.

**Mid-shift change / in-progress orders.** Recommendation: settings changes apply only to **new orders** created after the local cache picks up the new `settings_version`. Any order already open (in KOT/held/not-yet-billed state) at the moment the settings update lands keeps the settings snapshot it was created with. Concretely:

- Each order row stores a `billing_settings_version_snapshot` (and, ideally, a compact denormalized snapshot of the specific fields that affect calculation — delivery charge amount, container charge mode/label, tax-before/after-discount flags — so recalculation later doesn't depend on settings history being retained forever).
- Billing calculation for an order always reads from its own snapshot, never from "current" settings.
- This avoids a bill's tax/charge math silently shifting mid-transaction if a manager edits settings while a cashier is mid-order.

### A.5 API Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/outlets/{outlet_id}/billing-settings` | Fetch current billing settings row (used by outlet-server sync pull and by the admin UI to populate the form) |
| `PUT /api/outlets/{outlet_id}/billing-settings` | Full replace — admin UI save button submits the complete form; increments `settings_version` server-side |
| `PATCH /api/outlets/{outlet_id}/billing-settings` | Partial update — reserved for programmatic/internal use (e.g., a single-field automation); increments `settings_version` |
| `GET /api/outlets/{outlet_id}/billing-settings/history` | Returns audit/change history: each row = version, changed fields (old→new), `updated_by_user_id`, timestamp |
| `GET /api/outlets/{outlet_id}/billing-settings/version` | Lightweight endpoint returning just `settings_version`, for outlet-server polling without pulling the full row |

All write endpoints require manager/owner role (A.8) and return the new `settings_version` in the response so the caller can confirm propagation without a second GET.

### A.6 Business Logic / Edge Cases

**Container charge: per-channel auto-apply × calculation mode.**

Field 6 (auto-apply per channel) and field 7 (calculation mode) are independent axes: field 6 decides *whether* the container charge is automatically added for a given order type without cashier action; field 7 decides *how the amount is computed* once it applies (whether auto-applied or manually added by the cashier for a channel not in field 6).

Worked example — assume `container_charge_enabled = true`, order has 3 items of container-eligible types, `container_charge_label = "Container Charge"`, per-item container fee schedule = $0.50/item, order-level flat container fee = $1.20:

- **Item wise**: charge = sum of per-item container fee × quantity of container-requiring items. 3 items × $0.50 = **$1.50** added as one line, or as 3 sub-lines depending on print settings.
- **Order wise**: charge = a single flat fee per order regardless of item count = **$1.20** (one line, once, no matter how many items).
- **Fix per item**: charge = a fixed fee applied per unit item copy explicitly (distinct from "item wise" in that it does not vary by item's own container-fee tier — every eligible item gets the same fixed per-unit amount, e.g. $0.40 × 3 = **$1.20**). Implementers must confirm with product whether "Item wise" vs "Fix per item" differ only in whether the per-item rate is itemtype-specific (item wise) or outlet-global-flat (fix per item); this distinction should be nailed down before coding — flagged in A.10.

If `container_charge_auto_dinein = false` but the order is Dine In and the cashier manually adds a container charge, mode (field 7) still governs the computation; only the *automatic* application is suppressed for that channel, not the calculation rule.

**Tax before vs. after discount — worked example.**

Order subtotal = $100.00, discount = 10% ($10.00), tax rate = 5%.

- `tax_before_discount = false` (tax after discount, the default): taxable base = $100 − $10 = $90.00 → tax = $4.50 → total = $90 + $4.50 = **$94.50**.
- `tax_before_discount = true`: tax computed on pre-discount subtotal = $100 → tax = $5.00; discount still applied to the subtotal only → total = ($100 + $5.00) − $10.00 = **$95.00**.

This must match the calculation order of operations already fixed in the business-logic-rules doc; this screen only toggles which branch of that documented order applies — it does not redefine the order of operations itself.

**Backward tax after discount.** Applies only when the outlet is using backward (tax-inclusive) pricing, per the helper note. When enabled, the backward-computed tax component is recalculated using the post-discount price rather than the original tax-inclusive price. See A.10 for the DEC-017 ambiguity this raises: the note says to "ignore" the setting under forward tax configuration, but the UI does not currently disable/grey out the checkbox when the outlet's tax mode is forward — it only warns via text.

### A.7 Admin/Config Dependency (No-Hardcode Compliance)

This screen is one half of the project's no-hardcode rule in practice: every value that would otherwise be baked into POS billing logic (default order type, default payment method, delivery/container/service charge toggles and amounts, container charge label text, tax-calc-order flag, discount-basis flag) is instead a column read at runtime from `outlet_billing_settings`, populated exclusively through this admin screen and its API. No literal like `"Container Charge"`, a hardcoded `5%` tax rate, or an assumed default order type may appear in POS billing source; all such values must be parameters resolved from this table (or from the order's settings snapshot, per A.4) at calculation time.

### A.8 Permissions

- **Edit** (`PUT`/`PATCH` on billing settings): restricted to roles `MANAGER` and `OWNER`. Cashier role has no access to this screen or its write endpoints — enforced both at UI (screen not shown/reachable) and API (403 on role check) layers.
- **View** (`GET`): `MANAGER`/`OWNER` only in the admin panel context; the POS billing screen itself doesn't call this admin GET — it consumes the outlet-server's locally cached settings, which is a system-level read, not a user-permissioned one.
- **History/audit** (`GET .../history`): `MANAGER`/`OWNER`, plus any auditor/support role defined elsewhere in the permissions doc.

### A.9 Test Plan

1. **Field validation tests**: saving with delivery charge enabled and amount blank/zero is rejected (both client and server); saving with container charge enabled and empty label is rejected.
2. **Container charge — golden tests** (one per mode), using the worked examples in A.6 as fixed expected outputs:
   - Item wise: 3 eligible items × $0.50 → expect $1.50.
   - Order wise: any item count → expect flat $1.20.
   - Fix per item: 3 eligible items × $0.40 → expect $1.20.
3. **Per-channel auto-apply tests**: order type Dine In with `container_charge_auto_dinein=false` → container charge not auto-added; same order with flag true → auto-added.
4. **Tax-before/after-discount golden test**: subtotal $100, discount 10%, tax 5% → assert $94.50 (after) vs $95.00 (before), matching A.6 exactly.
5. **Special discount calc basis test**: verify discount computed against "Total" vs "Core" basis produces documented different results (exact basis definitions to be pulled from business-logic-rules doc).
6. **Settings versioning / snapshot test**: create an order, capture its `billing_settings_version_snapshot`; update outlet billing settings (bump version); re-run billing calculation on the still-open order and assert it still uses the old snapshot values, not the new ones; open a *new* order after the update and assert it uses the new values.
7. **Propagation test**: simulate outlet-server offline during a cloud settings update; bring it back online; assert it detects stale `settings_version` and pulls the update before the next order is billed.
8. **Permission test**: cashier-role token attempts `PUT` on billing settings → expect 403.

### A.10 Open Questions / Flags for Stakeholder

- **DEC-017 (tax-mode scope ambiguity).** The "Calculate Backward Tax after discount" field ships with the helper note: *"Ignore this settings if you are using forward tax configuration for your outlet."* This implies the setting is only meaningful under backward tax configuration, but the UI does not disable or hide the control based on the outlet's actual tax mode — it relies on the manager reading and understanding the note. This is direct evidence the scope of DEC-017 needs resolution: should this field be conditionally hidden/disabled based on the outlet's tax-mode setting (and if so, where does "tax mode" itself live — is it part of this same settings table or a separate outlet tax-configuration table not yet documented)? Recommend product/engineering resolve before build: either (a) make the field conditionally visible only in backward-tax outlets, or (b) keep it always visible but store and expose the outlet's tax mode so the billing calculation layer can safely no-op this flag under forward tax without relying on the manager's manual compliance with a text hint.
- **Local edit path.** Whether outlet-server-local editing of billing settings should be supported at all (e.g., for connectivity-loss scenarios) or whether this must remain strictly cloud-admin-only, per DEC-018's recommendation, needs explicit stakeholder sign-off before the outlet-server admin surface (if any) is scoped.
- **Item wise vs. Fix per item semantics.** As noted in A.6, the precise distinction between these two container-charge modes is inferred from the field names alone and should be confirmed against actual KapMeta behavior or product intent before implementation.
- **Payment type source list.** Confirm whether "Default Payment Type" options are drawn from a separate outlet payment-methods configuration screen/table not covered in this doc, and if so, cross-reference that table's FK here.

---

## PART B: Bill/KOT Print Configuration

### B.1 Purpose & User Story

**Purpose.** This screen controls what content and format appear on two distinct printed artifacts: the customer-facing **Bill** and the kitchen-facing **KOT**. It governs both operational print behavior (when/how many times a KOT reprints, what happens on item cancellation/modification) and print template content (restaurant branding text, tax bifurcation display, duplicate-print watermarking).

**User story.** As an outlet manager, I want to configure exactly what appears on my printed bills and KOTs and how reprints/modifications are handled, so that my restaurant's printed documents are correct, on-brand, and operationally unambiguous for kitchen staff — without any developer involvement or hardcoded print templates.

### B.2 UI Spec

**Group 1 — KOT/Bill print behavior checkboxes** (all default Off unless noted):

| # | Field label | Control | Default |
|---|---|---|---|
| 1 | Print KOT On Print Bill | Checkbox | Off |
| 2 | Consider Non Prepared KOT in Bill | Checkbox | Off |
| 3 | Print Only Modified KOT | Checkbox | Off |
| 4 | Print Only Modified Items in KOT | Checkbox | Off |
| 5 | Print Deleted Items In KOT | Checkbox | Off |
| 6 | Print Deleted Items in separate KOT | Checkbox | Off |
| 7 | Print Cancelled KOT | Checkbox | Off |
| 8 | Print Kot No. on Bill as Token No. | Checkbox | Off |

**Group 2 — Radio groups:**

| # | Field label | Control | Options | Default |
|---|---|---|---|---|
| 9 | Category-wise tax bifurcation | Radio | None / Print CWT (category-wise-tax-bifurcation on bill) | None |
| 10 | Individual item price display mode | Radio | Without backward tax / With backward tax on printed bill | Without backward tax |

**Group 3 — More checkboxes:**

| # | Field label | Control | Default |
|---|---|---|---|
| 11 | Show Backward tax on printed bill | Checkbox | Off |
| 12 | Show Duplicate On a Bill If printed multiple times | Checkbox | Off |
| 13 | Show Duplicate On a Kot If printed multiple times | Checkbox | Off |

**Group 4 — Dropdown:**

| # | Field label | Control | Options / Default | Validation |
|---|---|---|---|---|
| 14 | Highlight order id on bill and KoT | Dropdown | e.g. "None", "Last 4 characters", "Full order ID" (exact enumerated set to be confirmed; screenshot shows "Last 4 characters" selected) | Default assumed "None"; required, single-select |

**Group 5 — "Bill Print Settings" sub-section:**

| # | Field label | Control | Default | Validation |
|---|---|---|---|---|
| 15 | Restaurant Name | Text | — | **Required**; max length 100 |
| 16 | Header Text | Textarea | — | **Required**; max length 500 |
| 17 | Footer Text | Textarea | "Thanks" | Optional (pre-filled default); max length 500 |
| 18 | Message for new customer | Textarea | empty | Optional; max length 500 |
| 19 | Show Restaurant Name | Toggle/checkbox | On | — |
| 20 | Show "Retail Invoice" On Top | Toggle/checkbox | Off | — |
| 21 | Show Sr No Column In Item Listing | Toggle/checkbox | Off | — |
| 22 | Show Assign to Label | Toggle/checkbox | Off | — |

### B.3 Data Model — `outlet_print_settings`

One row per outlet.

```
outlet_print_settings
--------------------------------------------------------------
outlet_id                              BIGINT / UUID   PK, FK -> outlets.id

-- Group 1
print_kot_on_print_bill                BOOLEAN  NOT NULL DEFAULT FALSE
consider_non_prepared_kot_in_bill      BOOLEAN  NOT NULL DEFAULT FALSE
print_only_modified_kot                BOOLEAN  NOT NULL DEFAULT FALSE
print_only_modified_items_in_kot       BOOLEAN  NOT NULL DEFAULT FALSE
print_deleted_items_in_kot             BOOLEAN  NOT NULL DEFAULT FALSE
print_deleted_items_in_separate_kot    BOOLEAN  NOT NULL DEFAULT FALSE
print_cancelled_kot                    BOOLEAN  NOT NULL DEFAULT FALSE
print_kot_no_on_bill_as_token_no       BOOLEAN  NOT NULL DEFAULT FALSE

-- Group 2
tax_bifurcation_mode                   ENUM('NONE','CATEGORY_WISE')  NOT NULL DEFAULT 'NONE'
item_price_backward_tax_display        ENUM('WITHOUT_BACKWARD_TAX','WITH_BACKWARD_TAX')  NOT NULL DEFAULT 'WITHOUT_BACKWARD_TAX'

-- Group 3
show_backward_tax_on_bill              BOOLEAN  NOT NULL DEFAULT FALSE
show_duplicate_on_bill_reprint         BOOLEAN  NOT NULL DEFAULT FALSE
show_duplicate_on_kot_reprint          BOOLEAN  NOT NULL DEFAULT FALSE

-- Group 4
order_id_highlight_mode                ENUM('NONE','LAST_4_CHARACTERS','FULL_ID')  NOT NULL DEFAULT 'NONE'

-- Group 5: Bill Print Settings
restaurant_name                        VARCHAR(100)   NOT NULL
header_text                            TEXT           NOT NULL
footer_text                            TEXT           NOT NULL DEFAULT 'Thanks'
new_customer_message                   TEXT           NULL
show_restaurant_name                   BOOLEAN  NOT NULL DEFAULT TRUE
show_retail_invoice_label              BOOLEAN  NOT NULL DEFAULT FALSE
show_sr_no_column                      BOOLEAN  NOT NULL DEFAULT FALSE
show_assign_to_label                   BOOLEAN  NOT NULL DEFAULT FALSE

settings_version                       BIGINT       NOT NULL DEFAULT 1
updated_by_user_id                     BIGINT / UUID  NOT NULL
updated_at                             TIMESTAMPTZ  NOT NULL DEFAULT now()
created_at                             TIMESTAMPTZ  NOT NULL DEFAULT now()
```

### B.4 Settings Propagation Spec

Identical model to Part A (B.4 mirrors A.4 exactly, applied to `outlet_print_settings`):

1. Cloud admin panel is the canonical write path (DEC-018 recommended direction).
2. Save increments `settings_version`, emits a `print_settings.updated` event to the outlet-server sync channel.
3. Outlet-server pulls the updated row (or detects staleness on poll), updates its local cache, and bumps its own `settings_version`.
4. The local print-rendering engine (running on the outlet-server or the POS terminal, per the sync-architecture doc's deployment model) always renders using its currently cached settings — never calls the cloud directly at print time, so printing continues to work offline.

**Mid-shift change / in-progress orders.** Recommendation, same rationale as A.4: an order's KOT/bill print behavior should follow the settings snapshot captured when the order was **opened** (or, arguably, when each individual print event fires — see open question in B.10 on whether print-time settings or order-open-time settings should govern reprints of an old order). Baseline recommendation for v1: each order stores `print_settings_version_snapshot` at creation; all prints of that order (initial and duplicate) use that snapshot, so a manager changing, say, "Show Backward tax on printed bill" mid-shift does not retroactively alter a bill that's already mid-service, only orders opened after the change.

### B.5 API Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/outlets/{outlet_id}/print-settings` | Fetch current print settings row |
| `PUT /api/outlets/{outlet_id}/print-settings` | Full replace from admin UI save |
| `PATCH /api/outlets/{outlet_id}/print-settings` | Partial update, programmatic/internal use |
| `GET /api/outlets/{outlet_id}/print-settings/history` | Audit/change history: version, changed fields old→new, actor, timestamp |
| `GET /api/outlets/{outlet_id}/print-settings/version` | Lightweight version-check endpoint for outlet-server polling |

Same role restriction as A.5/A.8.

### B.6 Business Logic / Edge Cases — Template-Flag List

The print-rendering engine must never contain hardcoded conditional strings or layout branches keyed to literal outlet identity. Instead, each `outlet_print_settings` column becomes a **template flag** consumed generically by the rendering engine, which selects/suppresses template blocks purely from these flag values. Below is the flag list a rendering engine would consume, with the conditional behavior each drives:

| Template flag (source column) | Effect on rendered output |
|---|---|
| `print_kot_on_print_bill` | When bill print is triggered, engine also emits a KOT print job as a side effect |
| `consider_non_prepared_kot_in_bill` | Bill line-item aggregation includes items from KOTs not yet marked "prepared" |
| `print_only_modified_kot` | On item edit, reprint job is generated only for the KOT(s) containing modified items, not the full KOT set |
| `print_only_modified_items_in_kot` | Within a reprinted KOT, only the changed item rows are rendered, not the full original item list |
| `print_deleted_items_in_kot` | Deleted items remain visible (e.g., struck through) in the KOT render rather than being omitted |
| `print_deleted_items_in_separate_kot` | Deleted items are rendered on a distinct KOT print job rather than inline with the standard KOT |
| `print_cancelled_kot` | A KOT print job is generated even when the underlying order/item is cancelled |
| `print_kot_no_on_bill_as_token_no` | Bill template renders the KOT number in the position/label normally reserved for a token number |
| `tax_bifurcation_mode = CATEGORY_WISE` | Bill template inserts a tax breakdown block segmented by item category; `NONE` omits this block entirely |
| `item_price_backward_tax_display` | Controls whether each line item's unit price is rendered inclusive (`WITH_BACKWARD_TAX`) or exclusive (`WITHOUT_BACKWARD_TAX`) of backward tax |
| `show_backward_tax_on_bill` | Bill template includes/excludes a backward-tax summary line |
| `show_duplicate_on_bill_reprint` | On any bill print beyond the first for a given order, template overlays/prefixes a "DUPLICATE" marker; first print never shows it |
| `show_duplicate_on_kot_reprint` | Same behavior as above, applied to KOT reprints |
| `order_id_highlight_mode` | Controls how the order ID is rendered: suppressed (`NONE`), last 4 characters only, or the full ID, each potentially with distinct visual emphasis (e.g., larger font) |
| `restaurant_name` + `show_restaurant_name` | Header block renders the restaurant name text only when the show-flag is true |
| `header_text` | Rendered verbatim near the top of the bill template |
| `footer_text` | Rendered verbatim at the bottom of the bill template |
| `new_customer_message` | Rendered only for orders flagged as a new customer's first order (requires a customer-history flag on the order, not itself part of this settings table — cross-reference to customer/CRM data) |
| `show_retail_invoice_label` | Bill template renders a "Retail Invoice" label at the top when true |
| `show_sr_no_column` | Item listing table includes a serial-number column when true |
| `show_assign_to_label` | Bill template includes an "Assigned To" label/value (e.g., delivery staff or table attendant) when true |

Reprint counting (needed to drive the two "Show Duplicate" flags) requires a `print_count` (or `bill_print_count` / `kot_print_count`) counter on the order/KOT record itself — not part of `outlet_print_settings` but a dependency this screen's logic relies on; flagged for the order-model doc if not already present there.

### B.7 Admin/Config Dependency (No-Hardcode Compliance)

Every visual/behavioral branch in the bill/KOT print templates — restaurant name and header/footer text, the "Thanks" default footer, whether duplicate markers appear, whether tax bifurcation renders, which order-ID substring is highlighted — is sourced exclusively from `outlet_print_settings` via this admin screen, never embedded as literal text or conditional logic in the print-rendering source. This is the second half (with Part A) of the admin-UI layer that fulfills the project's no-hardcode rule: the rendering engine is a generic template-flag consumer, and this screen is the only place those flags are authored.

### B.8 Permissions

Identical model to A.8: edit (`PUT`/`PATCH`) restricted to `MANAGER`/`OWNER`; cashier role has no write access to print settings, enforced at UI and API layers; history/audit visible to `MANAGER`/`OWNER` and defined auditor roles.

### B.9 Test Plan

1. **Required-field validation**: save rejected when Restaurant Name or Header Text is blank; Footer Text accepted blank (falls back to stored default "Thanks" only at row-creation time, not re-injected on explicit blank save — confirm this behavior with product, see B.10).
2. **Template-flag rendering tests** (render a fixed sample order through the print engine with each flag toggled):
   - `show_backward_tax_on_bill = false` → assert rendered bill output contains no backward-tax line.
   - `show_backward_tax_on_bill = true` → assert the line is present with correct computed value.
   - `tax_bifurcation_mode = NONE` vs `CATEGORY_WISE` → assert presence/absence of the category tax-breakdown block.
   - `show_duplicate_on_bill_reprint = true`, print the same order twice → assert first print has no "DUPLICATE" marker, second print does.
   - `print_kot_no_on_bill_as_token_no = true` → assert bill's token-number field renders the KOT number, not a separately generated token.
   - `order_id_highlight_mode = LAST_4_CHARACTERS` → assert only the last 4 characters of the order ID render in the highlighted position.
3. **KOT modification-flow tests**: item added/edited on an order with `print_only_modified_items_in_kot = true` → reprinted KOT contains only the changed rows; with the flag false → full KOT reprints.
4. **Deleted item tests**: delete an item with `print_deleted_items_in_kot = true` vs `print_deleted_items_in_separate_kot = true` → assert deleted item appears inline (struck through) in the former, and on a distinct print job in the latter.
5. **Settings-versioning/snapshot test**: mirror A.9's test — open an order, capture `print_settings_version_snapshot`, update print settings, reprint the same order, assert it still renders using the original snapshot's flags; a newly opened order after the update uses the new flags.
6. **Permission test**: cashier-role token attempts `PUT` on print settings → expect 403.

### B.10 Open Questions / Flags for Stakeholder

- **Print-time vs. order-open-time settings for reprints.** B.4 recommends snapshotting print settings at order-open time and applying that snapshot to all reprints of that order, mirroring Part A's in-progress-order rule. However, print settings arguably relate more to *formatting* than to *financial calculation*, so a stakeholder may reasonably prefer reprints to always use the *current* settings rather than a stale snapshot (e.g., a corrected restaurant name/header text should probably apply retroactively to reprints, unlike a tax calculation rule). This needs explicit product sign-off before implementation, since it changes the snapshot design in B.6.
- **Footer Text default re-application.** Whether saving the form with Footer Text left blank should persist an empty string (opts the outlet out of any footer) or silently reapply the "Thanks" default is ambiguous from the screenshot and needs clarification.
- **`order_id_highlight_mode` full option set.** Only "Last 4 characters" is confirmed from the screenshot; the complete enumerated list of dropdown options (and whether more granular options like "Last 6 characters" exist) needs to be confirmed against the actual KapMeta source screen before the ENUM in B.3 is finalized.
- **Print-count dependency.** The "Show Duplicate" flags depend on a print-count field on the order/KOT record that lives outside `outlet_print_settings`; confirm this field exists (or gets added) in the order-model schema, since this doc's data model only covers the settings table itself.
- **Local vs. cloud-only editing.** Same open question as Part A (A.10): whether print settings may ever be edited from a local outlet-server admin surface, or must remain strictly cloud-admin-edited per DEC-018, needs stakeholder confirmation before the outlet-server admin surface (if any) is scoped.
