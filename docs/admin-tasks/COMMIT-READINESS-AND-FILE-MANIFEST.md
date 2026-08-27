# PetPooja POS Platform — Commit Readiness & File Manifest Report

## Executive Summary
This document provides a complete inventory of all modified, newly created, and verified files across the **PetPooja POS Admin & Platform Synchronization** tasks (Tasks 1 through 8).

Out of the ~300+ total entries currently appearing in git status:
- **~45 Essential Project Files** contain the actual application logic, database seeds, frontend UI components, microservice repositories, shared types, and audit reports.
- **~280+ Unnecessary / Dependency Files** belong to `.agents/skills/` (agent skill fonts, external CSV benchmarks, test fixtures) and temporary build artifacts (`packages/shared-types/auth.js`).

---

## 1. Complete Categorized Manifest of Essential Files

### 🎨 A. POS Frontend Application (`apps/pos-web/`)
| File Path | Description / Changes |
| :--- | :--- |
| [`apps/pos-web/pages/admin.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/pages/admin.tsx) | Sales Analytics dashboard, Live Occupancy Rate card, GST Tax Breakdown slab table (5%, 12%, 18%), and Settled Invoices CSV export. |
| [`apps/pos-web/pages/finance.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/pages/finance.tsx) | Daily Z-Report, Cash Drawer & Petty Cash Reconciliation Panel, "+ Log Petty Cash" Modal, and "🔒 End-of-Day Shift Close" Modal. |
| [`apps/pos-web/pages/inventory.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/pages/inventory.tsx) | Portion `+` / `−` crash fix, safe price formatting, "+ Add Raw Material" modal, Recipe BOM cards, Supplier Directory & PO generation. |
| [`apps/pos-web/pages/menu.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/pages/menu.tsx) | "📥 Bulk Import CSV" Modal, dynamic category filters, 86 item availability toggles, and live dish catalog. |
| [`apps/pos-web/pages/login.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/pages/login.tsx) | Multi-outlet switcher and authenticated session token handling. |
| [`apps/pos-web/components/Nav.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/components/Nav.tsx) | 240px sidebar container, Quick Links wrapper alignment, and section navigation. |
| [`apps/pos-web/components/PetPoojaHeader.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/components/PetPoojaHeader.tsx) | Interactive **Store Operations Control Modal** (Online/Offline, channels, outlet info) and **Live Operational Alerts Panel** (unread badges, low stock, table service, online orders). |
| [`apps/pos-web/components/QuickLinks.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/components/QuickLinks.tsx) | Upwards-opening popover with full sidebar width containment, non-clipped "+ Add" button, and saved shortcuts list. |
| [`apps/pos-web/components/PosBillingView.tsx`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/pos-web/components/PosBillingView.tsx) | POS cart, table checkout, order creation, and CRM customer linking. |

---

### ⚙️ B. Backend API Gateway (`apps/api/`)
| File Path | Description / Changes |
| :--- | :--- |
| [`apps/api/src/app.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/app.ts) | Master router mounts for `/reporting`, `/finance`, `/inventory`, `/integration`, `/integrations`, `/user-management`, `/waiters`, `/crm`, `/menu`, `/kitchen`. |
| [`apps/api/src/routes/reporting.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/reporting.ts) | Endpoints: `/reporting/sales-summary`, `/reporting/tax-breakdown`, `/reporting/invoices`. |
| [`apps/api/src/routes/finance.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/finance.ts) | Endpoints: `/finance/z-report`, `/finance/cash-drawer`, `/finance/petty-cash`, `/finance/close-shift`, `/finance/ledger-entries`, `/finance/refunds`. |
| [`apps/api/src/routes/inventory.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/inventory.ts) | Endpoints: `/inventory/ingredients`, `/inventory/recipes` (joined ingredient names & units), `/inventory/vendors`, `/inventory/purchase-orders`. |
| [`apps/api/src/routes/integration.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/integration.ts) | Endpoints: `/integration/channel-items`, `/channel-items/:id/availability`, `/integrations/channels`. |
| [`apps/api/src/routes/menu.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/menu.ts) | Endpoints: `/menu/bulk-import-csv`, `/menu/categories`, `/menu/items`, `/menu/availability`. |
| [`apps/api/src/routes/orders.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/orders.ts) | Endpoints: `/orders`, `/orders/live`, table checkout, status transitions. |
| [`apps/api/src/routes/tables.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/tables.ts) | Endpoints: `/tables`, `/tables/occupancy`, `/tables/sections`. |
| [`apps/api/src/routes/user-management.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/user-management.ts) | Endpoints: `/user-management/users`, `/roles`, `/permissions`, `/quick-links`. |
| [`apps/api/src/routes/waiters.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/waiters.ts) | Endpoints: `/waiters/active`, floor monitoring. |
| [`apps/api/src/routes/auth.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/src/routes/auth.ts) | Multi-tenant auth token generation and outlet scoping. |
| [`apps/api/package.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/package.json) & [`apps/api/tsconfig.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/apps/api/tsconfig.json) | API build configurations and dependencies. |

---

### 🧩 C. Microservices & Domain Logic (`services/*`)
| File Path | Description / Changes |
| :--- | :--- |
| [`services/reporting/src/reporting-service.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/reporting/src/reporting-service.ts) | Reporting domain aggregation service. |
| [`services/reporting/src/stores/prisma-reporting-repository.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/reporting/src/stores/prisma-reporting-repository.ts) | SQL queries for GST slabs (5%, 12%, 18%), hourly sales, settled invoices, and table occupancy rate calculation. |
| [`services/reporting/src/index.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/reporting/src/index.ts) | Module export surface for reporting domain. |
| [`services/finance/src/z-report.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/finance/src/z-report.ts) | Shift reconciliation, petty cash tracking, and variance audit logging. |
| [`services/menu/src/menu-catalog-repository.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/menu/src/menu-catalog-repository.ts) | Dynamic CSV ingestion engine and dish creation. |
| [`services/menu/src/stores/prisma-availability-repository.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/menu/src/stores/prisma-availability-repository.ts) | 86 item availability toggles with version incrementing. |
| [`services/integration-hub/src/stores/prisma-channel-item-status-repository.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/integration-hub/src/stores/prisma-channel-item-status-repository.ts) | Multi-channel mapping joins and optimistic version concurrency locks for Swiggy/Zomato. |
| [`services/orders/src/stores/prisma-order-repository.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/orders/src/stores/prisma-order-repository.ts) | Order status transitions and live KDS sync. |
| [`services/crm/src/customer-manager.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/crm/src/customer-manager.ts) | Multi-tenant customer profile and loyalty points creation. |
| [`services/auth/src/rbac.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/auth/src/rbac.ts) & [`services/auth/src/session-store.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/auth/src/session-store.ts) | Role-based access control and token verification. |
| [`services/auth/tsconfig.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/services/auth/tsconfig.json) | Auth service TypeScript configuration. |

---

### 🗄️ D. Shared Types & Database Seeds
| File Path | Description / Changes |
| :--- | :--- |
| [`packages/shared-types/reporting.ts`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/packages/shared-types/reporting.ts) | GST tax breakdown, settled invoices, and occupancy summary type definitions. |
| [`packages/shared-types/package.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/packages/shared-types/package.json) | Shared types package definition. |
| [`kapmeta/schema.prisma`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/kapmeta/schema.prisma) | Multi-tenant database schema definition. |
| [`db/seeds/seed_admin.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_admin.sql) | User accounts & outlet seeds. |
| [`db/seeds/seed_dining_tables.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_dining_tables.sql) | Tables & floor sections seeds. |
| [`db/seeds/seed_menu.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_menu.sql) | Menu categories, items, and taxes seeds. |
| [`db/seeds/seed_marketing_and_fixes.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_marketing_and_fixes.sql) | Marketing campaigns & discounts seeds. |
| [`db/seeds/seed_notifications.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_notifications.sql) | Notifications & alerts seeds. |
| [`db/seeds/seed_permissions.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_permissions.sql) | RBAC permissions & role mappings seeds. |
| [`db/seeds/seed_stations.sql`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/db/seeds/seed_stations.sql) | KDS stations seeds. |
| [`package-lock.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/package-lock.json) & [`tsconfig.json`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/tsconfig.json) | Root monorepo configuration. |

---

### 📖 E. Documentation, Checkpoints & Audit Reports
| File Path | Description |
| :--- | :--- |
| [`CHECKPOINT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/CHECKPOINT.md) | Master development checkpoint log. |
| [`docs/ADMIN-DOMAIN-STATUS-AND-ROADMAP.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/ADMIN-DOMAIN-STATUS-AND-ROADMAP.md) | Platform-wide architecture audit and task roadmap. |
| [`docs/admin-tasks/TASK-1-GST-TAX-BREAKDOWN-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-1-GST-TAX-BREAKDOWN-REPORT.md) | Task 1: GST Tax Breakdown Table Report. |
| [`docs/admin-tasks/TASK-2-TABLE-OCCUPANCY-RATE-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-2-TABLE-OCCUPANCY-RATE-REPORT.md) | Task 2: Live Table Occupancy Rate Calculation Report. |
| [`docs/admin-tasks/TASK-3-RECENT-SETTLED-INVOICES-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-3-RECENT-SETTLED-INVOICES-REPORT.md) | Task 3: Settled Invoices List & CSV Export Report. |
| [`docs/admin-tasks/TASK-4-BULK-CSV-MENU-IMPORTER-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-4-BULK-CSV-MENU-IMPORTER-REPORT.md) | Task 4: Bulk CSV Menu Importer Report. |
| [`docs/admin-tasks/TASK-5-CASH-DRAWER-RECONCILIATION-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-5-CASH-DRAWER-RECONCILIATION-REPORT.md) | Task 5: Cash Drawer & Petty Cash Reconciliation UI Report. |
| [`docs/admin-tasks/TASK-6-INVENTORY-SUPPLY-CHAIN-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-6-INVENTORY-SUPPLY-CHAIN-REPORT.md) | Task 6: Inventory & Recipe BOM Interactive Workflows Report. |
| [`docs/admin-tasks/TASK-7-ONLINE-ITEM-STATUS-AND-SIDEBAR-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-7-ONLINE-ITEM-STATUS-AND-SIDEBAR-REPORT.md) | Task 7: Online Item Status (Aggregator Sync) & Quick Links Report. |
| [`docs/admin-tasks/TASK-8-HEADER-STORE-AND-ALERTS-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/TASK-8-HEADER-STORE-AND-ALERTS-REPORT.md) | Task 8: Top Header Store Operations & Live Alerts Modals Report. |
| [`docs/admin-tasks/SYSTEM-WIDE-SYNCHRONIZATION-REPORT.md`](file:///c:/Users/Hamza/Downloads/PetPooja/PetPooja/docs/admin-tasks/SYSTEM-WIDE-SYNCHRONIZATION-REPORT.md) | 36-Endpoint System-Wide Synchronization Report. |

---

## 2. Unnecessary Files to Discard / Exclude from Commit

The ~280+ files that inflated your git status come from:
1. **`.agents/skills/` (280+ files):** Agent skill assets (downloaded font files, third-party benchmark CSVs, test python runners).
2. **`packages/shared-types/auth.js`:** An accidentally emitted JS file in a TypeScript package.
3. **`skills-lock.json`:** Agent skill lock file.

---

## 3. Recommended Action for Clean Commit

By updating `.gitignore` to ignore `.agents/skills/` and deleting `packages/shared-types/auth.js`, the git tree is instantly cleaned down to **exactly the ~45 essential production files** ready for a clean commit.
