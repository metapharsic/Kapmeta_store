# DB-STD — Database Naming Standard

**ID:** DB-STD · **Status:** DRAFT · **Owner:** DBA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** DB-MAP-COL · **Traced by:** all migrations, CI lint

Enforced in review. A rename after production data exists is expensive and risky, so get it right in the first migration.

---

## Objects

| Object | Pattern | Example |
|--------|---------|---------|
| Table | plural snake_case | `order_items` |
| Junction table | both singulars, alphabetical | `item_modifier_groups` |
| Column | singular snake_case | `unit_price_minor` |
| Primary key | `id` | `id` |
| Foreign key column | `<singular_ref>_id` | `order_id` |
| Enum type | singular snake_case | `order_status` |
| Index | `idx_<table>_<cols>` | `idx_orders_outlet_status` |
| Unique index | `uq_<table>_<cols>` | `uq_orders_outlet_number` |
| Partial index | `idx_<table>_<cols>_<pred>` | `idx_kot_tickets_station_open` |
| Check constraint | `ck_<table>_<rule>` | `ck_taxes_rate_range` |
| Foreign key | `fk_<table>_<ref>` | `fk_order_items_order` |
| Trigger | `trg_<table>_<action>` | `trg_orders_status_guard` |
| Function | `fn_<verb>_<noun>` | `fn_next_invoice_number` |
| View | `v_<subject>` | `v_active_orders` |
| Materialized view | `mv_<subject>` | `mv_daily_sales` |
| Partition | `<table>_yYYYYmMM` | `audit_logs_y2026m08` |
| Migration file | `NNNN_snake_description.sql` | `0004_orders.sql` |

---

## Column Suffixes

Suffixes are load-bearing — they encode the type contract so a reviewer catches a mistake without opening the schema.

| Suffix | Type | Meaning |
|--------|------|---------|
| `_id` | `UUID` | Foreign key |
| `_at` | `TIMESTAMPTZ` | Point in time, UTC |
| `_date` | `DATE` | Calendar or business date |
| `_time` | `TIME` | Wall-clock configuration |
| `_minor` | `BIGINT` | Money in smallest currency unit |
| `_bps` | `INTEGER` | Rate in basis points |
| `_qty` | `NUMERIC` | Quantity — **always paired with a `uom` column** |
| `_count` | `INTEGER` | Cardinal count |
| `_ref` | `TEXT` | Pointer to an external system (e.g. secrets manager) |
| `_hash` | `TEXT` | Hashed value, never the plaintext |

## Column Prefixes

| Prefix | Type | Meaning |
|--------|------|---------|
| `is_` | `BOOLEAN` | State |
| `has_` | `BOOLEAN` | Possession |
| `can_` | `BOOLEAN` | Capability |

---

## Forbidden

| Never | Because |
|-------|---------|
| `data`, `info`, `value`, `temp`, `misc` as a column name | Says nothing; guarantees a future rename |
| Reserved words (`order`, `user`, `group`) unquoted | Requires quoting forever |
| Abbreviations not in the glossary | `ord_dt` is not faster to type than `order_date` |
| `CamelCase` or `PascalCase` | PostgreSQL folds to lowercase; you will fight it forever |
| Type in the name (`orders_table`, `str_name`) | Redundant, and wrong after a type change |
| Plural columns | A column holds one value per row |
| `NUMERIC`/`FLOAT` for money | Protocol rule 1 |
| `TIMESTAMP` without time zone | Ambiguity across outlets in different zones |
| `VARCHAR(n)` for status | Use an enum |

---

## Migration Files

```
NNNN_short_snake_description.sql
```

- Sequential, forward-only, never edited after merge
- One logical change per file
- Wrapped in `BEGIN; … COMMIT;` unless the statement forbids it (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`)
- Data backfills go in their own migration: batched, resumable, idempotent
- Comment the *why* at the top, not the *what* — the DDL already says what

---

## Backward Compatibility

Expand → migrate → contract, across three releases:

| Release | Action |
|---------|--------|
| N | Add the new column/table. Nullable or defaulted. Old code still works. |
| N+1 | Backfill. Write to both. Read from new. |
| N+2 | Drop the old column. |

A single breaking `ALTER` means the app cannot be rolled back without a schema rollback — and schema rollbacks against live transactional data are how a bad deploy becomes a data-loss incident.

---

## Review Checklist

- [ ] Names follow the patterns above
- [ ] `outlet_id` present on operational tables
- [ ] All five audit columns present
- [ ] Money is `BIGINT _minor` + currency
- [ ] Timestamps are `TIMESTAMPTZ`
- [ ] Every FK indexed
- [ ] Unique constraints for idempotency where applicable
- [ ] Enum used instead of free-text status
- [ ] Backward-compatible with the previous app version
- [ ] Registered in `DB-OBJECT-CATALOGUE.md` and `DB-MAP-table-to-module.md`
- [ ] ADR raised
