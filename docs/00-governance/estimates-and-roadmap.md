# Estimates & Roadmap

**Status:** PLANNING BASELINE — not a commitment until Phase 0 closes.

## Timeline (16-24 weeks to production)

```
Phase 0: Discovery & Requirements    ████░░░░░░░░░░░░  2-3 wk
Phase 1: UX/UI Design System         ░░░████░░░░░░░░░  3-4 wk
Phase 2-3: Architecture + Database   ░░░░░░███░░░░░░░  4-6 wk
Phase 4-6: Core POS (Menu/Order/KOT) ░░░░░░░░█████░░░  8-12 wk
Phase 7: Online Integration          ░░░░░░░░░░░███░░  4-6 wk
Phase 8-9: Inventory + Finance       ░░░░░░░░░░░░░███  6-10 wk
Phase 10-11: CRM + Reporting         ░░░░░░░░░░░░░░██  6-8 wk
Phase 12-15: Security/Test/Perf      ░░░░░░░░░░░░░░░█  4-6 wk
Phase 16: Pilot + Rollout            ░░░░░░░░░░░░░░░█  2-4 wk
```

Independent modules run in parallel.

## Effort by Phase

| Phase | Duration | Team | Effort (PW) |
|-------|----------|------|-------------|
| 0 Discovery | 2-3 wk | 4-5 | 10-15 |
| 1 UX/UI | 3-4 wk | 2-3 | 8-12 |
| 2-3 Architecture + DB | 4-6 wk | 3-4 | 16-24 |
| 4-6 Core POS | 8-12 wk | 6-8 | 48-96 |
| 7 Online Integration | 4-6 wk | 3-4 | 16-24 |
| 8-9 Inventory + Finance | 6-10 wk | 4-5 | 24-50 |
| 10-11 CRM + Reports | 6-8 wk | 3-4 | 18-32 |
| 12-15 Hardening | 4-6 wk | 6-8 | 24-48 |
| 16 Rollout | 2-4 wk | 8-10 | 16-40 |
| **Total** | **16-24 wk** | **peak 10-12** | **180-341 PW** |

## Caveat

The range assumes clear decisions and stable requirements. With ~40% of requirements undefined, add 30-50% buffer until DEC-001..DEC-012 close. Re-baseline at Phase 0 exit.

## Phase 0 First Actions

**Week 1-2**
- Kickoff workshop; assign owners to DEC-001..DEC-012
- Business process workshops: order lifecycle, menu, inventory, finance
- Current-state vs future-state workflows documented
- Requirement register with source traceability; freeze R1 scope
- Architecture review; stack approval; cloud strategy; security requirements
- Team assignments; 2-week sprint cadence; dev environments; repo structure

**Week 3-4**
- Reference screens → production wireframes; design system; usability review
- HLD final; OpenAPI baseline; ERD v1.0; integration architecture review
- CI/CD pipeline; DEV/QA/UAT/STAGING provisioned; observability; backup/DR
