# Production Runbook

**Owner:** SRE · **Status:** DRAFT — expand during pilot hypercare.

> **Diagnosing something right now?** Start at [`troubleshooting/README.md`](troubleshooting/README.md) — it routes by symptom.
> Log format and fields: [`LOGGING-STANDARD.md`](LOGGING-STANDARD.md).

## SLOs

| Service | SLO |
|---------|-----|
| Order placement availability | 99.9% monthly |
| POS API latency | p95 < 500 ms |
| KOT delivery to kitchen screen | < 2 s |
| Inbound channel order processing | < 30 s from webhook receipt |

## Alert → Action

| Alert | First check | Action |
|-------|------------|--------|
| Order error rate > 1% | API logs by correlation ID | Identify failing module; roll back if release-correlated |
| Payment failure rate spike | Gateway status page + `payments` errors | Switch to fallback capture mode; notify finance |
| Dead-letter queue depth > 50 | `integration_errors` grouped by channel | Check partner API status; replay after fix |
| KOT latency > 5 s | Queue lag + websocket connections | Restart consumer; failover kitchen display to polling |
| DB connections saturated | Active queries, long transactions | Kill runaway queries; scale pool; check for missing index |
| Disk > 80% on DB | Partition sizes, audit tables | Run archival job per DEC-010 |

## Common Procedures

### Replay a failed inbound channel event
1. Locate event in `inbound_events` by `external_event_id`
2. Confirm no order already exists for it (idempotency check)
3. Trigger replay endpoint; monitor for duplicate creation
4. Record in incident log

### Manual menu resync to a channel
1. Confirm `channel_item_mapping` is complete for the outlet
2. Trigger full resync job for that channel account
3. Verify sync status flips to Synchronized in the admin UI

### Reprint a lost KOT
Use the reprint action — never re-place the order. Reprints increment a counter and write an audit row.

## Incident Severity

| Sev | Definition | Response |
|-----|-----------|----------|
| S1 | Cannot take orders at one or more outlets | Immediate page, all hands, comms every 30 min |
| S2 | Degraded (payments, KOT, or channel down) | Page on-call, 1 h response |
| S3 | Single-feature fault with workaround | Next business day |

Post-incident review within 24 h for S1/S2. Data is never deleted during recovery.
