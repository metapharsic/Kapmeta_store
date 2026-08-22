# TS-INT — Integration Failures

**ID:** TS-INT · **Status:** DRAFT · **Owner:** Integration Lead · **Version:** 1.0 · **Updated:** 2026-08-08

Aggregators, payment gateways, webhooks, sync. Highest-risk area in the system (RSK-02, RSK-03, RSK-11).

---

## TS-INT-01 — Online Order Never Arrived

Customer ordered on Swiggy/Zomato. Nothing in the POS. Work outward:

```
Did the webhook reach us?
   SELECT * FROM inbound_events
   WHERE channel_account_id = $1 AND created_at > now() - interval '1 hour';
      │
   no ─┴─ yes
   │        │
   │        ▼
   │     Was it processed?   processed_at IS NULL → stuck
   │        │
   │        ▼
   │     Did it create an order?   orders.channel_order_id
   │        │
   │        ▼
   │     Quarantined?   integration_errors
   ▼
Network / signature / partner-side issue
```

| Finding | Cause | Action |
|---------|-------|--------|
| No `inbound_events` row | Never reached us | Check partner dashboard, endpoint reachability, firewall, certificate |
| Row exists, `processed_at` NULL | Consumer stopped or crashed | Check consumer health, DLQ; replay |
| Row exists, error logged | Mapping or validation failure | See TS-INT-03 |
| Row exists, order exists | It worked — check the UI filter | Often an outlet or date filter issue |

**The raw event is persisted before processing.** That is why recovery is always possible here — replay from `inbound_events` rather than asking the partner to resend.

---

## TS-INT-02 — Duplicate Order From A Channel

**S1 if food was cooked twice.**

```sql
SELECT id, channel_order_id, created_at, status
FROM orders WHERE channel_order_id = $1;

SELECT id, external_event_id, created_at
FROM inbound_events WHERE external_event_id = $1;
```

| Finding | Meaning |
|---------|---------|
| Two orders, two events with **different** `external_event_id` | Partner sent two genuinely distinct events — partner-side issue |
| Two orders, **one** event | Processing ran twice — consumer not idempotent |
| Two orders, two events, **same** `external_event_id` | **`uq_inbound_events_external` is missing.** Verify immediately. |

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'inbound_events'::regclass;
```

The unique constraint is the actual guarantee. An application-level `SELECT`-then-`INSERT` check passes tests and fails under concurrent delivery — it loses the race. If the constraint is absent, that is the root cause regardless of what the application code appears to do (RSK-03, `TST-SEC-27`).

---

## TS-INT-03 — Order Quarantined / Unknown Item

```sql
SELECT * FROM integration_errors
WHERE resolved_at IS NULL ORDER BY created_at DESC;
```

| Error | Cause | Fix |
|-------|-------|-----|
| Unknown item mapping | Item exists on the channel, not mapped internally | Add to `channel_item_mapping`, replay |
| Item mapped but inactive | Mapping points to a deleted/inactive item | Correct the mapping |
| Price mismatch | Channel price ≠ internal price | Policy is DEC-007 — fallback or reject |
| Outlet not mapped | `channel_accounts` missing for that outlet | Configure |

An operator must be able to resolve this from `UX-SCR-18` without database access. If they cannot, the operator surface is the defect.

---

## TS-INT-04 — Menu Not Syncing To Channel

See [TS-WF-06](TS-WF-workflow-failures.md#ts-wf-06--menu-change-not-reflected) for the flow. Integration-side causes:

| Cause | Check |
|-------|-------|
| Credentials expired | `channel_accounts.credentials_ref` → secrets manager |
| Rate limited by partner | 429s in `logs/integration/outbound-*.log` |
| Payload schema changed partner-side | 400s with a new error shape — **RSK-02** |
| Item not mapped | `channel_item_mapping` |
| Stale version discarded | Working as designed — verify before treating as a bug |

**Priority case: internal OFF, channel ON.** Customers can order what the kitchen will not make. S2, immediately.

---

## TS-INT-05 — Webhook Signature Failing

| Cause | Check |
|-------|-------|
| Wrong secret | Secrets manager vs partner dashboard |
| Secret rotated partner-side | Partner notification, rotate ours |
| Body modified in transit | Proxy re-encoding, or the framework parsing before verification |
| Wrong algorithm or encoding | Partner docs vs implementation |
| Timestamp outside tolerance | Clock skew — check NTP |

**Most common:** signature computed over a parsed-and-re-serialized body rather than the raw bytes. Verification must run on the raw body, before any JSON parsing.

Never disable signature verification to "unblock" orders. That endpoint accepts orders from anyone on the internet.

---

## TS-INT-06 — Dead-Letter Queue Filling

```sql
SELECT error_code, count(*), max(created_at)
FROM integration_errors
WHERE resolved_at IS NULL
GROUP BY error_code ORDER BY count(*) DESC;
```

| DLQ depth | Meaning | Action |
|-----------|---------|--------|
| < 10 | Normal transient failures | Monitor |
| 10-50 | Something systematic | Investigate now |
| > 50 | **Alert threshold** | Escalate, 30 min SLA |
| Growing steadily | Partner API changed, or a bug in every message | Stop retrying, fix, then replay |

Replay only after the root cause is fixed. Replaying into the same failure burns retry budget and buries the original error under thousands of duplicates.

---

## TS-INT-07 — Payment Gateway Issues

Blocked context: DEC-005 is open, so specifics depend on the unselected gateway.

| Symptom | Check |
|---------|-------|
| Capture fails | Gateway status page, credentials, amount format |
| Callback not received | Webhook endpoint reachable, signature, gateway dashboard |
| Double capture | `uq_payments_gateway_txn` — **S1 if breached** |
| Settlement mismatch | `WF-FIN-02` reconciliation → exception report, never auto-adjust |
| Refund fails | Original payment state, gateway refund window |

**Never retry a capture without an idempotency key.** That is how a customer gets charged twice.

Fallback when the gateway is down: cash-only mode. Orders must still be takeable — the gateway is P1, not P0 (`DEP-EXT-03`).

---

## TS-INT-08 — Partner API Changed

RSK-02. Symptoms: sudden 4xx across all requests to one channel, or successful responses with an unexpected shape.

```
1. Confirm scope — one channel or all?  One channel = partner-side.
2. Check partner changelog / developer notice
3. Compare current request/response against the adapter's contract test
4. Fix ONLY the adapter — the change must not reach a domain module
5. Add a contract test covering the new shape
6. Replay DLQ once the adapter is fixed
```

The adapter boundary is what makes this survivable. If a partner change requires touching `services/orders`, the isolation has been broken — fix that too, or the next change costs the same again.

---

## Escalate When

- Duplicate orders reached the kitchen → **S1**
- Double payment capture → **S1**
- Channel shows items as available that are internally OFF → **S2**
- All inbound orders from a channel stopped → **S2**
- DLQ over 50 → **S2**, 30 min
- Signature verification failing with no known cause → Security
