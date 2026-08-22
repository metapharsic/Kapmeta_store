# DEC-005: Payment Gateway Integration

**ID:** DEC-005
**Status:** OPEN
**Owner:** Finance
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-005 · [`schema-reference.md`](../05-database/schema-reference.md) `payments` constraint `UNIQUE (gateway, gateway_txn_id)`
**Traced by:** `REQ-BIL`, `DEP-EXT-03`, `API-PAY`, `WF-PAY-01/02`, reconciliation design

---

## Question

Which payment acceptance model does R1 integrate — and specifically, does the POS initiate and confirm the transaction through a gateway API, or does it record the result of a transaction completed on a separate terminal?

## Context

- No source material covers payments. `payments`, `refunds`, `settlements` exist authorized by this decision alone ([`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md) reverse lookup).
- The schema has already committed to `UNIQUE (gateway, gateway_txn_id)` to prevent double capture. That constraint presumes there *is* a gateway with transaction IDs. Under a record-only model there may be no such ID, and the constraint becomes unenforceable — the schema would need a different guard.
- [`DECISION-LOG.md`](DECISION-LOG.md) rates this High cost-of-delay with the reason "reconciliation design depends on settlement file format". That is the sharp end. The gateway determines what a settlement file contains, at what cadence it arrives, how fees and taxes on fees are expressed, and therefore what `settlements` and the reconciliation workflow can actually match on.
- Restaurant payment reality in this market is mixed: cash, UPI (frequently via a static QR that the POS never sees), card on a bank-supplied terminal, aggregator-settled online payments, and occasionally wallet. **A meaningful share of digital payments may never touch our gateway at all** — a customer scanning a QR completes a transaction the POS learns about only when a staff member marks the order paid. Any design that assumes gateway-mediated payment will mis-model the most common digital method.
- Protocol constraints in play:
  - Rule 6 — every mutating endpoint and webhook accepts `Idempotency-Key`. Gateway webhooks are the canonical duplicate-delivery case and the testing requirement already mandates a duplicate-delivery test proving exactly one internal record.
  - §4 — never hold a transaction open across an external HTTP call. Payment capture is event-driven and individually retryable. This is not optional under any gateway choice.
  - Rule 10 / §4 logging — no card data, tokens or PAN in logs, fixtures or lower environments.
- **Card data handling is the constraint that most limits the option space.** Any design in which the POS application touches card numbers pulls the whole system into a scope of compliance obligations that R1 is not resourced for. Options below are shaped to keep card data out of our application entirely. Security must confirm this alongside [DEC-011](DECISION-LOG.md).
- Interacts with [DEC-002](DEC-002-offline-pos-capability.md): no gateway-mediated payment works offline. If offline capture is approved, offline settlement is cash-only under every option here.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Record-only (no gateway).** POS records tender type and an optional reference the operator keys in. Card and UPI happen on external devices. `payments` rows are assertions by staff, not confirmations by a payment network. | ~5-8 person-days. No certification, no webhooks, no settlement ingestion. | Nothing is verified. A mis-keyed or fabricated payment record closes an order that was never paid, and there is no independent source to catch it. Reconciliation is manual: someone compares the POS payment summary to the bank statement by hand, daily. `UNIQUE (gateway, gateway_txn_id)` becomes vestigial. | Yes — this is the least-committed position. Adding a gateway later does not invalidate historic records, it just improves later ones. |
| B | **Single gateway, API-initiated, hosted/tokenised.** One provider. POS creates a payment intent, the customer completes it on a provider-controlled surface (dynamic QR, hosted page, or provider terminal), the gateway confirms by webhook. Settlement files ingested into `settlements`. | ~18-25 person-days including webhook idempotency, reconciliation, refund path, and provider onboarding/certification lead time. | Single-provider dependency: their outage is our outage, their fee schedule is our margin, and their settlement format is baked into our reconciliation. Commercial terms are a Finance question that engineering cannot evaluate. Also: this still does not capture the static-QR payments that bypass us. | Partially. The abstraction is reusable; the reconciliation logic is provider-shaped and largely rewritten if the provider changes. |
| C | **Gateway abstraction, one provider implemented.** A `PaymentProvider` interface (intent, confirm, refund, settlement-ingest) with exactly one concrete implementation in R1. | B + ~6-9 person-days. | The classic premature-abstraction trap: an interface designed against one provider usually fits only that provider, and the second one breaks it anyway. The genuine payoff is narrower than it looks — it is in the *settlement ingestion* and *refund* paths, not the capture path. | Yes, and it is the option that makes later changes cheapest — if the abstraction is honest. |
| D | **Terminal-integrated (POS↔card terminal).** POS drives a physically connected or LAN card terminal directly; amount pushed to the device, result read back. | ~20-30 person-days and highly device-specific; bank/acquirer dependency; hardware procurement on the critical path. | Eliminates the most common till error (wrong amount keyed into the terminal) and gives a verified result. But it couples R1 to specific hardware and an acquirer relationship, and the integration protocol is usually vendor-confidential with a slow onboarding path. Overlaps [DEC-006](DEC-006-printer-kot-hardware.md) procurement. | No, cheaply. Hardware and acquirer commitments are contractual. |
| E | **Defer.** Build the order and billing flow with a tender-type stub; decide before R1 hardening. | Blocks reconciliation and `settlements` design; provider onboarding lead time is not recoverable later. | The lead time is the risk, not the code. Provider onboarding and any certification run on the provider's calendar, not ours — the same schedule exposure noted for [DEC-007](DEC-007-aggregator-apis.md). | n/a |

## Impact If Wrong

**If we record payments without verification (A) and staff error or fraud occurs:** orders close as paid against money that never arrived. The gap surfaces only when someone reconciles the bank statement manually, typically days later, by which time the order, the customer and the shift are all gone. There is no transaction ID to trace and no gateway record to appeal to — the POS is the only witness and it is the thing that was wrong.

**If we build against one gateway's settlement format and change provider after go-live:** the reconciliation module is rewritten, and — worse — `settlements` rows written under the old format cannot be re-matched under the new one. Historic reconciliation becomes read-only and un-reprocessable, so any dispute about a pre-migration settlement is resolved from PDFs by hand.

**If webhook idempotency is imperfect:** a duplicate delivery creates a second `payments` row. The `UNIQUE (gateway, gateway_txn_id)` constraint catches the exact-duplicate case, but a retry that arrives with a different event ID for the same transaction does not violate it. The order then shows as overpaid, and the automatic consequence is a refund path triggered against money that was only ever collected once.

**If refunds are designed after capture rather than with it:** the first refund happens on a live customer at the counter. Refund is not the inverse of capture — it has its own authorization, its own partial-amount semantics, its own settlement timing, and its own failure states. Retrofitting it means the append-only `refunds` history begins mid-life.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/finance` (`REQ-BIL`) | `payments.yaml` contract; capture/confirm/refund state machine; tender taxonomy | 4 |
| Reconciliation / `settlements` (`REQ-FIN`) | Entire design — settlement grain, fee representation, match keys, unmatched handling | 3 |
| `services/integration-hub` | Whether a payment webhook receiver is in R1 scope at all; `inbound_events` shape for payment events | 2 |
| UX — POS payment screen | Tender selection, split payment, partial payment, pending/confirming states, failure retry | 2 |
| Procurement / Finance ops | Provider selection, commercial terms, onboarding start — the long-lead item | 1 |
| **Total** | | **~12 person-days/week** |

## Recommendation

**Option C — gateway abstraction with one provider implemented — and start provider onboarding this week regardless of which option is approved.**

Reasoning: the recommendation is really two separate claims, and they should be evaluated separately.

*On the abstraction:* the interface is worth building, but for a narrower reason than usual. The capture path will fit one provider and be rewritten if we switch. The parts that genuinely pay for the abstraction are settlement ingestion and refunds, because those are where provider-specific assumptions leak furthest into the finance module — and where a leak becomes historic, unfixable data rather than replaceable code. Keeping `settlements` in a provider-neutral internal shape, with a per-provider adapter that maps into it, is the specific thing being recommended. If Finance considers the extra 6-9 days unjustified, Option B is defensible provided the settlement table stays neutral.

*On the model:* Option A alone is not recommended for R1, but **Option A must be supported alongside whatever else is chosen**, because cash and static-QR payments exist and will not stop existing. The tender taxonomy therefore needs a first-class "recorded, unverified" class from day 1, and the reconciliation design must expect a permanent unverified bucket rather than treating it as an error state. Designing as though all payments are gateway-confirmed is the most likely way this decision goes wrong in practice.

*On timing:* whatever is decided, the provider onboarding clock should start immediately. It is the only part of this that engineering cannot compress.

Option D is not recommended for R1. The error it fixes is real, but it puts hardware procurement and an acquirer relationship on the critical path for a benefit that can be added in R2 without invalidating anything built under B or C.

Finance should overrule the provider-neutrality recommendation if commercial terms depend on a deep single-provider commitment — that is a legitimate trade, it just needs to be made knowingly rather than by default.

---

## Decision

**Decided:**
**Rationale:**
**Approved by:**
**Date:**

## Consequences

*To be completed on decision.*

**Becomes possible:** verified payment status on the order; automated daily reconciliation; refunds through the same rail as capture; settlement-level fee visibility feeding `ledger_entries`; a payment summary report that can be trusted without manual checking.

**Becomes harder:** the payment path acquires an external dependency with its own uptime, and POS availability now partly depends on it. Every payment change needs a Security reviewer per the protocol. Webhook handling adds a duplicate-delivery test obligation to every payment-touching change. Provider fee changes become a finance event the system must represent.

**Permanent commitment:** the `payments` and `settlements` grain and the match-key strategy. Once reconciliation history exists, changing the match keys means historic settlements cannot be reprocessed. The tender taxonomy is similarly permanent — it is stamped on every order and every report groups by it.

## Follow-Up

- [ ] ADR raised (structural): ADR-0005 — payment capture, refund and settlement model
- [ ] `DECISION-LOG.md` updated
- [ ] Provider onboarding started (long lead — start regardless of option)
- [ ] Security sign-off that no card data enters the application scope (link to DEC-011)
- [ ] Tender taxonomy defined, including the unverified/recorded class for cash and static QR
- [ ] Refund semantics specified with capture, not after (partial, authorization, timing)
- [ ] Duplicate-delivery test written for the payment webhook per [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §5
- [ ] Cross-check [DEC-002](DEC-002-offline-pos-capability.md): offline settlement is cash-only
- [ ] Downstream artifacts updated: `REQ-BIL`, `REQ-FIN`, `DEP-EXT-03`, `API-PAY`
- [ ] Estimate re-baselined if scope changed
