# New Feature Checklist

A real step-by-step, reverse-engineered from how features were actually
added in this repo's session history (`agents/STATUS.md`, git log — e.g.
CP-19 Inventory Dashboard, CP-22 Reports rebuild, CP-23 Management section).
Read `docs/boilerplate/README.md` first for the layout/version context this
checklist assumes.

## 0. Before writing anything

- [ ] Check `docs/decisions/DECISION-LOG.md` for an open `DEC-xxx` blocking
      your module (`docs/MODULE-MAP.md`'s "Blocked by" column tells you which
      ones apply). Don't guess past an open decision — per
      `docs/START-HERE.md` this has cost real rework before.
- [ ] Check `agents/task-board.json` for an existing `TSK-xxx` covering this
      work, and `agents/AGENT_REGISTRY.json` for which agent lane
      (`assignedFiles`) already owns the files you're about to touch, to
      avoid the kind of concurrent-duplicate-work collision documented in
      CP-19 ("found a large chunk of this exact feature already written,
      UNCOMMITTED, in the working tree by a separate process").
- [ ] If you have reference screenshots/specs of the real target screen,
      compare against what's actually built before assuming a gap — several
      rounds (CP-18, CP-21, CP-23) turned out to be smaller corrections than
      expected because most of the target already existed.

## 1. Schema change (if the feature needs new/changed tables)

- [ ] Write a new migration file in `db/migrations/`, named
      `NNNN_description.sql` — next sequential 4-digit number (see the
      existing sequence, currently through `0055_create_accounting_tables.sql`).
      Follow `db/migrations/README.md`'s single-file Up/Down marker
      convention:
      ```sql
      -- +migrate Up
      ...forward DDL...
      -- +migrate Down
      ...reverse DDL...
      ```
- [ ] **All id/FK columns are `TEXT`, not `uuid`** — see
      `docs/boilerplate/README.md`'s "TEXT ids, not UUID" section. This is a
      correction to what `db/migrations/README.md` itself still documents;
      trust the live-DB ground truth over that file until it's updated.
      Getting this wrong rolls back the whole migration transaction
      (Postgres `42804`), even the unrelated statements in the same file.
- [ ] Every operational table carries `outlet_id TEXT NOT NULL` (unless it is
      explicitly global/shared) — `ENGINEERING-PROTOCOL.md` Rule 2.
- [ ] Any money column is `BIGINT` minor units + a currency column, never
      `FLOAT`/`NUMERIC` — Rule 1.
- [ ] Prefer `IF NOT EXISTS` / idempotent DDL where the table might already
      exist from a prior `prisma db push` — this repo has real, documented
      schema drift between what migrations say and what's live (see
      `agents/STATUS.md`'s several "repair" migrations, 0043-0051). If your
      migration is defensive/idempotent by design, say so in a comment, the
      way 0043-0051 do.
- [ ] Mirror the change into `kapmeta/schema.prisma` — add/edit the model,
      **without** `@db.Uuid` on id/FK fields (per the TEXT convention above).
      Use `@map(...)` for snake_case columns and `@@map(...)` for the table
      name, matching existing models.
- [ ] Note in your STATUS.md entry (see below) that the user must run `npm
      run db:migrate` and restart the API — migrations in this repo are not
      auto-applied; every CP round that added one says this explicitly.

## 2. Backend route

- [ ] Add `apps/api/src/routes/<name>.ts` (or extend an existing one), owned
      by the correct `services/<module>` domain logic — routes are the thin
      HTTP layer, not where business rules live (ENGINEERING-PROTOCOL.md §4).
- [ ] Resolve `outlet_id` from the session/JWT, never trust a body field for
      it (Rule 4).
- [ ] No hardcoded/fabricated business data or fallback literals — `.agents/AGENTS.md`
      Rule 1 and `ENGINEERING-PROTOCOL.md` Rule 11 are absolute here. CP-19's
      dashboard-summary fix (fake "412/167 ready to add" targets, fabricated
      item names, a fake `×10` multiplier, a hardcoded `stockQty:100`) is the
      canonical example of what NOT to do, and what gets ripped out when found.
      If a screen element genuinely has no backing data yet, render an honest
      neutral placeholder or a "coming soon" state instead of inventing a
      number — see CP-18's Zomato/Swiggy sync-banner handling, or CP-22's
      "Credit Remaining" field.
- [ ] Mount the router in `apps/api/src/app.ts`.
- [ ] `cd apps/api && npx tsc --noEmit` — confirm you have not increased the
      error count versus the pre-existing baseline (this repo currently
      tracks a nonzero-but-stable `tsc` baseline in `apps/api`, see
      `docs/sdlc/DEFINITION_OF_DONE.md`).

## 3. Frontend page

- [ ] Add `apps/pos-web/pages/<route>.tsx` (Pages Router — no `app/` dir).
      Reuse an existing generic view where one already fits (e.g. CP-22's
      `reports/view.tsx?key=` generic detail page, rather than one bespoke
      file per report) instead of duplicating boilerplate.
- [ ] Add the new page to `SIDEBAR_GROUPS` in
      `apps/pos-web/components/Nav.tsx` — this is the single source of truth
      for navigation. Pick the right existing group by domain (Daily
      Operations / Menu / Inventory / Finance / Reports / Management / CRM /
      Aggregator Center / Quick Links) or add a new group entry if none fits.
      Set a real `permission` string per link.
- [ ] Confirm `KapMetaHeader.tsx` renders the group/link in **both** the
      desktop sidebar and the mobile drawer variants — CP-21 found Quick
      Links present in one but missing from the other.
- [ ] `cd apps/pos-web && npx tsc --noEmit` — must stay at 0 errors; this
      workspace's baseline is 0, and every session round confirms it stays 0.

## 4. Task-board / STATUS update convention

Every feature round in this repo ends with two housekeeping edits, evidenced
by the "Update task-board/STATUS for CP-NN ..." commits throughout git log:

- [ ] `agents/task-board.json`: add/update the relevant `TSK-xxx` entry
      (`taskId`, `title`, `assignedTo` — an agent id from
      `agents/AGENT_REGISTRY.json` — `status`, `priority`, `relatedGate`
      pointing at the `CP-xxx` gate this work closes or advances). Bump
      `lastUpdated` at the top of the file.
- [ ] `agents/STATUS.md`: append a new dated section, `## YYYY-MM-DD — CP-NN
      <short title>`. Real entries always include: how many agents worked
      the round and in what split (DB/backend/frontend), what reference
      material was used (screenshots, user report, log grep), what was
      actually built (file-by-file), what was found broken and fixed with
      root cause, what was deliberately left as an honest stub/TSK instead
      of faked, the `tsc` result for each touched workspace (baseline vs.
      new-error delta), and the commit hash(es). See any 2026-09 entry for
      the real format to match.
- [ ] Update `docs/MODULE-MAP.md`'s Quick Lookup table if you added a new
      module, table-ownership row, or changed a `Blocked by`/`Release` value.

## 5. Commit

- [ ] Personally read the full diff before committing (`git diff`), not just
      trust the generated code — this is explicit, repeated practice in
      STATUS.md ("Personally verified before committing: ...").
- [ ] Commit only the files you actually touched for this feature — CP-25's
      entry explicitly calls out leaving another concurrent session's edits
      uncommitted rather than sweeping them in.
- [ ] Conventional Commits style, imperative subject ≤ 50 chars, per
      `ENGINEERING-PROTOCOL.md` §3.
