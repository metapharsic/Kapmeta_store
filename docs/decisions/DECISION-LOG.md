# Decision Log

**ID:** DEC-LOG · **Status:** APPROVED · **Owner:** Product Owner · **Version:** 1.1 · **Updated:** 2026-08-09
**Traces to:** CP-00 · **Traced by:** all REQ-, DB-, API-, UX- artifacts

Live status of every Phase 0 decision. This is the file to check before starting any work.

---

## Status Summary

| Total | Open | Approved | Blocked modules |
|-------|------|----------|----------------|
| 20 | **0** | 20 | none |

12 from the original Phase 0 register, 8 surfaced during requirement drafting (DEC-013..020). All 20 approved by Abdul Mannan (Admin, acting across all decision-owner roles) 2026-08-09 — see individual DEC files' Decision blocks. Several carry placeholder numeric values (DEC-010 retention periods, DEC-015 approval thresholds) pending real statutory/distribution data; DEC-020 is a genuine legal question that admin sign-off does not substitute for actual counsel — flagged in its own file.

This table reads 0 open. Per Checkpoint Protocol, this closes DECISION-LOG.md's own criterion but is only one of CP-00's 8 exit criteria — see `../checkpoints/CHECKPOINTS.md`.

---

## Decision Packets

Every decision has a full packet: options with tradeoffs, quantified impact, blocked work, and an engineering recommendation the owner is free to overrule. Decision fields are blank pending sign-off.

| | | |
|--|--|--|
| [DEC-001](DEC-001-outlet-architecture.md) outlet architecture | [DEC-008](DEC-008-discount-promotion-rules.md) discounts | [DEC-015](DEC-015-po-approval-thresholds.md) PO thresholds |
| [DEC-002](DEC-002-offline-pos-capability.md) offline POS | [DEC-009](DEC-009-reporting-kpi-formulas.md) KPI formulas | [DEC-016](DEC-016-variance-tolerance-bands.md) variance bands |
| [DEC-003](DEC-003-recipe-bom-inventory.md) recipe/BOM | [DEC-010](DEC-010-data-retention-archival.md) retention | [DEC-017](DEC-017-retrospective-po-policy.md) retrospective PO |
| [DEC-004](DEC-004-tax-calculation-rules.md) tax rules | [DEC-011](DEC-011-security-compliance-baseline.md) security baseline | [DEC-018](DEC-018-purchase-finance-module-boundary.md) purchase/finance boundary |
| [DEC-005](DEC-005-payment-gateway.md) payment gateway | [DEC-012](DEC-012-deployment-target.md) deployment target | [DEC-019](DEC-019-po-transmission-method.md) PO transmission |
| [DEC-006](DEC-006-printer-kot-hardware.md) printer/KOT hardware | [DEC-013](DEC-013-accounting-system-export-target.md) accounting export | [DEC-020](DEC-020-erasure-vs-invoice-retention.md) **erasure vs retention** |
| [DEC-007](DEC-007-aggregator-apis.md) aggregator APIs | [DEC-014](DEC-014-loyalty-program-model.md) loyalty model | |

**Escalate DEC-020 first.** It is a legal question with no clean technical answer, and it must be settled before any customer data is stored in production.

---

## Decision Table

| ID | Decision | Owner | Due | Status | Blocks | Downstream artifacts |
|----|----------|-------|-----|--------|--------|---------------------|
| **DEC-001** | Single vs multi-outlet architecture | Product Owner | Wk 1 | 🟢 APPROVED | — | All `DB-` objects, `REQ-*`, `UX-*` |
| **DEC-002** | Offline POS capability required? | PO + IT | Wk 1 | 🟢 APPROVED | — | `REQ-ORD`, `UX-SCR-POS`, `WF-ORD-01` |
| **DEC-003** | Recipe/BOM inventory automation | Ops + Finance | Wk 2 | 🟢 APPROVED | — | `REQ-INV`, `REQ-PUR`, `DB-TBL-STOCK_MOVEMENTS` |
| **DEC-004** | Tax calculation rules | Finance + Tax | Wk 1 | 🟢 APPROVED | — | `REQ-BIL`, `REQ-FIN`, `DB-TBL-TAX_RULES` |
| **DEC-005** | Payment gateway integration | Finance | Wk 2 | 🟢 APPROVED | — | `REQ-BIL`, `DEP-EXT-03`, `API-PAY` |
| **DEC-006** | Printer / KOT hardware | Ops + IT | Wk 2 | 🟢 APPROVED | — | `REQ-KOT`, `DEP-HW-01` |
| **DEC-007** | Aggregators beyond Swiggy/Zomato | Business | Wk 2 | 🟢 APPROVED | — | `DEP-EXT-01/02`, `WF-INT-01` |
| **DEC-008** | Discount & promotion rules | PO + Finance | Wk 2 | 🟢 APPROVED | — | `REQ-ORD`, `DB-TBL-DISCOUNTS` |
| **DEC-009** | Reporting KPI formulas | Finance + PO | Wk 2 | 🟢 APPROVED | — | `REQ-RPT`, `DB-TBL-*_SUMMARY` |
| **DEC-010** | Data retention & archival | Legal + IT | Wk 3 | 🟢 APPROVED (placeholder periods) | — | `DB-TBL-AUDIT_LOGS`, `REQ-FIN` |
| **DEC-011** | Security / compliance requirements | Security + Legal | Wk 1 | 🟢 APPROVED | — | `REQ-AUTH`, all security controls |
| **DEC-012** | Deployment target | IT | Wk 3 | 🟢 APPROVED | — | `infra/`, `DEP-INT-*` |

---

## Newly Identified — Raised During Requirement Drafting

Surfaced while writing the R2/R3 specs. Not in the original Phase 0 register; each needs an owner assigned at CP-00 kickoff.

| ID | Decision | Raised by | Owner | Status | Blocks |
|----|----------|-----------|-------|--------|--------|
| **DEC-013** | Target accounting system for ledger export | `REQ-FIN` | Finance | 🟢 APPROVED | — |
| **DEC-014** | Loyalty program model (points / visits / tiered / cashback) | `REQ-CRM` | PO + Marketing | 🟢 APPROVED (deferred, Option E) | — |
| **DEC-015** | PO approval threshold values | `REQ-PUR` | Finance | 🟢 APPROVED (placeholder bands) | — |
| **DEC-016** | Receipt / price variance tolerance bands | `REQ-PUR` | Finance + Ops | 🟢 APPROVED | — |
| **DEC-017** | Retrospective PO policy (goods received without a PO) | `REQ-PUR` | Finance + Ops | 🟢 APPROVED | — |
| **DEC-018** | Purchase ↔ Finance module boundary (who owns vendor invoices) | `REQ-PUR`, `REQ-FIN` | Architect + Finance | 🟢 APPROVED | — |
| **DEC-019** | PO transmission method to vendors | `REQ-PUR` | Ops | 🟢 APPROVED | — |
| **DEC-020** | Right-to-erasure vs statutory invoice retention conflict | `REQ-CRM`, `REQ-FIN` | **Legal** | 🟢 APPROVED (admin sign-off, not independent counsel) | — |

**DEC-020 stays the one to watch.** Signed here under admin authority, but the packet is explicit this is a legal question engineering cannot resolve, and admin sign-off is not a substitute for actual counsel on a DPDP Act conflict. Get real legal review before any customer data is stored in production, regardless of this signature.

---

## Cost Of Delay

| Decision | Weekly cost if unresolved | Why |
|----------|--------------------------|-----|
| DEC-001 | **Critical** — retrofitting outlet scoping later touches every table, query, permission and report, against live data | Schema-wide |
| DEC-004 | **Critical** — tax errors are statutory, not cosmetic; wrong invoices already issued cannot be un-issued | Legal exposure |
| DEC-011 | **Critical** — security architecture cannot be bolted on after the fact | Rework |
| DEC-002 | High — offline changes the entire client architecture, not a feature flag | Client rewrite |
| DEC-007 | High — partner certification has multi-week lead time regardless of our readiness | Schedule (RSK-11) |
| DEC-005 | High — reconciliation design depends on settlement file format | Rework |
| DEC-003 | Medium — R2 scope, but schema decisions land in R1 | Migration |
| DEC-009 | Medium — every dashboard number is provisional until signed | Rework + trust |
| DEC-006/008/010/012 | Low-medium — contained blast radius | Localized |

Overall exposure if the register stays open past Phase 0: **30-50% rework** (RSK-01).

---

## Decision Record Format

When a decision closes, append here:

```
### DEC-NNN — <title>
**Decided:** <the choice, stated unambiguously>
**Rationale:** <why, including what was rejected and why>
**Approved by:** <name, role>
**Date:** YYYY-MM-DD
**ADR:** ADR-NNNN (if structural)
**Artifacts to update:** <IDs>
```

---

## Closed Decisions

### DEC-001 — Single vs Multi-Outlet Architecture
**Decided:** Option A — Every operational table carries `outlet_id NOT NULL` and all permissions are outlet-scoped from migration 001.
**Rationale:** The cost of retrofitting outlet scoping later is estimated at 35-60 person-days of high-risk migrations. Building it from day 1 is cheap insurance against database-wide changes.
**Approved by:** Product Owner & Solution Architect
**Date:** 2026-08-08
**ADR:** ADR-0001

### DEC-002 — Offline POS Capability
**Decided:** Option D — Start online-only for R1, but enforce all enablers (client-generated UUIDv7s, Idempotency-Keys on all writes, decoupled order numbering per terminal). Re-route to C (full offline write) in R1.1.
**Rationale:** Simplifies debugging the core domain in R1, while keeping the architecture reversible at minimal cost.
**Approved by:** PO + IT & Solution Architect
**Date:** 2026-08-08
**ADR:** ADR-0002

### DEC-006 — Printer / KOT Hardware
**Decided:** Option D — Hybrid LAN print agent as the primary for R1, deferring KDS station-display routing to R2.
**Rationale:** Network print agent at the outlet runs without internet, maintaining operational safety during outages.
**Approved by:** Operations + IT & Solution Architect
**Date:** 2026-08-08

### DEC-003 — Recipe/BOM Inventory Automation
**Decided:** Option B — Automatic deduction of ingredients from stock based on active recipes when an order is completed, with manual adjustments for waste.
**Rationale:** Streamlines stock tracking automatically, but allows operations to reconcile physical stock variance manually.
**Approved by:** Operations & Finance
**Date:** 2026-08-08

### DEC-004 — Tax Calculation Rules
**Decided:** Option A — Inclusive tax by default, calculated per line item based on standard GST slabs in India.
**Rationale:** Invoicing accuracy requires localized per-item tax slabs (5%, 12%, 18%) for regulatory compliance.
**Approved by:** Finance & Tax
**Date:** 2026-08-08

### DEC-005 — Payment Gateway Integration
**Decided:** Option A — Razorpay integration as primary, utilizing webhook callbacks for capture settlement.
**Rationale:** Webhooks are required for capturing payments and reconciling transactions asynchronously.
**Approved by:** Finance
**Date:** 2026-08-08

### DEC-011 — Security / Compliance Requirements
**Decided:** Option A — Server-side JWT claims mapping roles to permissions, HTTPS transit, and database audit logs on critical tables.
**Rationale:** Meets baseline security requirements for RBAC enforcement and statutory audit trails.
**Approved by:** Security & Legal
**Date:** 2026-08-08

### DEC-012 — Deployment Target
**Decided:** Option A — AWS containerized environment (ECS/Fargate or EKS) with managed RDS PostgreSQL. Local development will bypass Docker completely and run directly on the host.
**Rationale:** Combines reliable cloud infrastructure scaling with simpler, lightweight host-based local development execution.
**Approved by:** IT Lead
**Date:** 2026-08-08

### DEC-007 — Aggregator APIs Beyond Swiggy/Zomato
**Decided:** Option B — channel-neutral hub, Swiggy and Zomato as adapters. No third channel named.
**Rationale:** Schema already assumes channel-neutral shape; abstraction premium over Option A is small. See full packet for detail.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09
**Artifacts to update:** `REQ-INT`, `DEP-EXT-01/02`, `WF-INT-01/02`, `CHANNEL_ITEM_MAPPING`

### DEC-008 — Discount & Promotion Rules
**Decided:** Option B, discount applied pre-tax.
**Rationale:** See DEC-008 packet. Audit row, funding-source tagging, and rounding rule mandatory alongside.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-009 — Reporting KPI Formulas
**Decided:** Option D — minimal signed KPI set for R1.
**Rationale:** See DEC-009 packet. Single calculation layer, versioned formula catalogue, order-level detail retained.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-010 — Data Retention & Archival
**Decided:** Option B mechanism (per-class, archive-not-drop); numeric periods are placeholders pending real statutory figures.
**Rationale:** See DEC-010 packet — periods are a legal-fact question this session cannot substitute for.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-013 — Accounting System Export Target
**Decided:** Option B now, Option A once target system named.
**Rationale:** See DEC-013 packet. CoA/dimensions to be requested from Finance regardless.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-014 — Loyalty Program Model
**Decided:** Option E — defer, no commercial position given.
**Rationale:** Consistent with charter deferring CRM/loyalty to R2/R3.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-015 — PO Approval Threshold Values
**Decided:** Option A, three-band structure; numeric bands are placeholders pending real PO value distribution.
**Rationale:** See DEC-015 packet.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-016 — Receipt/Price Variance Tolerance Bands
**Decided:** Option C first (observe-only), converting to Option B after 8-12 weeks of real data. Invoice-vs-GRN quantity variance stays at 0.
**Rationale:** See DEC-016 packet.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-017 — Retrospective PO Policy
**Decided:** Option B — permitted, distinct document type, capped, mandatory reason code, ratification enforced.
**Rationale:** See DEC-017 packet.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-018 — Purchase ↔ Finance Module Boundary
**Decided:** Option A — Purchase owns vendor invoice through match approval; Finance owns payment execution.
**Rationale:** See DEC-018 packet — locality of data.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-019 — PO Transmission Method
**Decided:** Option A (email + stored artifact) primary, Option B (manual) retained as explicit alternative.
**Rationale:** See DEC-019 packet.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

### DEC-020 — Right-to-Erasure vs Statutory Invoice Retention
**Decided:** Option A — anonymize customer PII on erasure, preserve invoice metadata/totals/transaction IDs.
**Rationale:** See DEC-020 packet. **Flagged:** this is a genuine DPDP Act legal question; admin sign-off is not a substitute for independent legal counsel. Revisit before production customer data storage.
**Approved by:** Abdul Mannan, Admin (acting as Legal/Product Owner authority)
**Date:** 2026-08-09
