# Troubleshooting

**ID:** TS-INDEX · **Status:** DRAFT · **Owner:** SRE · **Version:** 1.0 · **Updated:** 2026-08-08

Start from the **symptom**, not from the subsystem. Nobody reporting a problem knows which module it is in.

---

## Symptom Router

| Symptom | Go to |
|---------|-------|
| App crashes, 500s, blank screen, slow response | [TS-APP](TS-APP-application-errors.md) |
| Query timeout, deadlock, migration failed, disk full, connection pool exhausted | [TS-DB](TS-DB-database-issues.md) |
| Online order missing, duplicate order, menu not syncing, webhook failing | [TS-INT](TS-INT-integration-failures.md) |
| KOT not printing, order stuck in a status, payment not settling, shift won't close | [TS-WF](TS-WF-workflow-failures.md) |
| Numbers don't add up, wrong tax, report disagrees with Z-report, stock drifting | [TS-LOGIC](TS-LOGIC-broken-logic.md) |
| Production incident, need severity/escalation | [`../runbook.md`](../runbook.md) |

---

## First Five Minutes

Before diagnosing, establish scope. It changes everything about what you look at next.

```
1. WHO is affected?      one terminal / one outlet / all outlets
2. WHEN did it start?    correlate with the last deploy, migration, or config change
3. WHAT changed?         deploy, migration, config, aggregator API, certificate, network
4. IS MONEY AFFECTED?    if yes → escalate to S1 immediately, do not investigate alone
5. GET A CORRELATION ID  from the error screen, log, or support ticket
```

**Scope tells you the layer:**

| Scope | Almost always |
|-------|--------------|
| One terminal | Client, network, or that device's session |
| One outlet | Outlet config, local network, or outlet-scoped data |
| All outlets | Deploy, migration, shared infrastructure, or an external dependency |

---

## The Golden Rules

1. **Preserve data.** Never delete during recovery. Not orders, not payments, not logs. A recoverable outage becomes an unrecoverable one the moment someone "cleans up".
2. **Correlation ID first.** One ID traces the whole path. Grepping by timestamp turns 10 minutes into 2 hours.
3. **Read before writing.** Look at the actual rows before running an UPDATE. On a POS the row is somebody's money.
4. **Roll back the app, not the schema.** Migrations are written backward-compatible precisely so this is safe.
5. **One change at a time.** Two simultaneous fixes mean you learn nothing about which worked.
6. **Write it down.** Anything that takes over 30 minutes to solve becomes a new entry in the relevant guide.

---

## Severity

| Sev | Definition | Response |
|-----|-----------|----------|
| **S1** | Cannot take orders, or money is wrong | Immediate page, all hands, comms every 30 min |
| **S2** | Degraded — payments, KOT, or a channel down | Page on-call, 1 h response |
| **S3** | Single-feature fault with a workaround | Next business day |

Anything touching money is S1 until proven otherwise. An incorrect total that reaches an invoice cannot be fixed by a redeploy.

Post-incident review within 24 h for S1/S2.

---

## Log Locations

| Layer | Local | Deployed |
|-------|-------|----------|
| Application | `logs/app/` | Loki: `{module="orders"}` |
| Errors only | `logs/app/error-*.log` | Loki: `{level="error"}` |
| Database | `logs/database/` | RDS/PG logs + `pg_stat_statements` |
| Integration | `logs/integration/` | Loki: `{module="integration-hub"}` |
| Audit | `audit_logs` table | `audit_logs` table |

Format and field reference: [`../LOGGING-STANDARD.md`](../LOGGING-STANDARD.md).

---

## When It Is Not In These Guides

1. Search `audit_logs` for what changed around the reported time
2. Check the deploy and migration history
3. Reproduce in STAGING with production-shaped data
4. Escalate per the table in [`../../ONBOARDING.md`](../../ONBOARDING.md) ("Who To Ask")
5. **Add the finding here once solved.** The next person having this problem at 8 p.m. on a Friday is the reason this folder exists.
