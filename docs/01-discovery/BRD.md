# Business Requirements Document — Restaurant POS & Operations Platform

**ID:** BRD-01 · **Status:** DRAFT · **Owner:** Business Analyst · **Version:** 1.0 · **Updated:** 2026-08-09
**Traces to:** [`../checkpoints/CHECKPOINTS.md`](../checkpoints/CHECKPOINTS.md) CP-00 item 2 · `restaurant_pos_project_DETAILED_REQUIREMENTS_AND_DECISIONS_v2.docx` (27-page source + gap-fill analysis)
**Traced by:** all `REQ-*` docs, all `WF-*` workflow docs, `mappings/MAP-SRC-source-to-feature.md`

This document exists to satisfy CP-00 exit criterion #2 ("BRD with workflows approved"). It is a DRAFT — it becomes a CP-00-qualifying artifact only once signed per the sign-off block at the end. Signing this document does not itself close CP-00; the other 7 criteria in [`CHECKPOINTS.md`](../checkpoints/CHECKPOINTS.md) still apply independently, most load-bearing of which is [`DECISION-LOG.md`](../decisions/DECISION-LOG.md) reading 0 open.

---

## 1. Purpose & Source

The source document is 27 pages, primarily visual (dashboard/menu/order screenshots), and does **not** constitute a complete technical or business specification. Section 1.3 of the source-derived plan states this explicitly: the source does not fully specify user roles, business rules, tax configuration, recipe/BOM logic, inventory valuation, purchasing workflow, payment gateway behavior, delivery partner APIs, accounting rules, loyalty rules, CRM fields, multi-outlet behavior, offline synchronization, deployment topology, security controls, or reporting definitions.

This BRD converts what the source shows plus what Phase 0 discovery has since decided (`DECISION-LOG.md`) into an approvable set of business workflows. Where a workflow depends on a decision still OPEN, that dependency is named explicitly rather than assumed — per `mappings/MAP-SRC-source-to-feature.md`, roughly 40% of production requirements have no source evidence and exist as proposed design pending business confirmation.

## 2. Business Flow (End-to-End)

1. **Master setup** — outlet, users, roles, taxes, payment methods, menu categories, items, pricing, availability.
2. **Channel setup** — dine-in, pickup, delivery, external online channels.
3. **Order capture** — from POS or an integrated channel.
4. **Order validation** — price, availability, taxes, discounts, service/delivery charges, payment rules.
5. **Kitchen orchestration** — KOT created, items routed to preparation station(s).
6. **Preparation** — KOT status progresses through configured kitchen states.
7. **Fulfilment** — dine-in served, pickup handed over, delivery dispatched/completed.
8. **Billing/payment** — invoice generated, payment recorded and reconciled.
9. **Inventory impact** — ingredient/stock consumption per confirmed recipe/BOM rules.
10. **Analytics** — transaction events feed dashboard, reports, finance, operational KPIs.
11. **Audit/support** — every critical change recorded with actor, timestamp, outlet, before/after values.

## 3. Release 1 Scope

Per [`../00-governance/project-charter.md`](../00-governance/project-charter.md) §2-3:

**In scope:** Auth/RBAC, Menu & Catalog, Order Management (dine-in / pickup / delivery), KOT, Billing & Payments, Dashboard & core reports.
**Deferred to R2/R3:** Inventory automation, recipe/BOM, purchase, accounting export, CRM/loyalty, multi-currency.

This scope line is itself a CP-00 criterion (#6, "R1 scope frozen") and is not final until signed separately in the checkpoint ledger, independent of this BRD's sign-off.

## 4. Workflow Register

Every workflow below traces to a `WF-*` document with the full step sequence, transaction boundaries, failure paths, and audit points. This BRD does not restate that detail — it is the index and business-level narrative; the `WF-*` doc is the engineering-approvable artifact.

| Workflow doc | Covers | Status | Blocked by (OPEN decisions) |
|---|---|---|---|
| [`WF-ORD-order-lifecycle.md`](../workflows/WF-ORD-order-lifecycle.md) | Dine-in, pickup, delivery, cancellation/refund | DRAFT | DEC-008 (discounts) |
| [`WF-KOT-kitchen.md`](../workflows/WF-KOT-kitchen.md) | Kitchen ticket routing, station flow | DRAFT | — |
| [`WF-MNU-menu-sync.md`](../workflows/WF-MNU-menu-sync.md) | Menu/channel synchronization | DRAFT | DEC-007 (unsigned, see below) |
| [`WF-INT-integration.md`](../workflows/WF-INT-integration.md) | Aggregator inbound order processing | DRAFT | DEC-007 (unsigned) |
| [`WF-BIL-billing-payment.md`](../workflows/WF-BIL-billing-payment.md) | Invoice generation, payment capture, split-bill, refund/void | DRAFT | DEC-008 (discounts), DEC-010 (retention) |
| [`WF-INV-inventory-recipe.md`](../workflows/WF-INV-inventory-recipe.md) | Recipe/BOM stock consumption, PO/GRN, wastage, stock count | DRAFT | DEC-015/016/017/018/019 (purchase-specific; R2 scope) |

Not yet drafted (R2/R3 scope, tracked in `mappings/MAP-SRC-source-to-feature.md` "no source evidence" table): CRM/marketing workflows, finance/accounting export workflows.

## 5. Stakeholders & Sign-Off Authority

Per [`../00-governance/project-charter.md`](../00-governance/project-charter.md) §5 and [`CHECKPOINTS.md`](../checkpoints/CHECKPOINTS.md) CP-00 sign-off row:

| Role | Authority over |
|---|---|
| Product Owner | Scope, priority, discount/promotion policy, acceptance |
| Business Analyst | This document, workflow accuracy, requirement traceability |
| Solution Architect | Technical feasibility of workflows as specified |
| Finance | Tax, payment, billing, retention workflows |
| Operations | Kitchen, fulfilment, inventory workflows |
| Security | RBAC, audit, compliance controls referenced by every workflow |
| Legal | Data retention, erasure, statutory invoice conflicts |

## 6. Known Gaps at Time of Drafting (as of 2026-08-09 sign-off)

- **All 20 decisions in `DECISION-LOG.md` are now APPROVED**, signed by Abdul Mannan (Admin) acting across every decision-owner role. Several carry placeholder numeric values pending real data (DEC-010 retention periods, DEC-015 approval thresholds) — flagged in their own files, not silently treated as final. DEC-020 (erasure vs invoice retention) is flagged separately: a genuine DPDP Act legal question where admin sign-off does not substitute for independent counsel.
- **RBAC matrix** ([`../08-security/security-framework.md`](../08-security/security-framework.md)) now marked APPROVED, same admin authority.
- **Requirement traceability register** ([`../mappings/MAP-SRC-source-to-feature.md`](../mappings/MAP-SRC-source-to-feature.md)) still shows unmapped gaps (CRM/Marketing at 0% coverage) — this register was NOT rewritten as part of this sign-off pass; CP-00 item 8 needs it revisited separately.
- **Partner agreements, budget baseline, team assignment** (CP-00 items 4, 5, 7) are operational/business facts, not documents — no artifact exists to sign for these; they still need actual execution (contracts, budget approval, hiring/assignment).

This BRD closes CP-00 item 2. Items 1 and 3 are now also evidenced (decision log, RBAC). Items 4, 5, 6, 7, 8 still need independent action per [`CHECKPOINTS.md`](../checkpoints/CHECKPOINTS.md).

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Product Owner | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |
| Business Analyst | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |
| Solution Architect | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |
| Finance | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |
| Operations | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |
| Security | Abdul Mannan | Abdul Mannan (Admin) | 2026-08-09 |

Signed by a single admin authority across all roles, not by distinct named individuals per role. Recorded as such — see `CHECKPOINTS.md` CP-00 row for the same caveat.
