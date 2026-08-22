# DB-MAP-TBL — Table to Module to Requirement

**ID:** DB-MAP-TBL · **Status:** DRAFT · **Owner:** DBA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** DB-CAT, MAP-REQ · **Traced by:** CI consistency check

Complete artifact mapping. Every table, its owner, its authorization, its migration.

---

## Master Table

| Table | Module | REQ | Source evidence | Authorized by | Migration | Partitioned |
|-------|--------|-----|----------------|---------------|-----------|-------------|
| `organizations` | auth | cross | none | DEC-001 | 0001 🟢 | no |
| `outlets` | auth | cross | none | DEC-001 | 0001 🟢 | no |
| `terminals` | auth | `REQ-AUTH` | none | DEC-001 | 0002 | no |
| `business_hours` | auth | cross | none | DEC-001 | 0002 | no |
| `users` | auth | `REQ-AUTH` | none | DEC-011 | 0001 🟢 | no |
| `roles` | auth | `REQ-AUTH` | none | DEC-011 | 0001 🟢 | no |
| `permissions` | auth | `REQ-AUTH` | none | DEC-011 | 0001 🟢 | no |
| `role_permissions` | auth | `REQ-AUTH` | none | DEC-011 | 0001 🟢 | no |
| `user_roles` | auth | `REQ-AUTH` | none | DEC-011, DEC-001 | 0001 🟢 | no |
| `sessions` | auth | `REQ-AUTH` | none | DEC-011 | 0001 🟢 | no |
| `categories` | menu | `REQ-MNU` | **pages 7-27** | source | 0002 | no |
| `menu_items` | menu | `REQ-MNU` | **pages 7-27** | source | 0002 | no |
| `item_variants` | menu | `REQ-MNU` | pages 7-27 (partial) | source | 0002 | no |
| `modifier_groups` | menu | `REQ-MNU` | none | proposed | 0002 | no |
| `modifiers` | menu | `REQ-MNU` | none | proposed | 0002 | no |
| `item_modifier_groups` | menu | `REQ-MNU` | none | proposed | 0002 | no |
| `item_availability` | menu | `REQ-MNU` | **page 6** | source | 0002 | no |
| `availability_schedules` | menu | `REQ-MNU` | page 6 (Unscheduled state) | source | 0002 | no |
| `channel_item_mapping` | menu | `REQ-MNU` | page 4 (partial) | DEC-007 | 0002 | no |
| `price_lists` | menu | `REQ-BIL` | none | DEC-004 | 0003 🔴 | no |
| `item_prices` | menu | `REQ-BIL` | pages 7-27 (prices shown) | source + DEC-004 | 0003 🔴 | no |
| `taxes` | finance | `REQ-FIN` | none | DEC-004 | 0003 🔴 | no |
| `tax_rules` | finance | `REQ-FIN` | none | DEC-004 | 0003 🔴 | no |
| `discounts` | orders | `REQ-ORD` | none | DEC-008 | 0003 🔴 | no |
| `orders` | orders | `REQ-ORD` | **pages 1-3** | source | 0004 | no |
| `order_items` | orders | `REQ-ORD` | **pages 2-3** | source | 0004 | no |
| `order_item_modifiers` | orders | `REQ-ORD` | none | proposed | 0004 | no |
| `order_status_history` | orders | `REQ-ORD` | pages 2-3 (statuses) | source + protocol rule 5 | 0004 | no |
| `order_payments` | orders | `REQ-BIL` | none | DEC-005 | 0004 🔴 | no |
| `order_refunds` | orders | `REQ-BIL` | none | DEC-005 | 0004 🔴 | no |
| `kitchen_stations` | kitchen | `REQ-KOT` | **page 5** | source | 0005 | no |
| `station_routes` | kitchen | `REQ-KOT` | page 5 (implied) | proposed | 0005 | no |
| `kitchen_orders` | kitchen | `REQ-KOT` | **page 5** | source | 0005 | no |
| `kot_tickets` | kitchen | `REQ-KOT` | **page 5** | source | 0005 | no |
| `kot_items` | kitchen | `REQ-KOT` | **page 5** | source | 0005 | no |
| `customers` | crm | `REQ-CRM` | nav bar only | DEC-010 | 0006 | no |
| `customer_addresses` | crm | `REQ-CRM` | none | proposed | 0006 | no |
| `customer_tags` | crm | `REQ-CRM` | none | proposed | 0006 | no |
| `loyalty_accounts` | crm | `REQ-CRM` | none | proposed (loyalty DEC needed) | 0006 | no |
| `integrations` | integration | `REQ-INT` | **page 4** | source | 0007 | no |
| `channel_accounts` | integration | `REQ-INT` | page 4 | DEC-007 | 0007 | no |
| `inbound_events` | integration | `REQ-INT` | none | protocol rule 6 | 0007 | **monthly** |
| `outbound_events` | integration | `REQ-INT` | page 6 (sync status) | source | 0007 | **monthly** |
| `sync_jobs` | integration | `REQ-INT` | **page 6** | source | 0007 | no |
| `integration_errors` | integration | `REQ-INT` | page 6 (Failed state) | source | 0007 | no |
| `audit_logs` | cross | `REQ-AUD` | none | protocol rule 7 | 0008 | **monthly** |
| `configuration_changes` | cross | `REQ-AUD` | none | protocol rule 7 | 0008 | **monthly** |
| `access_logs` | cross | `REQ-AUD` | none | DEC-011 | 0008 | **monthly** |
| `daily_sales_summary` | reporting | `REQ-RPT` | **page 1** | source + DEC-009 | 0009 🔴 | no |
| `hourly_sales_summary` | reporting | `REQ-RPT` | page 1 | DEC-009 | 0009 🔴 | no |
| `item_sales_summary` | reporting | `REQ-RPT` | page 1 (Top Items) | source + DEC-009 | 0009 🔴 | no |
| `payment_summary` | reporting | `REQ-RPT` | page 1 (Payment Mix) | source + DEC-009 | 0009 🔴 | no |
| `kot_performance` | reporting | `REQ-RPT` | page 1 (KOT Duration) | source + DEC-009 | 0009 🔴 | no |
| `ingredients` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `stock_locations` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `stock_balances` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `stock_movements` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | consider |
| `recipes` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `recipe_items` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `wastage_records` | inventory | `REQ-INV` | none | DEC-003 | 0010 🔴 | no |
| `vendors` | inventory | `REQ-PUR` | none | DEC-003 | 0011 🔴 | no |
| `purchase_orders` | inventory | `REQ-PUR` | none | DEC-003 | 0011 🔴 | no |
| `po_items` | inventory | `REQ-PUR` | none | DEC-003 | 0011 🔴 | no |
| `goods_receipts` | inventory | `REQ-PUR` | none | DEC-003 | 0011 🔴 | no |
| `gr_items` | inventory | `REQ-PUR` | none | DEC-003 | 0011 🔴 | no |
| `invoices` | finance | `REQ-FIN` | none | DEC-004 | 0012 🔴 | no |
| `invoice_items` | finance | `REQ-FIN` | none | DEC-004 | 0012 🔴 | no |
| `payments` | finance | `REQ-BIL` | none | DEC-005 | 0012 🔴 | no |
| `refunds` | finance | `REQ-BIL` | none | DEC-005 | 0012 🔴 | no |
| `settlements` | finance | `REQ-FIN` | none | DEC-005 | 0012 🔴 | no |
| `ledger_entries` | finance | `REQ-FIN` | none | DEC-004, accounting DEC | 0012 🔴 | consider |

**63 tables.** 10 built, 53 planned, **31 blocked by an open decision.**

---

## Source-Evidence Summary

| Authorization | Tables | % |
|--------------|--------|---|
| Direct source evidence | 17 | 27% |
| Proposed (no source, no decision yet) | 15 | 24% |
| Blocked on a DEC | 31 | 49% |

**Only 27% of the schema is traceable to the source document.** This is the 40% requirements gap expressed in tables, and it is the concrete argument for CP-00 being a hard gate.

---

## Ownership Rule

The **Module** column is authoritative. That module's code is the only code permitted to write to those tables. Other modules read via API or subscribe to events (`MAP-EVT`).

Cross-module writes are the fastest way to make the modular monolith un-splittable. CI cannot detect this — code review must.
