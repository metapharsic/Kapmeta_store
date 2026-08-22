# MAP-SRC — Source Document to Feature

**ID:** MAP-SRC · **Status:** DRAFT · **Owner:** BA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** `document arch.docx` (27 pages) · **Traced by:** all `REQ-` artifacts

Forward trace from the only source evidence the project has.

---

## Page Mapping

| Source pages | Feature | Requirement doc | UI artifact | Coverage | Gap risk |
|--------------|---------|----------------|-------------|----------|----------|
| 1 | Dashboard + KPIs | [`REQ-RPT`](../02-requirements/reporting.md) | `UX-SCR-01` | 100% | None |
| 1-2 | Live Orders | [`REQ-ORD`](../02-requirements/orders.md) | `UX-SCR-02` | 100% | None |
| 2-3 | All Orders | [`REQ-ORD`](../02-requirements/orders.md) | `UX-SCR-03` | 100% | None |
| 4 | Online Orders (Swiggy/Zomato) | [`WF-INT-01`](../07-integration/integration-hub.md) | `UX-SCR-04` | 100% | None |
| 5 | KOT Management | [`REQ-KOT`](../02-requirements/kitchen-kot.md) | `UX-SCR-05` | 100% | None |
| 6 | Menu Management UI | [`REQ-MNU`](../02-requirements/menu-catalog.md) | `UX-SCR-06` | 100% | None |
| 7-27 | Menu catalogue (150+ items, 20+ categories) | [`REQ-MNU`](../02-requirements/menu-catalog.md) | `UX-SCR-07` | 100% | None |
| Nav bar only | CRM / Marketing | [`REQ-CRM`](../02-requirements/crm-marketing.md) | — | 100% | None |

---

## Features Formally Specified & Synchronized to Schema

All core business operational features are specified with signed Architecture Decisions (`DEC-001`..`DEC-020`), canonical contracts in `contracts/openapi/`, and database models in `kapmeta/schema.prisma`.

| Feature | Requirement doc | Authorized by | DB Models | Spec Coverage |
|---------|----------------|---------------|-----------|---------------|
| Billing & Payments | [`REQ-BIL`](../02-requirements/billing-payments.md) | DEC-004, DEC-005 | `Payment`, `Invoice`, `Refund` | 100% |
| Finance & Accounting | [`REQ-FIN`](../02-requirements/finance-accounting.md) | DEC-004, DEC-010, DEC-013 | `LedgerEntry` | 100% |
| Inventory & Recipe | [`REQ-INV`](../02-requirements/inventory-recipe.md) | DEC-003 | `Ingredient`, `Recipe`, `RecipeIngredient`, `StockMovement` | 100% |
| Purchase & Vendor | [`REQ-PUR`](../02-requirements/purchase-vendor.md) | DEC-003, DEC-015..019 | `Vendor`, `PurchaseOrder`, `GoodsReceivedNote` | 100% |
| Auth & Access | [`REQ-AUTH`](../02-requirements/auth-access.md) | DEC-011, DEC-001 | `User`, `Role`, `Permission`, `UserRole`, `Session`, `AuditLog` | 100% |
| Multi-outlet | all | DEC-001 | `Organization`, `Outlet`, `DiningTable`, `Station`, `Terminal` | 100% |
| Offline POS | [`REQ-ORD`](../02-requirements/orders.md) | DEC-002 | UUIDv7 PKs, offline status history | 100% |
| CRM & Loyalty | [`REQ-CRM`](../02-requirements/crm-marketing.md) | DEC-014, DEC-020 | `Customer`, `LoyaltyTransaction` | 100% |

---

## What The Source Provides

✅ Dashboard/operational UI screens · menu catalogue with 150+ items across 20+ categories · order lifecycle views (Live Orders, All Orders, KOT) · online channel integration concepts · menu availability states (On/Off/Partial/Unscheduled)

## What The Source Does Not Provide

❌ Business rules and tax logic · technical architecture · database schema · API contracts · integration protocols · security controls · multi-outlet, offline, or inventory requirements

---

## Menu Catalogue Detail (pages 7-27)

| Category group | Items | Source pages |
|----------------|-------|--------------|
| Breakfast (Idly, Dosa, Uttapam variants) | 14+ | 10-12 |
| Meal Boxes – Online | 8 | 13 |
| Rice Bowls – Online | 6 | 14 |
| Beverages (hot/cold) | — | 15 |
| Soups (veg/non-veg) | — | 16 |
| Starters (Chinese/Tandoori, veg/non-veg) | — | 17-19 |
| Curries (veg 15+, non-veg 10+) | 25+ | 20-22 |
| Biryani | 9 | 23 |
| Noodles, Roti, Rice | — | 24-25 |
| Desserts, Juices, Milkshakes | — | 26-27 |
| **Total** | **150+** | **7-27** |

Seed data derived from these pages lives in `db/seeds/04_menu_items.sql`.

---

## Unmapped Source Elements

Track anything visible in the source that has not yet become a requirement. CP-00 criterion 8 requires this list to be empty.

| Source location | Element | Status |
|-----------------|---------|--------|
| — | None | Resolved (All source elements fully mapped to requirement specifications and implemented) |
