# Module Map

For any module: where its code lives, which docs govern it, what blocks it.

---

## Quick Lookup

| Module | Code | Requirement doc | Contract | Blocked by | Release |
|--------|------|----------------|----------|-----------|---------|
| **Auth / RBAC** | `services/auth` | `02-requirements/auth-access.md` | `contracts/openapi/auth.yaml` | DEC-011, DEC-001 | R1 |
| **Menu & Catalog** | `services/menu` | `02-requirements/menu-catalog.md` | `menu.yaml` | DEC-001, DEC-007 | R1 |
| **Orders** | `services/orders` | `02-requirements/orders.md` | `orders.yaml` | DEC-002, DEC-004, DEC-008 | R1 |
| **Kitchen / KOT** | `services/kitchen` | `02-requirements/kitchen-kot.md` | `kitchen.yaml` | DEC-006 | R1 |
| **Billing / Payments** | `services/finance` | `02-requirements/billing-payments.md` | `payments.yaml` | DEC-004, DEC-005 | R1 |
| **Dashboard / Reporting** | `services/reporting` | `02-requirements/reporting.md` | `reporting.yaml` | DEC-009 | R1 |
| **Integration Hub** | `services/integration-hub` | `07-integration/integration-hub.md` | `webhooks.yaml` | DEC-007 | R1.1 |
| **Inventory / Recipe** | `services/inventory` | `02-requirements/inventory-recipe.md` | `inventory.yaml` | DEC-003 | R2 |
| **Purchase** | `services/inventory` | `02-requirements/purchase-vendor.md` | — | DEC-003, DEC-015..019 | R2 |
| **Finance / Accounting** | `services/finance` | `02-requirements/finance-accounting.md` | — | DEC-004, DEC-010, DEC-013 | R2 |
| **CRM / Marketing** | *(not created)* | `02-requirements/crm-marketing.md` | — | DEC-014, DEC-020 | R3 |
| **POS UI** | `apps/pos-web` | `04-design/design-system.md` | — | DEC-002 | R1 |
| **Admin UI** | `apps/admin-web` | `04-design/design-system.md` | — | — | R1 |
| **API Gateway / BFF** | `apps/api` | `06-api/api-standards.md` | all | — | R1 |
| **Multi-Agent Orchestration** | `services/*` | `03-architecture/multi-agent-orchestration-and-wiring.md` | `DEP-INT` | DEC-001 | R1 |

---

## Ownership & Boundaries

Each module owns its tables. **No module reads another module's tables directly** — go through the owning module's API. This is what keeps later extraction to separate services possible.

| Module | Owns tables | Publishes events |
|--------|------------|-----------------|
| `auth` | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions` | `user.role_changed` |
| `menu` | `categories`, `menu_items`, `item_variants`, `modifiers`, `modifier_groups`, `item_availability`, `availability_schedules`, `channel_item_mapping` | `menu.item_availability_changed` |
| `orders` | `orders`, `order_items`, `order_item_modifiers`, `order_status_history`, `order_payments`, `order_refunds` | `order.placed`, `order.status_changed`, `order.cancelled` |
| `kitchen` | `kitchen_orders`, `kot_tickets`, `kot_items`, `kitchen_stations`, `station_routes` | `kot.created`, `kot.completed` |
| `finance` | `invoices`, `invoice_items`, `payments`, `refunds`, `settlements`, `ledger_entries` | `payment.captured`, `refund.issued` |
| `inventory` | `ingredients`, `stock_locations`, `stock_balances`, `stock_movements`, `recipes`, `recipe_items`, `wastage_records` | `stock.moved` |
| `integration-hub` | `integrations`, `channel_accounts`, `inbound_events`, `outbound_events`, `sync_jobs`, `integration_errors` | `channel.sync_failed` |
| `reporting` | `daily_sales_summary`, `hourly_sales_summary`, `item_sales_summary`, `payment_summary`, `kot_performance` | — (read-only consumer) |

---

## Dependency Order

Build in this order. Each layer depends on the one above it.

```
auth  ─────────────────────────────► everything
  │
menu ──────────► orders ──────────► kitchen
                    │                  │
                    ├──► finance ◄─────┘
                    │
                    ├──► inventory (R2)
                    │
                    └──► reporting (consumes all)

integration-hub ──► menu (outbound sync)
                └─► orders (inbound orders)
```

`reporting` reads events and summary tables — never live transactional tables under load.

---

## Where To Add A New Thing

| Adding | Goes in |
|--------|---------|
| New API endpoint | `contracts/openapi/<module>.yaml` first, then `services/<module>` |
| New table | New migration in `db/migrations/`, plus an ADR |
| New shared type | `packages/shared-types` (generated from OpenAPI — do not hand-write) |
| New UI component used by both apps | `packages/ui-kit` + Storybook story |
| New UI screen | `apps/pos-web` or `apps/admin-web`; add to the screen inventory in `04-design/design-system.md` |
| New channel adapter | `services/integration-hub`, behind the existing adapter interface |
| New env var | `.env.example` + the config schema in `packages/config` |
| New scheduled job | `services/<owning-module>`, documented in `12-operations/runbook.md` |
| Structural decision | `docs/adr/NNNN-*.md` |
