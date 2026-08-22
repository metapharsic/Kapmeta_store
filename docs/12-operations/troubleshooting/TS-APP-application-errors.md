# TS-APP — Application Errors

**ID:** TS-APP · **Status:** DRAFT · **Owner:** SRE · **Version:** 1.0 · **Updated:** 2026-08-08

Crashes, 5xx, blank screens, slowness, auth failures.

---

## TS-APP-01 — 500 On Every Request

| Check | Command / location | Meaning |
|-------|-------------------|---------|
| App started? | health endpoint / pod status | Crash loop vs running |
| Startup errors | `logs/app/error-*.log`, first 50 lines | Missing env var, failed DB connect |
| Config validation | startup log | `packages/config` rejects invalid env at boot |
| DB reachable | `psql $DATABASE_URL -c 'select 1'` | See [TS-DB](TS-DB-database-issues.md) |
| Migration state | `logs/database/migration-*.log` | App started against an unmigrated DB |

**Most common cause:** app deployed before its migration ran. Fix: run migrations, restart. This is why CD runs migrations as a separate step before rollout.

---

## TS-APP-02 — 403 On Everything

Not a bug in most cases. Work down this list:

| Cause | Verify | Fix |
|-------|--------|-----|
| Missing `X-Outlet-Id` | Request headers in `logs/app/http-*.log` | Client must send it |
| Outlet not granted to user | `user_roles` for that `user_id` | Grant the role, outlet-scoped |
| Role lacks the permission | `v_user_effective_permissions` | Grant permission to role |
| Session outlet ≠ header outlet | `error` log, `outlet.mismatch` | **Security event — investigate, do not just fix** |
| Token expired | JWT `exp` | Refresh flow broken? |

```sql
SELECT p.code
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p       ON p.id = rp.permission_id
WHERE ur.user_id = $1
  AND (ur.outlet_id = $2 OR ur.outlet_id IS NULL);
```

`outlet.mismatch` in the logs means a request carried an outlet in the body that differed from the session grant. There is no legitimate cause for this. Treat it as an intrusion attempt until proven to be a client bug.

---

## TS-APP-03 — Slow Responses / p95 Breach

Isolate the layer before optimizing anything.

```bash
jq 'select(.duration_ms > 500) | {route, duration_ms, module}' logs/app/http-*.log | sort | uniq -c
```

| Pattern | Likely layer | Next step |
|---------|-------------|-----------|
| One route slow | Query or N+1 | [TS-DB-03](TS-DB-database-issues.md) |
| All routes slow | Pool, CPU, or GC | Connection pool + host metrics |
| Slow only at peak | Pool exhaustion or lock contention | `pg_stat_activity` |
| Slow after a deploy | Regression | Compare against the previous release |
| Dashboard slow, POS fine | Aggregating live tables | Should read summary tables (`REQ-RPT`) |

Dashboard queries hitting `orders` directly instead of `daily_sales_summary` is the single most common performance defect in this system's design (RSK-05).

---

## TS-APP-04 — Blank Screen / Frontend Crash

| Check | Where |
|-------|-------|
| Console errors | Browser devtools |
| Failed API calls | Network tab, look for 4xx/5xx |
| Error boundary triggered | Should show a correlation ID — get it |
| Version mismatch | Client built against an older API contract |

A blank screen means the error boundary did not catch it, or a state is unhandled. Both are `UX-STATE-CATALOGUE` violations — file it as a defect, not just an incident.

---

## TS-APP-05 — Memory Growth / OOM

| Suspect | Check |
|---------|-------|
| Unbounded query result | Any endpoint without pagination |
| Cache without TTL | Redis key count and memory |
| Event listener leak | Long-lived websocket connections |
| Large payload buffering | Webhook receiver holding raw bodies |

Reproduce with a load test before "fixing" — memory graphs invite confident wrong conclusions.

---

## TS-APP-06 — Realtime Not Updating (Live Orders / KOT Board)

| Cause | Check | Fallback |
|-------|-------|----------|
| WebSocket blocked by proxy | Browser console | Should degrade to polling automatically |
| Consumer stopped | Queue consumer health | Restart consumer |
| Event not published | `logs/app/*.log` for the event name | Publisher-side bug |
| Client not subscribed | Subscription on mount | Client bug |

**Realtime is an enhancement, never the only path.** If the board is blank rather than merely stale, polling fallback is broken — that is the actual defect.

---

## Escalate When

- Money is affected → **S1**, immediately
- `outlet.mismatch` present → Security, immediately
- Data appears lost → **stop**, preserve everything, page the DBA
- Cause unknown after 30 minutes → escalate rather than continuing alone
