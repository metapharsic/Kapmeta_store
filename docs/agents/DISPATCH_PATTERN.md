# Dispatch Pattern — how A2A rounds are actually run

This documents the *lived* working method used across checkpoints CP-20 through CP-28,
not an aspirational process. Every step below exists because skipping it produced a real
defect at some point in this project's history.

## The six steps

### 1. Recon before dispatch
The orchestrator personally greps/reads the relevant files first — routes, pages, schema,
existing catalog files — before writing any agent prompt. Reason: several rounds discovered
the requested feature was *already half-built*, and a blind dispatch would have produced a
duplicate parallel implementation. Example: in the Accounting round, recon found
`management_lists` (built one round earlier) already covered Utility Bill Operator, Loan
Information and Denomination generically — four screens needed **zero new code**.

### 2. Design the contract yourself, then hand it over
The orchestrator writes the exact route contract (paths, query params, body shapes,
permissions) and the DB conventions into the prompt *before* dispatch. Agents implement
against a fixed contract rather than inventing one. This is what lets backend and frontend
agents run **in parallel** without a handshake: both were handed the same contract text.

### 3. Constrain the prompt hard
Every dispatch prompt carries, verbatim:
- the TEXT-ids-not-UUID DB convention (see `docs/adr/0009-text-ids-not-uuid.md`),
- "prisma generate cannot run in this sandbox — use `$queryRaw`/`$executeRaw`",
- a named existing file to copy the pattern from ("look at `report-notifications.ts`"),
- explicit territory limits ("do NOT touch `apps/api/*`"),
- "do NOT commit — leave changes in the working tree",
- "be honest: if there's no real data source, return an empty result with a documented
  comment rather than fabricating rows" (AGENTS.md Rule 1).

### 4. Agent self-verifies
Each agent runs `npx tsc --noEmit` on the projects it touched and reports **new errors vs
baseline** (the repo has a large pre-existing error baseline from a stale generated Prisma
client, so a raw error count is meaningless — the delta is what matters).

### 5. Orchestrator re-verifies independently
Agent reports are treated as claims, not evidence. Before any commit the orchestrator runs
`git status --porcelain`, reviews `git diff`, and re-runs `tsc`. This has caught real
discrepancies — e.g. an agent reporting 91 API errors where the true baseline was 82.

### 6. Record and commit
`agents/task-board.json` (`activeTasks[]`: `taskId`, `title`, `assignedTo`, `status`,
`priority`, `relatedGate`) gains an entry per unit of work — including a `PENDING` entry for
anything knowingly left unfinished. `agents/STATUS.md` gains a narrative checkpoint section.
Then a targeted `git add` of only the round's own files, and a commit carrying the session
trailer.

## Three real worked examples

**CP-22 — Reports rebuild.** Recon showed the existing Reports nav didn't match the
reference. Contract designed first: a `report-catalog.ts` mapping real, already-mounted
`/reporting/*` and `/finance/*` endpoints into UI categories, plus one generic
`/reports/view?key=` page reused across ~20 endpoints instead of 20 bespoke pages. Backend
agent added `report_notifications` + two real `finance.ts` endpoints; frontend agent built
four screens. Old nav links were preserved as catalog cards rather than deleted.

**CP-23 — Management section.** Two agents in parallel on disjoint territory
(`apps/api/*` vs `apps/pos-web/*`). Generic `management_lists` / `management_settings` /
`management_activity_logs` tables were designed up front so 14 reference screens collapsed
into three reusable page components. Three screens with no real backend
(Explore Products, Audit Trail, Device Mapping) shipped as honest stubs and were filed as
`TSK-039 PENDING` rather than faked.

**CP-24 — Menu desync.** A pure investigation dispatch: the prompt named five candidate
causes to rule in or out with `file:line` evidence, and forbade stopping at the first
theory. The agent found the real root cause — `listAllItems()` referenced
`row.availabilities`, a Prisma relation that does not exist, so every item silently fell
back to a hardcoded `{ isStocked: true }` stub — plus two missing polling refreshes. It also
explicitly ruled the kitchen board *out* of scope (it renders immutable KOT snapshots),
which prevented a pointless follow-up round.

## Failure modes this pattern has actually hit

- **Shared-checkout races.** Other AI tools on the host machine edit the same working tree.
  Uncommitted work has been absorbed into a teammate's commit mid-round. Mitigation: check
  `git log` and `git status` at the start *and* end of every round; `git add` only your own
  paths, never `git add -A`.
- **Stale `.git/index.lock`.** A timed-out command can leave a zero-byte lock. Rule: check
  `ps` for a live git process and the lock's age before removing it — never reflexively.
- **Sandbox limits.** `npx prisma generate` cannot run here (403 fetching the query engine)
  and the live DB is unreachable, so migrations are always run by the human on their own
  machine. Prompts must say this or agents waste turns retrying.
