# DEC-015: PO Approval Threshold Values

**ID:** DEC-015
**Status:** OPEN
**Owner:** Finance
**Raised by:** `REQ-PUR` ([`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Approval Thresholds)
**Due:** Before R2 build start
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md)
**Traced by:** `WF-PUR-01`, PO state machine `PENDING_APPROVAL → APPROVED` guard, approval configuration schema

---

## Question

What PO value bands require which approver role, and at what value does a second, different approver become mandatory?

## Context

[`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) carries a placeholder table (Outlet Manager ≤ ₹10,000 · Area Manager to ₹50,000 · Finance above, two approvals) and states explicitly that these numbers are **not agreed policy**. This packet exists to replace them with signed ones.

Already committed and not in scope here:

- The raiser can never approve their own PO at any value, enforced server-side.
- Threshold is evaluated on the **PO total at approval time**; editing an approved PO upward re-triggers approval. Without this the band is bypassed by approving small and editing large.
- Every approval records approver, role, timestamp and the **threshold configuration version in force**, plus an audit row in the same transaction.
- Bands are per outlet and configurable.

What Finance must supply is the numbers and the role at each band. Engineering cannot infer them; they are a statement of how much money the business is willing to let each role commit without a second pair of eyes.

**This is a control-environment decision, and it is not a case where tighter is safer.** Set the bands too low and every routine vegetable order needs an Area Manager at 6 a.m.; the predictable result is that outlets stop raising POs and buy off-system, which produces *no* control at all plus a broken inventory ledger. Set them too high and a single manager can commit amounts nobody reviews. The right answer is the one operations will actually comply with — which means Ops should be consulted even though Finance owns the call.

A useful calibration input Finance already has and engineering does not: the **distribution of current purchase order values**. If 90% of POs are under ₹15,000, a ₹10,000 first band routes a large fraction of daily ordering through escalation.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Three bands as drafted, numbers set from the actual PO value distribution.** Finance picks the boundaries so that the routine-ordering band covers ~80-90% of PO volume, escalation covers the rest, dual approval sits above a genuinely material value. | Build cost identical to any banded scheme (~5-8 person-days for config + guard + audit) | Requires Finance to look at real spend data before the review. Without that input the numbers are still guesses, just signed ones | Yes — bands are configuration; changing them is a config change with a version bump, and past approvals stay explainable because the config version is recorded |
| B | **Two bands only.** Single approver below a threshold, dual approval above. Simpler role model. | Lowest — ~4-6 person-days | Loses the middle escalation tier, so either the Outlet Manager's authority is high or the Area Manager is in every order. Works for a small group, poorly for a multi-outlet one | Yes |
| C | **Value bands plus category rules.** e.g. capex or non-food categories always escalate regardless of value; perishables have a higher routine band. | ~10-14 person-days; needs a category dimension on requisition lines | More faithful to how procurement risk actually distributes, but more configuration surface and more ways to misconfigure. Only worth it if the business genuinely purchases beyond food ingredients through this module | Yes, but the category dimension on lines is a schema addition |
| D | **Defer; ship R2 with a single configurable threshold and one approver role, tune in production.** | Minimal now | Approval config version is recorded from day one, so tuning later is traceable — this is less bad than it sounds. The real cost is that the first months of purchasing run under a control the auditor will ask about and Finance did not set | Yes |

## Impact If Wrong

- **Bands too low:** the 6 a.m. produce order needs an Area Manager who is asleep. Within two weeks outlets are phoning vendors directly and raising a retrospective PO — or no PO at all — which lands squarely on DEC-017. The control does not fail loudly; it is quietly routed around, and the first evidence is an inventory variance nobody can explain because the receipts have no matching orders.
- **Bands too high:** an Outlet Manager commits ₹200,000 to a vendor they have a relationship with, unreviewed. There is an audit row naming them, so it is detectable after the fact — but the money is committed and the goods are received.
- **Threshold evaluated on the wrong figure:** if the guard reads the PO total at *submission* rather than at approval, the documented bypass works. The spec already forbids this; the risk is an implementation that quietly does it anyway. Requires a specific test.
- **Bands changed without version recording:** a two-year-old approval cannot be justified because nobody can establish which threshold table was in force. This is the difference between an audit finding and an answer.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Purchase (R2) | `WF-PUR-01` approval workflow, `PENDING_APPROVAL → APPROVED` guard, approval configuration schema and admin UI | 3 |
| Purchase | Requisition approval path (same threshold machinery) | 1 |
| Notifications | Approval routing and escalation reminders — cannot be built without the role map | 1 |

*Note: Purchase is R2 and already blocked in full on DEC-003, so this is not currently on the critical path. It becomes so the moment DEC-003 closes.*

## Recommendation

**Option A, with the boundary values set from the actual PO value distribution — and treat "what fraction of daily orders will this escalate" as the primary acceptance test for the numbers, not "what feels prudent".**

Reasoning:

- Three bands match how procurement authority is normally delegated and give a middle escalation tier that a two-band scheme forces into either extreme.
- The distribution check is the part worth insisting on. A threshold that escalates 40% of routine ordering is not a strong control; it is a control that will be bypassed, and bypassed controls produce worse data than no control.
- Category rules (Option C) are premature. This module purchases food ingredients against a recipe-driven inventory. Revisit if capex or non-food procurement is brought in scope.
- Recommend Finance also set an explicit **dual-approval floor** rather than deriving it from the top band, so it survives future band retuning unchanged.
- Ops should be in the review. Finance owns the decision; Ops owns whether it is complied with, and a control nobody complies with is worth less than a lower one everybody does.

---

## Decision

**Decided:** Option A — three-band approval structure. Actual boundary values NOT set here (no real PO value distribution exists pre-launch); placeholder bands below apply until Finance retunes from real data.
**Rationale:** Three bands match normal procurement delegation. Distribution check (target: low double-digit % of orders escalating, not 40%+) is the acceptance test once real data exists. Dual-approval floor set as an explicit fixed value, not derived from the top band, so it survives retuning.
**Placeholder bands pending real distribution:** auto-approve under ₹5,000; single-approval ₹5,000–₹25,000; dual-approval above ₹25,000.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Fixes the role model for procurement: whichever roles are named here must exist in the RBAC matrix in [`../08-security/security-framework.md`](../08-security/security-framework.md), which currently has no Area Manager row.
- Sets the operational tempo of purchasing. Approval latency becomes a measurable metric and a cause of stockouts if the bands are wrong.
- Threshold configuration becomes versioned, permanently. Every approval carries its config version; the version history can never be pruned without breaking the explainability of past approvals.
- Directly conditions DEC-017: the tighter these bands, the more retrospective-PO pressure the business will generate.

## Follow-Up

- [ ] PO value distribution obtained from Finance/Ops before the review
- [ ] `DECISION-LOG.md` updated → [`DECISION-LOG.md`](DECISION-LOG.md)
- [ ] Downstream artifacts updated: [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Approval Thresholds, `WF-PUR-01`
- [ ] Any new approver role added to the RBAC matrix in [`../08-security/security-framework.md`](../08-security/security-framework.md)
- [ ] Test written proving threshold is evaluated at approval time and that upward edit of an approved PO re-triggers approval
- [ ] Test written proving raiser cannot self-approve at any value
- [ ] Approval latency added to the operational metric set for post-go-live tuning
- [ ] Affected teams notified: Finance, Ops, Engineering
- [ ] Estimate re-baselined if scope changed
