# Inventory Service — PROPOSAL

**No screenshot or spec evidence exists for inventory/stock behavior in this
project.** Everything below is a reasonable-default proposal, built by
following the conventions established in `services/orders` and
`services/shared` (in-memory Repository pattern, `roundMoney`, vitest), not
a confirmed product requirement. Treat field names, statuses, and business
rules as a starting point for review, not as ground truth.

## Contents

- `src/types.ts` — `RawMaterial`, `Recipe`, `PurchaseOrder`, `StockMovement`.
- `src/InventoryRepository.ts` — in-memory `Repository<T>` implementations.
- `src/InventoryService.ts` — `deductStockForOrder`, `receivePurchaseOrder`,
  `adjustStock`.
- `test/InventoryService.test.ts` — vitest coverage.

## Notes on behavior

- `deductStockForOrder` aggregates recipe consumption across all items
  first, validates every raw material has enough stock, and only then
  writes movements — all-or-nothing, no partial deduction on failure.
- `allowNegativeStock` (config flag, default `false`) governs both
  `deductStockForOrder` and `adjustStock`.
- A menu item with no recipe defined is silently skipped (not treated as an
  error) during deduction.
