# MAP-REQ — Requirement to Implementation

**ID:** MAP-REQ · **Status:** DRAFT · **Owner:** Solution Architect · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** MAP-SRC, DEC-LOG · **Traced by:** CI consistency check

The spine. Every requirement to its code, contract, schema and tests.

---

## Master Mapping

| REQ | Requirement doc | Module | API contract | DB objects | Workflow | Tests | Blocked by | Release |
|-----|----------------|--------|--------------|-----------|----------|-------|-----------|---------|
| `REQ-AUTH` | [auth-access](../02-requirements/auth-access.md) | `services/auth` | `auth.yaml` | `DB-TBL-USERS`, `ROLES`, `PERMISSIONS`, `USER_ROLES`, `ROLE_PERMISSIONS`, `SESSIONS` | `WF-AUTH-01` | `TST-SEC-*` | DEC-011, DEC-001 | R1 |
| `REQ-MNU` | [menu-catalog](../02-requirements/menu-catalog.md) | `services/menu` | `menu.yaml` | `DB-TBL-CATEGORIES`, `MENU_ITEMS`, `ITEM_VARIANTS`, `MODIFIERS`, `MODIFIER_GROUPS`, `ITEM_AVAILABILITY`, `AVAILABILITY_SCHEDULES`, `CHANNEL_ITEM_MAPPING` | `WF-MNU-01` | `TST-E2E-05/06` | DEC-001, DEC-007 | R1 |
| `REQ-ORD` | [orders](../02-requirements/orders.md) | `services/orders` | `orders.yaml` | `DB-TBL-ORDERS`, `ORDER_ITEMS`, `ORDER_ITEM_MODIFIERS`, `ORDER_STATUS_HISTORY`, `ORDER_PAYMENTS`, `ORDER_REFUNDS` | `WF-ORD-01/02/03` | `TST-E2E-01/02/03` | DEC-002, DEC-004, DEC-008 | R1 |
| `REQ-KOT` | [kitchen-kot](../02-requirements/kitchen-kot.md) | `services/kitchen` | `kitchen.yaml` | `DB-TBL-KITCHEN_ORDERS`, `KOT_TICKETS`, `KOT_ITEMS`, `KITCHEN_STATIONS`, `STATION_ROUTES` | `WF-KOT-01` | `TST-E2E-01` | DEC-006 | R1 |
| `REQ-BIL` | [billing-payments](../02-requirements/billing-payments.md) | `services/finance` | `payments.yaml` | `DB-TBL-PAYMENTS`, `REFUNDS`, `ORDER_PAYMENTS` | `WF-PAY-01/02` | `TST-E2E-08/10` | DEC-004, DEC-005 | R1 |
| `REQ-FIN` | [finance-accounting](../02-requirements/finance-accounting.md) | `services/finance` | — | `DB-TBL-INVOICES`, `INVOICE_ITEMS`, `SETTLEMENTS`, `LEDGER_ENTRIES`, `TAXES`, `TAX_RULES` | `WF-FIN-01/02` | `TST-INT-*` | DEC-004, DEC-010 | R1/R2 |
| `REQ-RPT` | [reporting](../02-requirements/reporting.md) | `services/reporting` | `reporting.yaml` | `DB-TBL-DAILY_SALES_SUMMARY`, `HOURLY_SALES_SUMMARY`, `ITEM_SALES_SUMMARY`, `PAYMENT_SUMMARY`, `KOT_PERFORMANCE` | `WF-RPT-01` | `TST-PERF-*` | DEC-009 | R1 |
| `REQ-INT` | [integration-hub](../07-integration/integration-hub.md) | `services/integration-hub` | `webhooks.yaml` | `DB-TBL-INTEGRATIONS`, `CHANNEL_ACCOUNTS`, `INBOUND_EVENTS`, `OUTBOUND_EVENTS`, `SYNC_JOBS`, `INTEGRATION_ERRORS` | `WF-INT-01/02` | `TST-E2E-04/07` | DEC-007 | R1.1 |
| `REQ-INV` | [inventory-recipe](../02-requirements/inventory-recipe.md) | `services/inventory` | `inventory.yaml` | `DB-TBL-INGREDIENTS`, `STOCK_LOCATIONS`, `STOCK_BALANCES`, `STOCK_MOVEMENTS`, `RECIPES`, `RECIPE_ITEMS`, `WASTAGE_RECORDS` | `WF-INV-01/02` | `TST-E2E-11` | DEC-003 | R2 |
| `REQ-PUR` | [purchase-vendor](../02-requirements/purchase-vendor.md) | `services/inventory` | — | `DB-TBL-VENDORS`, `PURCHASE_ORDERS`, `PO_ITEMS`, `GOODS_RECEIPTS`, `GR_ITEMS` | `WF-PUR-01` | `TST-INT-*` | DEC-003 | R2 |
| `REQ-CRM` | [crm-marketing](../02-requirements/crm-marketing.md) | *(not created)* | — | `DB-TBL-CUSTOMERS`, `CUSTOMER_ADDRESSES`, `CUSTOMER_TAGS`, `LOYALTY_ACCOUNTS` | `WF-CRM-01` | — | DEC-010 | R3 |
| `REQ-AUD` | cross-cutting | all | — | `DB-TBL-AUDIT_LOGS`, `CONFIGURATION_CHANGES`, `ACCESS_LOGS` | all | `TST-SEC-*` | DEC-010, DEC-011 | R1 |

---

## Reverse Lookup — "Why does this table exist?"

Pick any table, find its owning `REQ`, follow to `MAP-SRC` for source evidence or to `DEC-LOG` for the decision that authorized it.

| If the table is… | Owner REQ | Authorized by |
|------------------|-----------|--------------|
| `orders*`, `order_*` | `REQ-ORD` | Source pages 1-5 |
| `menu_items`, `categories`, `item_*`, `modifier*` | `REQ-MNU` | Source pages 6-27 |
| `kot_*`, `kitchen_*`, `station_*` | `REQ-KOT` | Source page 5 |
| `payments`, `refunds`, `settlements` | `REQ-BIL` | DEC-005 (no source) |
| `invoices*`, `ledger_entries`, `tax*` | `REQ-FIN` | DEC-004 (no source) |
| `ingredients`, `stock_*`, `recipe*`, `wastage_*` | `REQ-INV` | DEC-003 (no source) |
| `vendors`, `purchase_orders`, `po_*`, `g*_items` | `REQ-PUR` | DEC-003 (no source) |
| `customers*`, `loyalty_*` | `REQ-CRM` | DEC-010 (nav only) |
| `users`, `roles`, `permissions`, `sessions` | `REQ-AUTH` | DEC-011 (no source) |
| `inbound_events`, `outbound_events`, `sync_jobs` | `REQ-INT` | Source page 4 |
| `*_summary`, `kot_performance` | `REQ-RPT` | DEC-009 (partial source p.1) |
| `audit_logs`, `access_logs`, `configuration_changes` | `REQ-AUD` | ENGINEERING-PROTOCOL rule 7 |
| `organizations`, `outlets`, `terminals`, `business_hours` | cross-cutting | DEC-001 |

**A table not in this list is unauthorized schema.** Either map it or drop it.

---

## Blast Radius — "This DEC changed, what do I revisit?"

| Decision | Artifacts to review |
|----------|--------------------|
| DEC-001 | Every row above. Outlet scoping is schema-wide. |
| DEC-002 | `REQ-ORD`, `WF-ORD-01`, `UX-SCR-POS-*`, POS client architecture |
| DEC-003 | `REQ-INV`, `REQ-PUR`, `REQ-KOT` (wastage), `WF-INV-*`, `WF-ORD-01` step 10 |
| DEC-004 | `REQ-BIL`, `REQ-FIN`, `REQ-RPT`, `DB-TBL-TAX_RULES`, every invoice + report |
| DEC-005 | `REQ-BIL`, `DEP-EXT-03`, `WF-PAY-*`, reconciliation |
| DEC-006 | `REQ-KOT`, `DEP-HW-01`, `WF-KOT-01` |
| DEC-007 | `REQ-INT`, `DEP-EXT-01/02`, `WF-INT-*`, `CHANNEL_ITEM_MAPPING` |
| DEC-008 | `REQ-ORD` pricing, `DB-TBL-DISCOUNTS`, `WF-ORD-01` step 4 |
| DEC-009 | `REQ-RPT`, all summary tables, every dashboard `UX-` |
| DEC-010 | `REQ-FIN`, `REQ-CRM`, audit partitioning, archival jobs |
| DEC-011 | `REQ-AUTH`, security framework, all audit requirements |
| DEC-012 | `infra/`, `DEP-INT-*`, CI/CD |
