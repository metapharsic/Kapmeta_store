# DEC-014: Loyalty Program Model — Points / Visits / Tiered / Cashback

**ID:** DEC-014
**Status:** OPEN
**Owner:** Product Owner + Marketing
**Raised by:** `REQ-CRM` ([`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) §Loyalty Models)
**Due:** Before R3 planning
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md)
**Traced by:** `loyalty_accounts`, loyalty ledger tables, R3 scope, pricing engine redemption path

---

## Question

Which single loyalty mechanic does the platform implement for R3 — points, visit-count, spend tiers, or cashback store credit?

## Context

[`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) lays out all four candidates with an explicit note that none is selected and no existing DEC covers it. This packet is that DEC.

Constraints that hold whichever model wins, and which are already committed:

- `loyalty_accounts` holds the account; **balance is derived from an append-only ledger**, never an `UPDATE balance`.
- Accrual fires on order `COMPLETED`, not `PLACED`.
- Refund reverses accrual against the **original business day**.
- Redemption is a discount and routes through the pricing engine (DEC-008), not a parallel code path.
- Earn/burn rates are outlet-configurable only if DEC-001 lands multi-outlet.

The decision is a business one with two engineering consequences that the owner should weigh:

1. **Liability.** Points and cashback create an outstanding obligation that Finance must value and report. Visits and tiers do not. This is a real accounting conversation, not a schema detail — an unredeemed points balance is a liability line, and its valuation depends on expiry policy and breakage assumptions that Finance must supply.
2. **Interaction complexity.** Points and cashback redemption interact with tax (DEC-004: is a points redemption a discount before tax or a tender after tax?) and with discount stacking (DEC-008). Visit-based rewards mostly sidestep both.

DEC-009 is a hard prerequisite for tiers: a rolling-spend tier needs a signed definition of "spend" and a window length, and there isn't one.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Points.** Earn N points per currency unit; redeem against the bill, partial redemption allowed; expiry policy required. | High — ~25-35 person-days. Append-only ledger, expiry job, liability report, tax and discount interaction, redemption in the pricing engine | Most familiar to customers and most demanding on Finance. Blocked on DEC-004 and DEC-008 for the redemption semantics. Expiry policy is itself a business decision that has to be made at the same time | Program rules yes; accrued balances no — customers hold them and they must be honoured or bought out |
| B | **Visits.** Nth qualifying visit is free or discounted. | Low — ~8-12 person-days. Counter derived from an append-only visit ledger; reward is a fixed discount | Gameable by bill splitting (two covers, two bills, two visits) unless a same-customer same-day rule is applied — which annoys legitimate large parties. No relation to spend, so it is regressive for high-AOV outlets: the £8 customer and the £80 customer earn identically | Yes, comparatively — no monetary liability to unwind |
| C | **Tiered.** Silver/Gold/Platinum from rolling spend; tier grants benefits (priority, fixed % discount, perks). | Medium — ~15-20 person-days plus a rolling-window recompute job. **Blocked on DEC-009** for the spend definition and window | Tier demotion is a customer-relations event that Marketing must have a policy for before launch, not after the first demotion email. Benefits still have to be defined — a tier with no concrete benefit is a badge | Program rules yes; a demotion-free grandfathering promise, if made, is permanent |
| D | **Cashback / store credit.** A percentage returns as spendable store credit. | High — ~25-35 person-days. Store credit is a tender type, which means it touches billing, refunds and the ledger, not just CRM | Store credit is a genuine financial liability with statutory implications (potentially unclaimed-property-style treatment) and a messy refund interaction: refunding an order paid partly in store credit has to return credit as credit, not cash. Legal and Finance both have standing here | No — outstanding credit is money owed |
| E | **Defer past R3; ship CRM without loyalty.** | Zero now | CRM is R3 already, so deferral is cheap in schedule terms. The cost is that `loyalty_accounts` sits in the schema unimplemented and Marketing plans campaigns around a capability that does not exist. Honest option if the business has no loyalty commitment yet | Yes |

## Impact If Wrong

- **Points chosen without an expiry policy:** the liability grows without bound and Finance reports a number that only ever increases. Introducing expiry later against customers who accrued under no-expiry terms is a consumer-fairness problem and usually results in honouring the old terms indefinitely for those balances — permanently two rule sets in the ledger.
- **Model switched after launch:** existing balances have to be converted at a rate someone invents, communicated to every enrolled customer, and reconciled. The append-only ledger means both the old and new schemes' entries live in the same table forever, and every historical loyalty report has to know which regime applied on which date.
- **Cashback chosen without Finance:** store credit appears as a tender in `order_payments` with no corresponding ledger treatment agreed, and net sales is overstated by the credit portion until someone notices — which is at year-end audit.
- **Visits chosen for a high-AOV concept:** the program is measurably running at a loss on low-value repeat customers and delivering nothing to the customers who actually carry the P&L, and there is no data to fix it because visit-count reveals nothing about spend.
- **Tiers built before DEC-009:** the spend definition used for tiering disagrees with the one on the finance dashboard, and a customer is demoted based on a number the business does not stand behind.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| CRM (R3) | `loyalty_accounts` and the loyalty ledger schema, accrual engine, balance API | 2 (R3, so not yet on the critical path) |
| Billing / pricing | Redemption path through the pricing engine; whether store credit is a tender type | 1 |
| Finance | Whether a loyalty liability account exists in the CoA (interacts with DEC-013) | 1 |
| Reporting | Loyalty KPIs, breakage and liability reporting | 1 |

## Recommendation

**Option C (tiered) if the business wants loyalty in R3; Option E if it does not yet have a commercial position.**

Reasoning — and this is a weak engineering preference on a business question, offered so the owner has a starting point to argue with:

- Tiers carry **no monetary liability**, which removes Finance, Legal and the tax-interaction question from the critical path entirely. That is the single biggest cost driver among these options and it is avoidable.
- Tiers are spend-linked, so unlike visits they scale with the customer's actual value and are not defeated by bill splitting.
- The build sits in the middle of the range and reuses the derived-tag machinery CRM needs anyway.
- The two real costs are honest: it is **blocked on DEC-009** (accepted — every CRM KPI is), and demotion policy must be written by Marketing before launch.
- Points is the option customers expect and Marketing may well insist on. That is a legitimate overrule. If it is chosen, the expiry policy and the DEC-004 redemption-vs-tender question must be decided **in the same review**, not deferred — those two are where points programs go wrong.
- Cashback should only be chosen with Finance and Legal explicitly in the room, given the store-credit liability.

Do not implement two models "configurably". A configurable loyalty engine covering points and tiers costs more than both and is invariably used in exactly one mode.

---

## Decision

**Decided:** Option E — defer. No commercial position on loyalty model given at this time; consistent with project charter deferring CRM/loyalty to R2/R3.
**Rationale:** Packet recommends E absent a stated commercial position. Revisit as Option C (tiered) when R3 planning begins and Marketing/Finance can commit to a model — tiers carry no monetary liability and reuse CRM's derived-tag machinery, per packet's stated preference if/when loyalty is greenlit.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Any model with a monetary balance (points, cashback) permanently commits the business to honouring accrued balances and to reporting them as a liability. This cannot be walked back by a product change.
- Fixes the loyalty ledger's entry types. Because the ledger is append-only, a later model change layers a second scheme on top rather than replacing the first.
- Determines whether store credit becomes a tender type in billing — a cross-module change affecting refunds, reconciliation and the ledger, not a CRM-local feature.
- Sets what Marketing can promise. A published earn rate is a commitment to customers, not a configuration value.

## Follow-Up

- [ ] ADR raised (structural): ADR-NNNN — loyalty ledger and redemption path
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) §Loyalty Models, `loyalty_accounts`, schema reference, R3 scope
- [ ] If points or cashback: expiry/breakage policy agreed with Finance, and liability account added to the CoA (DEC-013)
- [ ] If tiered: rolling-window and spend definition confirmed against DEC-009; demotion policy written by Marketing
- [ ] Redemption-vs-tax treatment confirmed against DEC-004; stacking rules against DEC-008
- [ ] Affected teams notified: Product, Marketing, Finance, Engineering
- [ ] Estimate re-baselined if scope changed
