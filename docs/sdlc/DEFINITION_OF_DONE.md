# Definition of Done — KapMeta POS Platform

`docs/00-governance/definition-of-ready-done.md` is the formal governance
version of this document (reviewed · tested · migration tested both
directions · OpenAPI updated · audit logging present · permissions enforced
server-side · performance baseline met · QA passed · UAT recorded · rollback
steps written — the short form in `ENGINEERING-PROTOCOL.md` §7). This file
describes the bar that has actually been held to, round after round, as
recorded in `agents/STATUS.md` — narrower in scope (this sandbox cannot run
a live DB, a browser, or QA/UAT) but concretely enforced on every entry.

## 1. `tsc` clean — or no worse than it started

Every closed round in `agents/STATUS.md` reports a `tsc` result per
workspace touched. `apps/pos-web` is held to a hard **0 errors** bar,
confirmed before and after the change (e.g. CP-21: "tsc: pos-web 0 errors
(both before and after)"; CP-24: "tsc clean both projects"). `apps/api`
carries a pre-existing, nonzero baseline (its exact count has moved between
rounds — 91, 100, 106, 82 — because other concurrent agents/sessions touch
it too) — the requirement there is **zero new errors introduced by your
change**, verified by diffing the count before/after, not by chasing the
baseline down. CP-19 states this precisely: "tsc: pos-web 0, api 106 (this
round's starting baseline, unchanged by our fixes — the +6 over the prior
100 baseline comes from the other process's still-untyped raw-SQL additions,
pre-existing before we touched anything)" — i.e. know *why* the baseline
moved before claiming your change didn't cause it.

## 2. No hardcoded business data (`.agents/AGENTS.md` Rule 1)

This is the most consistently enforced rule in the session history and the
one most often the actual subject of a fix, not just a guideline followed
incidentally:

- CP-19's `GET /inventory/dashboard/summary` had six separate violations
  removed in one pass: fake "412/167 ready to add" targets, fabricated
  highest/least-profit item names ("Matar Paneer"/"Bhindi Masala"), fake
  nonzero fallbacks standing in for a legitimately-zero real total, a fake
  "×10" consumption multiplier, a hardcoded `stockQty:100` on every item, and
  a fabricated price-trend line built from static multipliers — every one
  replaced with a real computed value.
- The same round found a second, unrelated hardcoded literal — a static
  "8 agents" count in `/admin/daily-operations` — and fixed it too, because
  Rule 1 was violated there independently of the task at hand.
- CP-20 removed a hardcoded `"SWIGGY"`/`"EXT-001"` fallback in `GET
  /channels` specifically because it would have mislabeled a real Zomato
  connection as Swiggy — a concrete example of what a fake-data fallback
  actually breaks in production, not an abstract concern.
- CP-26 removed a static `'Admin'` fallback from `/auth/me`, static
  `QUICK_ROLES` with hardcoded credentials/outlet IDs from `login.tsx`, and
  a static `STAFF_LIST` from `CaptainPinLoginModal.tsx`, replacing all three
  with data fetched from real new endpoints (`GET /auth/outlets`, `GET
  /auth/staff-profiles`) backed by a real seeded roster.

The corollary, equally enforced: when a screen element genuinely has no
backing data in the schema yet, the correct move is an **honest** stub —
"coming soon", a neutral placeholder, or a documented empty state — never an
invented number or name. CP-18's Zomato/Swiggy "Last Menu Triggered" banner,
CP-22's "Credit Remaining"/"Credit Purchase Till Now" fields, and CP-23's
Accounting reconciliation/payment-history tabs are all examples of this
correct pattern, each tracked with its own `TSK-xxx` for later real
implementation rather than silently faked.

## 3. `agents/task-board.json` and `agents/STATUS.md` updated in the same round

A feature or fix is not done until the ledger reflects it — see
`docs/boilerplate/NEW_FEATURE_CHECKLIST.md` §4 for the exact fields. This
repo's git log shows this as a *separate, immediately-following commit* in
almost every round ("Update task-board/STATUS for CP-24 menu desync fix",
"Update task-board and STATUS for CP-23 Management section") — the code
commit and the ledger commit are both required, and are kept as two commits
rather than squashed, which is itself part of the convention: it keeps the
"what changed" diff separable from the "what does the record say happened"
diff.

## 4. Personally-verified diffs before committing

Not "tests pass" as an abstraction — a named list of what was actually read.
Real examples, verbatim from STATUS.md: CP-20 amendment 3 — "Personally
verified before committing: read all 6 new migrations end-to-end plus the
full schema.prisma diff, cross-checked several against their source
migration files and cited log evidence directly, confirmed the enum types
0047 depends on ... were created independently by 0028 and would have
landed regardless." CP-23 round 1 — "Verified: tsc clean on all
touched/new files (apps/api + pos-web), git diff reviewed, DB convention
(TEXT ids) followed throughout." CP-23 Biller App amendment — "tsc clean
(pos-web 0 errors, api 82 pre-existing unrelated errors confirmed via
stash/pop, zero new)" — note the stash/pop technique used specifically to
isolate whether an error count change was caused by this change or by
something else already in the tree.

## 5. Scope discipline

CP-25 is the clearest example: after finishing the requested change, the
round explicitly did **not** sweep in another concurrent session's
uncommitted inventory work or STATUS/task-board edits sitting in the same
working tree — "Committed f1a6460... another session's concurrent inventory
work + STATUS/task-board edits were left untouched, not mine to commit." The
same entry documents clearing a stale `.git/index.lock` left by a
timed-out heredoc, but only after confirming no live git process was
actually holding it — never force-removing a lock as a first resort.

## 6. What "done" explicitly does not require here (documented sandbox limits)

Multiple STATUS.md entries state plainly what could not be verified and why,
rather than silently skipping it: `device_bash` has no path to a live
Postgres (`ECONNREFUSED 127.0.0.1:5432`), so no round in this session's
history has been able to browser-verify a change end-to-end or run a real
`db:migrate`. This is treated as a known, named gap — every migration-adding
round ends by telling the user to run `npm run db:migrate` and restart the
API themselves — not as something quietly assumed to be fine.
