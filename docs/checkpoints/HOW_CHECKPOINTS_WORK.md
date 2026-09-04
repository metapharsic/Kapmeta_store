# How Checkpoints Work (this session's real convention)

This documents the actual working convention used throughout this session's
multi-agent rounds, grounded in the real structure of `agents/task-board.json`
and `agents/STATUS.md`. It is a separate, later-added numbering sequence
from the older phase-gate ledger in `docs/workflows/CHECKPOINTS.md`
(CP-00 through CP-09) — see the note at the end.

## What a checkpoint (CP-N) actually is, in practice

A checkpoint in this session's usage is **one work round** — a discrete
chunk of user-requested work (a bug report, a batch of reference
screenshots, a feature ask) that one or more dispatched agents complete in
a single pass, get personally re-verified, and get committed together. It
is not a formal signed gate with exit criteria the way `docs/workflows/CHECKPOINTS.md`'s
CP-00..CP-09 ledger is — it is closer to a numbered changelog entry that
also gets a human-readable narrative in `agents/STATUS.md`.

## Numbering

- Checkpoints are numbered sequentially as work happens: CP-10 (seat/merge
  P0) is the first one that appears in this session's STATUS.md, running
  through CP-30 (waiter Shakuro theme) as of this writing.
- A single user request sometimes spans several checkpoints if the scope is
  large (CP-10 has P0/P1/P2 sub-phases, each logged as its own dated
  STATUS.md entry but sharing the CP-10 number). A single checkpoint number
  sometimes gets amended multiple times in place (CP-20 has 3 documented
  amendments, CP-23 has 2) rather than incrementing — an amendment is used
  when the *same* underlying problem or feature request deepens (a follow-up
  bug the first fix didn't fully cover), while a new CP number is used for a
  genuinely new user ask.
- The next number to use is always "the current max in `agents/STATUS.md`,
  plus one" — there is no separate counter file. Before starting new work,
  check the last dated `## YYYY-MM-DD — CP-N ...` heading in STATUS.md.

## `agents/task-board.json` — real structure

Confirmed from the live file (`agents/task-board.json`):

```json
{
  "lastUpdated": "2026-09-03T14:08:03Z",
  "activeTasks": [
    {
      "taskId": "TSK-008a",
      "title": "Menu CRUD completion + modifier-options schema fix (P0' + P6 start)",
      "assignedTo": "agent-backend",
      "status": "COMPLETED",
      "priority": "CRITICAL",
      "relatedGate": "CP-11",
      "notes": "Fixed 2 live bugs: POST /menu/modifier-options targeted a nonexistent table ..."
    }
  ]
}
```

Real field names, confirmed by inspection — not invented:
- `taskId` — `TSK-NNN`, sometimes with a letter/name suffix for a sub-task
  spawned off a larger one (`TSK-008a`, `TSK-008h-backend`,
  `TSK-010-D1` — the D-numbers there map directly to the seat/merge plan's
  defect list).
- `title` — short human title.
- `assignedTo` — an agent id/role string. Inconsistent casing exists in the
  live file: some entries use the full registry ids (`agent-backend`,
  `agent-frontend`, `agent-sre`), others use a shorter lowercase form
  (`backend-agent`, `frontend-agent`, `sre-agent`) for the same role — a
  real, unresolved inconsistency, not a documentation error on this page's
  part.
- `status` — seen values: `COMPLETED`, `IN_PROGRESS`. (No `BLOCKED` or
  `CANCELLED` value observed in the live file, though nothing in the schema
  forbids one.)
- `priority` — seen values: `HIGH`, `MEDIUM`, `CRITICAL`, and also the
  shorter `P0`/`P1` form on the CP-11 sub-tasks — again a real inconsistency
  across rounds, not normalized.
- `relatedGate` — the `CP-N` string this task belongs to.
- `notes` (optional) — free text, present on most entries, carrying the
  same "what broke / what was found / what was fixed" narrative style used
  in STATUS.md, just scoped to one task instead of the whole round.

## When a checkpoint is considered closed

A checkpoint is closed when its STATUS.md entry says so explicitly — the
convention used is a parenthetical in the heading itself, e.g.
`## 2026-09-01 — CP-11 Full-CRUD Parity, round 4 (complete) — CP-11 now
closed out`. Before that point, intermediate rounds are logged with
`(in progress)` in the heading (see CP-11 round 1). A round is only marked
complete after:
1. Every dispatched agent's work is verified — `npx tsc --noEmit` clean (or
   at worst no *new* errors against a stated pre-existing baseline, which
   this session tracks explicitly, e.g. "tsc: 101 errors, same baseline,
   zero new").
2. A `git diff`/`git status` review confirming no corruption when multiple
   agents touched the same file concurrently, and no unrelated line-ending
   churn.
3. `agents/task-board.json` and `agents/STATUS.md` are updated to reflect
   the finished state.
4. A commit lands with the `Claude-Session` trailer.

A checkpoint that surfaces more problems than it fixes (CP-20's three
amendments, CP-10's multi-phase P0/P1/P2 structure) stays open under the
same number rather than being force-closed and reopened as a new one — this
keeps the full "what broke, what was found, what was fixed" story together
under one gate number, which is why `CHECKPOINT_LOG.md` groups them that
way too.

## Relationship to `docs/workflows/CHECKPOINTS.md`

That file is a different, earlier artifact: a formal phase-gate ledger
(CP-00 Discovery Exit through CP-09 Production go-live) with signed exit
criteria, written during an earlier planning phase of this project and
using the same `CP-N` prefix by coincidence of convention, not by shared
sequence. Do not conflate a `docs/workflows/CHECKPOINTS.md` entry with an
`agents/STATUS.md` entry of the same number — e.g. `docs/workflows/CHECKPOINTS.md`'s
CP-03 ("Core POS feature-complete") is unrelated to `agents/STATUS.md`'s
CP-03 if one existed; in practice the two ledgers' active ranges don't
overlap (the phase-gate ledger tops out at CP-09, this session's operational
log starts at CP-10), but the numbering schemes are independent and nothing
enforces that they stay disjoint.
