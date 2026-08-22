# Logging Standard

**ID:** OPS-LOG · **Status:** DRAFT · **Owner:** SRE · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** ENGINEERING-PROTOCOL rule 10, DEC-010, DEC-011

Logs are the only evidence available when something goes wrong in a restaurant at 8 p.m. Design them for that moment, not for development convenience.

---

## Format

Structured JSON lines. One event per line. No multi-line messages — they break every log aggregator.

```json
{
  "ts": "2026-08-08T14:32:11.482Z",
  "level": "error",
  "msg": "order.create.failed",
  "correlation_id": "7f3a91c2-...",
  "outlet_id": "b21e...",
  "user_id": "9c4f...",
  "terminal_id": "t-04",
  "module": "orders",
  "event": "order.create",
  "order_id": "a17b...",
  "error_code": "TAX_RULE_MISSING",
  "duration_ms": 142
}
```

---

## Mandatory Fields

| Field | Every log | Why |
|-------|-----------|-----|
| `ts` | yes | RFC 3339 UTC. Never local time. |
| `level` | yes | `debug` / `info` / `warn` / `error` / `fatal` |
| `msg` | yes | **Stable dotted event name**, not a sentence |
| `correlation_id` | yes | Traces one operation across HTTP, queue, adapter, DB |
| `module` | yes | Which service emitted it |
| `outlet_id` | where known | Every operational log is outlet-scoped |
| `user_id` | where known | Who did it |

`msg` being a stable identifier rather than prose is what makes alerting possible. `"order.create.failed"` can be counted and alerted on; `"Failed to create order for table 4"` cannot.

---

## Levels

| Level | Use | Example |
|-------|-----|---------|
| `debug` | Development detail, disabled in production | SQL statements, payload dumps |
| `info` | Business events worth counting | `order.placed`, `kot.created`, `payment.captured` |
| `warn` | Degraded but handled | `printer.unavailable`, `channel.retry`, slow query |
| `error` | Operation failed, user impacted | `order.create.failed`, `payment.capture.failed` |
| `fatal` | Process cannot continue | `db.connection.exhausted` |

**A handled failure is `warn`, not `error`.** Printer offline falls back to the display — that is the system working as designed. Logging it at `error` trains everyone to ignore errors, which is how the real one gets missed.

---

## Never Log

| Forbidden | Log instead |
|-----------|-------------|
| Card number, CVV, PAN | `payment_id`, last 4 only if required |
| Password, PIN, token, refresh token, API key | nothing |
| Customer phone, email, address | `customer_id` |
| Vendor bank details | `vendor_id` |
| Full request body on auth or payment routes | field names only |
| Stack trace to a client | `correlation_id` to the client, trace to the log |

CI scans fixtures and log output for these patterns. A leaked token is a rotated credential and an incident, not a cleanup ticket.

---

## What Must Be Logged

| Event | Level | Required fields |
|-------|-------|----------------|
| Every HTTP request | `info` | route, method, status, `duration_ms`, `outlet_id`, `user_id` |
| Order state transition | `info` | `order_id`, from, to, actor, reason_code |
| Payment capture / refund | `info` | `payment_id`, method, `amount_minor` — **never** card data |
| Permission denied | `warn` | attempted permission, `user_id`, `outlet_id` |
| **Outlet mismatch** (body vs session) | `error` | both values — this is a privilege-escalation attempt |
| Inbound webhook | `info` | channel, `external_event_id`, signature result, idempotency outcome |
| Retry attempt | `warn` | attempt number, backoff, target |
| DLQ move | `error` | message ID, failure count, last error |
| Migration applied | `info` | version, duration, statement count |
| Slow query (> threshold) | `warn` | statement fingerprint, `duration_ms`, rows |
| Audit-worthy mutation | `info` | mirrors the `audit_logs` row |

The outlet-mismatch row is the one to wire an alert to. It has no legitimate cause.

---

## Correlation

```
Client generates X-Correlation-Id  (or the gateway does)
        ↓
Propagated through every HTTP hop
        ↓
Attached to queue message headers
        ↓
Carried into adapter calls to external channels
        ↓
Recorded on inbound_events and integration_errors rows
        ↓
Returned to the client on every error response
```

An operator reading a correlation ID off an error screen to support, who can then retrieve the full cross-system trace, is the difference between a solvable incident and a guess.

---

## Retention & Privacy

| Environment | Retention | Notes |
|-------------|-----------|-------|
| Local | 7 days | Rotated daily, `logs/archive/` |
| DEV / QA | 14 days | |
| UAT / STAGING | 30 days | Anonymized data only |
| **Production** | **DEC-010** | Legal + IT decide; audit logs likely far longer than app logs |

Application logs and `audit_logs` are different things with different retention. Audit is a database table with statutory weight; app logs are operational telemetry. Do not conflate them (DEC-010, DEC-020).

---

## Sampling

| Log type | Production sampling |
|----------|--------------------|
| `error`, `fatal` | never sampled |
| Audit-worthy events | never sampled |
| Payment events | never sampled |
| HTTP `info` | sample above 1000 rps |
| `debug` | disabled |

Never sample anything involving money or permissions. The one dropped line is always the one needed.
