# Blocked Migrations

**Owner:** DBA · **Updated:** 2026-08-08

Migrations `0010`-`0012` are **not written**. Not an oversight — writing real DDL for them now means inventing the business rules that gate their shape, the same failure this whole doc tree exists to prevent.

| File | Tables | Blocked by | Why the shape is undecided |
|------|--------|-----------|----------------------------|
| `0010_inventory.sql` | `ingredients`, `stock_locations`, `stock_balances`, `stock_movements`, `recipes`, `recipe_items`, `wastage_records` | **DEC-003** | Whether consumption fires on order-confirm, on KOT-complete, or periodic-batch changes what `stock_movements` records and when — building the trigger now means guessing the trigger DEC-003 is meant to specify. |
| `0011_purchase.sql` | `vendors`, `purchase_orders`, `po_items`, `goods_receipts`, `gr_items` | **DEC-003**, DEC-015..019 | PO approval thresholds, variance tolerance, retrospective-PO policy, and the Purchase↔Finance boundary are each open decisions with their own packet (`docs/decisions/DEC-015` through `DEC-019`). The table shape follows the answer, not the other way round. |
| `0012_finance.sql` | `invoices`, `invoice_items`, `payments`, `refunds`, `settlements`, `ledger_entries` | **DEC-004**, DEC-005, DEC-013 | Tax model (inclusive/exclusive, per-line vs per-order), gateway shape, and the accounting export target all change these tables' columns, not just their contents. |

`0003_pricing_and_tax.sql` gets a **structural-only stub** — `price_lists` and `item_prices` (pricing structure doesn't depend on DEC-004) plus a comment block for `taxes`/`tax_rules`/`discounts` naming the columns those tables *would* need, none created. Same pattern as `0009_reporting.sql`.

**When a blocking DEC closes:** write the migration against the signed decision packet, not against this file. Delete the corresponding row here once the migration merges.
