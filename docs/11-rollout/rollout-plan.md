# Rollout Plan

**Status:** DRAFT · **Owner:** PMO

## Release Strategy

| Release | Capabilities | Duration | Risk |
|---------|-------------|----------|------|
| R1 — Core POS | Auth, Menu, Orders, KOT, Billing, Dashboard | 12-16 wk | Medium |
| R1.1 — Online | Swiggy/Zomato integration, online orders | +4-6 wk | High |
| R2 — Operations | Inventory, Recipe/BOM, Purchase, Finance | +6-10 wk | High |
| R3 — Growth | CRM, Marketing, Loyalty, Multi-outlet expansion | +6-8 wk | Medium |

## Rollout Phases

### Phase 1 — Pilot (Week 1-2)
Single outlet · load representative menu + config · validate all workflows · run parallel with existing system · train outlet users · hypercare monitoring.

### Phase 2 — Wave 1 (Week 3-4)
2-3 additional outlets · measure defect rate + performance · refine processes · expand training.

### Phase 3 — Wave 2+ (Week 5+)
Gradual rollout to remaining outlets · continuous monitoring · optimization from feedback.

## Go-Live Criteria (R1)

- [ ] All critical E2E scenarios pass
- [ ] Security VAPT remediation complete
- [ ] Performance baselines met (p95 < 500 ms for POS APIs)
- [ ] UAT sign-off from business
- [ ] Production runbooks complete
- [ ] Support team trained
- [ ] Rollback plan tested in STAGING
- [ ] Monitoring and alerting operational

## Rollback Procedure

On critical failure:

1. Freeze deployment
2. **Preserve all transaction data — no deletion**
3. Disable the affected integration if the fault is isolated
4. Restore previous application version
5. Validate database health
6. Run smoke tests
7. Communicate status to stakeholders
8. Post-incident review within 24 hours

Migrations must be backward-compatible so an app rollback never requires a schema rollback.

## Training

Role-based: POS operator (2 h), kitchen user (1 h), outlet manager (4 h), finance (3 h). Quick-reference cards per role. Recorded sessions for later outlets.
