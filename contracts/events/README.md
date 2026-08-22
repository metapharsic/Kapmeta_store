# Domain Event Contracts

**Status:** DRAFT · **Owner:** Solution Architect · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** [`../../docs/mappings/MAP-EVT-event-to-consumer.md`](../../docs/mappings/MAP-EVT-event-to-consumer.md)
**Traced by:** [`../../docs/09-testing/e2e-scenarios.md`](../../docs/09-testing/e2e-scenarios.md), [`../../docs/09-testing/security-test-cases.md`](../../docs/09-testing/security-test-cases.md)

Schemas: [`events.schema.json`](./events.schema.json) (JSON Schema draft 2020-12). 13 events.

---

## Envelope

Every event, without exception, carries the same envelope:

| Field | Type | Required | Rule |
|---|---|---|---|
| `event_id` | UUID string | yes | Unique per emission. Consumers dedupe on this. |
| `event_type` | string | yes | From the catalogue below. `<domain>.<past_tense_fact>`. |
| `event_version` | integer ≥ 1 | yes | Payload contract version for this `event_type`. |
| `occurred_at` | RFC 3339 UTC | yes | When the fact happened, not when it was published. `Z` suffix required. |
| `outlet_id` | UUID string | yes | Scoping boundary. Resolved from the session/channel account, **never** from a request body. |
| `correlation_id` | string | yes | Propagated from `X-Correlation-Id` through logs, queue messages, downstream calls. |
| `idempotency_key` | string | yes | Stable across redeliveries of the same fact. The consumer's dedupe key of record. |
| `payload` | object | yes | Per-event, below. |

No additional top-level properties. Envelope fields are never duplicated into `payload`.

---

## Event Catalogue

| # | `event_type` | Publisher | Consumers | Delivery |
|---|---|---|---|---|
| 1 | `order.placed` | `orders` | `kitchen`, `reporting`, `inventory` | at-least-once |
| 2 | `order.status_changed` | `orders` | `reporting`, `integration-hub`, UI realtime | at-least-once |
| 3 | `order.cancelled` | `orders` | `kitchen`, `inventory`, `finance`, `reporting` | at-least-once |
| 4 | `kot.created` | `kitchen` | UI realtime, printer adapter | at-least-once |
| 5 | `kot.completed` | `kitchen` | `orders`, `reporting` | at-least-once |
| 6 | `payment.captured` | `finance` | `orders`, `reporting`, `finance` (invoice) | exactly-once semantics via idempotency key |
| 7 | `refund.issued` | `finance` | `orders`, `reporting`, `inventory` | at-least-once |
| 8 | `invoice.generated` | `finance` | `reporting`, ledger export | at-least-once |
| 9 | `menu.item_availability_changed` | `menu` | `integration-hub`, UI realtime | at-least-once, **version-ordered** |
| 10 | `channel.sync_failed` | `integration-hub` | UI realtime, alerting | at-least-once |
| 11 | `channel.order_received` | `integration-hub` | `orders` | idempotency-guarded |
| 12 | `stock.moved` | `inventory` | `reporting`, low-stock alerting | at-least-once |
| 13 | `user.role_changed` | `auth` | session invalidation, audit | at-least-once |

---

## Money

Money is always an object:

```json
{ "amount_minor": 24500, "currency": "INR" }
```

`amount_minor` is an **integer** in the smallest currency unit (paise), mirroring the `*_minor BIGINT` DB convention. `currency` is ISO 4217, denormalized onto the payload so a historical event keeps its own currency. A floating-point amount in any payload is a contract violation, not a rounding concern. Rates are integer basis points (`*_bps`), 5% = 500.

See [`../../docs/database/mappings/DB-MAP-column-conventions.md`](../../docs/database/mappings/DB-MAP-column-conventions.md).

---

## Consumer Obligations

**Delivery is at-least-once. Every consumer must be idempotent.** Duplicate handling is the consumer's problem, not the broker's. Dedupe on `event_id`, or on the domain key plus `idempotency_key`.

| Consumer | Must handle |
|---|---|
| `kitchen` ← `order.placed` | A duplicate must not create a second KOT for the same order + station. |
| `inventory` ← `order.*` | A duplicate must not double-deduct. The stock movement carries the source event ID. |
| `reporting` ← all | A duplicate must not double-count. Summaries are recomputed, not blindly incremented. |
| `integration-hub` ← `menu.*` | A lower `version` never overwrites a higher one. |
| `finance` ← `order.cancelled` | The refund is issued once, even on redelivery. |
| `orders` ← `kot.completed` | Status must not regress; check `order_status_history`, not the event alone. |

---

## Ordering

Do not assume broker ordering. Assume out-of-order delivery and design the consumer to cope — that assumption is free, and the alternative is a class of bug that only appears under load.

| Requirement | Mechanism |
|---|---|
| Menu availability applies in change order | `menu.item_availability_changed.payload.version` — an **integer**. Consumers **MUST discard** an event whose `version` is lower than or equal to the version already applied for that `(item_id, channel_id)`. |
| Order status must not regress | Consumer checks `order_status_history`, not the event alone. |
| Payment before invoice | `invoice.generated` subscribes to `payment.captured`, never to a timer. |

The `version` rule is the only ordering guarantee consumers implement themselves, and it is mandatory. Without it: admin turns an item OFF (v5) then ON (v6); the v5 response lands after v6; the aggregator shows OFF while POS shows ON. Verified by [`../../docs/09-testing/e2e-scenarios.md`](../../docs/09-testing/e2e-scenarios.md) TST-E2E-12.

---

## Versioning Rules

1. `event_version` starts at `1` for every `event_type` and increments independently per type.
2. **Breaking changes require a new `event_version`. Never edit a published version in place.** Same rule as the API: `contracts/openapi/` versions in the path, events version in the envelope.
3. Breaking = removing a field, renaming a field, narrowing a type, tightening an enum by removing a value, changing units or semantics of an existing field, or making an optional field required.
4. Non-breaking = adding an **optional** field, adding an enum value that consumers already treat as unknown-tolerant, relaxing a constraint. These ship under the same `event_version`.
5. Consumers must ignore unknown payload fields. A consumer that rejects on an unrecognized field blocks every future additive change.
6. Publishers emit **one** version at a time. During a migration, dual-publish `v(n)` and `v(n+1)` until every consumer has moved, then retire `v(n)`.
7. A retired version is removed from `events.schema.json` only after consumer confirmation, and the removal is itself a documented change.
8. `event_type` strings are permanent. A renamed concept is a new type plus a migration, never a reused string — the same rule as never reusing an enum value.
9. Schema changes are reviewed with the consumer list from the catalogue above attached. "Who breaks?" is answerable from this file.

---

## Failure Path

```
Consumer fails
      ↓
Retry with exponential backoff (3 attempts / 15 min)
      ↓  still failing
Dead-letter queue
      ↓
Alert at DLQ depth > 50   (WF-INT-03)
      ↓
Manual inspection by correlation_id → fix → replay from DLQ
```

Raw inbound channel events are persisted **before** processing, so replay is always possible. The `UNIQUE (channel_account_id, external_event_id)` constraint on `inbound_events` makes replay safe. See [`../../docs/workflows/WF-INT-integration.md`](../../docs/workflows/WF-INT-integration.md).

---

## Validation

CI validates every emitted event against [`events.schema.json`](./events.schema.json). The schema is the source of truth, not documentation of whatever shipped. Producer tests validate on emit; consumer tests validate on receive.
