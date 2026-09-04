# Agent Registry — the real roster

Source of truth: `agents/AGENT_REGISTRY.json` (schema `version: 2.0.0`, field `lastSync`,
array `agents`). This file summarises what is *actually* in that JSON — it is not an
aspirational roster. If the JSON and this page disagree, the JSON wins; update this page.

## Registry shape

Each entry in `agents[]` carries exactly these fields:

| Field | Meaning |
|---|---|
| `id` | Stable slug, e.g. `agent-backend`. Used as the reference key from `task-board.json`'s `assignedTo`. |
| `name` | Human-readable label shown in the Admin Hub's multi-agent panel (`apps/pos-web/pages/admin.tsx`, `?tab=agents`). |
| `role` | Coarse capability class, e.g. `BACKEND_ENGINEER`. |
| `status` | Lifecycle state. Every agent is currently `READY`; there is no live heartbeat writing this field — it is maintained by hand alongside `lastSync`. Treat it as declared intent, not runtime telemetry. |
| `domain` | One-line ownership boundary, including the port a surface runs on where relevant. |
| `currentTask` | Free-text note of the standing responsibility, not a live queue. The live queue is `agents/task-board.json`. |
| `assignedFiles` | Glob/path list defining the agent's write territory. This is the practical conflict-avoidance mechanism: two agents dispatched in the same round must not share entries here. |

## The eight registered agents

| id | Role | Domain (abridged) | Primary territory |
|---|---|---|---|
| `agent-orchestrator` | `SYSTEM_COORDINATOR` | Cross-system workflow coordination & port management | `scripts/startup.ps1`, `scripts/shutdown.ps1`, `scripts/status.ts`, `Start_KapMeta.bat` |
| `agent-a2a` | `A2A_COORDINATOR` | Inter-agent protocol, telemetry & Admin Hub wiring | `agents/*`, `apps/api/src/routes/admin.ts`, `apps/pos-web/pages/admin.tsx` |
| `agent-frontend` | `UI_ENGINEER` | POS Web UI (port 4444) & Admin Web (port 4445) | `apps/pos-web/pages/*`, `apps/pos-web/components/*`, `apps/pos-web/lib/auth.ts` |
| `agent-backend` | `BACKEND_ENGINEER` | API gateway (port 4001), services & event bus | `apps/api/src/index.ts`, `apps/api/src/routes/*`, `services/*` |
| `agent-database` | `DBA_ENGINEER` | PostgreSQL (port 5432) & Prisma schema | `kapmeta/schema.prisma`, `scripts/db-migrate.js`, `scripts/seed-dynamic-data.ts` |
| `agent-integration` | `INTEGRATION_ENGINEER` | Aggregators (Swiggy/Zomato), payments, thermal printers | `services/integration-hub/*`, `services/integration/*` |
| `agent-qa` | `TEST_ENGINEER` | Unit tests, contract validation & E2E simulation | vitest suite |
| `agent-sre` | `OPERATIONS_ENGINEER` | Diagnostics & operations | ops scripts / logs |

## Honest caveats

- **The registry is declarative, not runtime.** Nothing in the running app writes back to
  `AGENT_REGISTRY.json`. `status: READY` on all eight entries means "declared available",
  not "currently executing". `lastSync` is hand-maintained.
- **Registry roles ≠ dispatched sub-agents.** In practice a working round dispatches
  ad-hoc sub-agents whose prompts are written fresh per task (see `DISPATCH_PATTERN.md`).
  The registry entries are the *territories* those dispatches respect, which is what stops
  two parallel agents from writing the same file.
- **`assignedFiles` overlap is the real collision risk.** `agent-a2a` and `agent-frontend`
  both claim `apps/pos-web/pages/admin.tsx`. Rounds touching that file must not run both
  in parallel.
- **Multiple external tools share this checkout.** The host machine also runs other AI
  coding tools against the same working tree, which has produced real `.git/index.lock`
  contention and concurrent edits to the same files during sessions. Registry territories
  do not protect against those — only sequencing and `git status` checks do.

Related: `docs/agents/DISPATCH_PATTERN.md`, `docs/architecture/A2A_MULTI_AGENT.md`,
`docs/checkpoints/HOW_CHECKPOINTS_WORK.md`.
