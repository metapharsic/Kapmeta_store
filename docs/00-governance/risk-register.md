# Risk Register

**Owner:** Product Owner · Reviewed every sprint.

| ID | Risk | Impact | Prob. | Mitigation | Owner |
|----|------|--------|-------|------------|-------|
| R-01 | Unclear business rules | High | High | Phase 0 decision register + signed BRD | PO |
| R-02 | Aggregator API changes | High | Medium | Adapter abstraction + contract tests + monitoring | Integration Lead |
| R-03 | Duplicate online orders | High | Medium | Idempotency keys + persisted inbound events | Backend Lead |
| R-04 | Incorrect pricing/tax | High | Medium | Centralized pricing engine + reconciliation reports | Finance + Backend |
| R-05 | Slow dashboard queries | Medium | High | Pre-aggregations + indexes + query monitoring | DBA |
| R-06 | Inventory mismatch | High | Low | Immutable stock movements + periodic reconciliation | Ops |
| R-07 | POS network outage | High | Medium | Offline strategy decision (DEC-002) | IT |
| R-08 | Permission leakage | High | Low | Server-side RBAC + automated security tests | Security |
| R-09 | Poor user adoption | Medium | Medium | Pilot + training + usability testing | PMO |
| R-10 | Deployment failure | High | Low | CI/CD gates + tested rollback + backups | DevOps |
| R-11 | Integration certification delays | High | High | Engage partners week 1 + contract testing | Business |
| R-12 | Scope creep | Medium | High | Formal change control + release planning | PO |

## Escalation

High-impact + high-probability risks (R-01, R-11) are reviewed weekly with the steering group until mitigated.
