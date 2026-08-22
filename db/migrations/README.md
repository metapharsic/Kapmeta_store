# Kapmeta DB Migrations

## Convention

Each migration is ONE plain-SQL file named `NNNN_description.sql`, containing
both directions in a single file, separated by marker comments:

```sql
-- +migrate Up
...forward DDL...

-- +migrate Down
...reverse DDL...
```

This is the `sql-migrate` / `graphile-migrate`-style single-file marker
convention. It was chosen (over separate `.up.sql`/`.down.sql` pairs) because
it keeps the forward and reverse operations for a given schema change next to
each other, which is easier to review in a PR diff. Every file in this
directory follows this convention with no exceptions.

**These files are tool-agnostic plain SQL.** No specific migration runner has
been adopted yet — picking one (e.g. `node-pg-migrate`, Prisma Migrate,
Flyway, `sql-migrate`, `dbmate`) is explicitly deferred to Phase 2-3. Until
then, these files are the source of truth for schema intent and can be
applied by hand (`psql -f`) in numbered order against a fresh database, or
adapted mechanically into whichever tool's file format is chosen later (most
tools can consume the Up/Down blocks with light reformatting).

## Primary key convention

- **UUID (`uuid` via `gen_random_uuid()`)** for all outlet-scoped / tenant
  business data (outlets, tables, sessions, menu, taxes, orders, payments,
  sales_returns, settings, users). These are entities that get created
  client-side (POS terminals) and synced across a LAN/cloud topology, so
  IDs must be safely generatable offline without a central sequence.
- **`bigserial`** for pure append-only log / audit tables where rows are
  always written by a single authoritative writer and never need to be
  generated offline: `order_audit_log`, `channel_sync_log`, `backup_jobs`.

`pgcrypto` (for `gen_random_uuid()`) is enabled in migration 0001.

## Run order

```
0001_extensions_and_enums.sql
0002_create_users.sql
0003_create_outlets.sql
0004_create_tables_and_sessions.sql
0005_create_menu_categories_and_items.sql
0006_create_menu_item_channel_and_availability.sql
0007_create_taxes.sql
0008_create_payment_type_master.sql
0009_create_orders_and_order_items.sql
0010_create_order_payments.sql
0011_create_order_audit_log.sql
0012_create_sales_returns.sql
0013_create_outlet_billing_and_print_settings.sql
0014_create_sync_backup_channel_log.sql
0015_create_user_report_preferences.sql
```

`0099_seed_hotel_kapila_demo.sql` is **not** part of the ordered schema
build — it is a separate, clearly-marked seed script that is only ever run
against a database that already has 0001-0015 applied. It exists to prove
that the seed *path* works (admin-editable tables populated via INSERT, not
via hardcoded values in service code), per the project's no-hardcode rule.

## Notes / open flags

- `0012_create_sales_returns.sql` is marked **PROVISIONAL**: it is inferred
  from an earlier draft sketch, not from confirmed screenshot evidence.
  Flagged pending DEC-014 re-capture; do not treat its columns as final.
- `order_audit_log` (0011) is intended to be append-only. The trigger that
  would enforce this (blocking UPDATE/DELETE) is intentionally NOT
  implemented yet — only commented as a TODO — since trigger/permission
  strategy is being decided separately.
- Multi-outlet readiness: every tenant-scoped table carries `outlet_id`
  even though v1 UI is single-outlet only, per the locked Phase 0 decision.
