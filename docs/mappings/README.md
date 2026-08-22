# Mappings

**ID:** MAP-INDEX · **Status:** DRAFT · **Owner:** Business Analyst · **Version:** 1.0 · **Updated:** 2026-08-08

Traceability in both directions. Forward: "this source page became these tables." Backward: "why does this table exist?"

---

## Files

| ID | File | Maps |
|----|------|------|
| `MAP-SRC` | [`MAP-SRC-source-to-feature.md`](MAP-SRC-source-to-feature.md) | Source document pages → features → requirement docs |
| `MAP-REQ` | [`MAP-REQ-requirement-to-implementation.md`](MAP-REQ-requirement-to-implementation.md) | Requirement → API → DB objects → tests |
| `MAP-SCR` | [`MAP-SCR-screen-to-endpoint.md`](MAP-SCR-screen-to-endpoint.md) | UI screen → endpoints → permissions |
| `MAP-EVT` | [`MAP-EVT-event-to-consumer.md`](MAP-EVT-event-to-consumer.md) | Domain event → publisher → consumers |

---

## Why This Exists

Without mappings, three failures are guaranteed:

1. **Orphan schema.** A table nobody can justify, kept forever because nobody dares drop it.
2. **Silent gaps.** A source screen that never became a requirement, discovered during UAT.
3. **Blast-radius blindness.** A DEC changes and nobody knows which twelve artifacts to revisit.

The mapping tables answer all three in seconds instead of a two-day archaeology exercise.

---

## Maintenance Rule

Mappings update **in the same PR** as the thing they map. A mapping file that lags the code is actively harmful — it produces confident wrong answers.

CI check: every `DB-` object appears in `MAP-REQ`; every `UX-` screen appears in `MAP-SCR`.
