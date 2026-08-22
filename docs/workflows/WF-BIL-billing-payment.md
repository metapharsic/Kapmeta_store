# WF-BIL — Billing & Payment Workflows

**ID:** WF-BIL-01..04 · **Status:** DRAFT · **Owner:** BA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** [`../02-requirements/billing-payments.md`](../02-requirements/billing-payments.md), `REQ-BIL`
**Traced by:** `TST-E2E-BIL-01/02/03/04`, `UX-SCR-PAY-*`
**Blocked by:** DEC-004 (tax), DEC-005 (payment gateway), DEC-008 (discounts), DEC-010 (retention)

---

## WF-BIL-01 — Bill/Invoice Generation

**Trigger:** order reaches a billable state (fulfilled, or payment requested pre-fulfillment per channel)
**Actors:** POS Operator (`invoices.create`) · Pricing Engine (system)

```
1  Load order + line items, current status
2  Resolve applicable tax rule set (outlet, effective-dated)      ← DEC-004
3  Apply discounts / promotions to pre-tax base                   ← DEC-008, BLOCKING — tax base pre/post discount undecided
4  Calculate per-line-item tax, inclusive pricing                 ← DEC-004: GST 5/12/18%, inclusive, per line item
5  Apply service charge / delivery charge                          ← taxability BLOCKED, DEC-004
6  Apply rounding rule to grand total                               ← BLOCKED, DEC-004
7  Assign invoice number (sequential, outlet-scoped, gapless)
8  Persist invoice record                        ┐ ATOMIC
9  Stamp resolved tax_rule_id on every line       ┘
10 Render invoice document (tax invoice vs bill of supply per scheme) ← DEC-004
11 Audit log completion
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 7-9 | One DB transaction | An invoice number issued without a persisted invoice row is a gap that breaks sequential numbering and fails a filing audit |
| 10 | Outside the transaction, retryable | Document rendering is not money; it can fail and be regenerated from the persisted invoice without re-pricing |

Tax logic is never reimplemented at this step — it calls the single pricing engine per DEC-004, never a local calculation.

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 2 | No tax rule resolves for a line item | **Reject invoice generation.** Do not guess a rate. |
| 3 | Discount rule ambiguous (tax base undecided) | Blocked until DEC-008 closes; do not silently pick pre- or post-discount |
| 6 | Rounding produces residue | Residue lands on a visible `ROUNDING` line per outlet policy; never absorbed into tax |
| 7 | Invoice numbering collision | Reject, retry with next number; numbering must stay gapless and sequential |
| 8-9 | Transaction fails | Full rollback; no invoice without its stamped tax rule versions |

**Audit points:** tax rule resolution · discount application above threshold · invoice number assignment · document type chosen (tax invoice vs bill of supply).

---

## WF-BIL-02 — Payment Capture

**Trigger:** operator or channel initiates payment against an invoiced/billable order
**Actors:** POS Operator (`payments.capture`) · Payment Gateway (Razorpay, per DEC-005, system)

```
1  Select tender: CASH / CARD / UPI / gateway-mediated (Razorpay)  ← DEC-005
2  CASH → capture immediately, drawer movement recorded
   CARD/UPI/gateway → create payment intent, Idempotency-Key required
3  Customer completes transaction on gateway-controlled surface
4  Razorpay webhook received                          ← WF-BIL-webhook (below)
5  Verify signature                                    ── invalid → 401, log, do not process
6  Persist raw payload → inbound_events (unique on event id) ── duplicate → 200, no-op
7  ACK 200 to gateway before domain work
8  Resolve payment by (gateway, gateway_txn_id)
9  Apply state transition if legal; already-applied → no-op   ← idempotent
10 Persist result + audit row                       ┐ ATOMIC
11 Order paid-sum recomputed (derived, never cached) ┘
12 Order may proceed (COMPLETED / CONFIRMED per channel rules)
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 10-11 | One DB transaction | A payment recorded without the order's derived paid-sum updated leaves the order in a state that disagrees with its own money |
| 2-9 | Event-driven, individually retryable | Never hold a transaction open across the gateway HTTP call — capture is asynchronous and webhook-confirmed |

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 5 | Bad signature | Reject at 401, log, never process as a payment event |
| 6 | Duplicate webhook delivery | 200 ack, no reprocessing — idempotency via `inbound_events` unique constraint |
| 8 | Unknown `gateway_txn_id` | Exception raised, not a new payment — never mutate money on a hunch |
| 9 | Out-of-order event (e.g. captured after settled) | Guarded transition; late event recorded, state not regressed |
| 1-3 | Gateway timeout, outcome unknown | Payment stays INITIATED; reconcile by polling; never auto-retry the charge |

**Audit points:** payment intent creation · webhook signature verification result · every state transition · duplicate-delivery detection · order paid-sum recomputation.

---

## WF-BIL-03 — Split-Bill

**Trigger:** operator selects split at the payment step against one order
**Actors:** POS Operator (`payments.capture`)

```
1  Choose split mode: by item / equal share / mixed tender
2  BY ITEM     → assign each line item to a payer group
   EQUAL SHARE → order total (post-rounding) divided into N shares
   MIXED       → one order, N tender legs, methods may differ
3  Each leg becomes its own order_payments row referencing one payments row
4  Legs captured independently                       ← WF-BIL-02 per leg
5  Leg failure does not fail other legs; failed leg re-tendered as new leg
6  Order fully paid when sum(captured legs) − sum(refunded) == order.total
7  Computed at read time — never cached in a mutable column
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 3 | One DB transaction per leg | Each leg is an independent payment; legs must not block or roll back each other |
| 6-7 | Not a transaction — a read-time computation | Caching "paid" as a mutable column drifts from the true sum the moment a refund or a late leg lands |

Rounding of a split is not per-leg: the order total is rounded once, legs are tendered against the rounded total.

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 2 | Split mode changed mid-payment (some legs already captured) | Reject the mode change; captured legs stand, remaining balance re-split |
| 4 | One leg fails (e.g. card declined) | Other legs unaffected; order stays underpaid until re-tendered |
| 6 | Sum of legs exceeds order total | Reject at capture; overtender permitted for cash only, recorded as change, not a payment |

**Audit points:** split mode selection · leg-level capture and failure · final paid-sum reconciliation against order total.

---

## WF-BIL-04 — Refund / Void

**Trigger:** authorized user initiates a refund or void against a captured payment
**Actors:** Elevated Role User (`payments.refund`) · Payment Gateway (system)

```
Refund requested against ORIGINAL payment (never a fresh charge)
      ↓
Check permission + reason code                    ← mandatory, elevated role
      ↓  denied → reject + audit the attempt
Determine granularity: full or line-item partial
      ↓
INITIATED
      ↓
PENDING                                            ← sum of refunds ≤ captured amount, DB-enforced
      ↓
   ┌──────────────┴──────────────┐
SUCCESS                        FAILED
   ↓                              ↓
full → REFUNDED              exception raised, no auto-retry
partial → PARTIALLY_REFUNDED  (original payment stays CAPTURED)
      ↓
Refund reported against ORIGINAL business day, not day of refund
      ↓
Audit row written in same transaction as state change
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| PENDING→SUCCESS/FAILED + audit row | One DB transaction | A refund transition without its audit row is unauditable money movement |
| Refund vs original payment row | Original `payments` row never modified | Refunded total is derived; the append-only history is the only legitimate record of what happened |

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| Permission check | Non-elevated user attempts refund | Reject + audit the attempt |
| PENDING | Refund would exceed captured amount | Rejected by DB constraint, not application code alone |
| PENDING→FAILED | Gateway rejects | Exception raised; no automatic retry |
| Method mismatch | Refund method differs from original capture method | Blocked unless elevated override with reason (cash-refunding a card payment is a fraud vector) |
| Any | Refund transition attempted as an UPDATE to the original row | Rejected — refunds are append-only; correcting a wrong amount is a new refund, never an edit |

All transitions (INITIATED→PENDING→SUCCESS/FAILED, SUCCESS→REFUNDED/PARTIALLY_REFUNDED) are immutable and auditable — status history is append-only, never rewritten.

**Audit points:** refund request + reason code · permission check outcome · every state transition · method-mismatch override · business-day attribution of the refund.

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-004 | Steps 2-6 of WF-BIL-01 entirely: tax resolution, discount tax base, service/delivery charge taxability, rounding rule |
| DEC-005 | WF-BIL-02 entirely: gateway (Razorpay) capture/webhook model, idempotency, refund API semantics in WF-BIL-04 |
| DEC-008 | **BLOCKING** — WF-BIL-01 step 3 (discount application to pre-tax base) cannot proceed until pre/post-discount tax base is decided |
| DEC-010 | Retention period for `payments`, `refunds`, `inbound_events` — affects how long WF-BIL-02/04 records stay queryable before archival |
