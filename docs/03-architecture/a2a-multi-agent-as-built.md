# A2A Multi-Agent Architecture

"A2A" (agent-to-agent) in this repo is a **coordination convention over files**, not a
running message bus. There is no broker, no queue, no inter-process protocol. Three
plain files in `agents/` carry all shared state, and every participant — human or agent —
reads and writes them directly.

## The three coordination files

### `agents/AGENT_REGISTRY.json`
Declares eight agents (`agent-orchestrator`, `agent-a2a`, `agent-frontend`,
`agent-backend`, `agent-database`, `agent-integration`, `agent-qa`, `agent-sre`), each with
`id`, `name`, `role`, `status`, `domain`, `currentTask`, `assignedFiles`. The
`assignedFiles` globs are the real conflict-avoidance mechanism: parallel dispatches must
target disjoint territory. Full breakdown in `docs/agents/REGISTRY.md`.

### `agents/task-board.json`
The live work queue. Top-level key is **`activeTasks`** (not `tasks` — a real source of
scripted-edit bugs). Each entry: `taskId` (`TSK-NNN`), `title`, `assignedTo`, `status`
(`DONE` / `PENDING`), `priority`, `relatedGate` (`CP-NN`). Currently ~114 entries through
`TSK-052`. `PENDING` entries are deliberate, permanent-until-resolved debt records — e.g.
the `order_payments` two-lineage migration conflict, the systemic `@db.Uuid`-vs-TEXT audit,
and the honestly-stubbed reconciliation/payment-history tabs.

### `agents/STATUS.md`
Append-only narrative log, one section per checkpoint gate (`CP-20` … `CP-28` and counting).
Each section records what was requested, what root cause was found, what was fixed, how it
was verified, and what was knowingly left undone. This is the file that makes a
cold-started session productive: it is where "why is this table TEXT and not UUID" is
answered.

## How a round executes

```
human request
   → orchestrator recon (grep/read real files)
   → orchestrator writes explicit contract (routes, DB conventions, territory limits)
   → parallel dispatch: backend agent  ┐
                        frontend agent ┘  disjoint assignedFiles
   → each agent self-verifies (tsc, new-errors-vs-baseline)
   → orchestrator independently re-verifies (git status, git diff, tsc)
   → task-board.json + STATUS.md updated
   → targeted git add + commit with session trailer
```

Agents never commit. Only the orchestrator commits, and only after reading the diff. This
is deliberate: agent self-reports have diverged from reality (misstated baselines,
claimed-but-absent files), so the commit gate is the verification gate.

## Surfacing in the product

The Admin Hub exposes a multi-agent panel at `/admin?tab=agents`
(`apps/pos-web/pages/admin.tsx`, backed by `apps/api/src/routes/admin.ts`), owned by
`agent-a2a`. It renders registry/task-board state for operators. Because
`AGENT_REGISTRY.json`'s `status` field is hand-maintained rather than heartbeat-driven,
that panel shows **declared** availability, not live process health — a known and
documented limitation, not a bug to "fix" by faking telemetry.

## Why files instead of a bus

- **Survives cold starts.** A brand-new session with zero context reads three files and
  knows the project's entire decision history. A message bus would have lost that.
- **Human-auditable.** Every coordination decision is a reviewable git diff.
- **Matches the real constraint.** Agents here are short-lived, sandboxed processes with no
  shared network path to each other — several cannot even reach the live database. Shared
  files are the only medium all participants can actually touch.

The cost is real and accepted: no live status, no automatic conflict detection, and
manual discipline required to keep the files honest. The mitigation is procedural — the
verify-before-commit gate above — and it is documented rather than papered over.

Related: `docs/agents/DISPATCH_PATTERN.md`, `docs/agents/REGISTRY.md`,
`docs/checkpoints/HOW_CHECKPOINTS_WORK.md`, `docs/sdlc/OVERVIEW.md`.
