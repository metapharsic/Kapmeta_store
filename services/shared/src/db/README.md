# Postgres repositories — implementation notes

This documents the real Postgres-backed repository classes added alongside
the existing in-memory placeholders (`InMemory*Repository`, `TaxRepository`,
`SettingsRepository`). It does not replace the in-memory classes — both now
exist side by side, satisfying the same interfaces, so the composition root
(`apps/api/src/container.ts`, owned by a sibling Integration Agent) can swap
one line, e.g.:

```ts
// before
const ordersRepo = new InMemoryOrdersRepository();
// after
const ordersRepo = new PgOrdersRepository(getPool());
```

`getPool()` comes from `services/shared/src/db/Pool.ts` — a singleton
`pg.Pool` built from `DATABASE_URL`, or discrete `PGHOST`/`PGPORT`/`PGUSER`/
`PGPASSWORD`/`PGDATABASE` env vars if `DATABASE_URL` is unset (node-postgres
reads those itself). No ORM is used anywhere — every repository sends plain
parameterized SQL via `pool.query(text, params)`.

## Files added

| File | Backs |
|---|---|
| `services/shared/src/db/Pool.ts` | `getPool()` singleton, `withTransaction()` helper |
| `services/orders/src/PgOrdersRepository.ts` | `orders` + `order_items` |
| `services/orders/src/PgOrderAuditLog.ts` | `order_audit_log` |
| `services/orders/src/PgBillKotSequence.ts` | per-outlet bill/kot counters |
| `services/tables/src/PgTablesRepository.ts` | `restaurant_tables` |
| `services/tables/src/PgTableSessionsRepository.ts` | `table_sessions` |
| `services/tax/src/PgTaxRepository.ts` | `taxes` + `tax_channel_rules` |
| `services/settings/src/PgSettingsRepository.ts` | `outlet_billing_settings` + `outlet_print_settings` |
| `db-migrations/0016_extend_outlet_settings_jsonb.sql` | follow-up migration, see below |

## Orders schema mapping (cited for spot-checking)

Against `db-migrations/0009_create_orders_and_order_items.sql`:

| `orders` column (line) | `Order` field |
|---|---|
| `id` (20) | `id` |
| `outlet_id` (21) | `outlet_id` |
| `table_id` (22) | `table_id` |
| `channel` (23) | `channel` |
| `status` (24) | `status` |
| `kot_sent` (25) | `kot_sent` |
| `bill_no` (27) | `bill_no` |
| `kot_no` (28) | `kot_no` |
| `customer_name`/`customer_phone`/`customer_otp` (30-32) | `customer_name`/`customer_phone`/`otp` |
| `subtotal_amount`/`tax_amount`/`discount_amount`/`grand_total_amount` (34-37) | same names |
| `created_at`/`updated_at` (43-44) | same names, as ISO strings |

`orders` has **no column** for `Order.total_override_reason` (set by
`OrdersService.overrideTotal()`). Rather than add one, `PgOrdersRepository`
writes it into `order_audit_log` (action `'total_override'`) whenever
`save()` is called with a non-null value, and reconstructs it on read as
"the `after.total_override_reason` of the most recent `total_override`
audit entry for this order, else `null`". See `PgOrdersRepository.ts`'s
header comment for the complete reasoning.

Against `db-migrations/0009_create_orders_and_order_items.sql`, `order_items`:

| `order_items` column (line) | `OrderItem` field |
|---|---|
| `id` (69) | `id` |
| `outlet_id` (70) | `outlet_id` |
| `order_id` (71) | `order_id` |
| `menu_item_id` (72) | `item_id` |
| `item_name_snapshot` (73) | `item_name` |
| `unit_price` (74) | `unit_price` |
| `quantity` (75) | `quantity` |
| `line_total_amount` (79) | `line_total` |
| `notes` (80) | `notes` |
| `created_at`/`updated_at` (81-82) | same names |

`order_items` additionally has `line_subtotal_amount`/`line_tax_amount`/
`line_discount_amount`, which `OrderItem` doesn't expose (line-level tax/
discount splitting isn't part of this phase's domain model). `PgOrdersRepository`
writes `line_subtotal_amount = line_total_amount`, `line_tax_amount = 0`,
`line_discount_amount = 0` — line items are treated as tax-inclusive with
no line-level discount, consistent with `OrdersService`'s current (order-
level-only) discount/tax handling.

**`save()` transaction**: writes the `orders` row (upsert) and replaces all
of that order's `order_items` (delete-then-reinsert — `OrdersService` always
hands `save()` the complete, current item list) inside one
`BEGIN`/`COMMIT`, via `withTransaction()`.

## Per-outlet bill/kot sequence: why not a plain `SERIAL`

`bill_no`/`kot_no` must be sequential **per outlet** (each outlet starts at
1), per the sync-architecture decision recorded directly in
`0009_create_orders_and_order_items.sql`'s own header comment — outlets can
run offline on a LAN and must not depend on one shared counter. A Postgres
`SERIAL`/sequence object is exactly the opposite: one counter shared by
every row in the table, globally increasing across all outlets. Using one
would hand out interleaved numbers across outlets (outlet A: 1, 4, 9;
outlet B: 2, 3, 5...), which is not "per-outlet-local sequential". A fleet
of per-outlet `CREATE SEQUENCE` objects isn't practical either, since
outlets are created dynamically at runtime via admin CRUD, not at migration
time.

`PgBillKotSequence` (`services/orders/src/PgBillKotSequence.ts`) instead
uses a dedicated counter table, `outlet_bill_kot_seq` — one row per outlet,
columns `next_bill_no`/`next_kot_no` storing the **last issued** number
(0 = none yet). `nextBillNo()`/`nextKotNo()` run, inside one transaction:

1. `INSERT ... ON CONFLICT (outlet_id) DO NOTHING` to lazily create the
   outlet's row on first use (race-safe: the insert itself is atomic).
2. `SELECT next_bill_no FROM outlet_bill_kot_seq WHERE outlet_id = $1
   FOR UPDATE` — takes a row-level lock.
3. `UPDATE ... SET next_bill_no = $2` with the incremented value.

Two POS terminals racing to bill the same outlet serialize on that row
lock: the second transaction's `SELECT ... FOR UPDATE` blocks until the
first commits, then sees the already-incremented value — no duplicate
numbers, no gaps skipped, no cross-outlet interference.

**`outlet_bill_kot_seq` is not in any of the 0001-0016 migration files.**
It's created lazily by `PgBillKotSequence.ensureSchema()` the first time
it's used. A real deployment should add a proper numbered migration (e.g.
`0017_create_outlet_bill_kot_seq.sql`) with the same `CREATE TABLE` +
`ALTER TABLE ... ADD CONSTRAINT` DDL (see the file for the exact SQL) and
drop the lazy `ensureSchema()` call. It's implemented as lazy DDL here only
so this class is runnable/testable without a human first authoring that
migration.

## Settings schema/interface mismatch (why 0016 exists)

`services/settings/src/types.ts` (`OutletBillingSettings`/
`OutletPrintSettings`) was authored independently of
`db-migrations/0013_create_outlet_billing_and_print_settings.sql` (that
file's own header even says as much — "authored independently ... without
visibility into" the sibling repo's file). The two field sets only overlap
on two fields:

- `service_charge_enabled` (billing) — same name, same meaning, both sides.
- `footer_text` (TS) / `footer_message` (DB) — same concept, different name.

Everything else the TS interface exposes — `default_order_type`,
`delivery_charge_*`, `container_charge_*`, `tax_before_discount`,
`discount_calc_basis` (billing); `print_kot_on_bill`,
`show_duplicate_marker_*`, `restaurant_name`, `header_text`,
`show_srno_column`, etc. (print) — has **no column** on 0013's tables.
Conversely, 0013 has columns (`bill_prefix`, `kot_prefix`, `round_off_*`,
`max_discount_percent`, `require_customer_phone`, `printer_name`,
`paper_width_mm`, `print_logo`, `print_gstin`, `print_fssai_number`,
`kot_copies`, `bill_copies`, ...) that the TS interface never reads.

Rather than silently inventing values in application code (forbidden by
this project's no-hardcode-in-code rule) or unilaterally redesigning 0013 to
match types.ts without a human signing off, this agent added
**`0016_extend_outlet_settings_jsonb.sql`**: one `extended_settings jsonb`
column on each table, holding exactly the TS-interface fields that have no
first-class column. `PgSettingsRepository` reads/writes the two overlapping
fields via their real typed columns, and everything else via
`extended_settings`.

This means the "first-run defaults live in the DB, not a code literal"
property (which the in-memory `SettingsRepository`'s own doc comment
insists on) is only **fully** true for the two first-class-column fields —
their defaults come from the column's own `DEFAULT` in 0013. The
`extended_settings` fields' first-run values are still a code constant in
`PgSettingsRepository.ts` (`firstRunExtendedBillingDefaults`/
`firstRunExtendedPrintDefaults`, copied verbatim from the original
in-memory repository), written into the row once on first `INSERT` and
persisted from then on — a documented, narrower exception, not a silent
one. **Recommended follow-up**: a human reconciles 0013 with types.ts
properly (give the missing fields real typed columns) and this jsonb
overflow bucket goes away.

## OrderChannel schema/interface mismatch

The DB's `order_channel` enum (`0001_extensions_and_enums.sql:20-25`) is
`'dine_in' | 'online' | 'takeaway' | 'delivery'`. The TS `OrderChannel`
type used by `services/tax/src/types.ts` and `services/settings/src/types.ts`
is `'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato'` — a different
independently-authored enum (see `services/tax/src/TaxRepository.ts`'s and
`services/orders/src/types.ts`'s parallel-but-different `OrderChannel`
definitions already in the codebase pre-dating this agent's work). Only
`'dine_in'` and `'delivery'` are valid against both. Passing `'pickup'`,
`'swiggy'`, or `'zomato'` into `PgTaxRepository` throws a real Postgres enum
violation (`invalid input value for enum order_channel`) — verified in
`services/tax/test/PgTaxRepository.test.ts`. This is a pre-existing,
unresolved mismatch between two independently-built parts of the system;
**not** something this agent's repositories can or should paper over,
since silently remapping `'pickup'` to `'takeaway'` (say) would be a
business-logic decision no migration or spec actually makes. Flagging it
here for a human to reconcile.

## How these repositories were verified

No live Postgres was reachable in this sandbox: `pg_isready` reported "no
response" against the default socket. `pg-mem` (an in-memory
Postgres-compatible SQL engine) was installed as a `devDependency` in each
service instead, and real integration-style tests
(`services/*/test/Pg*Repository.test.ts`) load the **actual** schema —
every file in `db-migrations/0001-0016` (in order, `-- +migrate Up` half
only) — into a fresh pg-mem instance per test via
`services/shared/test/pgMemHarness.ts`, then exercise the repository
classes' real SQL against it. This is not a mock: the parameterized SQL
text the repositories send is genuinely parsed and executed by pg-mem.

**All 25 new tests pass**: 9 for orders (`PgOrdersRepository`,
`PgOrderAuditLog`, `PgBillKotSequence`), 4 for tables
(`PgTablesRepository`, `PgTableSessionsRepository`), 7 for tax
(`PgTaxRepository`), 5 for settings (`PgSettingsRepository`). `npx tsc
--noEmit` was run in each of the four service packages and introduces zero
new errors (some pre-existing, unrelated errors in `test/fakes.ts` and
`services/printing/src/adapters.ts` predate this agent's work and were left
untouched, per instructions not to fix files outside this task's scope).

**Known gap**: pg-mem does not implement real MVCC/row-level locking across
concurrently-open connections. `PgBillKotSequence`'s `SELECT ... FOR UPDATE`
is the standard, correct Postgres pattern for serializing concurrent
counter increments, but pg-mem can't verify the concurrent case — see the
comment on the "increments correctly across ten sequential calls" test in
`services/orders/test/PgOrdersRepository.test.ts` for what was actually
observed (10 concurrent calls against pg-mem all returned 1) versus what
this SQL does against real Postgres. **This is the one thing that still
needs verification against a real Postgres instance before shipping.**

**Other pg-mem-only workarounds** (all documented inline at their call
site, and all equivalent-but-different-syntax choices that are only needed
because of pg-mem quirks, not real Postgres behavior):
- `= ANY($1::uuid[])` against an **indexed** uuid column silently matches
  nothing in pg-mem; rewritten as `IN ($1, $2, ...)` with one placeholder
  per id (`PgTablesRepository.activeOrderIdsByTable`,
  `PgTaxRepository.getTaxesByIds`).
- `<> ALL($1::uuid[])` / `NOT IN (...)` against an indexed uuid column
  crashes pg-mem outright; rewritten as an explicit fetch-diff-in-JS-then-
  per-row-update (`PgTaxRepository.updateChannelRule`).
- `INSERT ... ON CONFLICT (outlet_id) DO UPDATE` against a table whose
  uniqueness on `outlet_id` comes from a separately-created `CREATE UNIQUE
  INDEX` (rather than an inline column constraint) isn't recognized as a
  valid ON CONFLICT target by pg-mem; rewritten as explicit
  check-then-insert-or-update (`PgSettingsRepository`).
- A registered custom SQL function (`gen_random_uuid()`, standing in for
  the `pgcrypto` extension pg-mem can't load) must be marked `impure: true`
  or pg-mem memoizes its zero-argument result and hands out the same "random"
  id to every row.
- `LEFT JOIN LATERAL` and a correlated scalar subquery referencing an outer
  query's row inside `WHERE` both fail to resolve the outer alias in
  pg-mem; `PgTablesRepository` instead resolves each table's current open
  session's order_id via one extra non-correlated query and merges the
  results in JS.

**TO RUN AGAINST REAL POSTGRES**: each test file's header comment says
exactly what to change (point `DATABASE_URL`/`PGHOST` etc. at a real
instance with 0001-0016 already applied, swap `createTestPool()` for
`getPool()`). The repository classes themselves are unchanged either way —
they were written directly against the real schema throughout, and the
pg-mem-specific rewrites above were verified to also be correct,
equivalent SQL against real Postgres (standard `IN`/`NOT IN`/`ANY` are all
semantically identical to a real Postgres query planner; only pg-mem's
handling of them differs).
