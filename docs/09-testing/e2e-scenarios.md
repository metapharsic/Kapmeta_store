# E2E Test Scenarios

**ID:** TST-E2E-01..12 · **Status:** DRAFT · **Owner:** QA Lead · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** [`test-strategy.md`](./test-strategy.md) (Critical E2E Scenarios), `WF-ORD`, `WF-KOT`, `WF-MNU`, `WF-INT`, `MAP-EVT`
**Traced by:** regression suite, UAT pack
**Companion:** [`security-test-cases.md`](./security-test-cases.md)

Twelve scenarios. Eleven expand the critical list in the test strategy; TST-E2E-12 covers the stale-version ordering guarantee that TST-E2E-06 depends on but does not itself prove.

---

## Conventions

| Convention | Rule |
|-----------|------|
| Money | Asserted as `amount_minor` (integer) + `currency`. A float anywhere in a request, response, or event payload is an automatic fail. |
| Timestamps | RFC 3339 UTC. |
| Outlet context | `X-Outlet-Id` header only. Never a body field — see [`security-test-cases.md`](./security-test-cases.md) TST-SEC-05. |
| Idempotency | `Idempotency-Key` on every order/money-creating POST, per [`../06-api/api-standards.md`](../06-api/api-standards.md). |
| Events | Asserted against [`../../contracts/events/events.schema.json`](../../contracts/events/events.schema.json). Envelope validity is checked on every emitted event in every scenario, not only where called out. |
| Seed data | `db/seeds/` 150-item catalogue. Outlet A = system under test, Outlet B = negative-control outlet. |
| Delivery | At-least-once. Any scenario asserting "exactly one X" must be run with a forced duplicate delivery, not only the happy path. |

**Standing assertion (all scenarios):** every event emitted carries `event_id`, `event_type`, `event_version`, `occurred_at`, `outlet_id`, `correlation_id`, `idempotency_key`, `payload` — and `outlet_id` equals the session's outlet grant.

---

## TST-E2E-01 — Dine-In: order → KOT → serve → payment → completion

**Traces to:** WF-ORD-01, WF-KOT-01, WF-PAY-01, REQ-ORD, REQ-KOT
**Priority:** P0

**Preconditions**

- Outlet A open, business date set via `fn_business_date()`.
- POS Operator session (`orders.create`, `payments.capture`), Kitchen User session (`kot.update`).
- Cart spans two station routes (tandoor + beverage) so the multi-ticket path is exercised.
- Tax rules present for every item in the cart.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | POST `/api/v1/orders` with 4 lines across 2 stations, `Idempotency-Key` set | 201. Order `CONFIRMED`. Response money is `amount_minor`/`currency`. |
| 2 | Read `order_items` | `unit_price_minor` and item name are **snapshotted**, not joined live (DB-MAP-COL). |
| 3 | Inspect the DB transaction | Order row and both KOT tickets committed in **one** transaction (WF-ORD-01 steps 5-6). |
| 4 | Consume `order.placed` | Exactly one event; payload carries `order_id`, `outlet_id`, `channel`, `type`, totals as `amount_minor`. |
| 5 | Read KOT board | 2 tickets, both `PENDING`, one per station, both referencing the same `order_id`. |
| 6 | Kitchen marks tandoor ticket `PREPARING` then `DONE` | Order stays **not** `READY` — beverage ticket still open (WF-KOT-01). |
| 7 | Kitchen marks beverage ticket `DONE` | Order → `READY`. Two `kot.completed` events, each with `duration_ms`. |
| 8 | Serve; mark served | Status appended to `order_status_history`; no row updated in place. |
| 9 | POST payment capture with `Idempotency-Key` | 201. `payment.captured` emitted once. |
| 10 | Await invoice | `invoice.generated` fires **after** `payment.captured`, subscribed to the event, not a timer (MAP-EVT ordering). |
| 11 | Order completes | Status `COMPLETED`. Reporting row on the correct `business_date`. |

**The assertion that matters:** steps 3 and 6. An order must never exist without its KOTs, and `READY` must require *all* tickets done — not the first.

**Failure it catches:** partial commit producing an order the kitchen never sees; premature `READY` on multi-station orders, which sends half an order to the table.

```gherkin
Given an order with items routed to two stations
When the tandoor ticket is marked DONE and the beverage ticket is still PREPARING
Then the order status is not READY
And when the beverage ticket is marked DONE
Then the order status becomes READY exactly once
```

---

## TST-E2E-02 — Pickup: order → KOT → ready → handover

**Traces to:** WF-ORD-02, WF-KOT-01
**Priority:** P0

**Preconditions**

- Two orders staged: (a) pay-at-handover, (b) channel-prepaid with payment not yet captured.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Create prepaid pickup order (b) with no captured payment | Order does **not** reach `CONFIRMED` (WF-ORD-02). |
| 2 | Capture the prepaid payment | Order → `CONFIRMED`; KOT generated only now. |
| 3 | Create pay-at-handover order (a) | `CONFIRMED` immediately; KOT generated. |
| 4 | Kitchen completes both | Both → `READY`; customer notification dispatched once per order. |
| 5 | Attempt handover on (a) with a wrong order number / OTP | Rejected. Status unchanged. Failed attempt recorded. |
| 6 | Handover with correct identifier | → `HANDED_OVER`. |
| 7 | Capture payment for (a) | `payment.captured` once; → `COMPLETED`. |
| 8 | Handover (b) | → `HANDED_OVER` → `COMPLETED` with no second payment. |

**The assertion that matters:** step 1 — a prepaid order must not be confirmed, and therefore must not reach the kitchen, before its money is captured.

**Failure it catches:** food cooked and handed over for an order that was never paid; double capture on prepaid handover.

---

## TST-E2E-03 — Delivery: order → KOT → dispatch → delivered → settlement

**Traces to:** WF-ORD-03, WF-FIN-02
**Priority:** P0

**Preconditions**

- One POS-origin delivery order, one aggregator-origin delivery order (same `type = DELIVERY`, different `channel`).
- Settlement file for the aggregator available for a business date in the past.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Create both orders | Both `type = DELIVERY`; `channel` differs. Type and channel are independent fields. |
| 2 | Kitchen completes | Both → `READY`. |
| 3 | Assign rider | → `ASSIGNED`; `order.status_changed` carries `from`, `to`, `actor`. |
| 4 | Dispatch | → `OUT_FOR_DELIVERY`. |
| 5 | Attempt to move `OUT_FOR_DELIVERY` → `READY` | 409. Status history has no regression (MAP-EVT: "order status must not regress"). |
| 6 | Confirm delivered | → `COMPLETED`. |
| 7 | Ingest aggregator settlement days later | Settlement matched to the **original** `business_date`, not today. |
| 8 | Run daily sales report for the original date | Totals include the settled order at the correct amounts. |

**The assertion that matters:** steps 5 and 7 — status is append-only and monotonic, and settlement reconciles to the original business day.

**Failure it catches:** status regression under redelivered events; settlement silently inflating today's revenue and deflating the original day's.

---

## TST-E2E-04 — Online: Swiggy order → inbound → mapping → KOT → fulfillment → callback

**Traces to:** WF-INT-01, REQ-INT
**Priority:** P0

**Preconditions**

- Channel account configured for Outlet A with signing secret and source IP allowlist.
- Item mapping complete for the payload's items except in step 6's variant.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | POST signed webhook | Signature and source IP verified before anything else (WF-INT-01 step 2). |
| 2 | Inspect `inbound_events` | Raw event persisted **before** parsing (step 3 precedes step 4). |
| 3 | Corrupt the payload body and replay under a new external ID | Raw row still persisted; failure is inspectable by correlation ID; no silent loss. |
| 4 | Normal payload proceeds | External item IDs mapped to internal menu items. |
| 5 | Order created | Internal order created transactionally; `channel.order_received` then `order.placed` emitted. |
| 6 | Variant: payload with an unmapped external item ID | Order **quarantined**, operator alerted, no internal order, no KOT, channel not acknowledged as success. |
| 7 | Check ack timing on the good order | 200 OK returned **only after** the order transaction commits (WF-INT-01 step 9). |
| 8 | Kitchen fulfills | KOT flow as TST-E2E-01. |
| 9 | Status callback to channel | Outbound callback carries the correlation ID recorded at step 11 of WF-INT-01. |

**The assertion that matters:** steps 2 and 7. Persist-before-parse, and acknowledge-after-commit.

**Failure it catches:** an order the channel believes exists but we never created (early ack); an order that vanishes without trace because parsing threw before persistence.

---

## TST-E2E-05 — Menu OFF: new orders blocked, existing orders remain valid

**Traces to:** WF-MNU-01, REQ-MNU
**Priority:** P0

**Preconditions**

- Item `X` is `ON`. One order already placed containing `X` and already `CONFIRMED` with a KOT issued.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Menu Admin toggles `X` to `OFF` | 200. Availability row written with an incremented `version`, audit row in the **same transaction**. |
| 2 | Read `menu.item_availability_changed` | Emitted once, `state = OFF`, integer `version` present. |
| 3 | POST a new order containing `X` | 422 with `ORDER_ITEM_UNAVAILABLE`; `details[].field` points at the offending line index. |
| 4 | POST a new order containing `X` plus 3 available items | Rejected at the line level: the unavailable line is refused, the rest of the cart survives, the response identifies which item (WF-ORD-01 failure path, step 2). |
| 5 | Inspect the pre-existing order | Still `CONFIRMED`, still fulfillable, KOT untouched. |
| 6 | Kitchen completes the pre-existing order | Reaches `READY` → `COMPLETED` normally. |
| 7 | Bulk-disable the whole category containing `X` | Each of the 60 items gets its **own** version, own sync job, own audit row. |

**The assertion that matters:** steps 5-6 — going OFF must never invalidate work already in flight; and step 7 — one audit row for a bulk action is not auditable.

**Failure it catches:** cancelling already-placed orders on an availability toggle; bulk operations that collapse to a single unattributable audit row.

```gherkin
Given item X is ON and order O containing X is CONFIRMED with a KOT issued
When an admin sets X to OFF
Then a new order containing X is rejected with ORDER_ITEM_UNAVAILABLE
And order O remains CONFIRMED and fulfillable to COMPLETED
```

---

## TST-E2E-06 — Menu ON: item orderable after channel sync confirms

**Traces to:** WF-MNU-01, WF-INT-02
**Priority:** P0

**Preconditions**

- Item `X` is `OFF` on channel `C`. Adapter for `C` is stubbed with controllable latency and failure injection.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Toggle `X` to `ON` | Internal state `ON` immediately; version incremented; sync job queued. |
| 2 | Before adapter responds, read the UI sync state | `Partial Changes` / `Pending` — internal ON, channel not yet pushed. |
| 3 | Adapter responds success | Sync state → `Synchronized`. Item orderable on channel `C`. |
| 4 | Force the adapter to fail the push | Sync state `Failed`, error persisted, manual retry control available (UX-SCR-18). |
| 5 | Retry manually; adapter is idempotent | Retry does not create a second sync job for the same version; channel state converges. |
| 6 | Inverse case: internal `OFF` but channel push fails | Display is `Failed` at **highest severity** and raises an incident-level alert, not a warning (WF-MNU local-vs-channel table). |

**The assertion that matters:** step 6. Internal-OFF / channel-ON is the only combination where customers can order food the kitchen will not make; it must be louder than every other sync failure.

**Failure it catches:** a failed OFF-push degraded into a routine warning and left unattended.

---

## TST-E2E-07 — Duplicate webhook: exactly one internal order created

**Traces to:** WF-INT-01 step 4, WF-INT-03, threat "replayed webhook creating duplicate orders"
**Priority:** P0 — highest value

**Preconditions**

- Channel account for Outlet A. Payload with fixed `external_order_id` and `external_event_id`.
- Ability to fire N concurrent identical webhooks (race, not just sequence).

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Fire webhook once | 200. One order, one KOT set, one `channel.order_received`, one `order.placed`. |
| 2 | Fire the **identical** webhook a second time, sequentially | 200 with the **prior result** returned, not a new order (WF-INT-01 step 4). |
| 3 | Count orders for that `external_order_id` | Exactly 1. |
| 4 | Count `inbound_events` rows | Both deliveries persisted as raw rows; only one processed to an order. Persistence is not deduped; **processing** is. |
| 5 | Fire 10 identical webhooks concurrently | Exactly 1 order. The 9 losers are rejected by the DB `UNIQUE (channel_account_id, external_event_id)` constraint, not by an application-level pre-check. |
| 6 | Inspect the enforcement point | Verify the failing path surfaces a unique-violation from `uq_inbound_events_external`. An application `SELECT`-then-`INSERT` under concurrency is a **fail** even if the count happens to be 1. |
| 7 | Count KOT tickets | Exactly one ticket per station. Kitchen consumer deduped on `order_id` + `station_id` (MAP-EVT consumer obligations). |
| 8 | Redeliver `order.placed` to the kitchen consumer directly | Still exactly one ticket per station — consumer idempotency, independent of the webhook guard. |
| 9 | Redeliver `order.placed` to the inventory consumer | No double deduction; the `stock_movements` row carries the source event ID and is written once. |
| 10 | Redeliver `order.placed` to reporting | Totals unchanged; summaries recomputed, not blindly incremented. |
| 11 | Replay from the persisted raw event after a manual fix | Idempotency guard still holds; no second order (WF-INT-03 replay safety). |

**The assertion that matters:** step 5 with step 6. One order under a concurrent burst, enforced by a database unique constraint. A passing count with application-level dedupe is a latent failure that appears under production load and not before.

**Failure it catches:** duplicate orders from aggregator retries — food cooked twice, customer charged once, inventory wrong, revenue wrong. This is the single most expensive integration bug in the system.

```gherkin
Given a channel account with no prior events
When 10 identical signed webhooks with the same external_event_id arrive concurrently
Then exactly one internal order exists
And exactly one KOT ticket exists per station
And exactly one stock movement exists per ingredient
And the 9 rejected inserts failed on uq_inbound_events_external
```

**Also assert:** each duplicate response is a success response carrying the *original* order's identifiers, not a 409. A duplicate delivery is a normal condition of at-least-once delivery, not an error.

---

## TST-E2E-08 — Payment callback retry: exactly one payment transaction

**Traces to:** WF-PAY-01, MAP-EVT (`payment.captured` = exactly-once via idempotency key), API idempotency
**Priority:** P0

**Preconditions**

- One unpaid `CONFIRMED` order. Gateway stub able to resend callbacks and to delay responses.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Capture payment with `Idempotency-Key = K` | 201. One `payments` row. One `payment.captured` event. |
| 2 | Repeat the same request with `K` and an identical body | Original response returned verbatim. Still one `payments` row. |
| 3 | Repeat with `K` and a **different** body | 409 (api-standards idempotency rule). No new payment. |
| 4 | Gateway resends the capture callback 5× | Still one `payments` row; still one `payment.captured`; ledger unchanged. |
| 5 | Redeliver `payment.captured` to the invoice consumer | Exactly one invoice, one `invoice_number` from `fn_next_invoice_number()`. No gap, no duplicate. |
| 6 | Redeliver `payment.captured` to reporting | Revenue total unchanged. |
| 7 | Wait past the 24 h idempotency window, replay `K` | Treated as a new request per policy; assert the documented behavior explicitly rather than leaving it undefined. |
| 8 | Assert amount representation | `amount_minor` integer + `currency` in the API response, the DB row, and the event payload. Any float fails the case. |

**The assertion that matters:** steps 4-5. Retried gateway callbacks must produce one payment and one invoice. Invoice numbering is statutory; a duplicate or a gap is a compliance defect, not a bug report.

**Failure it catches:** double-charged customers; duplicated or gapped invoice sequences.

---

## TST-E2E-09 — Cancellation after KOT: permission + reason + audit validated

**Traces to:** WF-ORD-04, WF-KOT-01, security-framework audited actions
**Priority:** P0

**Preconditions**

- Order `CONFIRMED` with KOT issued and one ticket `PREPARING`.
- Sessions: POS Operator (no elevated cancel right), Outlet Manager (elevated).

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | POS Operator attempts post-KOT cancellation | 403. Order unchanged. **The denied attempt is itself audited** (failed authorization attempts are an audited action). |
| 2 | Outlet Manager cancels with no reason code | 400/422. Reason is mandatory and must come from the configured list. |
| 3 | Outlet Manager cancels with a free-text reason not in the list | Rejected. Enum-backed, not free text. |
| 4 | Outlet Manager cancels with a valid reason code | 200. Status → `CANCELLED`. |
| 5 | Inspect the transaction | Status change and audit row committed **atomically** (WF-ORD-04). |
| 6 | Attempt `UPDATE`/`DELETE` on the audit row as the application role | Permission denied — audit tables are append-only, no application role holds those grants. |
| 7 | Check wastage | Post-KOT cancellation produces a wastage entry when DEC-003 automation is on; assert the configured branch, both states. |
| 8 | Compare with a pre-KOT removal | Pre-kitchen removal is a **void**, different permission, different audit weight — not a cancellation. |
| 9 | Consume `order.cancelled` | One event; `reason_code`, `actor`, `post_kot = true`. Kitchen, inventory, finance, reporting all consume it. |
| 10 | Redeliver `order.cancelled` to finance | Refund issued **once** (MAP-EVT consumer obligation). |

**The assertion that matters:** steps 1, 5 and 6. The denial is audited, the mutation and its audit row are atomic, and the audit row cannot be altered afterwards.

**Failure it catches:** silent cancellations with no attributable actor; audit rows written outside the mutation transaction and lost on rollback; tamperable audit trail.

---

## TST-E2E-10 — Refund: payment, order and report reconciliation all correct

**Traces to:** WF-ORD-04, WF-PAY-02, WF-FIN
**Priority:** P0

**Preconditions**

- Completed, paid, invoiced order from a **prior** business date, 4 lines.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Issue a partial refund against 1 of 4 lines | Accepted at line-item granularity. `refund.issued` emitted with `amount_minor`, `payment_id`, `business_day`. |
| 2 | Check `business_day` on the refund | The **original** order's business date, not today. |
| 3 | Run the daily report for today | Today's totals are not inflated or deflated by this refund. |
| 4 | Run the daily report for the original date | Net revenue reduced by exactly the refunded `amount_minor`. |
| 5 | Check order status | Order does **not** move to a prior status. History is append-only. |
| 6 | Refund the remaining 3 lines | Full-refund state reached by accumulation, not by rewriting the first refund. |
| 7 | Attempt to refund more than the captured amount | Rejected, 422. |
| 8 | Redeliver `refund.issued` to reporting and inventory | Totals unchanged; no second stock adjustment. |
| 9 | Reconcile payments ledger vs order vs report | All three agree to the paise. |

**The assertion that matters:** steps 2-4. A refund booked against today instead of the original business day silently corrupts historical totals, and it corrupts them in a way no error log will ever show.

**Failure it catches:** historical revenue drift; status regression on refund; over-refund.

---

## TST-E2E-11 — Stock shortage: configured behavior (block / alert / substitute)

**Traces to:** WF-ORD-01 step 10, DEC-003
**Priority:** P1 (P0 once DEC-003 resolves)

**Preconditions**

- Recipe-linked item whose ingredient stock is set just below the required quantity.
- The scenario runs **three times**, once per DEC-003 configuration.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Config = `block`: place the order | Order rejected at the availability/stock gate with a machine-readable code. No KOT, no partial order. |
| 2 | Config = `alert`: place the order | Order proceeds; low-stock alert raised; `stock.moved` emitted; resulting stock may go negative and that is visible, not hidden. |
| 3 | Config = `substitute`: place the order | Configured substitute applied; substitution recorded on the order line and surfaced on the KOT so the kitchen sees it. |
| 4 | All configs | `stock_movements` carries the source event ID. |
| 5 | Redeliver `order.placed` to inventory in each config | No double deduction. |
| 6 | Cancel a post-KOT order in each config | Wastage entry per DEC-003; stock does not silently return to sellable. |

**The assertion that matters:** step 3 — a substitution the kitchen cannot see is a wrong dish; and step 5 — deduction is once per order, not once per delivery.

**Failure it catches:** double stock deduction under redelivery; invisible substitutions.

**Note:** parameterize on the DEC-003 setting; do not hardcode one branch. All three are shipping behaviors.

---

## TST-E2E-12 — Out-of-order availability sync: lower version never wins

**Traces to:** WF-MNU-01 ("Why The Version Number Matters"), MAP-EVT ordering guarantees
**Priority:** P0

**Preconditions**

- Item `X`, channel `C`. Broker/consumer harness able to deliver events in a chosen order.

**Steps**

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Toggle `X` OFF → `menu.item_availability_changed` v5 | Event emitted with `version = 5`, `state = OFF`. |
| 2 | Toggle `X` ON → v6 | Event emitted with `version = 6`, `state = ON`. |
| 3 | Deliver v6 to `integration-hub` first | Applied. Channel projection = ON at version 6. |
| 4 | Deliver v5 **after** v6 | **Discarded silently**, logged at debug. Channel projection stays ON at version 6. |
| 5 | Redeliver v6 | Idempotent no-op. Version stays 6. |
| 6 | Deliver v7 (OFF) | Applied. Version 7, state OFF. |
| 7 | Deliver v6 again | Discarded. |
| 8 | Assert the stored version | Monotonically non-decreasing throughout. Never regresses. |
| 9 | Assert `version` type in the payload | Integer. A string or float version fails the case. |

**The assertion that matters:** step 4. A stale response must be dropped, not applied. This is the one ordering guarantee in the system that consumers are contractually required to implement themselves.

**Failure it catches:** the WF-MNU scenario verbatim — item shows OFF on the aggregator while POS says ON (or worse, ON on the aggregator while POS says OFF), because a slow v5 response landed after a fast v6.

```gherkin
Given item X availability is at version 6 with state ON
When a menu.item_availability_changed event with version 5 and state OFF is delivered
Then the consumer discards the event
And the stored version remains 6
And the stored state remains ON
```

---

## Coverage Map

| Strategy scenario | Test ID |
|---|---|
| Dine-in: order → KOT → serve → payment → completion | TST-E2E-01 |
| Pickup: order → KOT → ready → handover | TST-E2E-02 |
| Delivery: order → KOT → dispatch → delivered → settlement | TST-E2E-03 |
| Online: Swiggy order → inbound → mapping → KOT → fulfillment → callback | TST-E2E-04 |
| Menu OFF: new orders blocked, existing orders remain valid | TST-E2E-05 |
| Menu ON: item orderable after channel sync confirms | TST-E2E-06 |
| Duplicate webhook: exactly one internal order created | TST-E2E-07 |
| Payment callback retry: exactly one payment transaction | TST-E2E-08 |
| Cancellation after KOT: permission + reason + audit validated | TST-E2E-09 |
| Refund: payment, order and report reconciliation all correct | TST-E2E-10 |
| Stock shortage: configured behavior | TST-E2E-11 |
| — (ordering guarantee, added) | TST-E2E-12 |

## Performance Gates Attached to E2E Runs

Per [`test-strategy.md`](./test-strategy.md); asserted during the E2E suite, not only in the load suite.

| Scenario | Gate |
|---|---|
| TST-E2E-01 step 1 | POS order placement p95 < 500 ms |
| Menu load in TST-E2E-05/06 | p95 < 800 ms cold, < 200 ms cached (150+ items) |
| TST-E2E-10 steps 3-4 | Dashboard KPI query p95 < 1.5 s |
| TST-E2E-01 steps 5-7 | KOT board refresh < 2 s end-to-end |
| Sustained | 60 orders/min/outlet, 20 concurrent terminals |

## Exit Criteria

All twelve green, zero open critical/high defects, performance gates met, and every event emitted during the run validates against [`../../contracts/events/events.schema.json`](../../contracts/events/events.schema.json).
