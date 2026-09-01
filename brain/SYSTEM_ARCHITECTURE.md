# KapMeta POS Platform — Full System Architecture & Topology

**For:** Gemini, Claude & Multi-Agent Autonomous Engines  

---

## 1. System Topology & Fixed Port Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT / FRONTEND LAYER                                 │
│  apps/pos-web (Next.js 14 · Port 4444)      apps/admin-web (Admin Portal · Port 4445)   │
│  - POS Register UI (3-column layout)         - Category & Menu Item Dynamic Ingestion  │
│  - KDS Kitchen Screen (Real-time WS)         - RBAC User & Role Management             │
│  - Table Management & Order History          - Multi-Outlet Switching                  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP REST / WebSocket (port 4001)
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                             API GATEWAY (apps/api · Port 4001)                         │
│  - JWT Bearer Authentication & Claims Extraction (sub, outletId, roles, permissions)   │
│  - Distributed Trace Injection (X-Correlation-Id)                                      │
│  - Modular Express Routers (/auth, /menu, /orders, /kitchen, /inventory, /finance...)  │
│  - WebSocket Server (/kitchen for KDS updates, / for 86-list broadcasts)              │
│  - Background Engine Starters (LoyaltyEngine, LedgerEngine)                            │
└───────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────┘
        │              │              │              │              │              │
┌───────▼──────┐┌──────▼──────┐┌──────▼──────┐┌──────▼──────┐┌──────▼──────┐┌──────▼──────┐
│ services/auth││services/menu││  services/  ││  services/  ││  services/  ││  services/  │
│ RBAC, Token  ││  Categories,││   orders    ││   kitchen   ││  inventory  ││   finance   │
│ Refresh, PIN ││  Items, 86  ││State Machine││KOT, Stations││BOM deduction││GST, Invoices│
└───────┬──────┘└──────┬──────┘└──────┬──────┘└──────┬──────┘└──────┬──────┘└──────┬──────┘
        │              │              │              │              │              │
        └──────────────┴──────────────┼──────────────┴──────────────┴──────────────┘
                                      │
        ┌─────────────────────────────▼─────────────────────────────┐
        │       ASYNCHRONOUS DOMAIN EVENT BUS (apps/api/src/events) │
        │       - `order.confirmed` -> Kitchen KOT routing & KDS push│
        │       - `order.completed` -> Inventory BOM stock deduction │
        │       - `item.86_toggled` -> WebSocket broadcast to POS UI│
        └─────────────────────────────┬─────────────────────────────┘
                                      │
        ┌─────────────────────────────▼─────────────────────────────┐
        │         PERSISTENCE & INFRASTRUCTURE LAYER                │
        │  PostgreSQL 16 (Port 5432 · db 'kapmeta' · Prisma ORM)   │
        │  Redis 7.0 (Port 6379 · Cache & Session Store)            │
        │  Logs Engine (logs/api, logs/pos-web, logs/app, logs/err) │
        └───────────────────────────────────────────────────────────┘
```

---

## 2. Microservice Domain Boundaries

| Service Package | Primary Responsibilities | Direct DB Tables Owned |
|---|---|---|
| `@kapmeta/auth` | User auth, password hashing, session tokens, RBAC roles/permissions | `User`, `Role`, `Permission`, `UserRole`, `Session` |
| `@kapmeta/menu` | Menu catalog, 28 categories, variant modifiers, 86-list deactivation | `Category`, `MenuItem`, `ModifierGroup`, `ModifierOption`, `OutletMenuOverride` |
| `@kapmeta/orders` | Order state machine, cart pricing, split seating, table occupancy | `Order`, `OrderItem`, `OrderItemModifier`, `Table`, `FloorSection` |
| `@kapmeta/kitchen` | KOT generation, station routing (Grill/Fryer/Bar/Pantry), ESC/POS print | `KotTicket`, `KotItem`, `KitchenStation`, `PrinterConfig` |
| `@kapmeta/inventory`| Raw ingredients, recipes (BOM), automated stock consumption, purchase | `Ingredient`, `Recipe`, `RecipeLine`, `StockLedger`, `PurchaseOrder`, `GRN` |
| `@kapmeta/finance` | 5% GST tax engine, split settlements (Cash/Card/UPI), double-entry ledger | `Invoice`, `Payment`, `LedgerAccount`, `LedgerJournal`, `LedgerEntry`, `Shift` |
| `@kapmeta/crm` | Customer loyalty point earning/redemption, DPDP erasure | `Customer`, `LoyaltyAccount`, `LoyaltyTransaction` |
| `@kapmeta/reporting`| 4-Up executive KPI cards, hourly sales velocity, ERP/Tally exports | Read-only aggregates over `Invoice`, `Payment`, `OrderItem` |
| `@kapmeta/integration-hub` | Inbound Swiggy/Zomato webhooks, HMAC signature verification, DLQ retries | `ChannelPartner`, `IntegrationLog`, `WebhookDeadLetter` |
