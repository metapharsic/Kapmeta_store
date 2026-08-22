# Master Phases of Implementation & Execution Blueprint

**ID:** GOV-PHASES · **Status:** APPROVED · **Owner:** Solution Architect & PMO · **Version:** 3.0 · **Updated:** 2026-08-09
**Traces to:** `restaurant_pos_project_DETAILED_REQUIREMENTS_AND_DECISIONS_v2.docx` (1,871-paragraph blueprint) · `docs/checkpoints/CHECKPOINTS.md`

---

## Executive Phase Progression

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE 0: DISCOVERY & GOVERNANCE                          │
│     20 Approved Decisions (DEC-001..020) · Signed BRD · Risk Log · CP-00 Gate          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 1: UX/UI & DESIGN SYSTEM                            │
│  Light SaaS Theme · 7 Screen Prototypes · 6 Mandatory States · 44px Touch Targets (CP-01)│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2 & 3: ARCHITECTURE & DATABASE FOUNDATION                      │
│   Modular Monolith · Order State Machine · Idempotency · PostgreSQL Schema (CP-02)     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 4, 5, 6: CORE POS, MENU & KITCHEN ORCHESTRATION               │
│   28 Categories · Multi-Channel POS · KDS Board · Hybrid LAN ESC/POS Printer (CP-03)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 7, 8, 9: INTEGRATIONS, INVENTORY (BOM) & FINANCE                 │
│  Swiggy/Zomato Adapter (CP-04) · BOM Stock Deduction (CP-05) · 5% GST & Reconciliation  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                  PHASE 10, 11, 12: CRM, REPORTING, SECURITY & RBAC                      │
│   Loyalty Engine (CP-06) · Tally/ERP Export · 8-Role RBAC · Manager Override Audits    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 13, 14, 15: DEVOPS, TESTING, HARDENING & SCALE                    │
│    AWS ECS/RDS · CI/CD Gates · E2E Test Suite · p95 < 500ms Performance SLA (CP-07)    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 16: PILOT, MIGRATION & WAVE ROLLOUT                        │
│     2-Week Outlet Pilot (CP-08) · Legacy Migration · Production Wave Rollout (CP-09)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Comprehensive 16-Phase Specification

---

### Phase 0 — Discovery, Governance & Product Definition
* **Objective:** Establish complete requirement traceability, eliminate architectural ambiguities, and baseline governance boundaries.
* **Scope & Key Deliverables:**
  - **20 Architectural Decision Records (`DEC-001` to `DEC-020`):** Signed decision packets in [`docs/decisions/DECISION-LOG.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/decisions/DECISION-LOG.md).
  - **Business Requirements Document (`BRD-01`):** End-to-end operational workflows in [`docs/01-discovery/BRD.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/01-discovery/BRD.md).
  - **Traceability Matrix:** Bidirectional mapping in `docs/mappings/MAP-SRC-source-to-feature.md`.
  - **Project Risk Register:** Quantitative tracking of operational, partner, and compliance risks.
* **Governance Gate:** `CP-00` (Phase 0 Discovery Exit).

---

### Phase 1 — UX/UI, Design System & Interaction Model
* **Objective:** Deliver an accessible, high-clarity Light SaaS design system tailored for fast touch POS operations and data-dense back-office analytics.
* **Scope & Key Deliverables:**
  - **Design System Tokens:** Defined in [`docs/ui-ux-artifacts/UX-DESIGN-TOKENS.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/ui-ux-artifacts/UX-DESIGN-TOKENS.md) (Soft cool canvas `#f8fafc`, pure white cards `#ffffff`, deep slate navy `#0f172a`, emerald green `#10b981`, and pastel status chips).
  - **7 Core Operational Screens:** Detailed in [`docs/ui-ux-artifacts/UX-SCREEN-INVENTORY.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/ui-ux-artifacts/UX-SCREEN-INVENTORY.md):
    1. *Terminal Lock & Cashier PIN Screen*
    2. *Main Cashier Register / 3-Column Touch Layout*
    3. *Modifiers Selector Modal (Mandatory vs. Optional groups)*
    4. *Split & Settlement Panel (Cash, Card, UPI, Split Bill)*
    5. *Kitchen Display System (KDS) Board*
    6. *Inventory & 86-List Control Console*
    7. *Executive Sales & Financial Analytics Dashboard*
  - **The 6 Mandatory UI States:** Empty, Loading, Success, Validation Error, Server Error, Permission Denied in [`docs/ui-ux-artifacts/UX-STATE-CATALOGUE.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/ui-ux-artifacts/UX-STATE-CATALOGUE.md).
  - **Touch Ergonomics:** Enforced minimum **`44px x 44px`** interactive targets verified in [`docs/ui-ux-artifacts/UX-USABILITY-REVIEW.md`](file:///c:/Users/Dell/Desktop/Kapmeta/docs/ui-ux-artifacts/UX-USABILITY-REVIEW.md).
* **Governance Gate:** `CP-01` (🟢 **PASSED & SIGNED**).

---

### Phase 2 — Domain Architecture & Backend Foundation
* **Objective:** Establish service boundaries, contracts, and canonical state lifecycles within a containerized Modular Monolith.
* **Scope & Key Deliverables:**
  - **Modular Service Structure:** Independent packages in `services/*` (`auth`, `menu`, `orders`, `kitchen`, `finance`, `inventory`, `integration-hub`, `reporting`).
  - **Canonical Order State Machine** (as implemented in `packages/shared-types/orders.ts` `ORDER_TRANSITIONS`, verified end-to-end 2026-08-09):
    $$\text{DRAFT} \to \text{PLACED} \to \text{CONFIRMED} \to \text{KOT\_CREATED} \to \text{IN\_PREPARATION} \to \text{READY} \to [\text{ASSIGNED} \to \text{OUT\_FOR\_DELIVERY} \to] \text{HANDED\_OVER} \to \text{COMPLETED}$$
    *(`CANCELLED` reachable from any non-terminal state; `FAILED` on payment/technical failure. `ASSIGNED`/`OUT_FOR_DELIVERY` apply to delivery orders only — dine-in/pickup go `READY` → `HANDED_OVER` directly.)*
  - **Idempotency Protection:** Enforced `Idempotency-Key` headers on all mutating POST/PUT/PATCH endpoints to prevent duplicate charges or double orders.
  - **Standard Error Model:** Unified error envelope with `code`, `message`, `correlation_id`, and `details`.
* **Governance Gate:** `CP-02`.

---

### Phase 3 — PostgreSQL Database Design & Schema Engineering
* **Objective:** Implement an ACID-compliant, multi-tenant relational schema with strict multi-outlet isolation.
* **Scope & Key Deliverables:**
  - **Prisma Schema (`kapmeta/schema.prisma`):** Relational models covering Organizations, Outlets, Terminals, Roles, Permissions, Users, Categories, Items, Modifiers, Orders, KOTs, Invoices, StockMovements, and AuditLogs.
  - **The 9 Non-Negotiable Database Rules:**
    1. Every operational table enforces `outlet_id NOT NULL` with foreign key indexes (DEC-001).
    2. Money stored as integer minor units (`BIGINT` paise/cents) — **never floating point**.
    3. Status transitions written append-only to history tables.
    4. Client-side generated UUIDv7 primary keys for offline readiness (DEC-002).
    5. UTC timestamps in storage (`TIMESTAMPTZ`), rendered in outlet timezone.
  - **Migration System:** Versioned migration scripts in `db/migrations/` automated via `scripts/db-migrate.js`.
* **Governance Gate:** `CP-02`.

---

### Phase 4 — Menu & Catalog Management
* **Objective:** Provide a centralized catalog management engine with multi-channel pricing and real-time availability synchronization.
* **Scope & Key Deliverables:**
  - **28 Category Taxonomy:** Preconfigured categories (*Soup Veg/Non-Veg, Starters, Curries, Biryani, Pizzas, Burgers, Cold Beverages, Mocktails, Desserts, Meals, etc.*).
  - **Modifier Engine:** Support for single-select required modifiers (Crusts, Spice Levels) and multi-select optional add-ons with dynamic price adjustments.
  - **Real-Time 86-Listing:** Instant one-touch deactivation of depleted menu items, broadcasting updates via WebSockets to all connected terminals within 500ms.
  - **Outbound Aggregator Catalog Sync:** Automated menu payload formatting for Swiggy and Zomato APIs.
* **Governance Gate:** `CP-03`.

---

### Phase 5 — Order Management & Multi-Channel POS
* **Objective:** Deliver a resilient cashier order-taking engine supporting multiple fulfillment channels.
* **Scope & Key Deliverables:**
  - **Dine-In Operations:** Table grid management, active running orders, split billing (1–5 persons or custom amounts), and table transfers.
  - **Takeaway / Counter:** Rapid item selection, fast-checkout flow, and sequential customer token printing.
  - **Direct Delivery:** Customer contact and delivery address capture with rider dispatch tracking.
  - **Order Cancellation & Void Engine:** Reason-code enforcement, post-KOT manager elevation prompts, and audit log generation.
* **Governance Gate:** `CP-03`.

---

### Phase 6 — Kitchen / KOT Management & Kitchen Display System (KDS)
* **Objective:** Route order items to designated preparation stations and track cooking SLAs in real time.
* **Scope & Key Deliverables:**
  - **Kitchen Station Routing:** Automatic routing of line items to configured stations (*Grill, Fryer, Pantry, Mocktail Bar, Bakery*).
  - **Interactive KDS Interface (`apps/pos-web/pages/kitchen.tsx`):** Real-time ticket queue with color-coded SLA timers:
    - 🟢 *Normal:* 0–10 minutes
    - 🟡 *Warning:* 10–15 minutes
    - 🔴 *Critical SLA Breach:* $>15$ minutes (pulsing alert border)
  - **Hybrid LAN ESC/POS Print Agent (DEC-006):** Local network agent communicating directly with thermal printers over IP/USB for offline kitchen ticket and customer bill printing.
* **Governance Gate:** `CP-03`.

---

### Phase 7 — Online Aggregator & Integration Hub (Swiggy & Zomato)
* **Objective:** Seamlessly ingest and fulfill external orders from food delivery aggregators.
* **Scope & Key Deliverables:**
  - **Channel-Neutral Adapter Architecture (`services/integration-hub`):** Unified internal canonical order format with adapters for Swiggy, Zomato, and future channels (ONDC, Instamart) per DEC-007.
  - **Secure Inbound Webhooks:** HMAC-SHA256 signature verification, IP allowlisting, and duplicate order suppression.
  - **Dead-Letter Queue (DLQ) & Retry Engine:** Exponential backoff retries with dead-letter queue alerting for failed webhooks.
  - **Live Online Order Monitor:** Operational dashboard displaying incoming aggregator orders and rider arrival statuses.
* **Governance Gate:** `CP-04`.

---

### Phase 8 — Inventory, Recipe/BOM, Purchase & Stores (Release 2)
* **Objective:** Enable raw ingredient stock control, automated consumption, and vendor procurement workflows.
* **Scope & Key Deliverables:**
  - **Ingredient Master & Conversion Rules:** Multi-unit tracking (kg, g, l, ml, pcs) with minimum reorder thresholds.
  - **Recipe & Bill of Materials (BOM) Automation (DEC-003):** Automated deduction of raw ingredients from stock as orders are marked settled, with wastage logs for kitchen prep loss.
  - **Purchase Order (PO) Engine (DEC-015–019):** 3-tier value approval thresholds, automated vendor PO dispatch via email/PDF, and retrospective PO handling (DEC-017).
  - **Goods Received Notes (GRN) & 3-Way Matching (DEC-018):** Automated matching of PO, physical GRN quantity, and vendor invoice with variance tolerance bands (DEC-016).
* **Governance Gate:** `CP-05`.

---

### Phase 9 — Billing, Payments, Tax & Finance
* **Objective:** Secure payment collection, statutory GST compliance, and daily cash drawer reconciliation.
* **Scope & Key Deliverables:**
  - **Multi-Mode Settlement Engine:** Cash payment with quick currency denominations (₹100, ₹200, ₹500, ₹2000) and change calculator, EDC Card terminals, and dynamic UPI QR code generation.
  - **Statutory Tax Engine (DEC-004):** Inclusive 5% GST calculation (2.5% CGST + 2.5% SGST) applied per line item.
  - **Razorpay Payment Gateway Integration (DEC-005):** Webhook-driven payment capture and settlement verification.
  - **Daily Z-Report & Cash Drawer Tally:** End-of-shift cash drawer balance reconciliation, recording overage/shortage with manager sign-off.
* **Governance Gate:** `CP-03` / `CP-05`.

---

### Phase 10 — CRM, Marketing Automation & Promotions (Release 3)
* **Objective:** Drive customer retention through loyalty rewards, targeted promotions, and compliant data governance.
* **Scope & Key Deliverables:**
  - **Customer Profiles:** Unified customer profiles tracking total visits, favorite items, and lifetime gross spend.
  - **Loyalty Program Engine (DEC-014):** Spend-based points accumulation, tier levels (Silver, Gold, Platinum), and point redemption rules.
  - **Discount Engine (DEC-008):** Pre-tax flat and percentage promotional discounts, coupon codes, and cashier discount threshold limits ($<15\%$).
  - **DPDP Act Compliance & Data Erasure (DEC-020):** Anonymization of customer PII upon right-to-erasure requests while retaining statutory tax invoice records.
* **Governance Gate:** `CP-06`.

---

### Phase 11 — Dashboard, Reporting & Analytics
* **Objective:** Deliver operational intelligence, executive financial KPIs, and accounting ledger export.
* **Scope & Key Deliverables:**
  - **Executive Analytics Dashboard (`apps/pos-web/pages/admin.tsx`):** 4-Up KPI tiles (*Gross Revenue, Table Occupancy Rate, Settled Invoices, Average Order Value*), trend lines, and payment channel breakdown graphs.
  - **Operational & Shift Reports:** Hourly sales velocity, category sales breakdown, staff productivity, and KOT prep time averages.
  - **Accounting System Export (DEC-013):** Automated Chart of Accounts (CoA) journal exports compatible with Tally, QuickBooks, and enterprise ERPs.
* **Governance Gate:** `CP-06`.

---

### Phase 12 — Security, Audit & Compliance
* **Objective:** Implement enterprise-grade user management, fine-grained access control, and tamper-proof audit trails.
* **Scope & Key Deliverables:**
  - **8-Role RBAC Model (`docs/08-security/user-management-rbac.md`):** Server-enforced permissions for Super Admin, Outlet Manager, POS Cashier, Kitchen Chef, Menu Admin, Inventory Manager, Finance Accountant, and Auditor.
  - **Cashier PIN Shift Unlock & Manager Override:** Fast 4-digit PIN authentication on POS terminals with inline manager authorization prompts for high-risk mutations.
  - **Transactional Audit Logging:** Every privileged mutation writes an immutable audit record in the same database transaction.
  - **Security Baseline (DEC-011):** Zero plain-text secrets in git, TLS 1.2+ transit encryption, and minimal PCI-DSS footprint (zero cardholder PAN storage).
* **Governance Gate:** `CP-07`.

---

### Phase 13 — DevOps, Infrastructure & Observability
* **Objective:** Build scalable cloud infrastructure, automated deployment pipelines, and full system observability.
* **Scope & Key Deliverables:**
  - **AWS Containerized Infrastructure (DEC-012):** ECS/Fargate container deployment with managed AWS RDS PostgreSQL 16.
  - **CI/CD Automation:** Automated GitHub Actions pipeline enforcing linting, TypeScript type-checks, security secret scanning (Gitleaks), and test execution.
  - **Structured JSON Logging & Tracing:** Centralized daily logs in `logs/app/`, `logs/database/`, `logs/audit/` carrying correlation IDs (`X-Correlation-Id`).
  - **Automated Backup & Disaster Recovery (`scripts/db-backup.ps1`):** Daily PostgreSQL backups with automated snapshot verification against RPO (15m) and RTO (1h) targets.
* **Governance Gate:** `CP-07`.

---

### Phase 14 — Comprehensive Testing Strategy
* **Objective:** Ensure zero critical defects through multi-layered automated and manual test suites.
* **Scope & Key Deliverables:**
  - **Unit Testing:** Comprehensive test coverage for pricing, GST tax rounding, and discount engines.
  - **Contract & API Testing:** Validation of all REST endpoints against OpenAPI specifications.
  - **Security Negative Testing:** Automated tests verifying that wrong roles or mismatched `outlet_id` requests are strictly rejected.
  - **E2E Order Lifecycle Testing:** Automated end-to-end test suites covering Dine-In, Takeaway, Delivery, and Aggregator flows.
* **Governance Gate:** `CP-03` / `CP-07`.

---

### Phase 15 — Performance & Scalability Engineering
* **Objective:** Validate system throughput, concurrency, and sub-second response times under peak dining load.
* **Scope & Key Deliverables:**
  - **API Latency Target:** $p95 < 500\text{ms}$, $p99 < 1000\text{ms}$ under load of 60 orders/min per outlet.
  - **High Concurrency Benchmarks:** Stress-tested with 20 active POS terminals and 100+ active table carts simultaneously.
  - **Sub-2s KOT Routing:** Verifying that kitchen ticket events reach KDS monitors within 2 seconds of cashier confirmation.
* **Governance Gate:** `CP-07`.

---

### Phase 16 — Pilot, Data Migration & Wave Rollout
* **Objective:** Execute a controlled live trial, migrate legacy data, and scale across all restaurant branches.
* **Scope & Key Deliverables:**
  - **2-Week Pilot Deployment:** Live production execution at the initial pilot outlet with daily parallel reconciliation against legacy cash registers.
  - **Data Migration:** Tooling to import historical menu catalogs, tax slabs, and vendor lists.
  - **Staff Training & Runbooks:** Operational training and incident response documentation in `docs/12-operations/runbook.md`.
  - **Multi-Outlet Wave Rollout:** Staged rollout across remaining branches with zero downtime and automated rollback procedures.
* **Governance Gate:** `CP-08` (Pilot Success) & `CP-09` (Production Go-Live).
