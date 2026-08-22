# Feature Build Plan — Tax Listing / Tax Master Screen

**Project:** Kapmeta (PetPooja POS clone)
**Screen:** Tax Master (outlet-level tax configuration list + edit)
**Document status:** Draft build plan, implementation-ready pending stakeholder answers flagged in Section 11
**Related docs:** DB schema draft (`taxes` table), API contracts doc, business-logic-rules doc (billing calc order of operations), decision-register addendum (DEC-013..024, esp. DEC-017)

---

## 1. Purpose & User Story

### 1.1 Business context

Every GST-registered Indian restaurant is legally required to charge Central GST (CGST) and State GST (SGST) on food and beverage sales (or IGST for inter-state, rare for a single-outlet dine-in business). Standard restaurant GST rate is 5% total, split evenly as 2.5% CGST + 2.5% SGST — this matches the captured screenshot exactly. Outlets serving liquor must additionally charge state VAT on alcohol (VAT is outside GST), and some states/categories apply a cess. The Tax Master screen is the single place an outlet owner or manager configures which taxes apply, at what rate, and how they are calculated — without any of this being hardcoded in the application (see Section 8).

A second, POS-specific wrinkle: the *same* legal tax (CGST/SGST) is frequently configured **differently depending on the order channel**. Menu prices shown to a walk-in dine-in customer are typically tax-inclusive ("backward" tax, back-calculated out of a fixed menu price), while prices pushed to aggregator/online channels (Zomato, Swiggy, in-house online ordering) are typically tax-exclusive ("forward" tax, added on top of a base price), because the aggregator contract, commission calculation, and price-parity rules often require a clean base price with tax itemized separately. This is exactly the pattern in the captured data: CGST/SGST (dine-in, Backward Tax) and CGST [Online]/SGST [Online] (Forward Tax) coexisting for one outlet.

### 1.2 User story

> As an outlet owner/manager, I want to view and edit the tax rules applied to my menu, split by tax type (CGST/SGST/VAT/cess) and by whether the tax is back-calculated from an inclusive price or added on top of an exclusive price, so that every bill — dine-in, pickup, delivery, or online — computes the legally correct tax amount and the correct customer-facing total, and so that when government rates change I can update my configuration without needing a code deployment.

### 1.3 Dine-in vs online — why it matters operationally

- **Dine-in / walk-in (typically Backward Tax):** the printed menu price (e.g., "Butter Chicken — ₹300") is what the customer expects to pay approximately, inclusive of tax. The POS must back-calculate the pre-tax base and the tax component from that inclusive price.
- **Online / aggregator (typically Forward Tax):** the price sent to the aggregator API is a base price; GST is computed and added on top, and the aggregator (or Kapmeta's own online storefront) displays base + tax breakup + total separately, because aggregators need the clean base price for commission math and for price-parity audits against the in-restaurant price.

This is why the screen must support **per-channel tax configuration**, not a single outlet-wide toggle — see Section 7 for the concrete recommendation resolving DEC-017.

---

## 2. UI Spec

### 2.1 Tax Listing table (as captured)

| Column | Source field | Notes |
|---|---|---|
| Tax Title | `title` | e.g. "CGST", "SGST", "CGST [Online]", "SGST [Online]" |
| Tax Type | `tax_type` | "Backward Tax" / "Forward Tax" — display label mapped from `backward`/`forward` |
| Type | `calc_type` | Calculation method — "Percentage" observed; schema must also support "Flat" per business-logic-rules doc |
| Amount | `rate` | Numeric, e.g. 2.5 — unit depends on `calc_type` (% or ₹) |
| Action | — | Edit (pencil) icon per row |

Additional columns to add beyond what was captured, for completeness and to support the data model in Section 4:

| Column (proposed, not observed) | Rationale |
|---|---|
| Channel | Shows dine-in / pickup / delivery / online / all — currently implied only by the "[Online]" suffix in the title, which is a display-hack, not real data. The table should show this explicitly once `channel_scope` exists. |
| Status (Active/Inactive) | Needed once soft-deactivation exists (Section 4); currently all 4 rows appear active with no visible toggle. |
| Effective From | Needed once versioning exists (Section 5); shows the date the currently-displayed rate became active. |

**Flag:** the screenshot shows no Add button, no Delete/deactivate action, and no filter/search control. Two possibilities: (a) these controls exist off-screen (above the table, in a header row not captured) or (b) PetPooja intentionally fixes the tax structure to a small government-tax set per outlet and only allows editing the rate/type of existing rows. This needs a second screen capture including the full header before build. Treated as **open question** — see Section 11.

### 2.2 Edit modal (triggered by pencil icon)

Fields, based on the columns present plus fields required to make the row functionally complete:

| Field | Control | Validation |
|---|---|---|
| Tax Title | Text input | Required, max ~50 chars, unique per (outlet, channel_scope) pair |
| Tax Type | Dropdown: Backward Tax / Forward Tax | Required |
| Calculation Method | Dropdown: Percentage / Flat | Required |
| Rate / Amount | Numeric input | Required; if Percentage, 0–100 range with decimals (e.g. 2.5); if Flat, ≥ 0 currency value |
| Channel Scope | Multi-select or dropdown: Dine-in / Pickup / Delivery / Online (Aggregator) / All | Required — this is the field that makes per-channel Backward/Forward coexistence explicit rather than implied by title suffix (see Section 7) |
| Active | Toggle | Default true; deactivating hides the tax from new bills without deleting history |
| Effective From | Date picker | Required; defaults to "today"; see Section 5 — this creates a **new version**, it does not overwrite history |

Save behavior: per Section 5, saving an edit to rate/type does not mutate the existing row in place — it closes out the current version (`effective_to` = new date) and inserts a new version row effective from the chosen date. Editing purely cosmetic fields (title casing, display order) may be an in-place update; editing anything that affects billing math (rate, calc_type, tax_type, channel_scope) must always version.

### 2.3 Add New Tax flow (inferred, NOT confirmed by capture)

Not observed in the screenshot. Proposed for completeness, flagged as inferred:

1. "+ Add Tax" button, presumably top-right of the table header (standard PetPooja/Kapmeta pattern seen on other master-data screens in this project).
2. Opens the same modal as Section 2.2 in "create" mode, all fields empty/defaulted.
3. On save, creates a new `taxes` row (version 1) scoped to the current outlet.
4. No hard cap enforced in UI, though the business default is expected to remain 2 (CGST+SGST) × 2 (dine-in-backward, online-forward) = 4 rows for a typical Indian GST restaurant, plus optional VAT/cess rows for liquor-serving outlets.

**This entire subsection must be validated against a real "Add Tax" capture before implementation begins.**

---

## 3. Backward vs Forward Tax — Precise Arithmetic Definition

**Flag: the definitions below are the standard/conventional POS interpretation of "backward" vs "forward" tax and match the observed pattern (dine-in inclusive pricing, online exclusive pricing) but must be confirmed with compliance/product before being treated as final, per DEC-017.**

### 3.1 Forward Tax (tax-exclusive, "add on top")

Base price is fixed; tax is calculated on top of it and added to produce the customer total.

```
tax_amount  = base_price × (rate / 100)
total_price = base_price + tax_amount
```

### 3.2 Backward Tax (tax-inclusive, "back-calculated")

The menu/display price is fixed and is treated as **already including** all applicable taxes. The base (pre-tax) price and the tax components are derived by dividing the inclusive price by (1 + total rate).

```
total_rate   = sum of all applicable tax rates (e.g. CGST% + SGST%)
base_price   = inclusive_price / (1 + total_rate/100)
tax_amount   = inclusive_price − base_price
             (or equivalently: base_price × total_rate/100)
```

Each individual tax line (CGST, SGST) is then apportioned pro-rata out of `tax_amount` according to its own rate's share of `total_rate`.

### 3.3 Worked example — same ₹100 item, CGST 2.5% + SGST 2.5% (total 5%)

#### Forward Tax scenario (e.g., online channel)

Menu/base price entered by the outlet: **₹100.00** (tax-exclusive)

| Step | Calculation | Result |
|---|---|---|
| Base price | given | ₹100.00 |
| CGST (2.5% of base) | 100 × 0.025 | ₹2.50 |
| SGST (2.5% of base) | 100 × 0.025 | ₹2.50 |
| Total tax | 2.50 + 2.50 | ₹5.00 |
| **Customer-facing total** | 100 + 5.00 | **₹105.00** |

The customer sees a bill itemized as: Item ₹100.00, CGST ₹2.50, SGST ₹2.50, Total ₹105.00.

#### Backward Tax scenario (e.g., dine-in channel)

Menu price shown to the customer: **₹100.00** (tax-inclusive — "what you see is what you pay, tax already baked in")

| Step | Calculation | Result |
|---|---|---|
| Inclusive price | given | ₹100.00 |
| Total tax rate | 2.5% + 2.5% | 5% |
| Base (pre-tax) price | 100 / 1.05 | ₹95.2381 (round as per outlet rounding rule, e.g. ₹95.24) |
| Total tax amount | 100 − 95.2381 | ₹4.7619 (≈ ₹4.76) |
| CGST share (half of total tax, since CGST rate = SGST rate) | 4.7619 / 2 | ₹2.3810 (≈ ₹2.38) |
| SGST share | 4.7619 / 2 | ₹2.3810 (≈ ₹2.38) |
| **Customer-facing total** | unchanged | **₹100.00** |

The customer sees a bill itemized as: Item (base) ₹95.24, CGST ₹2.38, SGST ₹2.38, Total ₹100.00 — the same ₹100 the menu advertised, but only ₹95.24 of that is actual sale value; ₹4.76 is tax that was always embedded in the price.

#### Side-by-side takeaway

| | Forward Tax | Backward Tax |
|---|---|---|
| What outlet configures as "the price" | Base (pre-tax) price | Final inclusive price |
| Customer pays | Base + tax = **₹105.00** | The advertised price = **₹100.00** |
| Tax amount collected on a ₹100 configured price | ₹5.00 | ₹4.76 |
| Typical channel | Online/aggregator (base price feeds commission calc) | Dine-in (menu price is the promise to the customer) |

This difference is exactly why the same nominal "₹100 item, 2.5%+2.5%" produces a different real-world price and a different tax remittance depending on tax mode — getting the mode wrong for a channel either overcharges the customer (applying Forward math to a price meant as inclusive) or under-collects tax relative to what should have been remitted (applying Backward math to a price meant as exclusive). This is billing-critical and must be unit-tested exactly as shown above (Section 10).

---

## 4. Data Model

Table: `taxes`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID / bigint PK | |
| `outlet_id` | FK → outlets | Tax config is per-outlet, not global — different outlets may be in different states/GST jurisdictions |
| `title` | varchar(50) | e.g. "CGST", "SGST", "VAT", "Cess" — kept channel-agnostic; do NOT bake "[Online]" into the title once `channel_scope` exists (see 7.1) |
| `tax_type` | enum(`backward`, `forward`) | Per-row, per-channel — see Section 7 recommendation on DEC-017 |
| `calc_type` | enum(`percentage`, `flat`) | |
| `rate` | decimal(6,3) | Supports rates like 2.5, and flat amounts if `calc_type = flat` |
| `channel_scope` | enum(`dine_in`, `pickup`, `delivery`, `online`, `all`) | Determines which order channels this row applies to; `all` is a convenience value equivalent to matching every channel if no more-specific row exists for that channel |
| `is_online_variant` | boolean | Links a dine-in row (e.g. CGST) to its online counterpart (CGST [Online]) for display grouping/reporting purposes; not required for calc logic once `channel_scope` is authoritative, but useful for UI grouping and for migrating the legacy title-suffix pattern |
| `linked_tax_id` | FK → taxes.id, nullable | Explicit pairing pointer (alternative/complement to `is_online_variant`) so CGST(dine-in) and CGST(online) are provably "the same tax, different channel config" for reporting roll-ups |
| `is_active` | boolean | Soft-deactivation; inactive taxes are excluded from new order tax resolution but retained for historical reporting |
| `effective_from` | date | Start of validity window for this version of the row — see Section 5 |
| `effective_to` | date, nullable | End of validity window; NULL = currently active version |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `created_by` | FK → users | Audit trail — who changed a tax rate (compliance-sensitive, see Section 9) |

Indexes: `(outlet_id, channel_scope, is_active)` for the order-time lookup; `(outlet_id, title, effective_from)` for versioning queries.

---

## 5. Tax-Rate Versioning Spec

### 5.1 Why overwrite-in-place is unacceptable

GST rates are set by government notification and can change (the restaurant industry rate itself has changed by law in the past, e.g. the 2017 GST rollout and the 2018 rate revision from 18% to 5% for most restaurants). If the `taxes` table only ever stores the current rate and an edit overwrites it, every historical order's reported tax amount recalculates to today's rate whenever a report is regenerated — silently corrupting historical GST filings and financial reports. The taxes table must be **effective-dated / append-versioned**, matching the general pattern the business-logic-rules doc uses for other rate-bearing config.

### 5.2 Versioning model

- Each edit that changes billing-relevant fields (`rate`, `calc_type`, `tax_type`, `channel_scope`) creates a **new row** with a new `effective_from` date, and sets `effective_to` on the previous version to the day before the new version's `effective_from`.
- The `(title, outlet_id, channel_scope)` triple identifies a logical tax across its version history; `id` identifies one specific version.
- Order-time tax resolution (Section 6, `resolve-applicable-tax-for-order`) always queries by `order_date` falling within `[effective_from, effective_to or infinity)`.
- Orders store the **resolved tax rate and tax_type actually applied at billing time** directly on the order/order-line-item record (denormalized snapshot), not just a foreign key to the current `taxes` row — this is a defense-in-depth measure so that even if versioning logic has a bug, historical bills remain immutable and auditable independent of the taxes table's current state.

### 5.3 Worked example — rate change from 2.5% to 3% (CGST, dine-in, Backward Tax)

Suppose a government notification raises CGST from 2.5% to 3% (SGST similarly, for illustration held constant at 2.5% here for simplicity — in reality both legs would typically change together) effective **2026-09-01**.

| taxes row | title | rate | effective_from | effective_to |
|---|---|---|---|---|
| v1 (existing, closed out) | CGST | 2.5 | 2026-01-01 | 2026-08-31 |
| v2 (new, current) | CGST | 3.0 | 2026-09-01 | NULL |

A report run on **2026-09-15** covering **2026-08-15 to 2026-09-15** (spanning the change) must show:

- Orders dated 2026-08-15 through 2026-08-31: CGST computed at **2.5%** (each such order's line item was already snapshotted at 2.5% at billing time per 5.2, and even a re-derivation via `resolve-applicable-tax-for-order(order_date)` for those dates correctly resolves to v1 because 2026-08-20, e.g., falls within v1's `[2026-01-01, 2026-08-31]` window).
- Orders dated 2026-09-01 onward: CGST computed at **3.0%**, resolving to v2 whose window is `[2026-09-01, NULL]`.
- The report's tax summary total is the sum of the two sub-periods at their respective rates — never a single blended rate applied across the whole range, and never today's (2026-09-15's) rate of 3.0% misapplied retroactively to the August orders.

This is the concrete correctness bar: **editing the Tax Master screen on 2026-09-01 must never change the computed tax on an order billed on 2026-08-20.**

---

## 6. API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/outlets/{outletId}/taxes` | GET | List current (active, latest-version) taxes for the Tax Listing table. Supports `?include_inactive=true` and `?as_of=DATE` for viewing historical/future-dated config. |
| `/api/outlets/{outletId}/taxes/{taxId}/history` | GET | Full version history of one logical tax (all rows sharing the same title/channel_scope lineage) — for an audit/history view. |
| `/api/outlets/{outletId}/taxes` | POST | Create a brand-new tax (Section 2.3 Add flow). Creates version 1. |
| `/api/outlets/{outletId}/taxes/{taxId}` | PUT/PATCH | Edit a tax. If billing-relevant fields changed, implemented server-side as "close current version + insert new version" per Section 5.2, not a raw UPDATE. Returns the new version's id. |
| `/api/outlets/{outletId}/taxes/{taxId}/deactivate` | POST | Soft-deactivate (sets `is_active = false`, `effective_to = today`) rather than DELETE — preserves history. |
| `/api/outlets/{outletId}/taxes/resolve` | GET | **Billing engine's lookup.** Params: `outlet_id`, `channel` (dine_in/pickup/delivery/online), `order_date`. Returns the list of applicable active tax rows (rate, tax_type, calc_type) for that channel at that date, per Section 5.2/5.3 window matching. This is the endpoint the checkout/billing-calc flow calls — it must never be bypassed by billing code reading `taxes` directly, to keep the versioning window logic in one place. |

All write endpoints require the elevated permission described in Section 9 and must write `created_by` for audit.

---

## 7. Business Logic / Edge Cases

### 7.1 Resolving DEC-017 — recommended model

**DEC-017 asks:** is Backward vs Forward tax mode a single outlet-wide either/or setting, or can it coexist per channel? The evidence conflicts: the outlet_billing_settings screen's helper text ("Ignore this settings if you are using forward tax configuration for your outlet") implies a single outlet-wide either/or toggle, while the Tax Master screen shows both modes active simultaneously for one outlet (CGST/SGST as Backward, CGST[Online]/SGST[Online] as Forward).

**Recommendation:** treat `tax_type` (backward/forward) as a **per-row, per-`channel_scope` property**, not an outlet-wide global. Concretely:

- Each `taxes` row declares its own `tax_type` AND its own `channel_scope`.
- The order-time resolver (`resolve-applicable-tax-for-order`) filters candidate tax rows by matching `channel_scope` to the order's channel, then applies whatever `tax_type` those matched rows carry.
- A dine-in order therefore automatically picks up the Backward-tax CGST/SGST rows; an online order automatically picks up the Forward-tax CGST[Online]/SGST[Online] rows — with **zero special-casing in the billing engine**, purely a data-driven lookup.

**Why this fits the observed evidence better than a single toggle:** the Tax Master screen — which is the authoritative, per-tax-row configuration surface — plainly shows four simultaneously active rows spanning both modes for one outlet. A single outlet-wide toggle could not produce that state. The `outlet_billing_settings` helper text is most plausibly a **legacy/simplified-mode hint** aimed at outlets that only ever configured one channel (e.g., dine-in-only restaurants with no online presence, for whom the outlet-level setting is the only tax config they ever touch, making the Tax Master per-row granularity moot in practice) — not a hard architectural constraint. **This interpretation must still be confirmed with product/compliance before shipping**, because if the outlet_billing_settings toggle is in fact enforced server-side as a hard either/or gate elsewhere in the codebase, the per-row model proposed here would conflict with it and the two settings surfaces would need to be reconciled (most likely by deprecating the outlet-level toggle in favor of Tax Master's per-row granularity, with a migration that backfills the toggle's historical intent into `channel_scope`/`tax_type` values).

### 7.2 Tax rate changes mid-order

If a rate change's `effective_from` falls between an order's creation time and its final billing/settlement time (e.g., an order opened at 23:55 the day before a rate change and closed at 00:05 after), the resolver must key off a single canonical timestamp — recommend **order creation time** (when the KOT/order was first punched), not settlement time, for consistency with how menu prices are typically locked at order-open. This should be confirmed as a business rule and documented as DEC (new) if not already covered by an existing decision register entry; flagged in Section 11.

### 7.3 Non-GST tax types (VAT, cess) — extensibility

The schema's `title` field is free text and `tax_type`/`calc_type`/`channel_scope` are generic enums, so VAT (for liquor-serving outlets, often a flat state-set percentage separate from GST) and cess (e.g., certain sin-good surcharges) fit the existing model without schema changes — they are simply additional `taxes` rows with an appropriate `channel_scope` (VAT typically applies uniformly regardless of channel, so `channel_scope = all`) and whichever `tax_type` the outlet's liquor pricing convention uses (commonly Backward, since bar menu prices are usually inclusive, but this varies by state and outlet and should not be assumed). No architectural change is required for v1 to support this; it is purely a matter of whether the outlet has such rows configured. Confirm with stakeholders whether V1 launch scope requires VAT/cess support or whether it is GST-only for the initial release (Section 11).

### 7.4 Deactivating a tax in use

Deactivating a tax row (`is_active = false`) must not retroactively affect past orders (their snapshot values, per 5.2, are already fixed) but must immediately remove it from the resolver's candidate set for new orders from that point forward. If deactivating a row leaves a channel with zero matching tax rows, the UI should warn the manager ("Online orders will be billed tax-free until a Forward Tax rule is configured for that channel") rather than silently allowing zero-tax billing, since that is very likely a configuration mistake with compliance consequences.

---

## 8. Admin/Config Dependency

Per project rule (CLAUDE.md): tax rates and tax rules are tenant/business data and must never be hardcoded in application source. The Tax Master screen **is** the required admin UI satisfying this rule for taxes specifically — it is the only sanctioned way tax rates, calc methods, tax modes, and channel scoping enter the system, backed entirely by the `taxes` table described in Section 4. No billing code should contain literal rate constants (e.g., `0.025`) anywhere; all tax figures must flow through `resolve-applicable-tax-for-order` (Section 6). This screen should be called out explicitly in any compliance/audit documentation as evidence of the no-hardcode rule being satisfied for GST/VAT/cess.

---

## 9. Permissions

- Tax configuration is compliance-sensitive: an incorrect rate or mode directly affects legally-required tax remittance and customer-facing pricing.
- Recommend restricting all tax **write** operations (create, edit, deactivate) to roles: **Owner**, **Manager**, and **Accountant** (or equivalent finance role if the role model distinguishes one) — not general staff/cashier roles.
- Recommend the Tax Listing (read-only view) be visible to Manager+ roles as well, so front-of-house managers can verify what's configured without being able to change it, but this should be confirmed against the project's existing role/permission matrix doc rather than invented fresh here.
- All writes must log `created_by` (Section 4) and ideally emit an audit-log event, given GST compliance implications — recommend cross-referencing with any existing audit-logging feature doc for this project rather than building a bespoke audit trail just for taxes.
- Given the severity of a mis-set tax rate (either overcharging customers or under-remitting legally owed tax), consider requiring a confirmation step ("Are you sure? This changes the tax rate applied to all new bills from [effective date]") on save — a UX safeguard, not a hard requirement, flagged for product's judgment.

---

## 10. Test Plan

1. **Golden arithmetic test — Forward Tax:** ₹100 base, CGST 2.5% + SGST 2.5% → expect CGST ₹2.50, SGST ₹2.50, total ₹105.00 (Section 3.3).
2. **Golden arithmetic test — Backward Tax:** ₹100 inclusive price, CGST 2.5% + SGST 2.5% → expect base ₹95.24 (rounded), CGST ₹2.38, SGST ₹2.38, total ₹100.00 (Section 3.3). Include a rounding-policy test asserting the outlet's configured rounding rule (e.g., round-half-up to 2 decimals) is applied consistently so CGST+SGST+base reconcile exactly to the inclusive total with no stray paisa.
3. **Versioning-across-report-period test:** seed a tax with two versions (2.5% effective 2026-01-01–2026-08-31, 3.0% effective 2026-09-01 onward, per Section 5.3); generate a tax summary report spanning 2026-08-15 to 2026-09-15; assert orders before 2026-09-01 are computed at 2.5% and orders on/after are computed at 3.0%, and that editing the tax again on the report-run date does not change either sub-period's already-billed figures.
4. **Channel-scope resolution test:** configure CGST/SGST as Backward+dine_in and CGST[Online]/SGST[Online] as Forward+online for one outlet; place a dine-in order and assert the resolver returns the Backward pair; place an online order and assert the resolver returns the Forward pair; assert no cross-contamination (a dine-in order never picks up the Forward/online rows and vice versa).
5. **Zero-match channel test:** deactivate all tax rows for the `pickup` channel; place a pickup order; assert the system either blocks checkout with a configuration warning or bills tax-free with a visible flag (per whichever behavior product confirms in 7.4) rather than silently defaulting to some other channel's rate.
6. **Effective-date boundary test:** create a new tax version with `effective_from` = tomorrow; assert an order placed today still resolves to the current (not the future) version; assert an order placed tomorrow resolves to the new version — validates the versioning window's inclusive/exclusive boundary handling.
7. **Multi-tax-line rounding reconciliation test:** with 3+ simultaneous tax rows (e.g., CGST+SGST+cess) in Backward mode, assert the sum of all apportioned tax components plus base price reconciles exactly to the inclusive price (no rounding drift across multiple lines).
8. **Permission test:** assert a cashier-role user receives 403 on all tax write endpoints; assert Owner/Manager/Accountant succeed.
9. **Non-GST tax type test (if in v1 scope):** configure a VAT row with `channel_scope = all`; assert it applies uniformly to dine-in, pickup, delivery, and online orders alike, alongside whatever GST rows also match.

---

## 11. Open Questions / Flags for Stakeholder

1. **DEC-017 (full ambiguity, unresolved):** Is Backward vs Forward tax mode meant by the vendor/product to be a single outlet-wide either/or setting (per the `outlet_billing_settings` helper text) or a per-tax-row/per-channel setting (per the Tax Master screen's simultaneous Backward+Forward rows)? Section 7.1 proposes a resolution (per-row/per-channel) and a theory for why the two surfaces appear to conflict, but this needs explicit confirmation from whoever owns the PetPooja behavioral parity requirement, and/or compliance sign-off if Kapmeta is diverging from PetPooja's actual (possibly buggy or legacy) behavior rather than replicating it.
2. **Add/Delete tax rows:** the captured screenshot shows no Add button and no delete/deactivate action — need a second screen capture (full header, and an attempt to trigger add/delete in the reference product) to confirm whether Kapmeta should build unrestricted add/delete or a fixed 4-row (or N-row) government-tax structure with only rate/type editable.
3. **Non-GST tax types in v1:** does the initial release need to support VAT/cess (liquor-serving outlets), or is v1 scoped to GST-only (CGST/SGST) with VAT/cess deferred to a later milestone? Section 7.3 shows the schema already supports it at no extra cost, but UI/QA scope should be confirmed.
4. **Order-time tax-lock instant:** confirm whether the canonical moment for resolving "which tax version applies" to an order is order-creation time (KOT punch) or bill-settlement time (Section 7.2) — affects orders that straddle a rate-change boundary.
5. **Rounding policy:** confirm the outlet-level (or system-level) rounding rule used in Backward-tax base/tax apportionment (round-half-up, round-half-to-even, truncate) so golden tests in Section 10 match the intended production behavior exactly, and confirm whether rounding is applied per-line or only at the final bill total.
6. **Interaction with outlet_billing_settings screen:** once DEC-017 is resolved, determine whether the `outlet_billing_settings` toggle should be deprecated/hidden in favor of Tax Master's per-row granularity, kept as a bulk-set convenience ("set all dine-in rows to Backward at once"), or removed entirely — needs a decision from whoever owns that screen's build plan.
