# @kapmeta/api

Composition-root HTTP API that wires together the six previously-isolated
service packages (`services/{orders,tables,tax,settings,printing,admin}`)
via real dependency injection — no mocks, no stubs standing in for real
service classes (a couple of small honest stand-ins exist only where *no*
real implementation exists anywhere in the repo yet — see "Admin DI seams"
below).

## Why this package exists

Six sibling agents each built a service package in isolation, and each
independently authored its own copy of the shared cross-service interfaces
(`services/shared/src/interfaces.ts`) without seeing each other's exact
code. This package is the integration pass: it reconciles the resulting
type mismatches and proves the six packages actually compile and run
together by building a real, runnable Express app on top of them, plus a
real end-to-end integration test.

The full mismatch write-up lives at
`../../docs-integration/interface-audit.md` — read that first for the
"what was wrong and why" detail. Summary of what changed:

1. **`services/shared/src/interfaces.ts`** no longer redeclares
   `OutletBillingSettingsShape`/`OutletPrintSettingsShape`/`PrintingService`
   from scratch (which had drifted — most notably `highlight_orderid_mode`
   was declared `boolean` there vs the real `'none'|'background'|'border'`
   string enum in `services/settings/src/types.ts`). It now re-exports the
   real types from `services/settings/src/types.ts` and
   `services/printing/src/types.ts` under their original names, so there is
   exactly one definition of each type.
2. **`services/printing/src/adapters.ts`** (new) — `toKotRenderInput()` /
   `toBillRenderInput()` convert Orders' own `PrintableOrder` projection
   into the printing service's real `KotRenderInput`/`BillRenderInput`
   shapes, filling fields Orders doesn't track yet (tax breakdown lines,
   charges, customer info) with honest zero/empty defaults rather than
   fabricated values.
3. **`services/orders/src/OrdersService.ts`** — `printKot`/`printBill` now
   run `toPrintableOrder(order)` through the new adapters before calling
   the real `PrintingService.renderKot`/`renderBill`.
4. **`services/orders/src/BillKotSequence.ts`** — added `resetSequence()`
   so the admin "Reset Bill No." action has something real to call.
5. **`services/orders/test/fakes.ts`** — updated to implement the real
   `SettingsService`/`PrintingService` interfaces (string
   `highlight_orderid_mode`, `outlet_id`/`updated_at` fields,
   `KotRenderInput`/`BillRenderInput` render inputs) instead of the old
   drifted stub shapes it was written against.

No service's internal business logic was rewritten — the printing
service's rendering logic (which branches on ~20 settings flags) was left
exactly as-is; only the adapter layer between it and Orders was added.

## Wiring — `src/container.ts`

`createContainer()` builds the full dependency graph, in dependency order:

```
TaxRepository        SettingsRepository        (no deps — leaves)
     │                      │
 TaxService            SettingsService        PrintingService (no deps)
     │                      │                       │
     └──────────────┬───────┴───────────────────────┘
                     ▼
              OrdersService  (repo, taxService, settingsService, printingService)
                     │
                     ▼
              TablesService  (repo, sessionsRepo, ordersService)

AdminService: auditLog, billKotSequenceResetter, ordersArchiver,
              migrationRunner, outletDirectory
```

### Admin DI seams

`services/admin/src/interfaces.ts` declares `BillKotSequenceResetter`,
`OrdersArchiver`, `MigrationRunner`, and `OutletDirectory` as abstract
collaborators to be supplied by whoever wires the composition root — this
is correct DI design on the admin author's part, not a mismatch, but no
concrete implementation of any of the four existed anywhere in the six
packages before this pass. `container.ts` supplies them:

- `BillKotSequenceResetterAdapter` — wraps the real `BillKotSequence` used
  by `OrdersService` (peeks/resets the same per-outlet counters).
- `OrdersArchiverAdapter` — wraps the real `InMemoryOrdersRepository`;
  archiving removes the outlet's live orders from that repository (an
  honest in-memory analogue of "move to an archive store" — there is no
  separate archive store elsewhere in the codebase to move them to).
- `MigrationRunnerStub` / `OutletDirectoryAdapter` — **honest stand-ins**,
  documented as such in `container.ts`. No migration-runner or
  outlet-directory service exists anywhere in this codebase yet; these are
  not "fake real implementations", they are minimal in-memory
  implementations of the interface contract so `AdminService` is fully
  exercisable today. Replace them with real implementations once those
  services exist.

## Endpoints

All routes are mounted under `/v1`. See `src/routes/*.ts`. Highlights:

- `POST /v1/orders`, `GET /v1/orders/:id`, `POST /v1/orders/:id/items`,
  `DELETE /v1/orders/:id/items/:itemId`, `POST /v1/orders/:id/print-kot`,
  `POST /v1/orders/:id/print-bill`, `POST /v1/orders/:id/override-total`,
  `POST /v1/orders/:id/cancel`, `POST /v1/orders/:id/status`,
  `POST /v1/orders/:id/split`
- `POST /v1/tables`, `GET /v1/tables/:id`, `GET /v1/outlets/:id/tables`,
  `POST /v1/tables/:id/open-session`, `POST /v1/tables/:id/close-session`,
  `POST /v1/tables/move-kot-items`
- `POST /v1/tax/compute`, `POST/GET /v1/outlets/:id/taxes`,
  `POST /v1/outlets/:id/tax-channel-rules`
- `GET/PATCH /v1/outlets/:id/settings/billing`,
  `GET/PATCH /v1/outlets/:id/settings/print`
- `POST /v1/outlets/:id/admin/{reset-bill-no,reset-sync-code,
  database-migration,remove-all-orders,remove-backup-files}`,
  `GET /v1/outlets/:id/admin/{logs,machines}`,
  `GET /v1/admin/database-migration/:jobId`

Errors from real service-layer exceptions (`OrderNotFoundError`,
`TableNotFoundError`, `InvalidStatusTransitionError`, `ForbiddenError`,
`ConfirmationRequiredError`, `InvalidConfirmationPhraseError`,
`NotFoundError`, plus untyped-but-recognizable `Error`s like "Cannot add
items to an order in status 'paid'") are mapped to 404/409/403/400 by
`src/errors.ts` + the error-handling middleware in `src/app.ts` — nothing
that is a known domain error leaks as a raw 500.

## Running

```bash
cd apps/api
npm install
npm start          # or: npm run dev (tsx watch), PORT=4000 by default
npx tsc --noEmit    # typecheck
npx vitest run      # run the integration test suite
```

Module resolution note: this package uses `"module": "ESNext"` +
`"moduleResolution": "Bundler"` (matching `services/orders`/`services/tables`)
so both `.js`-suffixed ESM-style relative imports (orders/tables) and
extensionless ones (settings/tax/printing) resolve correctly to their `.ts`
sources — everything here is compiled/run as source, never against a
prebuilt `dist/`. Runtime uses `tsx` (esbuild-based), which resolves the
same way. `services/admin`'s own `tsconfig.json` targets CommonJS for its
isolated `tsc --noEmit`, but that only governs its own standalone build;
its `.ts` sources are plain TypeScript and compile fine as part of this
package's Bundler-mode program too.

This is a small monorepo-style setup, not a published-package one: `apps/api`
imports sibling services directly by relative path
(`../../../services/orders/src/...`), and has its own `package.json`/
`node_modules` (root `package.json` only carries `typescript`/`vitest` for
ad hoc use, not a workspaces setup) — this keeps each service's own test
suite/tsconfig independent while `apps/api` is free to use its own
compiler options (Bundler resolution) needed to consume all six packages
together.

## Integration test

`test/orderLifecycle.integration.test.ts` — vitest + supertest against the
real wired Express app (`createApp(createContainer())`), no mocks at the
HTTP layer. Covers: seeding tax rows/channel rule and creating a table
directly through the container (fast setup) → opening a table session
(creates a dine_in order) via HTTP → adding two items via HTTP → GET the
order and asserting subtotal/tax/grand_total against the real backward-tax
formula (200 subtotal, 5% total rate → 9.52 tax, 209.52 grand total,
matching `services/tax/src/TaxService.ts`'s own worked example) → printing
the KOT (`kot_no` assigned, status → `running`) → printing the bill
(`bill_no` assigned, status → `printed`) → overriding the total with a
reason (asserts one `total_override` audit-log entry with correct
before/after) → cancelling, then attempting an invalid `cancelled ->
running` transition and asserting it comes back as a real HTTP 409 (not a
raw thrown error) → plus a second test asserting an unknown order id
returns a real HTTP 404.

### Verified commands and results (2026-08-22)

```
cd apps/api && npm install                    # 189 packages installed, OK
cd apps/api && npx tsc --noEmit                # no errors
cd apps/api && npx vitest run                  # 2/2 passed
cd services/orders && npx tsc --noEmit         # no errors
cd services/orders && npx vitest run           # 13/13 passed
cd services/printing && npx vitest run         # 10/10 passed
cd services/settings && npx vitest run         # 7/7 passed
cd services/tax && npx vitest run              # 5/5 passed
cd services/tables && npx vitest run && npx tsc --noEmit   # 6/6 passed, no errors
cd services/admin && npx vitest run            # 23/23 passed
```

Also smoke-tested by actually starting the server (`PORT=4321 npx tsx
src/index.ts`) and hitting it with `curl`: `GET /healthz` → `{"status":"ok"}`,
`POST /v1/tables` → a real created table JSON response.
