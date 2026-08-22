# Phase 0 Decision Register

**Status:** OPEN · **Blocks:** all development
**Exit criteria:** every row `APPROVED` with owner signature and date.

| ID | Decision | Options | Impact if wrong | Owner | Status | Due |
|----|----------|---------|-----------------|-------|--------|-----|
| DEC-001 | Single vs multi-outlet architecture | Single-tenant / outlet-scoped from day 1 | Rewrites data model, permissions, reporting | Product Owner | OPEN | Wk 1 |
| DEC-002 | Offline POS required? | Online-only / offline-capable with sync | Determines sync + conflict-resolution architecture | PO + IT | OPEN | Wk 1 |
| DEC-003 | Recipe/BOM inventory automation | Manual stock / auto-deduct on order | Fundamental inventory architecture | Operations + Finance | OPEN | Wk 2 |
| DEC-004 | Tax calculation rules | Inclusive / exclusive, per-item vs per-order, GST slabs | Invoice accuracy, statutory compliance | Finance + Tax | OPEN | Wk 1 |
| DEC-005 | Payment gateway | Which providers, capture vs auth, settlement file format | Payment reconciliation architecture | Finance | OPEN | Wk 2 |
| DEC-006 | Printer/KOT hardware | Network / USB / cloud print, ESC-POS profile | Kitchen station routing design | Operations + IT | OPEN | Wk 2 |
| DEC-007 | Aggregators beyond Swiggy/Zomato | Scope list, API vs POS-partner certification | Integration scope and timeline | Business | OPEN | Wk 2 |
| DEC-008 | Discount & promotion rules | Types, stacking, approval thresholds | Pricing engine design | PO + Finance | OPEN | Wk 2 |
| DEC-009 | Reporting KPI formulas | Net sales tax treatment, qualifying order states | Every dashboard number | Finance + PO | OPEN | Wk 2 |
| DEC-010 | Data retention & archival | Retention per entity, archive target | Storage cost, legal exposure | Legal + IT | OPEN | Wk 3 |
| DEC-011 | Security/compliance obligations | PCI scope, PII handling, audit depth | Security architecture, audit depth | Security + Legal | OPEN | Wk 1 |
| DEC-012 | Deployment target | Cloud provider, region, k8s vs managed | IaC and cost model | IT | OPEN | Wk 3 |

## Recording a Decision

Append below when a row moves to APPROVED. Then raise a matching ADR in `docs/adr/`.

```
DEC-XXX | Decided: <choice> | Rationale: <why> | Approved by: <name, role> | Date: <YYYY-MM-DD> | ADR: adr-XXXX
```

## Risk if Unresolved

30-50% rework potential once development begins. ~40% of production requirements are undefined by the source document.
