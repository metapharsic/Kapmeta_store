# TS-DB — Database Issues

**ID:** TS-DB · **Status:** DRAFT · **Owner:** DBA · **Version:** 1.0 · **Updated:** 2026-08-08

PostgreSQL. Connection, performance, locking, migrations, integrity.

---

## TS-DB-01 — Connection Pool Exhausted

Symptom: `timeout acquiring connection`, everything slow, app otherwise healthy.

```sql
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

SELECT pid, state, now() - query_start AS duration, left(query, 120)
FROM pg_stat_activity
WHERE state <> 'idle' AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;
```

| Finding | Cause | Fix |
|---------|-------|-----|
| Many `idle in transaction` | Transaction left open — **usually an external HTTP call inside a transaction** | Fix the code. Protocol forbids this. |
| Many long `active` | Missing index or a runaway report | [TS-DB-03](#ts-db-03--slow-query) |
| All `idle`, pool still full | Pool leak — connections not released | Restart, then find the unreleased path |

```sql
-- last resort, and only on a confirmed runaway
SELECT pg_cancel_backend($pid);   -- polite
SELECT pg_terminate_backend($pid); -- forceful
```

Never terminate a backend running a migration. You get a half-applied schema.

---

## TS-DB-02 — Deadlock

```sql
SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
       left(blocked.query,80) AS blocked_query,
       left(blocking.query,80) AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

Deadlocks in this system almost always come from **inconsistent lock ordering** across the order → payment → inventory path. Two transactions touching the same rows in different orders will eventually collide under load.

Fix: establish one canonical lock order (orders → payments → stock) and hold it everywhere. Retrying on deadlock hides the problem rather than solving it.

---

## TS-DB-03 — Slow Query

```sql
SELECT calls, mean_exec_time, total_exec_time, left(query,120)
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

```sql
EXPLAIN (ANALYZE, BUFFERS) <the query>;
```

| In the plan | Meaning | Fix |
|-------------|---------|-----|
| `Seq Scan` on a large table | Missing index | Add per the index strategy in `DB-OBJECT-CATALOGUE` |
| Rows estimate far off actual | Stale statistics | `ANALYZE <table>` |
| Nested loop over many rows | Bad join order | Rewrite or add a composite index |
| Sort spilling to disk | `work_mem` too small | Tune, or reduce the result set |
| Query hitting `orders` for a report | **Design defect** | Should read a summary table (`REQ-RPT`) |

**Check first:** does the query filter on `outlet_id`? An outlet-scoped query missing that predicate scans every outlet's data and will get slower every week (RSK-05).

---

## TS-DB-04 — Migration Failed

```
1. STOP. Do not run the next migration.
2. Read logs/database/migration-*.log — find the exact failing statement.
3. Determine: did it commit partially?
```

```sql
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;
```

| Situation | Action |
|-----------|--------|
| Failed inside a transaction | Rolled back cleanly. Fix the migration, re-run. |
| Failed outside a transaction (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`) | **Partial state possible.** Inspect manually before retrying. |
| Failed on production data but passed on empty DB | The migration is not data-safe. Fix forward with a new migration. |
| Timed out on a large table | Needs a batched, resumable backfill instead |

**Never** edit a merged migration. **Never** hand-patch production schema to "match". Both destroy the guarantee that every environment is reproducible from migrations.

A failed `CREATE INDEX CONCURRENTLY` leaves an invalid index:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY <invalid_index>;
```

---

## TS-DB-05 — Disk Filling

| Suspect | Check |
|---------|-------|
| Audit/event partitions | Partition sizes on `audit_logs`, `access_logs`, `inbound_events`, `outbound_events` |
| Archival job not running | Job schedule + last run |
| WAL accumulating | Replication slot inactive but retained |
| Bloat | `pg_stat_user_tables` dead tuples |

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size,
       n_dead_tup
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

Archival policy is DEC-010. If that decision is still open, disk growth is unbounded by design — flag it rather than deleting rows to buy time.

**Never delete audit rows to free space.** Archive them.

---

## TS-DB-06 — Data Looks Wrong

Before changing anything, establish what happened:

```sql
SELECT * FROM audit_logs
WHERE entity_type = 'order' AND entity_id = $1
ORDER BY created_at;

SELECT * FROM order_status_history
WHERE order_id = $1 ORDER BY created_at;
```

| Symptom | Likely cause |
|---------|-------------|
| Order total ≠ sum of items | Pricing engine bug, or items edited post-total. See [TS-LOGIC](TS-LOGIC-broken-logic.md) |
| Status regressed | Someone wrote `orders.status` directly instead of appending history — protocol violation |
| Duplicate order from a channel | `uq_inbound_events_external` missing or bypassed. See [TS-INT](TS-INT-integration-failures.md) |
| Money off by rounding | Float crept into the path. Grep for `NUMERIC`/`FLOAT` in the tax code. |
| Stock balance ≠ sum of movements | Trigger `trg_stock_balance` failed or was bypassed |

Repair only after the cause is understood. A corrective UPDATE on a misdiagnosed row makes the original problem unrecoverable.

---

## TS-DB-07 — Replica Lag

```sql
SELECT client_addr, state, sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication;
```

Reporting reads from a replica. Lag means the dashboard shows stale numbers — which will be reported as a "wrong totals" bug. Check lag before investigating the reporting logic.

---

## Escalate When

- Data loss suspected → **stop all writes**, page the DBA, preserve WAL
- Migration partially applied to production → DBA, do not improvise
- Money-bearing rows inconsistent → **S1**
- Restore required → follow the DR procedure in [`../../10-devops/environments-and-cicd.md`](../../10-devops/environments-and-cicd.md)
