# DEC-011: Security & Compliance Baseline — PCI Scope, PII Handling, Audit Depth

**ID:** DEC-011
**Status:** OPEN
**Owner:** Security Engineer + Legal
**Raised by:** Solution Architect
**Due:** Week 1
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../08-security/security-framework.md`](../08-security/security-framework.md), [`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) §PII & Consent, [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Retention
**Traced by:** `REQ-AUTH`, all security controls, `DB-TBL-AUDIT_LOGS`, encryption design, DEC-010, DEC-020, non-prod data strategy

---

## Question

What compliance regime does the platform build to — specifically, what PCI-DSS scope do we accept, what protection level applies to customer PII under the DPDP Act, and how deep does the audit trail go?

## Context

[`../08-security/security-framework.md`](../08-security/security-framework.md) is marked PROPOSED and blocks entirely on this decision. It already commits to backend-enforced RBAC, MFA for admin, TLS 1.2+, Vault-managed secrets, and append-only audit rows written in the mutation transaction (protocol rule 7). Those are not in question here.

Three things are open and they are separable, but they must be answered together because they share one control budget and one architecture:

1. **PCI scope.** The threat model already asserts "No PAN storage; gateway-hosted capture keeps PCI scope minimal (DEC-011)" — asserted, not decided. If the POS ever touches a card number (manual entry fallback, MOTO orders, a P2PE terminal misconfigured to send clear PAN), scope jumps from SAQ-A/A-EP to SAQ-D and drags network segmentation, quarterly ASV scanning and annual on-site assessment with it. DEC-005 (payment gateway) constrains but does not settle this: some gateways offer both hosted and direct-post integrations.
2. **PII.** Customer phone is the primary identifier ([`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md)) and is therefore in every order path, not confined to CRM. India's DPDP Act applies: purpose-limited consent, notice versioning, breach notification, and data-principal rights including erasure — which collides with statutory invoice retention (DEC-020). Vendor contact and banking references are also PII/sensitive ([`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md)).
3. **Audit depth.** Protocol rule 7 says privileged mutations write an audit row. It does not say whether that row carries before/after field values, whether reads of PII are audited, or whether audit is tamper-evident (hash-chained / WORM) versus merely append-only by permission.

Constraint: security architecture is not retrofittable. Encryption-at-rest choice (column-level vs storage-level) determines schema; audit depth determines table shape and write volume; PCI scope determines network topology and therefore DEC-012.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Minimal PCI (SAQ-A) + DPDP baseline + standard audit.** Gateway-hosted capture only — no card entry surface in any of our code, ever, including MOTO. Storage-level encryption + column-level for contact fields. Audit rows carry actor, action, entity, before/after diff on privileged mutations only; PII *reads* not audited. Append-only enforced by grants. | ~15-20 person-days security engineering in R1; ongoing ASV scanning not required at SAQ-A | Card-present/MOTO edge cases must be refused at product level, which Ops may not accept; no forensic answer to "who looked at this customer's number" | Partly — dropping to a narrower scope later is easy, widening later is a re-architecture |
| B | **Option A + tamper-evident audit + PII read auditing.** Hash-chained audit table, periodic anchor, every `customers.pii.read` and bulk export logged with justification. | A + ~10-15 person-days; audit write volume roughly 3-5× (every profile view writes a row); storage and partitioning cost | Read-audit noise makes the trail less usable unless queries are built alongside it; performance cost on the CRM profile screen | Yes — can be switched off, but the gap in history is permanent |
| C | **Full SAQ-D posture.** Accept that a card entry surface will exist; build segmentation, key management, quarterly ASV scanning, annual QSA assessment. | 60-100+ person-days plus recurring assessor and scanning fees; touches DEC-012 network design | Very likely unnecessary — no evidenced requirement for direct card handling. Large sunk cost if a hosted-only path was available | Effectively no — segmentation decisions propagate into infrastructure |
| D | **Defer past CP-00.** Build R1 against the framework's existing mandatory controls; settle scope and audit depth before first production customer data. | Zero now | Every table storing PII or audit is provisional; encryption and audit shape are the two things that cost most to change against live data. Directly contradicts the "cannot be bolted on" entry in the cost-of-delay table | No — deferral is only cheap while zero production data exists, and that window is R1 |

## Impact If Wrong

- **PCI scope understated:** a manual-card-entry feature ships in R2, PAN transits our application logs (structured JSON logging is already global), and the platform is out of compliance from the first transaction. Remediation is log purge across all retained partitions plus a forced re-assessment; the acquirer can suspend settlement in the interim, which stops every outlet from taking card payment.
- **PII protection understated:** contact columns land unencrypted, and a production dump reaches staging (already prohibited by protocol rule 10 but not technically enforced). Under DPDP this is a reportable breach covering every customer who has ever ordered — the phone number is the primary key of the customer index, so the breach set is *all customers*, not a subset.
- **Audit depth understated:** a discount-abuse or refund-fraud investigation reaches a row that says "user 42 changed order 9981" with no before/after values, so the amount that was altered cannot be established. Every historical dispute in that period becomes unresolvable, and audit rows are append-only — the missing fields cannot be backfilled.
- **Audit depth overstated:** the CRM profile screen writes an audit row per view, day-close aggregation slows, and the audit partition outgrows the operational data it describes.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Auth / RBAC (`REQ-AUTH`) | Session model, MFA enrolment, permission-set persistence — all shaped by the assurance level chosen | 5 |
| Database / schema | Encryption approach for `customers`, `vendors` contact and banking columns; `audit_logs` column set and partitioning | 4 |
| Billing & payments | Gateway integration pattern cannot be fixed until hosted-only is confirmed (interacts with DEC-005) | 3 |
| CRM | Consent model, `customers.pii.read` permission, export controls | 2 (R3, so partial) |
| Infrastructure (DEC-012) | Network segmentation requirement is a direct output of PCI scope | 2 |
| Test / environments | Synthetic data generation strategy for lower environments | 2 |

## Recommendation

**Option A now, with B's tamper-evident audit adopted for `audit_logs` only (not PII read auditing).**

Reasoning:

- Gateway-hosted capture is the single material lever on this decision. It converts PCI from an architecture problem into a vendor-selection constraint, and it costs almost nothing if committed to before the payment integration is written. It is expensive to retrofit and nearly free to adopt now. Making "no PAN ever enters our process space" a hard product rule — enforceable in code review — is worth more than any compensating control.
- Hash-chaining the audit table is cheap at build time (a previous-row hash column and a write-path helper) and impossible to add retroactively with any credibility, because a chain that starts in month nine proves nothing about months one to eight.
- PII *read* auditing is the part we suggest holding. It is the highest-volume, lowest-signal control here, and unlike the chain it can be switched on later without invalidating what came before. Revisit if Legal reads DPDP as requiring access logging for data-principal requests — that is a Legal call, not an engineering one.
- Option C is not justified by any evidenced requirement, and Option D trades a week of decision time for a rework class the register already rates Critical.

Legal owns the DPDP interpretation (consent granularity, notice versioning, breach thresholds); Security owns the PCI scope commitment. Engineering implements whichever combination is signed.

---

## Decision

**Decided:**
**Rationale:**
**Approved by:**
**Date:**

## Consequences

*To be completed on sign-off. Anticipated:*

- Commits the platform to a payment integration pattern for the life of the product. Any future requirement for card-present or MOTO handling becomes a scope-change conversation with a compliance cost attached, not a feature ticket.
- Encryption approach fixes the schema for `customers`, `vendors` and any future PII-bearing table. Changing from storage-level to column-level later is a rewrite-every-row migration against live data.
- A tamper-evident audit chain permanently forbids any operational path that rewrites or backfills audit rows, including data-fix scripts under change control.
- Sets the floor that DEC-010 (retention), DEC-012 (deployment) and DEC-020 (erasure) build on; those three cannot be decided consistently before this one.

## Follow-Up

- [ ] ADR raised (structural): ADR-NNNN — encryption at rest and audit log integrity
- [ ] ADR raised: ADR-NNNN — payment capture pattern and PCI scope boundary
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../08-security/security-framework.md`](../08-security/security-framework.md) moved from PROPOSED to APPROVED, `REQ-AUTH`, `DB-TBL-AUDIT_LOGS`, schema reference
- [ ] DEC-005, DEC-010, DEC-012, DEC-020 re-checked for consistency with the chosen baseline
- [ ] Non-production data masking strategy written and enforced in CI
- [ ] Pre-go-live VAPT scope defined against the agreed posture
- [ ] Affected teams notified: all
- [ ] Estimate re-baselined if scope changed
