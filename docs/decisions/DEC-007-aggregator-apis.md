# DEC-007: Aggregator APIs Beyond Swiggy/Zomato

**ID:** DEC-007
**Status:** OPEN
**Owner:** Business
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-007 · source page 4 (integration, partial) · RSK-11 (partner certification lead time)
**Traced by:** `REQ-INT`, `DEP-EXT-01/02`, `WF-INT-01/02`, `CHANNEL_ITEM_MAPPING`

---

## Question

Which delivery/ordering channels must R1.1 support beyond Swiggy and Zomato, and does the integration hub commit to a channel-neutral internal model or to per-partner implementations?

## Context

- Source page 4 gives partial integration evidence. Swiggy and Zomato are named; nothing else is. The question is what else, and — more consequentially — what shape.
- **The schema has already partly answered the shape question.** `integrations`, `channel_accounts`, `channel_item_mapping`, `inbound_events`, `outbound_events`, `sync_jobs`, `integration_errors`, and `UNIQUE (channel_account_id, external_event_id)` as an idempotency guard are all channel-neutral by construction. `item_availability` carries `UNIQUE (item_id, channel_id)` and a `version` column driving sync ordering. That is a generic channel model already proposed. This packet asks Business to confirm or reject it — if the answer is "these two partners forever", several of those tables are over-built.
- **[`DECISION-LOG.md`](DECISION-LOG.md) rates this High cost-of-delay for a reason unrelated to code:** "partner certification has multi-week lead time regardless of our readiness" (RSK-11). Every week this stays open moves the go-live date by a week and no amount of engineering effort compresses it. This is the only decision on the register whose delay cost is purely external.
- The candidate channel classes, which differ in kind rather than degree:
  - **Aggregator marketplaces** (Swiggy, Zomato, and others such as ONDC-network buyer apps, Magicpin, Thrive). Partner-controlled menu, partner-controlled pricing rules, partner-owned customer.
  - **Own-brand ordering** (white-label website/app). We control both sides, so no certification, but it needs a storefront and a payment path — it is a product, not an integration.
  - **Dine-in QR ordering.** Same order pipeline, no external partner, no certification.
  - **Table-reservation and ticketing platforms.** Different data (covers, not orders); arguably not this decision.
  Treating these as one list is the mistake to avoid — only the first class carries certification lead time.
- Constraints that shape any answer:
  - Protocol rule 6 and the webhook testing requirement (duplicate-delivery test proving exactly one internal record) apply per channel. Each partner is a separate duplicate-delivery surface.
  - Cross-references [DEC-004](DEC-004-tax-calculation-rules.md): where the aggregator is liable to collect and pay tax on the supply, the restaurant's own invoice for that order is treated differently. Adding a channel can therefore change tax behaviour, not just order intake.
  - Cross-references [DEC-005](DEC-005-payment-gateway.md): aggregator orders arrive already paid, settled to us later net of commission. They belong in `settlements` reconciliation, not the gateway capture path.
  - Cross-references [DEC-008](DEC-008-discount-promotion-rules.md): partner-funded discounts are not our discounts, and mixing them corrupts net sales.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Two partners only, purpose-built.** Swiggy and Zomato implemented directly, no channel abstraction. Simplify or drop `integrations`/`channel_accounts` generality. | Lowest — ~20-30 person-days total for both. | Adding a third partner later is a near-full-cost integration plus a retrofit of the order model to be channel-aware. Also removes tables the schema already proposes, so this must be an explicit rejection, not a silent omission. | Poorly. Channel-awareness retrofitted after live orders exist means backfilling channel attribution onto historic orders that never had it. |
| B | **Channel-neutral hub, two partners implemented.** Keep the proposed generic model; implement Swiggy and Zomato as adapters. Third parties are then adapter work only. | ~30-40 person-days. The abstraction premium over A is real but modest because the schema already assumes it. | The usual risk — an abstraction derived from two similar partners may not fit a structurally different third (ONDC's network model in particular is not shaped like a marketplace API). Mitigated by keeping the neutral model at the *event and order* level and letting adapters be genuinely partner-shaped. | Yes. Adapters can be added or removed without touching the core. |
| C | **B plus a named third channel in R1.1.** Business names one additional channel now so certification starts in parallel. | B + ~10-15 person-days for the third adapter, plus its certification calendar. | Certification runs concurrently rather than serially, which is the only way to avoid a sequential multi-week penalty per partner. Risk is committing to a channel that turns out to be commercially uninteresting — wasted effort, but bounded and non-destructive. | Yes. |
| D | **B plus own-brand/QR ordering instead of a third aggregator.** Implement the neutral hub with the two partners, and add first-party ordering as the third channel — no certification, no commission, we own the customer. | B + ~25-35 person-days (storefront + payment path), no external lead time. | Materially larger build than an adapter, and it is a product commitment rather than an integration. But it is the only channel option that improves margin rather than costing commission, and it has zero external schedule dependency. Business, not engineering, should judge whether it is worth it. | Yes. |
| E | **Defer.** Build the hub, decide partners at R1.1 planning. | Certification lead time is deferred with it, so R1.1 slips by the certification duration — this is the option whose cost is invisible until it is unrecoverable. | The lead time does not compress. Deferring the decision defers go-live one-for-one. | n/a |

## Impact If Wrong

**If we build partner-specific and Business adds a third channel post-launch:** the order model has no channel dimension, so `orders` must be altered against live data to carry channel attribution, and every historic order gets a backfilled default that is a guess. Channel-level reporting — commission cost per channel, item mix per channel, the numbers that justify the partner relationship — cannot be produced for any period before the retrofit.

**If we defer and certification is the constraint:** the engineering work completes on schedule and the product cannot launch, because the partner's certification queue has not been entered. This is the failure mode RSK-11 already names. It is entirely avoidable and only by acting early.

**If partner-funded discounts are not distinguished from our own:** a partner promotion appears in our discount reporting as margin we gave away. Net sales, discount rate and effective margin are all wrong on every aggregator order, and because the distinction was never captured, it cannot be recovered from the stored data later. This one is worth flagging explicitly to Business — it is the most common way channel integrations corrupt financial reporting.

**If channel-specific menu/price divergence is not modelled:** aggregator prices are frequently marked up to absorb commission. Without `channel_item_mapping` carrying channel-specific price, either the dine-in price is published to the aggregator (margin loss on every order) or the aggregator price is charged in-store (customer-facing error).

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/integration-hub` (`REQ-INT`) | Whether the hub is generic or two bespoke integrations; `inbound_events` payload strategy; adapter interface | 4 |
| `services/menu` (`REQ-MNU`) | `channel_item_mapping` and channel-specific pricing/availability shape | 2 |
| `services/orders` (`REQ-ORD`) | Channel attribution on `orders`; whether externally-priced orders bypass the pricing engine | 2 |
| `services/reporting` (`REQ-RPT`) | Channel dimension on every summary table | 1 |
| Business / partner ops | Certification applications — **the long-lead item, not recoverable** | 1 |
| **Total** | | **~10 person-days/week** |

## Recommendation

**Option B as the architecture, and Business should name a third channel this week if one exists — Option C if it does.**

Reasoning: the architecture half of this is close to already decided by the schema, and the schema is right. `channel_accounts`, `inbound_events` with a per-channel idempotency key, and `channel_item_mapping` are the correct model for two partners even if there is never a third, because two partners already require channel-specific pricing, availability and event de-duplication. The abstraction premium over Option A is small enough that Option A's only real advantage — simplicity — does not survive contact with the second partner.

The part that genuinely needs a Business answer is the channel *list*, and it needs it primarily for schedule reasons rather than technical ones. If a third partner is plausible within twelve months, naming it now costs a parallel certification track; naming it later costs a serial one. That asymmetry is the whole argument for Option C.

Option D is worth Business considering on commercial grounds even though it is the largest build here — it is the only option that removes commission rather than adding a channel that charges it, and it carries no external schedule dependency. Engineering has no basis to recommend for or against it; it is a margin-versus-reach judgement.

Two requirements that should be approved alongside whichever option is chosen, because they are where channel integrations reliably corrupt data:
1. **Discount funding source is captured on every order line** — ours versus partner-funded — from the first channel, not retrofitted.
2. **Externally-priced orders record both the partner's stated total and our own computed total**, and a mismatch raises an `integration_errors` row rather than silently accepting the partner's figure. Without this, a partner-side pricing change is invisible until the settlement short-pays.

---

## Decision

**Decided:** Option B — channel-neutral hub, Swiggy and Zomato implemented as adapters. Third channel (Option C) not named at this time; revisit when a specific partner is commercially confirmed.
**Rationale:** Schema already assumes the channel-neutral shape; abstraction premium over Option A is small enough that A's simplicity advantage doesn't survive the second partner. Discount funding source (own vs partner-funded) and partner-stated-vs-computed total mismatch detection are both approved as mandatory from channel one, per packet recommendation.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on decision.*

**Becomes possible:** per-channel P&L including commission; channel-specific menus, pricing and availability; consolidated order queue across dine-in and delivery; adding a channel as adapter work rather than a project.

**Becomes harder:** every order-model change must consider channel-sourced orders that did not originate in our pricing engine. Each partner adds an ongoing compatibility obligation — their API changes on their schedule. Menu changes multiply by channel, and channel sync failures become a support category with `sync_jobs` and `integration_errors` needing operational tooling.

**Permanent commitment:** channel attribution on `orders` and the `inbound_events` idempotency key. Both are load-bearing for reconciliation and reporting, and neither can be reshaped once live orders exist.

## Follow-Up

- [ ] ADR raised (structural): ADR-NNNN — integration hub channel model
- [ ] `DECISION-LOG.md` updated
- [ ] **Certification applications submitted for all named partners — start immediately (RSK-11)**
- [ ] Discount funding source captured per order line from channel one
- [ ] Partner-total vs computed-total mismatch raises `integration_errors`
- [ ] Cross-check [DEC-004](DEC-004-tax-calculation-rules.md): aggregator-mediated supply tax treatment
- [ ] Cross-check [DEC-005](DEC-005-payment-gateway.md): aggregator settlement is not gateway capture
- [ ] Cross-check [DEC-008](DEC-008-discount-promotion-rules.md): partner-funded promotions
- [ ] Downstream artifacts updated: `REQ-INT`, `DEP-EXT-01/02`, `WF-INT-01/02`, `CHANNEL_ITEM_MAPPING`
- [ ] Estimate re-baselined if scope changed
