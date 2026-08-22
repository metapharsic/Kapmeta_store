# DEC-006: Printer / KOT Hardware

**ID:** DEC-006
**Status:** APPROVED
**Owner:** Operations + IT
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-006 · source page 5 (KOT flow) · [`schema-reference.md`](../05-database/schema-reference.md) Kitchen group
**Traced by:** `REQ-KOT`, `DEP-HW-01`, `WF-KOT-01`

---

## Question

How does a KOT reach the kitchen — printed by which topology, or displayed on a screen — and what is the guaranteed behaviour when that path fails mid-service?

## Context

- Source page 5 describes the KOT flow but does not specify hardware. `kitchen_stations` and `station_routes` in [`schema-reference.md`](../05-database/schema-reference.md) imply multiple destinations per order, which is the multi-station case: one order splits into a hot-kitchen ticket, a cold/salad ticket and a bar ticket. That routing model is already in the schema; what it routes *to* is this decision.
- [`DECISION-LOG.md`](DECISION-LOG.md) rates this Low-medium with a "contained blast radius". That is right for the schema and wrong for operations. The blast radius in code is small; the blast radius in a kitchen at 20:30 is the whole service.
- **The failure semantics are the real content of this decision, not the device.** A KOT is not a document, it is an instruction to cook. The question "what happens when the printer is out of paper and the order has already been accepted and charged" needs an answer that Ops owns. The options are roughly: fail the order (unacceptable), accept and queue silently (dangerous — food never cooked, customer waiting), or accept and alarm loudly at the terminal (workable, but requires a UI and a staff procedure).
- Protocol constraints:
  - Order creation and KOT generation share one transaction (§4). So the *record* of the KOT is transactional; the *physical print* cannot be, because it is an external call and §4 forbids holding a transaction across one. Print is therefore an asynchronous, retryable, idempotent job — and idempotency here means "do not print the same ticket twice", which a naive retry will do.
  - Append-only state (rule 5): reprints, voids and modifications must append to ticket history, not overwrite. A modified order produces a *new* ticket referencing the old, not an edited one.
- Interacts with [DEC-002](DEC-002-offline-pos-capability.md) directly. A cloud-print topology cannot print while the link is down, which makes offline order capture pointless — the kitchen never learns about the order. If offline is approved, the print path must be LAN-local or device-local.
- Procurement lead time is a schedule risk independent of engineering readiness, the same class of exposure as [DEC-007](DEC-007-aggregator-apis.md).

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Cloud printing service.** Server sends the ticket to a hosted print service; a small bridge device at the outlet pulls and prints. No LAN configuration by us. | ~8-12 person-days. Per-device recurring fee. | Print requires internet. Any outage stops the kitchen, and it stops it *silently* from the server's point of view — the server believes it dispatched. Adds a third-party dependency in the middle of the most time-critical path in the product. Forecloses offline entirely. | Yes in code; contractually depends on the service agreement. |
| B | **LAN network printers, direct from a local print agent.** ESC/POS over TCP to network printers; a lightweight agent at the outlet (or on the POS terminal) owns the queue, retries and status. | ~12-18 person-days, plus a per-site network configuration burden (static IPs or reservations, VLAN, firewall). Hardware procurement. | Works without internet — the strongest operational property here. Cost is support: every site becomes a small network we are implicitly responsible for, and "the printer stopped" becomes our ticket even when it is the site's router. Printer model differences in ESC/POS dialects are a real and tedious compatibility surface. | Yes. The agent abstraction can later target other transports. |
| C | **Kitchen Display System (KDS), no printing.** Screens at each station; tickets bumped by touch. Ticket state becomes data rather than paper. | ~20-30 person-days (a second real UI with its own availability requirement), plus screen hardware. | Gives genuine `kot_performance` data — prep times, bump times, station load — which paper cannot. But it changes kitchen working practice, and kitchens resist it: a screen cannot be annotated, cannot be clipped to a rail, and fails harder than paper. Requires a printed fallback anyway, so it is rarely a true replacement. | Poorly. Once Ops has trained on KDS and reports depend on bump timestamps, reverting to paper loses the metric series. |
| D | **Hybrid: LAN print as primary, KDS optional per station.** Print agent as in B; `station_routes` already supports per-station destinations, so a station's destination becomes printer *or* display. | B + ~10-15 person-days, deferrable — KDS can be R2 without changing the R1 routing model. | The routing abstraction is the commitment; it is small and already half-present in the schema. Main risk is scope creep, delivering neither well. | Yes — this is the option that keeps both doors open. |

## Impact If Wrong

**If print failure is silent:** an order is taken, charged, and never cooked. The customer waits, complains, and the kitchen has no record it was ever asked. This is the single worst operational outcome in the product and it is entirely a design choice, not an inevitability — it happens only if the terminal is not told that the ticket failed to print. Whichever topology is chosen, the terminal must surface print failure to the person standing in front of it, within seconds, in a way that cannot be dismissed by accident.

**If the retry path is not idempotent:** a transient printer error causes the ticket to print twice. Two identical tickets in a busy kitchen means the dish is cooked twice — real food cost, real waste, and no signal in the data that it happened.

**If cloud printing is chosen and offline capture is later approved under [DEC-002](DEC-002-offline-pos-capability.md):** the offline investment is wasted for the kitchen path. Orders are captured locally and correctly, and none of them reach the cook. The two decisions must be made consistently or one of them buys nothing.

**If KDS-only is chosen and a screen fails during service:** that station loses its entire queue with no physical artefact to fall back on. Paper degrades gracefully; a dead screen does not degrade at all.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/kitchen` (`REQ-KOT`) | Ticket dispatch mechanism; retry/idempotency design; failure notification contract back to the terminal | 3 |
| `WF-KOT-01` | The workflow cannot be written past "ticket generated" | 2 |
| Ticket template / rendering | Paper width, character set, whether templates are ESC/POS or HTML — different disciplines | 2 |
| Procurement (`DEP-HW-01`) | Hardware selection and ordering; lead time is not recoverable | 1 |
| `kot_performance` reporting | Whether prep/bump timestamps exist at all — paper produces almost no telemetry, KDS produces a lot | 1 |
| **Total** | | **~9 person-days/week** |

## Recommendation

**Option D — LAN print agent as the R1 primary, with the station-destination abstraction built now and KDS deferred to R2.**

Reasoning: the decisive property is that a LAN print path keeps working when the internet does not, and the kitchen is the one place in this system where a stall is immediately visible to a paying customer standing in the room. Cloud printing (A) is cheaper and simpler to deploy, and it fails in exactly the condition this market makes likely. That single property outweighs its deployment convenience.

The abstraction in D is cheap because [`schema-reference.md`](../05-database/schema-reference.md) already carries `station_routes` — making the route's destination polymorphic (printer or display) is a modest addition now and avoids re-modelling the kitchen when KDS is funded.

Two things that should be approved as requirements rather than left to implementation, because they are where this decision actually goes wrong:

1. **Print failure is loud and terminal-side.** The dispatch job reports status back; the terminal shows an undismissable alert naming the order and the station. Ops should also define the manual fallback procedure (handwritten chit, verbal call) so staff have something to do when it fires.
2. **Dispatch is idempotent per ticket, not per attempt.** A ticket carries an identity; a retry for a ticket already confirmed printed is a no-op. Without this, the retry logic added to fix silent failures will itself cause double-cooking.

Ops should overrule toward Option C if the kitchen is already screen-native and `kot_performance` telemetry is a stated commercial requirement — but if so, the printed fallback should be funded in the same release, not promised for later.

Ops should overrule toward Option A only if site network management is genuinely not available at the target sites, and in that case the offline question in [DEC-002](DEC-002-offline-pos-capability.md) should be closed as online-only in the same review, so the inconsistency is not carried forward unnoticed.

---

## Decision

## Decision

**Decided:** Option D — Hybrid: LAN print agent as the primary for R1, building KOT routing structures now, but deferring the Kitchen Display System (KDS) and dynamic display screen routing to R2.
**Rationale:** Local network print agent runs without internet, ensuring kitchen order printing never halts during external WAN outages. Deferring the full KDS display terminal logic simplifies R1 delivery scope.
**Approved by:** Operations + IT & Solution Architect
**Date:** 2026-08-08

## Consequences

*To be completed on decision.*

**Becomes possible:** multi-station routing from a single order; reprint and void with an auditable ticket history; under D/C, station-level prep timing feeding `kot_performance`.

**Becomes harder:** under B/D we take on per-site network configuration and the support obligations that follow — printer support tickets become ours by default. Ticket templates become a maintained artefact with device-specific quirks. Every kitchen feature must consider the failure path, not just the happy path.

**Permanent commitment:** the ticket identity and history model. Once tickets, reprints and voids are append-only records referenced by orders, the shape cannot change without re-deriving kitchen history. Hardware choice also commits Ops to a device fleet that is expensive to replace once deployed across sites.

## Follow-Up

- [ ] ADR raised (structural): ADR-0006 — KOT dispatch topology and failure semantics
- [ ] `DECISION-LOG.md` updated
- [ ] Print-failure notification requirement written into `REQ-KOT`
- [ ] Ops to define the manual fallback procedure when dispatch fails
- [ ] Ticket idempotency design confirmed (per ticket, not per attempt)
- [ ] Cross-check [DEC-002](DEC-002-offline-pos-capability.md) — topology must be consistent with the offline answer
- [ ] Hardware shortlist and lead times from Procurement (`DEP-HW-01`)
- [ ] Downstream artifacts updated: `REQ-KOT`, `WF-KOT-01`, `DEP-HW-01`
- [ ] Estimate re-baselined if scope changed
