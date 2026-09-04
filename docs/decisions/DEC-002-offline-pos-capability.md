# DEC-002: Offline POS Capability

**ID:** DEC-002
**Status:** APPROVED
**Owner:** Product Owner + IT
**Raised by:** Solution Architect
**Due:** 2026-08-15 (Wk 1)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-002 · source pages 1-5 (POS order flow)
**Traced by:** `REQ-ORD`, `WF-ORD-01`, `UX-SCR-POS-*`, POS client architecture

---

## Question

Must the POS terminal continue to take, print and settle orders while disconnected from the server, and if so, for how long and with which operations?

## Question Scope Note

"Offline" is not one capability. The honest sub-questions, which the owner should answer together:
- Can a **new order** be created offline? (hardest — requires client-generated identity)
- Can a **KOT** print offline? (depends on DEC-006 print topology)
- Can a **cash payment** be settled and a bill printed offline?
- Can a **card/UPI payment** be taken offline? (almost certainly no — the gateway is remote by definition)
- Is **menu/price data** available offline? (read-only cache — much cheaper than write offline)

## Context

- The source material shows a POS order flow with no reference to connectivity state, no offline indicator, no queued-order UI and no sync status. It neither requires nor excludes offline operation. This is a genuine gap, not an inference.
- **Offline is not a feature flag.** It changes the client from a thin view over a server API into a local system of record. Concretely it adds: a local persistent store on every terminal; client-generated IDs (UUIDv7 already chosen in [`schema-reference.md`](../05-database/schema-reference.md), which helps); a sync queue; a conflict-resolution table and a documented resolution policy per entity; a replay path that is idempotent; and a UI that must express "this order exists but the server has not seen it".
- Restaurant connectivity in the target market is genuinely unreliable — consumer broadband, single uplink, no failover, power events. Designing on the assumption of a stable link is designing for a condition that does not hold.
- Constraints already committed that offline interacts with:
  - Protocol rule 5 (append-only state) makes offline replay **easier** — status history replays cleanly where destructive updates would not.
  - Protocol rule 6 (`Idempotency-Key` on every mutating endpoint) is a prerequisite for replay and is already mandated.
  - Protocol rule 2/4 (outlet from session, never body) — an offline client holds a session that may have expired by the time it reconnects. Token lifetime and offline duration are coupled.
  - `UNIQUE (outlet_id, order_number)` — order numbers are the hard part. Two terminals offline simultaneously will both mint number 47 unless numbering is partitioned per terminal or the printed number is decoupled from the stored one.
- DEC-005 (payment gateway) and DEC-006 (printer topology) both constrain this. A cloud-printing model makes offline KOT impossible; a LAN print server makes it trivial.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Online-only.** Terminal is a thin client. Loss of connectivity blocks order entry; UI shows a clear degraded state and retries. | Baseline (0 incremental). | Service stops when the link stops. In a busy dinner service this means handwritten chits and a manual catch-up entry session — the failure lands on staff during the worst possible hour. Reputational and, if it happens twice, contractual. | **No, cheaply.** Retrofitting offline into a shipped online-only client is close to a client rewrite: 25-40 person-days plus a server-side conflict model that did not exist. |
| B | **Read-only offline (cached catalog).** Menu, prices, modifiers, tax rules cached locally. Order entry still requires the server. Fast startup, resilient to slow links, but no writes offline. | 5-8 person-days. Cache invalidation keyed off the `version` column already present on `item_availability`. | Solves the wrong half. Slow links get better; dropped links still stop service. Easy to mistake for having addressed the risk. | Yes. It is a strict subset of C. |
| C | **Full offline order capture, cash settlement only.** Local store; client-generated order and item IDs; per-terminal order-number block allocation; queued sync with `Idempotency-Key`; conflict table with a per-entity resolution policy; explicit sync UI. Card/UPI unavailable offline by design. | **25-40 person-days** across client and server, plus a permanent tax on every future POS feature (each new write path must also work offline). Test matrix roughly doubles for the order module. | The conflict cases are where this bites: same table settled twice, stock consumed against a balance the terminal could not see, a price change or discount rule that the terminal missed, a menu item marked unavailable server-side while a terminal keeps selling it. Each needs a stated policy, not a merge algorithm. | Yes — offline can be disabled later. But the architecture it imposes on the client stays. |
| D | **Defer to R1.1; build the enablers now.** Ship online-only for R1, but commit in R1 to the three things that make C affordable later: client-generated UUIDv7 IDs end to end, `Idempotency-Key` on every write (already protocol), and no server-generated identity in the order-creation path. | ~3-5 person-days of discipline in R1. Full offline later at ~18-25 person-days instead of 25-40. | Depends entirely on the enablers actually being enforced. If any order-creation path takes a server-generated ID, the saving evaporates. Needs a review gate, not a good intention. | Yes. This is the option designed to stay reversible. |

## Impact If Wrong

**If we ship online-only and the site's link is as unreliable as expected:** a 40-minute outage during dinner service produces roughly 60-100 orders that exist only on paper. Staff re-key them afterwards from memory and handwriting, so item-level accuracy is lost, modifiers are dropped, and the timestamps are all wrong — which corrupts the hourly sales summary, the KOT performance report, and any labour-scheduling decision made from them. Cash taken during the outage reconciles against nothing. If the outage spans the business-day boundary, the orders land in the wrong business day and the daily sales summary for both days is wrong. None of this is recoverable by a redeploy.

**If we build full offline and it is not needed:** we carry a local store, a sync engine and a conflict table on every terminal forever. Every subsequent POS feature costs more because it must also be correct offline. Worse than the wasted effort: the sync path is itself a source of defects, so we would have added a whole class of bug (duplicate orders, resurrected cancelled orders, stale-price orders) to a system that never needed it.

**If we get the order-number strategy wrong under offline:** two terminals print bill number 47 to two different customers on the same day. The unique constraint rejects one of them at sync, and the order that was already served and paid for is the one that fails to persist.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| POS client architecture | Framework and state-management choice; local persistence layer; whether there is a client-side domain model at all | 5 |
| `services/orders` (`REQ-ORD`) | Order creation contract — server-generated vs client-supplied ID; order number allocation strategy | 4 |
| UX (`UX-SCR-POS-*`) | Connectivity indicator, queued-order state, sync conflict resolution screens — all exist or do not exist based on this | 3 |
| `services/auth` | Offline token lifetime, offline re-auth, PIN-based local unlock | 2 |
| QA | Test strategy for the order module — the offline matrix roughly doubles it | 2 |
| **Total** | | **~16 person-days/week** |

## Recommendation

**Option D, with a stated intent to reach C in R1.1** — unless Ops can produce site connectivity data that makes C unavoidable for R1.

Reasoning: full offline (C) is the correct end state for this market, but building it in R1 alongside an unproven order model means debugging the sync engine and the domain model simultaneously, and every ambiguity in one shows up as a bug in the other. Option D buys the right to defer at a genuinely low price, because two of its three enablers (`Idempotency-Key`, UUIDv7) are already committed by the protocol and the schema. The third — never letting the server mint order identity — costs discipline, not days.

What would change this recommendation to C for R1: measured connectivity at the pilot sites. If Ops can show a single site with more than one unplanned outage per week during service hours, D is not defensible and C should be funded in R1.

Regardless of the option chosen, the order-number strategy needs deciding now, because it constrains the schema either way. The recommended shape: `order_number` is allocated from a per-terminal block, so no two terminals can collide, and the customer-facing bill number is that value rather than a global sequence. This is cheap under any option and removes the worst offline failure mode in advance.

Option B should not be chosen as an answer to this question. It is worth doing on its own merits for latency, but presenting it as the offline answer would misrepresent the risk to the owner.

---

## Decision

**Decided:** Option D — Start online-only for R1, but enforce all enablers (client-generated UUIDv7s, Idempotency-Keys on all writes, decoupled order numbering per terminal). Re-route to C (full offline write) in R1.1.
**Rationale:** Simplifies debugging the core domain in R1 by not implementing sync logic and domain changes at the same time, while keeping the architecture reversible at minimal cost.
**Approved by:** PO + IT & Solution Architect
**Date:** 2026-08-08
**ADR:** ADR-0008 (`../adr/0008-pos-client-architecture-and-offline-model.md`)

## Consequences

*To be completed on decision.*

**If C or D→C:** the terminal becomes a system of record, which permanently changes the meaning of "the server has the data". Every POS feature thereafter carries an offline design question. Support gains a new incident class (stuck sync queues) that requires per-terminal diagnostics. Order identity is client-generated forever — the server can never assume it minted an ID.

**If A:** service availability is bounded by network availability, which is a commercial promise the product cannot keep on its own. The SLA and the contract need to say so explicitly, and the retrofit cost stays on the risk register at full value.

**Permanent either way:** the order-number allocation strategy. Once numbers are printed on customer bills and filed against tax returns, the scheme cannot be changed retroactively.

## Follow-Up

- [x] ADR raised (structural): ADR-0008 — POS client architecture and offline model
- [ ] `DECISION-LOG.md` updated
- [ ] Ops to supply connectivity measurements from pilot sites before the review
- [ ] Order-number allocation strategy confirmed (needed under every option)
- [ ] Cross-check against [DEC-005](DEC-005-payment-gateway.md) — offline settlement is cash-only under any gateway
- [ ] Cross-check against [DEC-006](DEC-006-printer-kot-hardware.md) — cloud printing forecloses offline KOT
- [ ] Downstream artifacts updated: `REQ-ORD`, `WF-ORD-01`, `UX-SCR-POS-*`
- [ ] Estimate re-baselined if scope changed
