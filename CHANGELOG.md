# Changelog — Kapmeta PetPooja POS Platform

All notable changes, architectural milestones, and multi-agent coordination records for the PetPooja POS platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-08-31

### Added
- **Multi-Agent Architectural Wiring Spec:** Deep 8-component specification ([`docs/03-architecture/component-subtasks-and-multi-agent-spec.md`](docs/03-architecture/component-subtasks-and-multi-agent-spec.md)) covering API Gateway, POS Web Frontends, Auth & RBAC, Orders & Cart, Kitchen Display System (KDS), Inventory & BOM, Indian GST Finance, and Omni-Channel Aggregators.
- **Strict Multi-Agent Rules & Invariants:** Added [`.agents/AGENTS.md`](.agents/AGENTS.md) enforcing:
  - Zero Hardcoded Business Literals (no hardcoded dishes, prices, categories, recipes, table numbers, or tax slabs).
  - Mandatory Dynamic User Ingestion Mechanisms (admin forms, seed scripts, REST CRUD endpoints).
  - `BIGINT` integer minor units (paise/cents) for all financial arithmetic.
  - Multi-tenant tenant boundaries enforcing `outlet_id NOT NULL`.
  - Primary key generation utilizing UUIDv7.
  - Domain table isolation across microservices.
  - Transaction-bound append-only immutable audit logging for all privileged operations.
- **Categorized Screenshot Repository:** Organized 90+ reference screenshots into modular category folders under `Screen_shot/`:
  - `01_Billing_Cashier/`
  - `02_Online_Orders_Aggregator/`
  - `03_KDS_LiveView_Kitchen_Chef/`
  - `04_Reports_Admin/`
  - `05_Settings_Config_Admin/`
  - `06_Menu_Inventory_Master_Admin/`
- **Dynamic Seed & Data Ingestion Provision:** Dynamic seed generator scripts and CLI tools allowing custom parameter and user-fillable schema ingestion.
- **Frontend POS Web Enhancements (`apps/pos-web`):**
  - Section-filtered floor map (`AC`, `Non AC`, `Outdoor`).
  - Covers counter stepper `[ − ] 2 Pax [ + ]`.
  - Food photo tiles grid with FSSAI veg/non-veg indicator badges.
  - Modifier customizer sheet (`MenuCustomizerModal.tsx`) for portion, spice level, and add-on selection.
  - Course tagging & firing (`STARTER`, `MAIN`, `DESSERT`, `BEVERAGE`).
  - Offline LAN queue with auto-retry.
  - Cash denomination counter and tips calculator (`WaiterCashTipsCalculator.tsx`).
  - 3-column Cashier touch billing layout (`PosBillingView.tsx`) with multi-tender settlement.
  - Bill splitting sheet (`BillSplitModal.tsx`) supporting guest count and item assignment splits.
  - Admin management consoles for dynamic menu, table layouts, RBAC users, and 86 live item disabling.

### Changed
- **Git Remote Target Configuration:** Configured primary Git remote `origin` to `https://github.com/metapharsic/Kapmeta_store.git`.
- **System Documentation (`README.md`):** Updated complete platform architecture, component breakdown, directory map, setup instructions, and Git push/pull protocols.
- **Build Baseline (`CHECKPOINT.md`):** Re-baselined all 17 SDLC phases and runtime validation logs.

### Fixed
- Fixed and repaired service entry point re-exports for `services/orders`, `services/finance`, `services/inventory`, `services/crm`, and `services/reporting`.
- Fixed CommonJS vs ESM module resolution compatibility across `apps/api` routers and service bindings.
- Restored CORS middleware and authentication headers in the API Gateway.

---

## [0.9.0] - 2026-08-22

### Added
- Core POS Milestone CP-03: Order creation, KOT generation, station routing, and billing engine.
- PostgreSQL database migrations 0001-0016 in `db/migrations`.
- Indian GST tax engine (5%, 12%, 18% inclusive/exclusive tax slabs).
- Shift Z-Report reconciliation and cashier float balancing.

---
*Maintained under the Kapmeta SDLC & Multi-Agent Pair Programming Protocol.*
