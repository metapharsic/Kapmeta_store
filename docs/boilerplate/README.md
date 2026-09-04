# Boilerplate — KapMeta POS Platform

This folder documents what "boilerplate" actually means in this repository: the
real monorepo layout, the real dependency versions, and the real conventions a
new file has to follow to fit in. It is grounded in the current tree, not
generic advice — see `docs/START-HERE.md`, `docs/MODULE-MAP.md` and
`docs/ENGINEERING-PROTOCOL.md` for the governance-layer docs this folder
complements rather than duplicates.

## Monorepo shape

Root `package.json` (`kapmeta-pos-platform`) declares npm workspaces:

```json
"workspaces": ["apps/*", "packages/*", "services/*"]
```

There is no Turborepo/Nx — orchestration is plain npm workspace scripts
(`npm run dev -w @kapmeta/api`, `npm run build --workspaces --if-present`,
etc., see root `package.json` `scripts`). The Prisma schema location is
declared at the root too: `"prisma": { "schema": "kapmeta/schema.prisma" }`.

```
apps/
  api/          @kapmeta/api        — Express HTTP composition root (port set by env, dev via tsx watch)
  pos-web/      @kapmeta/pos-web    — Next.js 14 POS terminal + waiter/admin UI (dev on :4444)
  admin-web/    (separate admin app)
services/
  auth, menu, orders, kitchen, finance, inventory, integration-hub,
  reporting, tables, tax, printing, settings, admin, crm, marketing,
  purchase, notifications, aggregator, shared, ...
  — one folder per business domain. Each owns its own tables (see
    MODULE-MAP.md "Ownership & Boundaries"); apps/api wires them together
    via dependency injection, it does not contain business logic itself.
db/
  migrations/   — numbered plain-SQL files, see NEW_FEATURE_CHECKLIST.md
kapmeta/
  schema.prisma — the single Prisma schema for the whole platform
agents/
  AGENT_REGISTRY.json, task-board.json, STATUS.md — the multi-agent
  dispatch ledger, see docs/sdlc/OVERVIEW.md
.agents/AGENTS.md — the non-negotiable workspace rules (see below)
```

## Real tech stack (versions read from the actual `package.json` files — not guessed)

- **Runtime**: Node `>=18.0.0` (declared in `apps/api/package.json` `engines`)
- **Backend** (`apps/api`, `@kapmeta/api`): Express `^4.19.2`, `jsonwebtoken ^9.0.2`,
  `ws ^8.18.0` (websocket, e.g. live KOT/order pushes), `cors ^2.8.5`,
  `bcryptjs ^2.4.3`. Dev via `tsx watch src/index.ts`; `tsc --noEmit` is the
  typecheck script. TypeScript `^5.5.0` (api) — root uses `^5.0.0`.
- **Frontend** (`apps/pos-web`, `@kapmeta/pos-web`): Next.js `^14.2.5` (Pages
  Router — routes live in `apps/pos-web/pages/*.tsx`, not `app/`), React
  `^18.2.0`, Tailwind `^3.4.19`. Dev server explicitly pinned to port 4444
  (`next dev -p 4444`).
- **DB / ORM**: PostgreSQL (via `pg ^8.13.1` at the root and Prisma's `postgresql`
  datasource provider), Prisma `^5.22.0` / `@prisma/client ^5.22.0`. **Note**:
  `npx prisma generate` cannot run in the current sandbox (no network path to
  fetch the query-engine binary — see `agents/STATUS.md` CP-22), so some newer
  tables are queried via `$queryRaw`/`$executeRaw` instead of a generated
  Prisma delegate until that's resolved.
- **Testing**: Vitest (root `^4.1.10`, `apps/api` pins `^1.6.0`, `pos-web`
  pins `^1.4.0` — versions are NOT unified across workspaces, be aware when
  adding tests), Playwright `^1.62.1` for e2e (`npm run test:e2e`,
  `test:smoke`, `test:functional`, `test:validation`, `test:regression`
  point at `tests/playwright/tests/<suite>`).
- **Lint**: ESLint `^10.8.1` + `@typescript-eslint` `^8.66.0`, run via
  `npm run lint` (`eslint apps packages services --max-warnings=-1`).
- **Contracts**: `@redocly/cli ^2.46.0` lints OpenAPI specs
  (`npm run contracts:validate`, config `redocly.yaml`) — per
  ENGINEERING-PROTOCOL.md, the OpenAPI file in `contracts/openapi/` is meant
  to be written *before* the route implementation.
- **CI**: `.github/workflows/ci.yml` — a `quality` job (`npm ci`, `npm run
  lint`, `npm run typecheck`) and a `test` job that spins up real
  `postgres:16` and `redis:7` service containers against
  `DATABASE_URL=postgresql://pos:pos@localhost:5432/pos_test`.

## Scaffolding a new route (backend), following the repo's own conventions

Look at a recently-added, currently-real route file rather than inventing a
shape — e.g. `apps/api/src/routes/management.ts` (added CP-23,
`docs/../agents/STATUS.md`) is a good template: generic CRUD over an
outlet-scoped table, mounted in `apps/api/src/app.ts` under a prefix
(`/management/*`, mirroring how `reporting.ts` is mounted under
`/reporting/*`). New route files:

1. Land in `apps/<service-owning-app>/src/routes/<name>.ts` — nothing but the
   composition root (`apps/api`) talks HTTP; the actual domain logic should
   live in `services/<module>` where that separation already exists (see
   MODULE-MAP.md's "Ownership & Boundaries" table — a route in `apps/api`
   should not read another module's tables directly).
2. Resolve `outlet_id` from the authenticated session/JWT, never from the
   request body (ENGINEERING-PROTOCOL.md Rule 4) — see how `auth.ts`'s
   `/auth/me`/staff-profile routes and `management.ts` scope every query.
3. Mount the router in `apps/api/src/app.ts`.
4. Run `npx tsc --noEmit` in `apps/api` before considering it done — this
   session's own practice (see `docs/sdlc/DEFINITION_OF_DONE.md`) treats a
   changed tsc error count as a blocking regression.

## Scaffolding a new page (frontend), following the repo's own conventions

`apps/pos-web` uses the Next.js **Pages Router**: a new screen is a file
under `apps/pos-web/pages/`, e.g. `pages/reports/day-end-summary.tsx` or
`pages/inventory/purchase.tsx` (both added this session, see STATUS.md CP-19
and CP-22). To make a new page reachable from navigation:

1. Add the page file under `apps/pos-web/pages/`.
2. Add an entry to `SIDEBAR_GROUPS` in `apps/pos-web/components/Nav.tsx` — this
   is explicitly the single source of truth for app navigation (see the
   comment at the top of that array). Each group has `id`, `header`, `links:
   SidebarLinkDef[]` (each link: `href`, `permission`, `label`), and
   optionally `subGroups` for a second nesting level (drawer-only — see
   `KapMetaHeader.tsx`) and `alwaysExpanded` for a group that should render
   without a collapse chevron (used today only for "Daily Operations").
3. `KapMetaHeader.tsx` renders `SIDEBAR_GROUPS` for both the desktop sidebar
   and the mobile drawer — historically a group has been added to one and
   forgotten in the other (see the CP-21 Quick Links fix in STATUS.md);
   check both render paths.
4. Gate real permissions server-side — the `permission` string on a nav link
   is cosmetic only (ENGINEERING-PROTOCOL.md Rule 3); the API must enforce it
   independently.
5. `cd apps/pos-web && npx tsc --noEmit` before considering it done.

## Scaffolding a new service module

A new `services/<name>/` folder should own its own tables outright (add them
via a migration — see NEW_FEATURE_CHECKLIST.md) and expose functions/classes
that `apps/api` routes call — it must not be reached into directly by another
service. Register it (name, role, owned files) in
`agents/AGENT_REGISTRY.json` if it's meaningful enough to warrant its own
agent lane; add its module row to `docs/MODULE-MAP.md`.

## The DB convention this session discovered and now enforces: TEXT ids, not UUID

`db/migrations/README.md` documents an *intended* convention of native
`uuid` primary keys (`gen_random_uuid()`) for tenant/business tables. That
intent was never what actually landed. `agents/STATUS.md`'s 2026-09-02 "CP-20
amendment 2" entry records the ground-truth check: `scripts/inspect-db-v2.js`
run against the real live database found **every** `id`/`outlet_id`/`*_id`
column across all 24 tables checked is `TEXT`, with zero exceptions — matching
`kapmeta/schema.prisma`'s original `Outlet.id: String @id` (no `@db.Uuid`),
not the migration files. The real origin was almost certainly an early
`prisma db push` that used Prisma's default `String` id, with the raw-SQL
migration files layered on afterward and never actually matching live reality.

**The rule now**: every new migration and every new/edited Prisma model uses
plain `TEXT` id columns (`gen_random_uuid()::text` if you want a generated
default, or accept a client-supplied id), never `uuid`/`@db.Uuid`. Getting
this wrong causes a hard Postgres FK type mismatch (`42804`, "uuid and text")
that rolls back the *entire* migration transaction, including unrelated,
individually-safe `ADD COLUMN IF NOT EXISTS` statements in the same file —
this is exactly what silently hid the `orders.merge_group_id` column and
broke the Advance Order tab, per STATUS.md's CP-20 amendment 3.

Two other non-negotiables from `.agents/AGENTS.md` Rule 1 and
`ENGINEERING-PROTOCOL.md` Rule 1/2 to combine with this:

```prisma
model Invoice {
  id        String   @id @default(dbgenerated("gen_random_uuid()::text"))
  outletId  String   @map("outlet_id")            // NOT NULL, always
  totalMinor BigInt  @map("total_minor")           // currency: BigInt minor units, never Float
  currency  String   @default("INR")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("invoices")
}
```

i.e.: `id` and every FK are `String`/`TEXT` (no `@db.Uuid`), `outletId` is
required (never optional), and any money column is `BigInt` minor units plus
a currency field — never a float. See `models/*` in `kapmeta/schema.prisma`
that were touched or created in CP-19/20 (e.g. `TableMergeGroup`,
`OrderSeatBill`, `WaiterShiftHandover`) for real examples of this pattern
applied.
