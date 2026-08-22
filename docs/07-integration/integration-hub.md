# Integration Hub

**Source:** page 4 (Swiggy/Zomato) · **Coverage:** 30% · **Risk:** HIGH

## Components

```
Integration Hub
├─ Channel Account Manager      credentials, outlet mapping
├─ Inbound Webhook Receiver     signature auth, raw event persistence
├─ Outbound API Client          menu sync, status updates
├─ Mapping Engine               external ID ↔ internal ID
├─ Retry / Dead-letter Queue    failure handling
├─ Sync Status Store            reconciliation tracking
└─ Reconciliation Service       settlement matching
```

Each channel is an **adapter** behind one internal interface. Aggregator API changes must never reach domain modules.

## Inbound Order Workflow

1. Receive webhook or polling event
2. Authenticate / verify source signature
3. **Persist raw event before processing** (audit trail, replayable)
4. Check idempotency key — duplicate returns prior result
5. Map external item IDs → internal menu items
6. Validate availability + pricing policy
7. Create internal order (transactional)
8. Generate KOT → kitchen
9. Acknowledge external channel (200 OK)
10. Publish real-time status to UI
11. Record correlation ID for troubleshooting

Step 3 precedes step 4 deliberately: an event that fails processing is still recoverable.

## Failure Handling Matrix

| Failure | Strategy | SLA |
|---------|----------|-----|
| Network timeout | Exponential backoff retry | 3 attempts over 15 min |
| Duplicate event | Idempotent success response | Immediate |
| Unknown item mapping | Quarantine + operator alert | Manual resolution |
| Invalid price/tax | Business-defined fallback or reject | Configuration-driven |
| External API rejection | Persist error + expose manual retry | Operator action |
| Repeated failure (5+) | Dead-letter queue + escalation | 30 min alert |

## Outbound Sync

Menu availability, price, and item metadata push to channels. Versioned, idempotent, ordered per item. Sync status surfaces in the menu UI as Synchronized / Failed / Pending with a retry control.

## Reconciliation

Nightly job matches channel-reported orders and settlements against internal orders and payments. Mismatches produce an exception report for finance — never an automatic adjustment.

## Prerequisites

Partner API documentation, sandbox credentials, and POS-partner certification. Engage partners in **week 1** — certification lead time is the top schedule risk (DEC-007).
