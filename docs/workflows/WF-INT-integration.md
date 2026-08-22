# WF-INT — Integration Workflows

**ID:** WF-INT-01, WF-INT-03 · **Status:** DRAFT · **Owner:** Integration Lead · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** source page 4, `REQ-INT` · **Traced by:** `TST-E2E-04/07`, `UX-SCR-04/18`
**Blocked by:** DEC-007

---

## WF-INT-01 — Inbound Aggregator Order

**Trigger:** webhook from Swiggy/Zomato, or a poll cycle
**Actors:** channel adapter (system) · operator (only on quarantine)

```
 1  Receive webhook / poll event
 2  Authenticate: verify signature + source IP   ← fails → 401, log, alert
 3  PERSIST RAW EVENT                            ← before any parsing
 4  Check idempotency key
        │
        ├─ duplicate → return prior result, stop
        ▼
 5  Map external item IDs → internal menu items
        │
        ├─ unknown mapping → QUARANTINE + operator alert, stop
        ▼
 6  Validate availability + pricing policy
        │
        ├─ price mismatch → configured fallback or reject (DEC-007)
        ▼
 7  Create internal order (transactional)
 8  Generate KOT → kitchen
 9  Acknowledge channel (200 OK)
10  Publish realtime status to UI
11  Record correlation ID
```

**Step 3 before step 4 is deliberate.** If parsing fails on an unpersisted event, the customer's order simply ceases to exist and nobody can tell it ever arrived. Persist first, then process, then replay if needed.

**Step 9 timing:** acknowledge only after step 7 commits. Acknowledging earlier means the channel believes an order exists that we never created.

**Failure matrix**

| Failure | Strategy | SLA |
|---------|----------|-----|
| Network timeout | Exponential backoff retry | 3 attempts / 15 min |
| Duplicate event | Idempotent success response | Immediate |
| Unknown item mapping | Quarantine + operator alert | Manual resolution |
| Invalid price/tax | Business-defined fallback or reject | Configuration-driven |
| External API rejection | Persist error + expose manual retry | Operator action |
| Repeated failure (5+) | Dead-letter queue + escalation | 30 min alert |

**Idempotency guard:** `UNIQUE (channel_account_id, external_event_id)` on `inbound_events`. The database is the enforcement point, not application logic — application-level dedupe loses races.

---

## WF-INT-03 — Failure, Retry, DLQ, Replay

```
Processing failure
      ↓
Classify: transient or permanent?
      │
  transient                    permanent
      ↓                            ↓
Exponential backoff          Persist error
3 attempts / 15 min          Surface in UI (UX-SCR-18)
      ↓ still failing             ↓
      └──────────► Dead-letter queue
                          ↓
              Alert at depth > 50 (30 min)
                          ↓
              Operator inspects (correlation ID)
                          ↓
              Fix root cause (mapping, config, code)
                          ↓
              Replay from persisted raw event
                          ↓
              Idempotency guard prevents duplicates
```

**Replay safety:** because step 3 persisted the raw event and step 4 guards on a unique key, replay is always safe. This is the entire reason for that ordering.

**Operator surface:** `UX-SCR-18` shows sync status (Synchronized / Failed / Pending), the error, and a manual retry control. No operator should need database access to resolve a stuck order.

---

## Adapter Isolation

```
Integration Hub
├─ Channel Account Manager      credentials, outlet mapping
├─ Inbound Webhook Receiver     signature auth, raw persistence
├─ Outbound API Client          menu sync, status updates
├─ Mapping Engine               external ID ↔ internal ID
├─ Retry / Dead-letter Queue    failure handling
├─ Sync Status Store            reconciliation tracking
└─ Reconciliation Service       settlement matching
```

Each channel is an adapter behind one internal interface. **An aggregator API change must never reach a domain module.** That isolation is what makes RSK-02 survivable.

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-007 | Which channels, certification timeline, price-mismatch policy |
| DEC-005 | Payment webhook handling shares this retry/DLQ machinery |

**RSK-11 note:** partner certification has multi-week lead time independent of our readiness. Engage in week 1.
