# SDLC Overview — KapMeta POS Platform

This describes the software development lifecycle this repository has
*actually* been run under, not a generic process document. The formal
governance framework lives in `docs/00-governance/` through
`docs/12-operations/` (phases, RACI, ADRs); this file describes the
multi-agent execution model layered on top of it, evidenced by
`agents/AGENT_REGISTRY.json`, `agents/task-board.json`, and
`agents/STATUS.md`.

## The A2A / multi-agent dispatch model

`agents/AGENT_REGISTRY.json` (currently `"version": "2.0.0"`) is the roster
of named agents, each an object with real fields:

```json
{
  "id": "agent-frontend",
  "name": "Frontend UI Agent",
  "role": "UI_ENGINEER",
  "status": "READY",
  "domain": "POS Web UI (Port 4444) & Admin Web (Port 4445)",
  "currentTask": "Maintaining POS touch layout, KDS real-time feed, and auth guards",
  "assignedFiles": ["apps/pos-web/pages/*", "apps/pos-web/components/*", "apps/pos-web/lib/auth.ts"]
}
```

Other real roles present in the registry include `agent-orchestrator`
(`SYSTEM_COORDINATOR` — process lifecycle, port management, checkpoint
transitions) and `agent-a2a` (`A2A_COORDINATOR` — inter-agent protocol,
telemetry, admin-hub wiring). Each agent's `assignedFiles` is the boundary
that keeps two agents from editing the same surface unknowingly — the
DB/backend/frontend split described below is this registry's ownership map
in practice.

`agents/task-board.json` is the work ledger: a `lastUpdated` timestamp and an
`activeTasks` array of `TSK-xxx` objects — `taskId`, `title`, `assignedTo`
(an agent id from the registry), `status` (`COMPLETED` / `IN_PROGRESS` /
etc.), `priority`, and `relatedGate` (a `CP-xxx` checkpoint id). A feature
round is dispatched as one or more agents against specific `TSK-xxx` entries,
and STATUS.md's entries consistently open with a headcount, e.g. "3 agents (1
DB, 1 backend, 1 frontend)" (CP-18) or "2 agents (1 backend, 1 frontend,
dispatched in sequence with explicit endpoint contracts handed from backend
to frontend)" (CP-22) — the split is by layer, with contracts (schema,
endpoint shape) handed forward from DB → backend → frontend so agents can
work in parallel without blocking on each other's exact output.

## Checkpoint / gate numbering (`CP-N`)

Checkpoints are the units of forward progress recorded in `agents/STATUS.md`,
sequential and not always 1:1 with a single PR — a checkpoint can span a
correction ("CP-18 Correction"), an amendment ("CP-20 amendment 2", "CP-20
amendment 3"), or a follow-on fix under the same number. Real examples from
STATUS.md's tail:

- **CP-18** — Manage Menu screens rebuilt to match corrected reference
  screenshots (per-channel pricing).
- **CP-19** — Inventory Dashboard / Stock Purchase / Purchase Orders,
  including discovery of concurrent uncommitted work from another process.
- **CP-20** and its three amendments — the aggregator-feed bug chain: an
  immediate P2022 fix, then a failed real migration run, then the TEXT-vs-UUID
  ground-truth discovery, then a full log-driven drift sweep producing 6
  repair migrations.
- **CP-21** — nav drawer matched to a reference screenshot.
- **CP-22** — Reports section rebuild (4 real subpages against new/existing
  endpoints).
- **CP-23** and two amendments — Management section, Biller App workflow,
  Accounting sub-group.
- **CP-24** — menu desync fix (see "Bug triage" below).
- **CP-25** — Dine In/Delivery/Pickup enabled on the public order app.
- **CP-26** — zero hardcoded auth literals, dynamic staff/outlet ingestion.

Each STATUS.md entry is written in the same shape every time: who worked it
and how it was split, what reference evidence was used, what was built
file-by-file, what was found broken and why (root cause, not just symptom),
what was deliberately left as an honest stub instead of faked, the `tsc`
result per workspace, and the commit hash(es). Follow that shape for any new
entry — see `docs/boilerplate/NEW_FEATURE_CHECKLIST.md` §4.

## Verify-before-commit discipline

Every STATUS.md entry that closes a round states a `tsc` result explicitly —
not "tests pass" in the abstract, but a concrete before/after error count per
workspace, e.g. CP-20's "tsc: api — zero new errors from integration.ts,
orders.ts's only error is pre-existing (line 846, table_number, unrelated to
anything touched)" or CP-23's "tsc clean pos-web, api baseline unchanged (82
pre-existing errors, 0 new)". `apps/pos-web` is consistently held to a **0**
baseline; `apps/api` carries a known, tracked-but-nonzero pre-existing
baseline (the count itself has moved over time — 91, 100, 106, 82 in
different entries — because other concurrent work changes it; what's checked
is the *delta from whatever the round started at*, not an absolute target).

Beyond tsc, the recorded discipline is a personal diff review before
committing — STATUS.md repeatedly uses the phrase "Personally verified before
committing: ..." followed by a specific list of files actually read (e.g.
CP-22: "read the migration, the report-notifications route file (confirmed
`$queryRaw` tagged-template parameterization, not string-built SQL), the two
new finance.ts endpoints ... the Nav.tsx diff, and the report-catalog's
endpoint list against `reporting.ts`'s actual mounted routes"). This is not
optional boilerplate phrasing — see `docs/sdlc/DEFINITION_OF_DONE.md` for
what happens when it's skipped.

Browser/runtime verification is explicitly **not** available in this
environment: multiple STATUS.md entries note "NOT browser-verified (same
next build/DB sandbox limitation as every round this session — device_bash
can't reach Postgres, ECONNREFUSED 127.0.0.1:5432)". Live-DB migrations are
run by the user, not by an agent — every migration-adding round ends with
"User must run `npm run db:migrate` again ... and restart the API."

## How bugs get triaged and fixed — two real worked examples

**The menu-desync fix (CP-24).** User report: "Chef, waiter and admin all of
them menu are not in sync." Investigation found the real root cause was not
a UI/polling problem but a broken data path: `listAllItems`/`listByCategory`
in `menu-catalog-repository.ts` referenced `row.availabilities`, a Prisma
relation that does not exist on that model, so the query always fell back to
a hardcoded `{isStocked:true}` stub — meaning items 86'd via
`GET /menu/availability` (which computed correctly) never actually
disappeared from `GET /menu/items` (which fed both `waiter.tsx` and the
public QR order menu). The fix replaced the stub with a real
`item_availability` lookup, and separately added the missing 15s poll to
`waiter.tsx` and `menu.tsx` (mirroring the pattern `kitchen.tsx` already used
for KOTs) so already-open screens pick up changes without a manual refresh.
`kitchen.tsx` itself was checked and confirmed out of scope (it intentionally
shows immutable KOT snapshots, not live menu state).

**The DB TEXT vs UUID drift discovery (CP-20 amendments 2-3).** A migration
(0045) failed live with Postgres error `42804` ("uuid and text") — a genuine
FK type mismatch. Rather than patch that one column, the user ran
`scripts/inspect-db-v2.js` against the real live database, which showed every
id/outlet_id/`*_id` column across 24 checked tables is `TEXT`, contradicting
every migration file (all declared `uuid`) but matching
`kapmeta/schema.prisma`'s actual original model definitions. This overturned
an earlier "fix" from CP-19 that had converted some of these columns *back*
to UUID, which turned out to be wrong. The corrected convention (TEXT
throughout) was then applied to migration 0045 and, in CP-20 amendment 3, to
a fuller sweep once the *same bug class* was found hiding unrelated column
additions inside failed transactions across several more migrations (0046-0051)
— because a single FK-type failure anywhere in a migration's transaction
rolls back every other statement in that file, even ones that look
independently safe. This class of bug is documented for future contributors
in `docs/boilerplate/README.md`'s "TEXT ids, not UUID" section specifically
so it isn't rediscovered the hard way again.

## Relationship to the formal `docs/00-governance` through `docs/12-operations` tree

That tree is the requirements/architecture/governance source of truth
(DEC-xxx decisions, ADRs, module requirement docs) — it answers *what should
be built and why*. `agents/STATUS.md` and `agents/task-board.json` are the
execution log — they answer *what was actually built, in what order, by
which agent, verified how*. A checkpoint's STATUS.md entry should reference
the `DEC-xxx`/module doc it satisfies when one exists; see
`ENGINEERING-PROTOCOL.md` §2 for the intended story→merge workflow this
should ideally follow (spec-before-code via `contracts/openapi/`) — in
practice, several rounds in this session's history built the route first and
back-filled the contract, which is a known gap against the documented
protocol, not the protocol itself.
