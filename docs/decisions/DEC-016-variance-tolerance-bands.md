# DEC-016: Receipt & Price Variance Tolerance Bands

**ID:** DEC-016
**Status:** OPEN
**Owner:** Finance + Ops
**Raised by:** `REQ-PUR` ([`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Over-Receipt, §Price Variance Detection, §Three-Way Match)
**Due:** Before R2 build start
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md)
**Traced by:** Three-way match, receipt hold behaviour, `gr_items` variance fields, price variance report

---

## Question

What tolerance values govern over-receipt, purchase price variance, and invoice-to-PO price matching — and at which band does the system flag versus hold?

## Context

Three distinct tolerances are in play. They are grouped in one packet because Finance and Ops must weigh them against the same thing — how often a hold interrupts a delivery — but they are separate numbers and can be signed separately.

Placeholders in the spec, **explicitly not agreed**:

| Tolerance | Placeholder | Behaviour |
|-----------|-------------|-----------|
| Over-receipt | 5% or one pack unit, whichever is greater | Within: accept + flag. Above: HOLD pending supervisor approval before stock posts |
| Price variance at receipt (vs `last_purchase_price`) | ≤±5% silent · ±5-15% flag + daily report · >±15% HOLD | Compared per base UOM after conversion |
| Invoice vs PO unit price (three-way match) | ±2% or a fixed minor-unit amount | Mismatch → EXCEPTION queue, human resolution, nothing auto-adjusts |
| Invoice vs GRN quantity | 0 — exact match | Non-negotiable per spec |

Committed and out of scope here: variance is computed and **stored on the receipt line**, never recomputed later from a moving baseline; a first-ever purchase has no baseline and is not flagged; quality-rejected goods never enter stock at all.

The spec already flags the failure mode that matters most: **volatile commodities legitimately swing far beyond 15%.** Produce and seafood will trip a 15% hold routinely. If they do, the hold is acknowledged reflexively within a week and the control is dead — worse than absent, because it produces an audit trail of meaningless acknowledgements. A per-ingredient tolerance override is therefore not optional; the decision is what the *default* is and who may set overrides.

**This is a control-environment decision.** Tight tolerances mean deliveries sit on hold while a supervisor is found, which in a restaurant means goods on a loading bay in the heat. Loose tolerances mean systematic vendor over-billing goes unremarked. Neither extreme is safe, and the honest calibration input — how much price movement the business currently sees per category — sits with Ops and Finance, not engineering.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Placeholders adopted as-is, plus mandatory per-ingredient overrides for volatile categories set before go-live.** Global defaults 5% / 5-15% / ±2%, with a curated override list. | ~6-9 person-days for config + override resolution + report | Requires someone to curate the volatile list up front. If that curation does not happen, this degrades into the alert-fatigue failure described above | Yes — all values are configuration; stored variances stay explainable because the value is stored per line |
| B | **Category-based defaults instead of one global default.** Tolerance attaches to an ingredient category (produce / seafood / dry goods / packaging), per-ingredient override still available. | ~10-14 person-days; needs a category dimension with tolerance attributes | More faithful to reality and less curation-dependent than A. Costs a schema dimension and a configuration surface that must be maintained as the ingredient list grows | Yes; the category dimension is a schema addition |
| C | **Observe-only for the first period.** All bands flag and report; nothing holds. Convert to holds after 8-12 weeks of real variance data. | ~5-7 person-days; the hold path is built but disabled | Honest about not knowing the numbers yet, and produces the distribution needed to set them properly. The cost is a defined window with a detection-only control — over-billing in that window is caught by report, not prevented at the door | Yes — this is explicitly a staged rollout |
| D | **Defer entirely; accept all receipts, no variance detection in R2.** | Zero now | Price creep and over-billing are invisible. Food cost drifts and the cause is not attributable. Three-way match becomes a rubber stamp, which is the same as not having it | Yes, but the period is permanently unanalysed |

## Impact If Wrong

- **Price hold band too tight:** the seafood delivery holds every Tuesday. Within a fortnight the supervisor acknowledges without reading, and the one genuine 40% overcharge in the year is acknowledged along with everything else. The audit trail then actively misleads — it shows a control operating.
- **Price hold band too loose:** a vendor raises unit price 12% and it never surfaces above the flag threshold. Across a year on a high-volume ingredient that is a material food-cost movement attributed to nothing, and the moving average cost absorbs it silently, so menu margin reports show the erosion without showing the cause.
- **Over-receipt tolerance too tight:** goods physically present are held out of stock pending approval while the kitchen needs them. Staff take the stock physically and the system posts it later, or not at all — the ledger and the walk-in disagree, which is exactly the failure the inventory module exists to prevent.
- **Over-receipt tolerance too loose:** a vendor systematically over-delivers 8% and invoices for it. It is accepted and paid, every time.
- **Invoice price tolerance non-zero on quantity:** the spec sets quantity match at exactly 0 for good reason. If that is relaxed "for convenience", under-billed and over-billed lines net out across an invoice and the exception queue stops surfacing them.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Purchase (R2) | Receipt hold behaviour, tolerance configuration schema, override resolution logic | 3 |
| Purchase | Three-way match engine and exception classification | 2 |
| Reporting | Daily price variance report and its thresholds | 1 |
| Inventory | Moving average cost update path depends on which receipts post and when | 1 |

*Purchase is R2 and blocked in full on DEC-003; this becomes critical-path when DEC-003 closes.*

## Recommendation

**Option C first, converting to Option B.** Ship R2 with the full variance machinery in observe-only mode, collect 8-12 weeks of real distribution, then set category-based bands and enable holds.

Reasoning:

- Nobody in the room currently knows what normal price movement looks like per category for this business. Signing numbers today means signing guesses, and the specific failure mode of guessed-tight tolerances — trained-away alerts — is one the spec already anticipates and that is very hard to recover from once the habit forms.
- The build cost of observe-only is nearly the same as the full control; the hold path is written and gated by configuration, not omitted. This is a rollout decision, not a scope reduction.
- Category-based defaults (B) rather than global-plus-override-list (A) because A depends on somebody remembering to curate the volatile list, and that curation is exactly the kind of task that does not happen.
- Keep **invoice-vs-GRN quantity at exactly 0** regardless of what is decided elsewhere. That one is not a tolerance question; a quantity discrepancy is a fact, not a variance.
- If the business is unwilling to run a detection-only window, Option A with the volatile list curated **as a go-live gate** is the fallback — but then the curation must be a checklist item with a named owner, not an intention.

Ops owns the operational feasibility (can a hold actually be cleared at 6 a.m.?); Finance owns the control strength. Both signatures are needed.

---

## Decision

**Decided:** Option C first (observe-only, full variance machinery built but holds disabled), converting to Option B (category-based bands) after 8-12 weeks of real distribution data. Invoice-vs-GRN quantity variance stays at exactly 0 regardless.
**Rationale:** Packet recommendation. Build cost of observe-only is nearly identical to the full control; hold path is gated by config, not omitted, so this is a rollout decision not a scope cut. Category-based (B) over global-plus-override-list (A) because curated override lists don't get maintained.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Sets how often deliveries are interrupted, which is an operational cost paid daily at every outlet, not a system setting.
- Variance values are stored on the receipt line at posting time. Retuning bands later does not restate historical variances — deliberately — so reports spanning a band change must state which regime applied.
- If category-based, adds a tolerance-bearing category dimension to the ingredient master that must be maintained for every new ingredient, forever.
- An observe-only period is a defined window in which over-billing is detected but not prevented. That window must be stated explicitly to Finance and to the auditor, not left implicit.

## Follow-Up

- [ ] Historical price-movement data by category requested from Ops/Finance
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Over-Receipt, §Price Variance Detection, §Vendor Invoice Three-Way Match
- [ ] If observe-only: the conversion date and the review that sets final bands are scheduled at the same time as the decision, with a named owner
- [ ] Test written proving UOM conversion happens before comparison (per-case vs per-kg comparison is the documented false-alarm source)
- [ ] Test written proving invoice-vs-GRN quantity tolerance is exactly zero
- [ ] Alert acknowledgement rate added to the metric set — a rate near 100% means the band is wrong
- [ ] Affected teams notified: Finance, Ops, Engineering
- [ ] Estimate re-baselined if scope changed
