# MAP-EVT — Event to Consumer

**ID:** MAP-EVT · **Status:** DRAFT · **Owner:** Solution Architect · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** MAP-REQ, HLD module boundaries · **Traced by:** `contracts/events/`

Async wiring. This is how modules talk without reading each other's tables.

---

## Event Catalogue

| Event | Publisher | Payload key fields | Consumers | Delivery |
|-------|-----------|-------------------|-----------|----------|
| `order.placed` | `orders` | order_id, outlet_id, channel, type, totals | `kitchen`, `reporting`, `inventory` | at-least-once |
| `order.status_changed` | `orders` | order_id, from, to, actor, reason | `reporting`, `integration-hub`, UI realtime | at-least-once |
| `order.cancelled` | `orders` | order_id, reason_code, actor, post_kot | `kitchen`, `inventory`, `finance`, `reporting` | at-least-once |
| `kot.created` | `kitchen` | kot_id, order_id, station_id, items | UI realtime, printer adapter | at-least-once |
| `kot.completed` | `kitchen` | kot_id, order_id, duration_ms | `orders`, `reporting` | at-least-once |
| `payment.captured` | `finance` | payment_id, order_id, method, amount_minor | `orders`, `reporting`, `finance` (invoice) | **exactly-once semantics via idempotency key** |
| `refund.issued` | `finance` | refund_id, payment_id, amount_minor, business_day | `orders`, `reporting`, `inventory` | at-least-once |
| `invoice.generated` | `finance` | invoice_id, order_id, invoice_number | `reporting`, ledger export | at-least-once |
| `menu.item_availability_changed` | `menu` | item_id, channel_id, state, version | `integration-hub`, UI realtime | at-least-once, **version-ordered** |
| `channel.sync_failed` | `integration-hub` | sync_job_id, channel, error, attempt | UI realtime, alerting | at-least-once |
| `channel.order_received` | `integration-hub` | inbound_event_id, channel, external_order_id | `orders` | idempotency-guarded |
| `stock.moved` | `inventory` | movement_id, ingredient_id, qty, type | `reporting`, low-stock alerting | at-least-once |
| `user.role_changed` | `auth` | user_id, outlet_id, roles_before, roles_after | session invalidation, audit | at-least-once |

---

## Consumer Obligations

**Every consumer must be idempotent.** Delivery is at-least-once; duplicate handling is the consumer's problem, not the broker's.

| Consumer | Must handle |
|----------|------------|
| `kitchen` ← `order.placed` | Duplicate must not create a second KOT for the same order+station |
| `inventory` ← `order.*` | Duplicate must not double-deduct stock (movement carries source event ID) |
| `reporting` ← all | Duplicate must not double-count; summaries are recomputed, not incremented blindly |
| `integration-hub` ← `menu.*` | Out-of-order delivery: a lower `version` never overwrites a higher one |
| `finance` ← `order.cancelled` | Refund is issued once, even on redelivery |

---

## Ordering Guarantees

| Requirement | Mechanism |
|-------------|-----------|
| Menu availability must apply in change order | `version` column on `item_availability`; consumers discard stale versions |
| Order status must not regress | Consumer checks `order_status_history`, not the event alone |
| Payment before invoice | Invoice generation subscribes to `payment.captured`, not a timer |

Do not assume broker ordering. Assume out-of-order and design the consumer to cope — that assumption is free, and the alternative is a class of bug that only appears under load.

---

## Failure Path

```
Consumer fails
      ↓
Retry with exponential backoff (3 attempts / 15 min)
      ↓  still failing
Dead-letter queue
      ↓
Alert at DLQ depth > 50  (WF-INT-03)
      ↓
Manual inspection → fix → replay from DLQ
```

Raw inbound channel events are persisted **before** processing, so a replay is always possible. See [`../07-integration/integration-hub.md`](../07-integration/integration-hub.md).

---

## Schema Location

Event payload schemas: `contracts/events/`. Versioned like APIs — a breaking payload change is a new event version, never an in-place edit.
