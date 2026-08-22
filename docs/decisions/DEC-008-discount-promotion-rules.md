# DEC-008: Discount & Promotion Rules

**ID:** DEC-008
**Status:** OPEN
**Owner:** Product Owner + Finance
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-008 · [`schema-reference.md`](../05-database/schema-reference.md) `discounts` (Pricing & Tax group)
**Traced by:** `REQ-ORD` pricing, `DB-TBL-DISCOUNTS`, `WF-ORD-01` step 4

---

## Question

What discount expressiveness must the R1 pricing engine support, and — separately and non-negotiably — is tax computed on the pre-discount or post-discount amount?

## Context

- `discounts` exists as a single table in the Pricing & Tax group with no defined structure. Whether that is one table or a rules engine depends entirely on the expressiveness answer.
- **The two halves of this question have very different characters.** Expressiveness is a product scope call with a recoverable failure mode. The tax base is a Finance/statutory call with an unrecoverable one. They are bundled here because they are decided by the same two owners in the same review, but they should be answered separately and the second should not be traded away for the first.
- The expressiveness ladder, roughly in cost order:
  1. Manual line or bill discount, percentage or fixed amount, entered by an authorised user with a reason.
  2. Pre-configured discount definitions (staff meal, happy hour, loyalty tier) selectable at the till.
  3. Coupon codes with validity windows, usage limits and per-customer caps.
  4. Conditional promotions — buy-X-get-Y, combo/meal pricing, spend thresholds, time-of-day and day-of-week rules.
  5. Stacking, priority and exclusivity rules across all of the above.
  Each rung is a materially different engine. Level 5 is where a pricing engine stops being a calculation and becomes a rules system with its own semantics, and it is the rung most often assumed for free.
- Constraints already committed:
  - Money is `BIGINT` minor units (rule 1). Percentage discounts produce fractions and therefore need an explicit rounding rule, stated as integer arithmetic — the same discipline required in [DEC-004](DEC-004-tax-calculation-rules.md).
  - Pricing and discount logic lives in one place ([`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4). Reports must not recompute discounts.
  - Pricing/discount changes require unit tests with boundary cases and a Finance reviewer (§5).
  - Privileged mutations write an audit row in the same transaction (rule 7). A manual discount is a privileged mutation — it is money given away by a named person — so it must carry actor, reason and audit row, not just an amount.
- Cross-reference [DEC-007](DEC-007-aggregator-apis.md): partner-funded promotions on aggregator orders are not our discounts. If the funding source is not recorded per line, our discount reporting includes money we never gave away.
- Cross-reference [DEC-009](DEC-009-reporting-kpi-formulas.md): "net sales" is defined partly by which discounts subtract from it. That definition depends on this decision, and the two must be consistent.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Manual discounts only (ladder 1).** Percentage or amount, line or bill level, authorised role, mandatory reason code, audit row. No configured promotions. | ~6-9 person-days. | Every promotion becomes a staff instruction executed by hand at the till, which means inconsistent application and no reliable promotion performance data. Also the highest leakage risk: a manual discount facility with weak authorisation is the most direct route for till fraud in a restaurant. | Yes. Configured promotions layer on top without invalidating manual discounts. |
| B | **Manual + configured discount definitions (ladder 1-2).** Named, effective-dated discount definitions with scope (item/category/bill) and eligibility; selectable at the till; manual discount retained as an override. | ~12-18 person-days. | Covers most day-to-day restaurant practice. Does not do coupons or conditional offers, so marketing campaigns still need manual workarounds — and workarounds are exactly what corrupts the data. | Yes. |
| C | **B + coupons and conditional promotions (ladder 1-4), explicitly no stacking.** Coupon codes with validity and usage limits; buy-X-get-Y and combo pricing; time and day rules. Exactly one promotion applies per order; the best-value one wins, deterministically. | ~25-35 person-days. | The "no stacking" constraint is what keeps this tractable and it is the thing most likely to be argued away in a later meeting. Without it the engine is Option D. Conditional promotions also interact with refunds and partial cancellations in ways that need explicit rules — refunding one item of a buy-one-get-one is not obvious. | Adding stacking later is a significant rework of the resolution order, but does not invalidate stored data. |
| D | **Full rules engine with stacking, priority and exclusivity (ladder 1-5).** | ~45-60 person-days, plus a permanent testing burden — combinatorial interactions between promotions are the defining test problem. | Very likely to produce unintended free food. A stacking engine's failure mode is a combination nobody modelled resolving to a total nobody intended, at scale, before anyone notices. | Simplification is possible; orders already priced under complex rules cannot be re-explained. |
| E | **Defer expressiveness, decide the tax base now.** Ship A for R1; revisit 2-4 at R2 with real promotional requirements. | A's cost only. | Reasonable for expressiveness. Not reasonable for the tax base, which cannot be deferred — see below. | Yes for expressiveness; the tax base is not deferrable. |

## Impact If Wrong

**Tax base — the unrecoverable one.** If tax is computed on the wrong base, every discounted order carries the wrong tax and the wrong net revenue. The error only appears on discounted orders, so it is proportionally invisible in aggregate and will not be caught by a smoke test — it surfaces at filing, across a whole period, on a subset of invoices that must then be individually identified and restated. This is the same class of exposure as [DEC-004](DEC-004-tax-calculation-rules.md) and it must be confirmed by the same tax practitioner. **Engineering has no standing to decide this and should not be allowed to.**

**Stacking, if built and imperfect.** A promotion combination that resolves to a near-zero total goes out as free food, repeatedly, until someone notices the margin. The orders are valid, the customers are gone, and the only remedy is disabling the promotion going forward.

**Manual discounts without authorisation and audit.** Discount becomes the mechanism for till theft: staff apply a discount, collect the full amount in cash, and the difference is undetectable because there is no actor, no reason and no audit row to correlate against. This is a well-known pattern in restaurant operations and it is prevented by design, not by supervision.

**Rounding on percentage discounts.** Line-level discounts that round individually may not sum to a bill-level discount computed on the total. The bill then shows a discount figure that does not equal the sum of its lines — small, persistent, and it will not reconcile.

**Discount funding source not captured.** Partner-funded aggregator promotions are counted as our own discount. Discount rate, net sales and effective margin are all wrong on every aggregator order, permanently, because the distinction was never stored.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/orders` — pricing (`REQ-ORD`, `WF-ORD-01` step 4) | The pricing engine's discount stage, and the order of operations between discount and tax | 4 |
| `DB-TBL-DISCOUNTS` | Table structure — one table or a rules model | 2 |
| `services/finance` (`REQ-BIL`) | Invoice presentation of discount lines; discount-inclusive tax computation | 2 |
| `services/reporting` (`REQ-RPT`) | Discount rate and net sales cannot be defined — blocks [DEC-009](DEC-009-reporting-kpi-formulas.md) | 2 |
| `services/auth` | Which roles may discount, and up to what limit | 1 |
| **Total** | | **~11 person-days/week** |

## Recommendation

**Split the decision. Approve Option B for R1 expressiveness, and settle the tax base separately with the tax practitioner in the same session as [DEC-004](DEC-004-tax-calculation-rules.md).**

On expressiveness: Option B is recommended because it covers the discount patterns a restaurant actually uses daily — staff meals, happy hour, manager comps — without committing to a rules engine before anyone has written a real promotion brief. Option C is the likely R2 target and B extends into it cleanly. Option D should be resisted at R1 on the strength of its failure mode alone: an under-tested stacking engine gives away food at a rate proportional to trade volume, and it does so in a way that looks like normal operation.

On the tax base: engineering's recommendation is only that it be **explicitly decided, written as a formula, and covered by boundary tests before the first line of pricing code is merged**. Which base is correct is a statutory question. Whichever is chosen, the order of operations in the pricing engine must be a single documented sequence — subtotal, then discount, then tax, or subtotal, then tax, then discount — with no second implementation anywhere in the codebase.

Three requirements that should be approved regardless of the option chosen, because they are cheap now and cannot be retrofitted onto issued invoices:

1. **Every discount application records actor, reason code, authorising role and an audit row in the same transaction.** This is protocol rule 7 applied to the highest-leakage path in the product.
2. **Discount funding source is recorded per line** (own / partner-funded), so [DEC-007](DEC-007-aggregator-apis.md) channels do not corrupt discount reporting.
3. **Percentage-discount rounding is specified as integer arithmetic** with a stated residue rule, and line-level discounts are guaranteed to sum to the bill-level figure.

Finance and the Product Owner should overrule toward C for R1 if a marketing calendar with dated, conditional campaigns already exists. If it does not exist, building for it is guessing at a shape that the first real campaign will contradict.

---

## Decision

**Decided:** Option B for R1 expressiveness. Discount applied to pre-tax base (subtotal → discount → tax), consistent with standard GST practice already assumed by DEC-004's inclusive per-line calculation.
**Rationale:** Packet recommendation. Three mandatory requirements approved alongside: audit row (actor/reason/role) on every discount application; funding source (own/partner-funded) recorded per line; percentage-discount rounding as integer arithmetic with line-level sum matching bill-level figure.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on decision.*

**Becomes possible:** consistent promotion application across staff; discount performance reporting; discount authorisation limits by role; a defensible audit trail for every rupee given away.

**Becomes harder:** every pricing change now needs a Finance reviewer and boundary tests. Refund and partial-cancellation logic must unwind discounts correctly, which is harder than applying them. Each rung of expressiveness added later multiplies the pricing test matrix rather than adding to it.

**Permanent commitment:** the order of operations between discount and tax, and the discount rounding rule. Both are embedded in every issued invoice. Changing either applies forward only, and the system must then hold two conventions and know which applies to which date range — the same constraint as [DEC-004](DEC-004-tax-calculation-rules.md).

## Follow-Up

- [ ] ADR raised (structural): ADR-0008 — pricing engine order of operations and discount model
- [ ] `DECISION-LOG.md` updated
- [ ] **Tax base (pre- vs post-discount) confirmed by the tax practitioner** — decide with [DEC-004](DEC-004-tax-calculation-rules.md)
- [ ] Discount rounding rule specified as integer arithmetic, line sums reconcile to bill total
- [ ] Discount authorisation limits per role defined with `services/auth`
- [ ] Audit row on every discount application (actor, reason, role) per protocol rule 7
- [ ] Funding source (own / partner) recorded per discount line — see [DEC-007](DEC-007-aggregator-apis.md)
- [ ] Refund/partial-cancellation discount unwind rules written
- [ ] Cross-check [DEC-009](DEC-009-reporting-kpi-formulas.md): which discounts subtract from net sales
- [ ] Downstream artifacts updated: `REQ-ORD`, `DB-TBL-DISCOUNTS`, `WF-ORD-01`
- [ ] Estimate re-baselined if scope changed
