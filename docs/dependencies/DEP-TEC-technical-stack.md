# DEP-TEC — Technical Stack Dependencies

**ID:** DEP-TEC · **Status:** PROPOSED · **Owner:** Solution Architect · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** HLD, DEC-012 · **Traced by:** `infra/`, CI pipeline

---

## Runtime & Infrastructure

| ID | Component | Version | Crit. | Rationale | Failure mode |
|----|-----------|---------|-------|-----------|-------------|
| `DEP-TEC-01` | PostgreSQL | 16 | **P0** | ACID, complex queries, proven scale | **Total outage.** No orders. |
| `DEP-TEC-02` | Redis | 7 | P1 | Sessions, menu cache, realtime coordination | Sessions lost, cache miss storm |
| `DEP-TEC-03` | Message queue (RabbitMQ / Kafka / SQS) | TBD | P1 | Reliable async + integration | Events queue in outbox; sync path unaffected |
| `DEP-TEC-04` | S3-compatible storage | — | P3 | Invoices, exports, audit documents | Exports unavailable; orders unaffected |
| `DEP-TEC-05` | Node.js | 20 LTS | P0 | Runtime | — |
| `DEP-TEC-06` | Kubernetes / containers | TBD | P0 | Repeatable deploy, horizontal scale | DEC-012 |
| `DEP-TEC-07` | OpenTelemetry + Prometheus + Grafana + Loki | — | P3 | Traces, metrics, logs | Blind but running |

`DEP-TEC-01` is the single hardest dependency in the system. Everything else has a degraded path; PostgreSQL does not.

---

## Application Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | React / Next.js (TypeScript) | PROPOSED |
| Backend | Node.js / NestJS (or Spring Boot) | PROPOSED |
| Realtime | WebSocket / SSE, polling fallback | PROPOSED |
| API contracts | OpenAPI 3.1 | PROPOSED |
| Testing | Unit + integration + Playwright E2E | PROPOSED |

All PROPOSED until architecture review at CP-02.

---

## Library Policy

Adding a dependency requires an ADR covering:

| Question | Why it matters |
|----------|---------------|
| What problem does it solve? | If the answer is "convenience", reconsider |
| Why not the standard library? | Every dependency is a future upgrade and a future CVE |
| License | Legal review for anything not permissive |
| Maintenance status | Last release, open issues, bus factor |
| Bundle / runtime cost | POS runs on modest hardware over restaurant wifi |
| Transitive footprint | A small package pulling 200 transitive deps is not small |

**Banned without explicit security sign-off:** anything handling cryptography, authentication, payment data, or PII that is not an established, audited library. Hand-rolled crypto is never acceptable.

---

## CI-Enforced Gates

| Gate | Action on failure |
|------|------------------|
| `npm audit --audit-level=high` | Build fails |
| Secret scanning (gitleaks) | Build fails |
| License check | Build fails on non-approved license |
| Lockfile committed | Build fails if missing or dirty |
| Container image scan | Build fails on high/critical |

---

## Upgrade Policy

| Type | Cadence |
|------|---------|
| Security patch | Immediate; hotfix path if critical |
| Minor | Monthly batch, regression suite must pass |
| Major | Planned, with an ADR, never bundled with a feature release |
| Runtime (Node, PostgreSQL) | Track LTS; upgrade one release before EOL, tested in STAGING first |

Never upgrade a major version in the same PR as a feature. When something breaks you need to know which of the two caused it.

---

## Version Pinning

Exact versions in lockfiles. Container images pinned by digest, not tag — `postgres:16` can silently become a different image; a digest cannot.

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-012 | Cloud provider, region, Kubernetes vs managed — determines `DEP-TEC-06`, `DEP-EXT-07` |
| DEC-011 | Secrets manager choice, encryption requirements |
| DEC-002 | Offline capability may add a local store + sync engine to the client — a material stack addition |
