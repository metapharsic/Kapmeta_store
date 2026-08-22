# Environments & CI/CD

**Status:** DRAFT · **Owner:** DevOps

## Pipeline

```
DEV → QA → UAT → STAGING → PRODUCTION
 ↓     ↓     ↓        ↓          ↓
Unit  Func  Business Prod-like  Live
Tests Tests Accept.  Rehearsal  Ops
```

| Env | Purpose | Data | Deploy trigger |
|-----|---------|------|----------------|
| DEV | Developer integration | Synthetic seed | Every merge to `develop` |
| QA | Functional + regression | Synthetic seed | Nightly + on demand |
| UAT | Business acceptance | Anonymized snapshot | Release candidate tag |
| STAGING | Production rehearsal, perf, DR drill | Anonymized snapshot | Release candidate tag |
| PRODUCTION | Live | Live | Manual approval on release tag |

## CI Gates (build fails otherwise)

1. Lint + typecheck
2. Unit tests + coverage threshold
3. Migration up/down dry run against a fresh database
4. API contract validation against OpenAPI spec
5. Dependency vulnerability scan (no high/critical)
6. Secret scanning
7. Container image build + scan

## CD Rules

- Migrations run as a separate step before the app rollout, and must be backward-compatible with the previous app version (expand → migrate → contract).
- Rolling deploy with health-check gate.
- Production deploys require a named approver and a prepared rollback plan.

## Observability

Metrics (Prometheus) · logs (structured JSON, correlation ID) · traces (OpenTelemetry) · dashboards (Grafana).

**Alerting on:** order placement error rate, payment failure rate, integration dead-letter depth, KOT delivery latency, database connection saturation, p95 API latency breach.

## Backup & DR

Nightly full + continuous WAL archiving. RPO 15 min, RTO 1 h. Restore drill quarterly in STAGING — an untested backup is not a backup.
