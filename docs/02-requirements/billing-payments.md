# Billing & Payments — Functional Spec

**Source:** fragments only · **Coverage:** 10% · **Status:** DRAFT · **Blocks on:** DEC-004, DEC-005, DEC-010, DEC-011

Almost everything below is **PROPOSED**. The source material describes payment *collection* at a screen level and nothing about gateway behaviour, settlement, or tax. Rules marked PROPOSED are engineering defaults awaiting sign-off — they are not agreed business rules. Do not implement a PROPOSED rule without the corresponding DEC being closed ([`../01-discovery/decision-register.md`](../01-discovery/decision-register.md)).

All amounts are `BIGINT` minor units plus `currency CHAR(3)` per rule 1 of [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md). All tables are outlet-scoped. `payments` and `refunds` are append-only: a payment is never destructively updated, state changes append to payment status history.

## Payment Methods

| Method | Capture timing | Gateway involved | Settlement | Refund path | Status |
|--------|---------------|------------------|-----------|-------------|--------|
| `CASH` | At tender | No | Immediate, into drawer | Cash out of drawer, shift-attributed | PROPOSED |
| `CARD` | Auth then capture (DEC-005) | Yes | T+n per acquirer | Gateway refund API | BLOCKED — DEC-005, DEC-011 |
| `UPI` | Single-step capture on collect/intent callback | Yes | T+0/T+1 per PSP | Gateway refund API | BLOCKED — DEC-005 |
| `WALLET` | Single-step capture | Yes | Per wallet provider | Gateway refund API | BLOCKED — DEC-005 |
| `AGGREGATOR_PREPAID` | Already collected by aggregator before the order reaches POS | No | Aggregator payout cycle, net of commission | Aggregator-initiated only; POS records, does not issue | PROPOSED |
| `SPLIT` | Composite — one `order_payments` row per tender leg | Mixed | Per leg | Per leg, in reverse-capture order (PROPOSED) | PROPOSED |

Notes:

- `AGGREGATOR_PREPAID` must never be refundable from POS. The money is not ours to return. POS records the aggregator's refund as an inbound event.
- Method list is not final. Meal vouchers, credit/on-account, gift cards and loyalty redemption are unscoped — raise a CR if required.
- **Card data never touches our systems.** Scope (P2PE terminal vs hosted gateway page vs SDK) is DEC-011. Until DEC-011 closes, no card entry surface may be built at all.

## Payment State Machine

```
                   ┌─────────────────────────────────────┐
                   ↓                                     │
INITIATED → AUTHORIZED → CAPTURED → SETTLED              │
     │           │           │          │                │
     │           │           │          └→ (terminal)    │
     │           │           │                           │
     │           │           └→ REFUND_PENDING → REFUNDED│(partial: stays CAPTURED,
     │           │                     │                 │ refunded_amount > 0)
     │           │                     └→ REFUND_FAILED ─┘
     │           │
     │           └→ VOIDED         (pre-capture reversal)
     │           └→ EXPIRED        (auth window lapsed)
     │
     └→ FAILED   → (retry creates a NEW payment row, never reuses this one)

Any state → DISPUTED  (chargeback inbound; does not alter the payment row,
                       appends history + opens an exception)
```

### Transition Rules

| From | To | Guard |
|------|----|-------|
| — | INITIATED | Order exists, amount > 0, `Idempotency-Key` present |
| INITIATED | AUTHORIZED | Gateway auth success; `gateway_txn_id` persisted |
| INITIATED | CAPTURED | Single-step methods (UPI, wallet, cash) |
| INITIATED | FAILED | Gateway decline, timeout, or user abandon |
| AUTHORIZED | CAPTURED | Capture call succeeds, or auto-capture per DEC-005 |
| AUTHORIZED | VOIDED | Pre-capture reversal; elevated role + reason + audit row |
| AUTHORIZED | EXPIRED | Auth validity window lapsed without capture |
| CAPTURED | SETTLED | Settlement file/webhook matched to `gateway_txn_id` |
| CAPTURED | REFUND_PENDING | Refund requested; sum of refunds ≤ captured amount |
| REFUND_PENDING | REFUNDED | Gateway confirms; full amount returned |
| REFUND_PENDING | REFUND_FAILED | Gateway rejects; exception raised, no auto-retry |
| any | DISPUTED | Chargeback notification received |

Transitions are validated server-side and append to payment status history. **No transition rewrites an amount.** A wrong amount is corrected by a refund plus a new payment, never by an `UPDATE`.

FAILED is terminal for that row. A retry is a new `payments` row against the same order — this is why `payments` and `orders` are one-to-many, and why order-level "paid" is a derived sum, not a column that gets toggled.

## Capture vs Settlement

Distinct concepts, distinct tables, distinct reports. Conflating them is the single most common finance defect in POS systems.

| | Capture | Settlement |
|--|---------|-----------|
| Meaning | We have taken the payment | The funds actually reached the outlet's bank |
| Table | `payments` | `settlements` |
| Timing | Order time | T+0 to T+7, gateway/aggregator dependent |
| Drives | Order can complete; sales reports | Bank reconciliation; exception reports |
| Amount | Gross tendered | Gross − commission − gateway fee − taxes on fee |
| Business day | Order's business day | Settlement's own date; **never** back-dated into sales |

Sales reports are built on capture. Cash-in-bank reports are built on settlement. The two will not match, by design, and the difference is the reconciliation exception report — see [`finance-accounting.md`](finance-accounting.md).

## Split & Partial Payments

PROPOSED — no source coverage.

- A split payment is N `order_payments` legs, each referencing one `payments` row. There is no "split payment" record type.
- Legs may mix methods (e.g. ₹400 cash + ₹200 UPI).
- Order becomes fully paid when `sum(captured legs) − sum(refunded) == order.total`. Computed at read time, never cached in a mutable column.
- **Overtender:** cash only. Difference is change given, recorded on the cash leg; it is not a tip and not a payment.
- **Undertender / partial:** order stays `PLACED`; it cannot reach `COMPLETED`. Dine-in may run partially paid; prepaid channels may not.
- Leg-level failure does not fail the other legs. A failed leg leaves the order underpaid and is re-tendered as a new leg.
- Maximum leg count: PROPOSED cap of 8, to bound reconciliation complexity. Not agreed.

Rounding of a split is **not** per-leg. The order total is rounded once (see below) and legs are tendered against the rounded total.

## Refunds

- A refund is an append to `refunds` plus an `order_refunds` link. The original `payments` row is never modified; its refunded total is derived.
- Refunds require role permission, a reason code, and write an audit row **in the same transaction** (protocol rule 7).
- Partial refunds are allowed at line-item granularity, consistent with [`orders.md`](orders.md). Sum of refunds against a payment may never exceed its captured amount — enforced by a DB constraint, not application code alone.
- **Refunds report against the ORIGINAL business day**, not the day the refund was issued. Net sales for a closed day therefore change retroactively. Any report cached per business day must be invalidated when a refund lands against it.
- A refund against a `SETTLED` payment is still permitted; it produces its own settlement entry later, usually as a deduction in the next payout.
- Refund of a cash payment is a drawer-out movement attributed to the shift issuing it, but a sales adjustment attributed to the original business day. These are deliberately different attributions.
- Refund method must equal the original capture method unless an elevated role overrides with a reason. Cash-refunding a card payment is a fraud vector; it stays behind a permission and an audit row.

Refund ordering across a split (which leg is refunded first) is PROPOSED as reverse-capture order. Unconfirmed.

## Tips, Service Charge and Rounding

All BLOCKED on DEC-004. Listed so implementation does not silently invent behaviour.

| Concern | Question that must be answered | Current state |
|---------|-------------------------------|---------------|
| Service charge | Taxable or not; before or after discount; opt-out allowed | BLOCKED — DEC-004 |
| Tip | Part of invoice total or a separate non-revenue tender leg; taxable | BLOCKED — DEC-004 |
| Tip on card | Whether the terminal supports tip adjust post-auth | BLOCKED — DEC-005, DEC-011 |
| Rounding | Nearest minor unit vs nearest 50/100; applied to grand total only | BLOCKED — DEC-004 |
| Rounding storage | PROPOSED: a discrete `ROUNDING` adjustment line, never absorbed into an item price or tax | PROPOSED |

Engineering position, for the record: rounding must be a visible line so invoice arithmetic reconstructs exactly. Absorbing rounding into tax makes the tax breakup unverifiable.

Tips are PROPOSED to be excluded from net sales and from AOV — see [`../GLOSSARY.md`](../GLOSSARY.md). Not agreed.

## Cash Drawer & Shift Reconciliation

PROPOSED. No source coverage.

```
Shift OPEN
   ↓  opening float counted + declared (terminal, user, timestamp)
Cash movements accumulate
   ├─ SALE_IN        (cash capture)
   ├─ REFUND_OUT     (cash refund)
   ├─ PAID_IN        (manual, reason required)
   ├─ PAID_OUT       (manual, reason required, elevated role)
   └─ DROP           (cash removed to safe)
   ↓
Shift CLOSE requested
   ↓  BLIND count entered — expected total is NOT shown before entry
   ↓
Variance = counted − (float + ins − outs)
   ├─ within tolerance → shift CLOSED
   └─ outside tolerance → reason mandatory, elevated approval, audit row
   ↓
Shift CLOSED (immutable; corrections are adjustment entries, not edits)
```

- Blind count is deliberate. Showing the expected figure first makes the count worthless as a control.
- Variance tolerance is outlet config, not a constant.
- A shift belongs to one terminal and one business day. A shift crossing the outlet's `day_start_time` is closed and reopened; it is not allowed to span two business days.
- Non-cash tenders are reconciled against the gateway, not the drawer, and appear on the shift report as declared-vs-gateway lines only.

## Gateway Webhook Idempotency

Applies to every inbound gateway/aggregator payment event. Mandatory regardless of which gateway DEC-005 selects.

```
Webhook received
   ↓
Verify signature  ──── invalid ──→ 401, log, DO NOT process
   ↓
Persist raw payload → inbound_events  (UNIQUE (channel_account_id, external_event_id))
   ↓  duplicate key → return 200 immediately, no reprocessing
   ↓
ACK 200 to gateway (fast — before any domain work)
   ↓
Enqueue for async processing
   ↓
Handler resolves payment by (gateway, gateway_txn_id)   ← UNIQUE, prevents double capture
   ↓
Apply state transition if legal; if already applied, no-op
   ↓
Persist result + audit row; repeated failure → DLQ, exception report
```

Rules:

- ACK before processing. A slow handler causes gateway retries, which causes duplicate delivery.
- Out-of-order delivery is expected. A `captured` event arriving after a `settled` event must not regress state — transitions are guarded, late events are recorded and dropped.
- The gateway is the source of truth for payment state, but only via signed events. A client-reported "payment success" never captures a payment on its own.
- Webhook processing never mutates money on a hunch: an event referencing an unknown `gateway_txn_id` becomes an exception, not a new payment.

## Failure Modes

| # | Failure | Detection | Handling | Reports as |
|---|---------|-----------|----------|-----------|
| 1 | Gateway timeout, outcome unknown | No response within timeout | Payment stays INITIATED; reconcile by polling gateway status; never auto-retry the charge | Pending exception |
| 2 | Duplicate webhook delivery | `inbound_events` unique violation | 200, no-op | Nothing |
| 3 | Double capture attempt | `UNIQUE (gateway, gateway_txn_id)` | Rejected at DB level | Exception |
| 4 | Customer charged, order failed | Gateway CAPTURED, no completed order | Refund workflow, manual approval | Exception + refund |
| 5 | Order completed, payment never captured | Derived paid-sum < total at day close | Blocks day close; must be resolved or written off with approval | Day-close exception |
| 6 | Refund exceeds captured amount | Constraint violation | Rejected | Exception |
| 7 | Cash variance beyond tolerance | Shift close | Reason + elevated approval + audit | Shift variance report |
| 8 | Chargeback | Gateway event | Payment → DISPUTED, appended not altered; finance-handled | Dispute register |
| 9 | Offline terminal, cash sale | Connectivity loss | Depends on DEC-002; **no offline card/UPI capture under any circumstance** | BLOCKED — DEC-002 |
| 10 | Aggregator refunds directly | Inbound event | Recorded as `AGGREGATOR_PREPAID` refund; POS does not move money | Original business day |
| 11 | Settlement short vs captured | Reconciliation run | Exception report only — **never** an automatic adjustment | Reconciliation exception |
| 12 | Late webhook after day close | Event timestamp < close time | Applied against original business day; closed-day report invalidated and regenerated | Restated day |

## Data Touchpoints

`payments`, `refunds`, `order_payments`, `order_refunds`, `settlements`, `inbound_events`, `audit_logs`. Definitions in [`../05-database/schema-reference.md`](../05-database/schema-reference.md). Cash drawer/shift tables are not yet in the schema reference — they require an ADR before implementation.

## Open Decisions

| DEC | Blocks |
|-----|--------|
| DEC-004 | Tax on service charge and tips, rounding rule, rounding line representation |
| DEC-005 | Gateway selection, auth-vs-capture model, refund API semantics, supported methods |
| DEC-010 | How long payment and event records are retained before archival |
| DEC-011 | PCI scope — determines whether card entry is built at all, and where |
| DEC-002 | Offline payment capture (cash only, if permitted) |

Nothing in this document is implementable end-to-end until DEC-005 and DEC-011 close. Cash-only flows and the payment state machine can be built ahead of them; anything gateway-facing cannot.
