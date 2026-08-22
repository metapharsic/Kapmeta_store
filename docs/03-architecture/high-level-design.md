# High-Level Design (HLD)

**Status:** REVIEW · **Owner:** Solution Architect · **Updated:** 2026-08-09
**Traces to:** `restaurant_pos_project_DETAILED_REQUIREMENTS_AND_DECISIONS_v2.docx` · `docs/00-governance/phases-of-implementation.md`

---

## 1. Architecture Style & Topology

The platform is designed as a **Modular Monolith deployed via containerized micro-services** (DEC-012). Domain modules maintain strict boundaries (own schema tables, no cross-module direct table reads — all cross-domain operations go via the module's public API / service layer).

```
┌─────────────────────────────────────────────────────────────┐
│                 WEB CLIENT & POS TERMINALS                   │
│      (Next.js / TypeScript, Responsive PWA, Touch-First)     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / REST / WebSockets
┌────────────────────────▼────────────────────────────────────┐
│                    API Gateway & BFF Layer                  │
│       (AuthN/JWT, Rate Limiting, RBAC Enforcer, Tracing)    │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────┘
    │          │          │          │          │
┌───▼───┐  ┌──▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼────┐
│ Auth  │  │Orders│  │ Menu  │  │Invent.│  │Reports │
│ RBAC  │  │ KOT  │  │Pricing│  │Recipe │  │Finance │
└───┬───┘  └──┬───┘  └───┬───┘  └───┬───┘  └───┬────┘
    └─────────┴──────────┴──────────┴──────────┘
                         │
        ┌────────────────▼────────────────┐
        │   PostgreSQL 16 (ACID Master)   │
        │   + Redis 7 (Sessions & Cache)  │
        │   + S3 (Documents & Receipts)   │
        │   + RabbitMQ (Events & DLQ)     │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │      Integration Adapters       │
        │  Swiggy/Zomato · Razorpay / UPI │
        │  LAN Print Agent · Tally Export │
        └─────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Implementation Detail |
|-------|-----------|------------------------|
| **Frontend UI** | Next.js 14 / React 18 (TypeScript) | Touch register, KDS board, Stock control, and Analytics console. Styled under the unified Light SaaS theme. |
| **Backend API** | Node.js / Express / TypeScript | Modular service packages in `services/*` and `apps/api`. |
| **Database** | PostgreSQL 16 + Prisma ORM | Relational schema with strict `outlet_id` scoping and UUIDv7 primary keys. |
| **Session & Cache**| Redis | Token blacklist, fast menu cache, and online session stores. |
| **Message Queue** | RabbitMQ / In-Memory EventEmitter | Async event processing, aggregator webhooks, and retry DLQ. |
| **Document Store**| AWS S3 / MinIO | Invoices, Z-reports, and statutory audit exports. |
| **Hardware Link** | Hybrid LAN Print Agent | ESC/POS thermal printing for kitchen KOTs and billing receipts (DEC-006). |

---

## 3. Module Boundaries & Event Registry

| Module | Owns Domain State | Events Published |
|--------|------------------|------------------|
| **`auth`** | Users, Roles, Permissions, Sessions | `user.role_changed`, `session.revoked` |
| **`menu`** | Categories, Menu Items, Modifiers, Tax Slabs | `menu.item_availability_changed` (86-list) |
| **`orders`** | Orders, Cart Line Items, State History | `order.created`, `order.status_changed`, `order.cancelled` |
| **`kitchen`** | KOT Tickets, Prep Stations, SLA Timers | `kot.created`, `kot.preparing`, `kot.ready` |
| **`finance`** | Invoices, Payments, Refunds, Settlements | `payment.captured`, `invoice.settled`, `refund.issued` |
| **`inventory`** | Ingredients, Stock Counts, POs, Recipes | `stock.movement_recorded`, `stock.low_alert` |
| **`integration-hub`** | Aggregator Channels, Webhook Logs, DLQ | `channel.order_received`, `channel.sync_failed` |
| **`reporting`** | KPI Aggregates, Z-Reports, Audit Summaries | Read-only consumer of transactional data |

---

## 4. Cross-Cutting Non-Negotiables (ENGINEERING-PROTOCOL §1)

1. **Money Representation:** Always stored as integer minor units (`BIGINT` paise/cents) with currency code (e.g. `18000` = ₹180.00). **Never floating point arithmetic.**
2. **Multi-Outlet Isolation (DEC-001):** Every operational query and table enforces `outlet_id NOT NULL`. The outlet context is resolved from the server JWT session, never from client request parameters.
3. **Canonical Order State Machine (Phase 2):**
   ```
   CREATED ──► CONFIRMED ──► IN_KITCHEN ──► READY ──► DELIVERED ──► SETTLED
      │            │             │
      ▼            ▼             ▼
   CANCELLED   CANCELLED     VOIDED (Post-KOT Manager Elevation Required)
   ```
4. **Idempotency:** Every mutating endpoint (`POST /orders`, `POST /payments/capture`, `/webhooks/*`) accepts `Idempotency-Key` headers to prevent duplicate captures or double charges.
5. **Transactional Audit Logging:** Privileged actions write an immutable audit log row in the same database transaction.
6. **Timezone Rule:** All timestamps stored in UTC (`TIMESTAMPTZ`) and formatted in the outlet's configured timezone. Business day boundary begins at configured `day_start_time` (not midnight).

---

## 5. Non-Functional Performance Baselines (NFRs)

* **API Response Time:** $p95 < 500\text{ms}$, $p99 < 1000\text{ms}$ under peak load (Phase 15).
* **Checkout Throughput:** Sub-2 second cart settlement and invoice generation.
* **KOT Latency:** $< 2\text{s}$ transit from register confirmation to kitchen display screen.
* **Concurrent Capacity:** Minimum 20 active POS terminals and 100 concurrent dining tables per outlet.
* **Availability & Recovery:** 99.9% uptime monthly; RPO $\le 15\text{min}$, RTO $\le 1\text{h}$ with automated backup scripts (`scripts/db-backup.ps1`).
