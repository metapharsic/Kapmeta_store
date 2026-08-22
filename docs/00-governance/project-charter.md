# Project Charter

**Status:** APPROVED · **Version:** 2.0 · **Owner:** Product Owner · **Approved by:** Abdul Mannan (Admin) · **Date:** 2026-08-09
**Detailed Roadmap:** [`docs/00-governance/phases-of-implementation.md`](phases-of-implementation.md)

---

## 1. Executive Objective

Deliver a scalable, enterprise-grade multi-outlet restaurant POS and operations platform covering menu/catalog, multi-channel order lifecycles, kitchen orchestration (KOT/KDS), multi-mode billing and payments, food delivery aggregator integrations (Swiggy/Zomato), inventory with automated recipe consumption (BOM), finance and tax compliance (5% GST), CRM with loyalty programs, and executive analytics.

---

## 2. Release Sequencing

| Release | Primary Scope & Modules | Target Phase Milestones |
|---|---|---|
| **Release 1 (R1 — Core POS & Ops)** | Auth & 8-Role RBAC, Menu Catalog (28 categories), Multi-Channel Order Taking (Dine-in, Takeaway, Delivery), KOT & KDS Board, Cash/Card/UPI Payments, 5% GST (DEC-004), Executive Dashboard. | Phases 0, 1, 2, 3, 4, 5, 6, 9, 11, 12, 13, 14, 15 |
| **Release 1.1 (R1.1 — Online Channels)** | Integration Hub, Swiggy & Zomato inbound webhook ingestion, HMAC verification, DLQ retries, Online Orders Monitor. | Phase 7 |
| **Release 2 (R2 — Inventory & Supply Chain)** | Raw Material Master, Recipe/BOM automated stock consumption (DEC-003), 3-Tier Purchase Orders (DEC-015), Goods Received Notes (GRN), 3-Way matching, Wastage logs, Tally/ERP accounting export (DEC-013). | Phases 8 & 9 (Advanced) |
| **Release 3 (R3 — CRM & Loyalty)** | Customer loyalty engine (points accumulation, tiering per DEC-014), pre-tax promotional discounts (DEC-008), marketing campaigns, DPDP customer data erasure (DEC-020). | Phase 10 |

---

## 3. Measurable Success Criteria

1. **Order Latency:** POS API response time $p95 < 500\text{ms}$, $p99 < 1000\text{ms}$ under peak load (60 orders/min per outlet).
2. **KOT Delivery SLA:** Kitchen ticket events delivered to KDS monitors within $<2\text{s}$ of cashier confirmation.
3. **Checkout Throughput:** Complete cart settlement and tax invoice generation in under 2 seconds.
4. **Security Hardening:** Zero High/Critical VAPT findings, 100% server-enforced RBAC, and immutable audit logs on all privileged mutations.
5. **Pilot Operational Stability:** 2-week live trial at pilot outlet with zero unexplained variance against daily cash/bank reconciliations and defect rate $< 0.1\%$.

---

## 4. Organizational Roles & Resource Allocation

| Role | Headcount | Core Responsibilities |
|------|:---:|----------------|
| **Product Owner** | 1 | Scope governance, feature prioritization, business acceptance. |
| **Business Analyst** | 1-2 | Requirement specifications, business workflows, traceability registers. |
| **Solution Architect** | 1 | System topology, domain boundaries, security architecture, technical decisions. |
| **UX/UI Lead** | 1 | Design tokens, wireframes, prototypes, touch accessibility standards. |
| **Frontend Engineers** | 3-4 | Next.js POS client, KDS interface, Stock console, Admin analytics. |
| **Backend Engineers** | 4-5 | Microservices, API gateways, database repositories, aggregator adapters. |
| **DBA / Data Engineer** | 1 | PostgreSQL schema optimization, indexing, migration automation, analytics queries. |
| **QA / Test Engineers** | 2-3 | Unit, contract, security negative tests, and automated E2E order suites. |
| **DevOps / SRE** | 1-2 | AWS ECS/RDS infrastructure, CI/CD pipelines, observability, backup drills. |
| **Security Engineer** | 1 (Shared) | RBAC validation, VAPT testing, secret scanning, compliance audits. |
| **Operations & Support** | 2+ | Pilot deployment, cashier/chef training, operational runbooks. |

---

## 5. Governance & Delivery Cadence

* **Sprint Length:** 2-week agile sprints with bi-weekly stakeholder reviews.
* **Phase Gate Protocol:** Formal checkpoint review (`CP-00` to `CP-09` in [`docs/checkpoints/CHECKPOINTS.md`](../checkpoints/CHECKPOINTS.md)) required prior to progressing past phase boundaries.
