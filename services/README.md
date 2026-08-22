# Orders + Tables Services

This directory contains two standalone TypeScript packages implementing the
Orders and Tables domain logic for Kapmeta (restaurant POS):

- `orders/` — order lifecycle, items, totals, bill/KOT numbering, audit log.
- `tables/` — restaurant tables, table sessions, live table status, the
  "Move KOT/Items" feature — built on top of `orders`.
- `shared/` — cross-cutting interfaces (`TaxService`, `SettingsService`,
  `PrintingService`) that `orders` depends on via constructor injection but
  does not implement. Those are owned by other agents/modules (tax engine,
  outlet settings, printer/KOT integration).

## Why an in-memory repository?

Both `orders` and `tables` define a generic `Repository<T>` interface and
ship an in-memory `Map`-backed implementation
(`InMemoryOrdersRepository`, `InMemoryTablesRepository`,
`InMemoryTableSessionsRepository`). This is explicitly a **placeholder** for
the real Postgres-backed repository that Phase 2-3's DB migrations define.
It lets all service logic (status machine, totals, audit log, sequences)
be fully exercised by tests today, with zero dependency on a live database.
Swapping in the real repository later should require no changes to
`OrdersService` / `TablesService` — only a new class implementing the same
`Repository<T>` interface (plus outlet-scoped query methods like
`findByOutlet`).

Similarly, `BillKotSequence` is an in-memory per-outlet counter. It is
**not concurrency-safe across processes** — the real implementation must
use a DB sequence or advisory lock scoped by `outlet_id` (see the comment
in `orders/src/BillKotSequence.ts`).

## How the pieces fit together

```
TablesService  ──uses──▶  OrdersService  ──calls──▶  TaxService (external)
     │                         │         ──calls──▶  SettingsService (external)
     │                         │         ──calls──▶  PrintingService (external)
     │                         ├─▶ OrdersRepository (in-memory placeholder)
     │                         ├─▶ OrderAuditLog (append-only, in-memory)
     │                         └─▶ BillKotSequence (in-memory per-outlet counter)
     ├─▶ TablesRepository (in-memory placeholder)
     └─▶ TableSessionsRepository (in-memory placeholder)
```

`TablesService.openTableSession()` creates a linked `Order` via
`OrdersService.createOrder()`. `TablesService.listTables()` derives each
table's display status (`Blank` / `Running` / `Running-KOT` / `Printed` /
`Paid`) from its linked order's `status` + `kot_sent`, per artifact-01 —
table status is never stored redundantly, always derived live.
`TablesService.moveKotItems()` (the "Move KOT/Items" feature) moves items
between two tables' orders using `OrdersService.addItem` /
`OrdersService.removeItem`, so totals recalculate through the normal
`calculateTotals()` path (which itself calls out to `TaxService` and
`SettingsService`) rather than being hand-patched.

Locked business rules enforced in code:

- `order_status` enum (`open | running | printed | paid | cancelled`) is
  strictly separate from the `kot_sent` boolean.
- All money fields are rounded via the shared `roundMoney()` helper before
  being persisted.
- `bill_no` / `kot_no` are per-outlet-local sequential integers, generated
  by `BillKotSequence`, never a DB-global serial.
- Manual grand-total edits go only through `OrdersService.overrideTotal()`,
  which always appends an `OrderAuditLog` entry with before/after values.
  There is no other code path that writes `grand_total_amount` directly for
  a manual edit.
- Status transitions are enforced by a strict table in `OrdersService`
  (`STATUS_TRANSITIONS`) — e.g. `open -> paid` directly, or
  `cancelled -> running`, both throw `InvalidStatusTransitionError`.
- Tax math and billing-settings logic are NOT implemented here — only the
  `TaxService.computeTax()` / `SettingsService.getBillingSettings()`
  interface contracts and the call sites (`OrdersService.calculateTotals`).

## Running the tests

Each package is independent and has its own `package.json` +
`vitest.config.ts`. From each package directory:

```bash
cd services/orders
npm install
npm test

cd services/tables
npm install
npm test
```

(The `tables` package's tests import `orders`' source and test-fakes
directly by relative path — there is no build/publish step needed between
the two packages for local development.)
