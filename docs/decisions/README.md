# Decisions

**ID:** DEC-INDEX · **Status:** APPROVED · **Owner:** Product Owner · **Version:** 1.0 · **Updated:** 2026-08-08

Two decision types, deliberately separate:

| Type | What | Where | Who decides |
|------|------|-------|-------------|
| **DEC-xxx** | Business / product decision | this folder | Business owner (PO, Finance, Ops, Security) |
| **ADR-xxxx** | Technical / structural decision | [`../adr/`](../adr/) | Solution Architect + engineers |

A `DEC` answers *what the business needs*. An `ADR` answers *how we build it*. An approved `DEC` with architectural consequence spawns an `ADR`. Conflating the two is how business people end up approving index strategies and engineers end up deciding tax policy.

---

## Files

| File | Purpose |
|------|---------|
| [`DECISION-LOG.md`](DECISION-LOG.md) | Live status of DEC-001..DEC-012, blocked modules, cost of delay |
| [`decision-template.md`](decision-template.md) | Template for raising a new DEC |
| [`../01-discovery/decision-register.md`](../01-discovery/decision-register.md) | Original Phase 0 register (source) |

---

## Raising A New Decision

You raise a `DEC` when you hit a question that:

- changes what the business gets, not just how it is built, **and**
- cannot be reversed cheaply once code ships

Tax treatment, multi-outlet scoping, offline capability, retention periods, loyalty model — all DEC. Which JSON library, which index — never DEC, that is an ADR or just a code review.

**Process**

1. Copy [`decision-template.md`](decision-template.md) → `DEC-NNN-short-name.md`
2. Fill it: context, options with real tradeoffs, cost of delay, recommendation
3. Register it in [`DECISION-LOG.md`](DECISION-LOG.md) with owner and due date
4. Owner decides; record the outcome and date in the log
5. Raise the matching ADR if it has structural consequence
6. Update every artifact whose `Traces to` includes this DEC

**Do not** decide a DEC in code and document it afterwards. That is not a decision, it is a fait accompli — and on tax or permissions it is an expensive one.

---

## Escalation

An open DEC blocking work is escalated with a **dated cost**, not a complaint:

> DEC-004 (tax rules) blocks billing implementation. 3 engineers idle from Mon 18 Aug. Estimated slip 8 person-days per week unresolved.

Vague blockers get deprioritized. Quantified ones get decided.
