# WF-ORD — Order Lifecycle Workflows

**ID:** WF-ORD-01..04 · **Status:** DRAFT · **Owner:** BA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** source pages 1-5, `REQ-ORD` · **Traced by:** `TST-E2E-01/02/03`, `UX-SCR-12/14/16`
**Blocked by:** DEC-002 (offline), DEC-004 (tax), DEC-008 (discounts)

---

## WF-ORD-01 — Dine-In: Order to Payment

**Trigger:** operator starts a new order on a POS terminal
**Actors:** POS Operator (`orders.create`) · Kitchen User (`kot.update`) · POS Operator (`payments.capture`)

```
1  Capture order (terminal or channel)
2  Validate availability against menu status         ← fails → item unavailable error
3  Calculate pricing + tax + charges                 ← DEC-004
4  Apply discounts / promotions                      ← DEC-008, threshold may need elevation
5  Create order transaction                ┐ ATOMIC
6  Generate KOT, route to station(s)       ┘
7  Kitchen preparation                                ← WF-KOT-01
8  Fulfillment (serve at table)
9  Payment capture                                    ← WF-PAY-01
10 Inventory consumption (if automated)               ← DEC-003
11 Invoice generation                                 ← WF-FIN-01
12 Reporting update
13 Audit log completion
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 5-6 | One DB transaction | An order that exists without its KOT means food never gets cooked |
| 9-12 | Event-driven, idempotent, individually retryable | Each can fail and retry without corrupting the others |

Never hold a transaction open across an external HTTP call (gateway, printer, aggregator).

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 2 | Item went OFF mid-order | Reject line, keep rest of cart, surface which item |
| 3 | Tax rule missing for item | **Reject the order.** Do not guess a rate. |
| 5-6 | Transaction fails | Full rollback; no partial order, no orphan KOT |
| 6 | Printer offline | KOT still created and shown on display; operator alerted (never blocks the order) |
| 9 | Payment declined | Order stays unpaid and open; retry allowed; no state regression |
| 10 | Stock insufficient | Per DEC-003: block / alert / substitute |

**Audit points:** order creation · every status transition · discount above threshold · payment capture · any elevation.

---

## WF-ORD-02 — Pickup

Same as WF-ORD-01 through step 7, then:

```
8  Order READY → customer notified
9  Handover verified (order number / OTP)
10 Status → HANDED_OVER → COMPLETED
```

Payment may be prepaid (channel) or at handover. Prepaid orders require captured payment before `CONFIRMED`.

---

## WF-ORD-03 — Delivery

```
7  Kitchen preparation
8  Order READY
9  Rider assigned              → ASSIGNED
10 Dispatched                  → OUT_FOR_DELIVERY
11 Delivered confirmed         → COMPLETED
12 Settlement (aggregator, days later)   ← WF-FIN-02
```

Delivery orders may originate from POS **or** an aggregator channel. Order type is fulfillment; channel is origin — see [`../GLOSSARY.md`](../GLOSSARY.md).

---

## WF-ORD-04 — Cancellation & Refund

```
Cancellation requested
      ↓
Check permission                    ← elevated role for post-KOT
      ↓  denied → reject + audit the attempt
Require reason code                 ← mandatory, from configured list
      ↓
Post-KOT?  ──yes──► wastage entry (if DEC-003 automation on)
      ↓ no
Status → CANCELLED  ┐ ATOMIC with audit row
Audit row written   ┘
      ↓
Payment captured?  ──yes──► refund record  ← WF-PAY-02
      ↓
Reports adjusted against ORIGINAL business day
```

**Rules**

- Pre-kitchen removal is a **void**; post-KOT is a **cancellation**. Different permissions, different audit weight.
- Partial refunds allowed at line-item granularity.
- Refunds never move the order to a prior status — status history is append-only.
- A refund reported against today rather than the original business day silently corrupts historical totals. This is deliberate design, not a bug.

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-002 | Whether steps 1-6 can run offline and reconcile later |
| DEC-004 | Step 3 entirely |
| DEC-008 | Step 4, and which discounts need elevation |
| DEC-003 | Step 10 and post-KOT wastage |
