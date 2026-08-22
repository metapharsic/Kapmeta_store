# PostgreSQL Schema Reference

**Status:** PROPOSED · **Owner:** DBA · ~60+ tables

## Design Rules

1. **UUID primary keys** (`uuid_generate_v7` preferred) — safe for distributed integrations.
2. **Immutable transactions** — never destructively update orders/payments; append status history.
3. **Audit columns** on every table: `created_at`, `updated_at`, `created_by`, `updated_by`.
4. **Outlet scoping** — every operational table carries `outlet_id` from day 1, even if launch is single-outlet (DEC-001).
5. **Money as `BIGINT` minor units** + `currency CHAR(3)`. Never `FLOAT`.
6. **Transactional integrity** — order + payment + inventory mutations commit in one transaction.
7. **Index every FK** plus high-selectivity filter columns (`outlet_id, status, created_at`).
8. **Migration-only schema change** — no manual production DDL, ever.
9. **Retention/archival** for high-volume audit and event tables (partition by month).

## Schema Groups

### Identity & Access
`users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`

### Organization
`organizations`, `outlets`, `stations`, `terminals`, `business_hours`

### Catalog *(source: pages 6-27)*
`categories`, `menu_items`, `item_variants`, `modifiers`, `modifier_groups`,
`item_availability`, `availability_schedules`, `channel_item_mapping`

### Pricing & Tax
`price_lists`, `item_prices`, `taxes`, `tax_rules`, `discounts`

### Customers
`customers`, `customer_addresses`, `customer_tags`, `loyalty_accounts`

### Orders *(source: pages 1-5)*
`orders`, `order_items`, `order_item_modifiers`, `order_status_history`,
`order_payments`, `order_refunds`

### Kitchen *(source: page 5)*
`kitchen_orders`, `kot_tickets`, `kot_items`, `kitchen_stations`, `station_routes`

### Inventory *(no source — proposed)*
`ingredients`, `stock_locations`, `stock_balances`, `stock_movements`,
`recipes`, `recipe_items`, `wastage_records`

### Purchase *(no source — proposed)*
`vendors`, `purchase_orders`, `po_items`, `goods_receipts`, `gr_items`

### Finance *(no source — proposed)*
`invoices`, `invoice_items`, `payments`, `refunds`, `settlements`, `ledger_entries`

### Integration *(partial source: page 4)*
`integrations`, `channel_accounts`, `inbound_events`, `outbound_events`,
`sync_jobs`, `integration_errors`

### Reporting *(partial source: page 1)*
`daily_sales_summary`, `hourly_sales_summary`, `item_sales_summary`,
`payment_summary`, `kot_performance`

### Audit
`audit_logs`, `configuration_changes`, `access_logs`

## Key Constraints

| Table | Constraint |
|-------|-----------|
| `orders` | `UNIQUE (outlet_id, order_number)`; `channel_order_id` unique per `channel_account_id` |
| `inbound_events` | `UNIQUE (channel_account_id, external_event_id)` — idempotency guard |
| `payments` | `UNIQUE (gateway, gateway_txn_id)` — prevents double capture |
| `stock_movements` | Append-only; balances derived or maintained by trigger, never hand-edited |
| `item_availability` | `UNIQUE (item_id, channel_id)`; `version` column drives sync ordering |

## Partitioning

`audit_logs`, `access_logs`, `inbound_events`, `outbound_events` — monthly range partitions on `created_at`, archived per DEC-010.
