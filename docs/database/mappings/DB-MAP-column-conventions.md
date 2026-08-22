# DB-MAP-COL — Column Conventions

**ID:** DB-MAP-COL · **Status:** DRAFT · **Owner:** DBA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** `05-database/schema-reference.md` · **Traced by:** all migrations

---

## Mandatory Columns — Every Table

| Column | Type | Null | Default | Purpose |
|--------|------|------|---------|---------|
| `id` | `UUID` | no | `gen_random_uuid()` | PK. Distributed-safe. |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | UTC always |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | Maintained by `trg_updated_at` |
| `created_by` | `UUID` | yes | — | User or `NULL` for system |
| `updated_by` | `UUID` | yes | — | User or `NULL` for system |

## Mandatory — Every Operational Table

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `outlet_id` | `UUID` | no | Scoping boundary. Present from day one regardless of DEC-001. |

Exempt: `organizations`, `users`, `roles`, `permissions`, `integrations` (org-level or global).

---

## Money

| Column pattern | Type | Rule |
|---------------|------|------|
| `*_minor` | `BIGINT` | Smallest currency unit (paise). **Never `NUMERIC`, `FLOAT`, `REAL`, `DOUBLE PRECISION`.** |
| `currency` | `CHAR(3)` | ISO 4217. Denormalized onto transaction rows so a historical row keeps its own currency. |
| `*_bps` | `INTEGER` | Rates in basis points. 5% = 500. Keeps the tax path integer-only. |

```sql
-- correct
total_minor      BIGINT  NOT NULL,
currency         CHAR(3) NOT NULL DEFAULT 'INR',
tax_rate_bps     INTEGER NOT NULL,

-- wrong, and it will be found in production by an accountant
total            NUMERIC(10,2),
tax_rate         FLOAT
```

---

## Time

| Column | Type | Rule |
|--------|------|------|
| `*_at` | `TIMESTAMPTZ` | Always UTC. Presentation converts to outlet timezone. |
| `*_date` | `DATE` | Calendar date only |
| `business_date` | `DATE` | **Computed via `fn_business_date()`.** Not `created_at::date`. |
| `*_time` | `TIME` | Wall-clock config (e.g. `day_start_time`) |

`business_date` is stored, not derived at query time — reports filter on it constantly, and recomputing per row makes every dashboard slow.

---

## Status & Enums

| Rule | Reason |
|------|--------|
| Enum types, not free-text `VARCHAR` | Typos become data corruption |
| Status changes append to a history table | Protocol rule 5 |
| Never reuse an enum value for a new meaning | Historical rows silently change meaning |
| Adding a value: `ALTER TYPE … ADD VALUE` in its own migration | Cannot run inside a transaction with other DDL in older PG |

---

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Table | plural, snake_case | `order_items` |
| Column | singular, snake_case | `unit_price_minor` |
| FK column | `<referenced_table_singular>_id` | `order_id` |
| Boolean | `is_` / `has_` prefix | `is_active`, `has_modifiers` |
| Timestamp | `_at` suffix | `completed_at` |
| Money | `_minor` suffix | `total_minor` |
| Rate | `_bps` suffix | `tax_rate_bps` |
| Quantity | `_qty` suffix + separate `uom` | `received_qty`, `uom` |
| Index | `idx_<table>_<cols>` | `idx_orders_outlet_status` |
| Unique index | `uq_<table>_<cols>` | `uq_inbound_events_external` |
| Check | `ck_<table>_<rule>` | `ck_taxes_rate_range` |
| FK | `fk_<table>_<ref>` | `fk_order_items_order` |
| Trigger | `trg_<table>_<action>` | `trg_orders_status_guard` |
| Function | `fn_<verb>_<noun>` | `fn_next_invoice_number` |
| View | `v_<subject>` | `v_active_orders` |
| Materialized view | `mv_<subject>` | `mv_daily_sales` |

---

## Snapshot vs Reference

Transaction rows **snapshot** the values that were true when the transaction happened:

| Table | Snapshots | Why |
|-------|-----------|-----|
| `order_items` | `unit_price_minor`, item name | A price change tomorrow must not alter yesterday's invoice |
| `order_item_modifiers` | `price_delta_minor` | Same |
| `invoice_items` | description, amounts, tax breakup | A statutory document is immutable |
| `stock_movements` | `cost_minor` | Costing must reflect the cost at movement time |
| `po_items` | `rate_minor` | Vendor price at PO time, for three-way match |

Joining to `menu_items` to display an old order's price is a real and common bug. It produces invoices that silently disagree with what the customer paid.

---

## Soft Delete

**Not used** for transactional data. Orders, payments and invoices are never deleted — they are cancelled or credited, with history.

Master data (`menu_items`, `vendors`, `users`) uses `is_active BOOLEAN`, never a physical delete, because transactional rows reference them forever.

---

## Nullability

| Situation | Rule |
|-----------|------|
| Business-required field | `NOT NULL` |
| Optional field | nullable |
| FK to an optional relationship | nullable |
| `outlet_id` on operational tables | **always `NOT NULL`** |
| `user_roles.outlet_id` | nullable — `NULL` means organization-wide grant |

Avoid `NOT NULL DEFAULT ''`. An empty string that means "unknown" is a null wearing a disguise, and it defeats every constraint you would otherwise get for free.
