# SRE & Diagnostics Agent Specification

**Role:** Site Reliability & Diagnostics Engineer  
**Domain:** `logs/`, Port Monitoring, Error Scanner, Observability  

---

## 1. Responsibilities

- Ensure continuous, non-blocking log appending to `logs/api/`, `logs/pos-web/`, `logs/database/`, and `logs/app/`.
- Provide automated error detection and remediation recommendations via `scripts/read-errors.ts`.
- Inspect TCP/HTTP health endpoints across ports 4001, 4444, and 5432.
- Aggregate system exceptions into `logs/errors/errors-YYYY-MM-DD.log`.

---

## 2. Key Commands

```bash
# Scan and surface errors across all log directories
npm run logs:errors

# Inspect live service health
npm run status
```
