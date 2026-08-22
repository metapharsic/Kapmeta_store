# DEC-003: Recipe/BOM Inventory Automation

**ID:** DEC-003
**Status:** OPEN
**Owner:** Operations + Finance
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-003 · [`schema-reference.md`](../05-database/schema-reference.md) Inventory group *(no source — proposed)*
**Traced by:** `REQ-INV`, `REQ-PUR`, `REQ-KOT` (wastage), `DB-TBL-STOCK_MOVEMENTS`, `WF-INV-*`, `WF-ORD-01` step 10

---

## Question

Does selling a menu item automatically deplete ingredient stock via a recipe/BOM, and if so, at what point in the order lifecycle and at what recipe granularity?

## Context

- The entire Inventory group in [`schema-reference.md`](../05-database/schema-reference.md) — `ingredients`, `stock_locations`, `stock_balances`, `stock_movements`, `recipes`, `recipe_items`, `wastage_records` — is marked **"no source — proposed"**. Seven tables exist in the schema on the strength of an assumption. If Ops answers "manual stock counts only", most of them are unauthorized schema per [`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md) and should be dropped rather than built.
- The delay cost in [`DECISION-LOG.md`](DECISION-LOG.md) is marked Medium with the note "R2 scope, but schema decisions land in R1". That is the crux: the feature is R2, the schema commitment is R1. `WF-ORD-01` step 10 (inventory consumption) is an R1 order-flow step whose existence depends on this answer.
- Protocol constraint: `stock_movements` is append-only and balances are derived or trigger-maintained, never hand-edited. Whatever is decided here must produce movement rows, not balance updates.
- Protocol constraint: order + payment + inventory mutations commit in one transaction — but [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4 also says payment capture, invoice and inventory consumption are event-driven and individually retryable. Consumption is therefore asynchronous and idempotent, which matters for the timing sub-question below.
- **The timing sub-question is not cosmetic.** Depleting at order placement, at KOT acceptance, or at order completion gives three different stock positions during service and three different answers when an order is cancelled after the food was cooked. Cancel-after-KOT already requires an elevated role and a reason code; whether it also reverses stock is an Ops policy call, not a technical one. Food already cooked is not food back in the store.
- **The granularity sub-question determines whether this is affordable at all.** A recipe per menu item is one thing; a recipe per item-variant-plus-modifier-combination is combinatorially larger, and someone in the kitchen has to author and maintain every row. The realistic failure mode of recipe-based inventory is not the software — it is that nobody maintains the recipes, yields drift, and within three months the system reports negative stock on onions.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **No recipe automation.** Stock is tracked at purchase and periodic physical count only. Drop `recipes`, `recipe_items`; keep `ingredients`, `stock_movements`, `stock_balances` for purchase and wastage. `WF-ORD-01` step 10 is removed. | Lowest. Removes ~2 tables and the whole consumption path from R1/R2. | No theoretical usage figure, so no variance analysis and no pilferage signal. Food cost is only knowable after a count. This is how most independent restaurants already operate, so it is not obviously wrong — but it forecloses the single most commercially attractive report in the product. | Yes, but the reverse direction is costly: adding consumption later means historical sales cannot be retro-depleted, so variance reporting has no history and starts from zero on switch-on day. |
| B | **Recipe per menu item, consume on order completion.** One BOM per menu item (not per modifier). Consumption posts as `stock_movements` rows on order completion, asynchronously and idempotently. Modifiers ignored for depletion. | ~15-20 person-days (R2) plus the R1 schema and the `WF-ORD-01` step-10 hook. Plus the real cost: Ops must author a recipe for every item on the menu before go-live. | Modifier-driven consumption (extra cheese, large portion, no onion) is invisible, so theoretical usage is systematically wrong by a variable margin. Variance reports will show a persistent unexplained gap that Ops will either learn to ignore or escalate as a bug. | Yes — granularity can be increased later without re-shaping `stock_movements`. |
| C | **Recipe per item + variant + modifier, consume on KOT acceptance.** Full BOM including variant yields and modifier deltas. Depletion at the point the kitchen accepts the ticket, matching when the ingredient is physically used. | ~30-40 person-days plus a materially larger data-authoring burden on Ops — every variant and every modifier needs a quantity delta, and each needs maintaining as the menu changes. | The maintenance burden is the risk, not the code. An unmaintained BOM produces confidently wrong numbers, which is worse than Option A's honest absence of numbers. Also couples inventory correctness to KOT correctness. | Granularity is reducible, but the authored data and the habit of trusting the numbers are not easily walked back. |
| D | **Defer the feature, commit the schema.** Ship R1 with `ingredients`, `stock_movements`, `stock_balances`, `wastage_records` and an inert `WF-ORD-01` step-10 hook that emits a consumption event nobody consumes yet. Decide recipe granularity in R2 with real menu data in hand. | ~4-6 person-days in R1 to define the event and the movement shape. | Unconsumed events accumulate or are discarded; if discarded, R2 still starts with no history. Also risks the classic outcome where "R2" never arrives and the hook rots. | Yes — this is the deliberately reversible option. |

## Impact If Wrong

**If we build recipe consumption and the recipes are not maintained:** the system reports theoretical usage that diverges from reality by an unknown and growing margin. Ops raises variance tickets that are data-entry problems, not defects, and engineering spends weeks proving that. Worse, once `stock_balances` goes negative — which it will, the first time a chef improvises — the purchasing module starts generating reorder suggestions from a corrupt base, and someone orders stock they already have.

**If we skip it and Finance later needs food-cost percentage:** there is no theoretical-usage series to compute against. Variance reporting can only begin on the day recipes are switched on; every prior month of sales is permanently un-analysable at ingredient level, because `order_items` alone cannot be retro-exploded against recipes that did not exist and yields that were never recorded.

**If consumption timing is set to order placement and cancellations are common:** stock is depleted for food never cooked, and unless the cancellation path reverses it exactly, `stock_balances` drifts by one order's ingredients per cancellation, permanently, with no signal that it happened.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/inventory` (`REQ-INV`) | Whether `recipes`/`recipe_items` exist at all; movement reason taxonomy; balance derivation strategy | 4 |
| `services/inventory` (`REQ-PUR`) | Reorder-point logic depends on whether consumption is known or counted | 2 |
| `services/orders` (`WF-ORD-01` step 10) | Whether the order-completion path emits a consumption event, and what it carries | 2 |
| `services/kitchen` (`REQ-KOT`) | Wastage capture at station level — in scope only if ingredient-level stock is real | 1 |
| Database / migrations | 7 proposed tables cannot be confirmed or dropped | 2 |
| **Total** | | **~11 person-days/week** |

## Recommendation

**Option D for R1, with Option B as the stated R2 target** — and one condition that should be part of the approval.

Reasoning: the schema decision must be made now and the feature decision must not be. Option D separates them honestly. Committing to `stock_movements` as an append-only ledger with a reason taxonomy costs a few days and is right under every option except pure A; committing to a recipe granularity before anyone has seen the real menu is guessing.

Option B rather than C as the R2 target, because modifier-level BOM is where the maintenance burden becomes unsustainable for a kitchen team, and an unmaintained BOM is worse than no BOM. Start at item level, measure the variance gap, and only add modifier deltas for the specific high-cost modifiers where the gap is material.

**The condition:** Ops must confirm before R2 starts that a named person owns recipe authoring and maintenance, with time allocated. If no such owner exists, the correct answer is Option A and the `recipes` tables should be dropped rather than built and abandoned. This is a genuine question for Operations, and "yes in principle" is not the same as a named owner with hours in their week.

On timing, the recommendation is consumption on **order completion**, not placement — it matches the point of no return for the food and avoids the cancellation-reversal drift entirely. Ops may prefer KOT acceptance for a live stock view during service; that is a legitimate override, but it requires an explicit cancellation-reversal policy to be written at the same time.

---

## Decision

**Decided:**
**Rationale:**
**Approved by:**
**Date:**

## Consequences

*To be completed on decision.*

**Becomes possible with B/C:** food-cost percentage, theoretical vs actual variance, pilferage detection, ingredient-level reorder points, menu-engineering by contribution margin. These are the reports that differentiate a POS from a till.

**Becomes harder:** every menu change becomes a two-part change — the item and its recipe. Menu velocity slows. Ops carries a permanent data-maintenance obligation. Negative-stock handling becomes a support category.

**Permanent commitment:** the `stock_movements` reason taxonomy and grain. Once movements are written and balances derived from them, changing the movement shape means re-deriving every balance in the system.

## Follow-Up

- [ ] ADR raised (structural): ADR-0003 — inventory consumption model and movement ledger
- [ ] `DECISION-LOG.md` updated
- [ ] Ops to confirm a named owner for recipe authoring and maintenance
- [ ] Consumption timing confirmed (placement / KOT acceptance / completion) with cancellation-reversal policy
- [ ] Unauthorized-schema check: drop `recipes`, `recipe_items` from [`schema-reference.md`](../05-database/schema-reference.md) if Option A
- [ ] Downstream artifacts updated: `REQ-INV`, `REQ-PUR`, `WF-ORD-01`, [`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md)
- [ ] Estimate re-baselined if scope changed
