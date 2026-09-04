# Workflows

**ID:** WF-INDEX · **Status:** ACTIVE · **Owner:** Business Analyst · **Version:** 2.0 · **Updated:** 2026-09-04

Every process the system runs, documented once, referenced everywhere.

---

## Workflow Catalogue

| ID | Workflow | File | Type | Blocked by |
|----|----------|------|------|-----------|
| `WF-ORD-01` | Order to payment (dine-in) | [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md) | Business | DEC-002, DEC-004 |
| `WF-ORD-02` | Pickup fulfillment | [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md) | Business | — |
| `WF-ORD-03` | Delivery fulfillment | [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md) | Business | — |
| `WF-ORD-04` | Cancellation & refund | [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md) | Business | DEC-004 |
| `WF-KOT-01` | KOT generation & routing | [WF-KOT-kitchen.md](WF-KOT-kitchen.md) | Business | DEC-006 |
| `WF-MNU-01` | Menu availability change & channel sync | [WF-MNU-menu-sync.md](WF-MNU-menu-sync.md) | Technical | DEC-007 |
| `WF-INT-01` | Inbound aggregator order | [WF-INT-integration.md](WF-INT-integration.md) | Technical | DEC-007 |
| `WF-INT-02` | Outbound menu push | [WF-MNU-menu-sync.md](WF-MNU-menu-sync.md) | Technical | DEC-007 |
| `WF-INT-03` | Failure, retry, DLQ, replay | [WF-INT-integration.md](WF-INT-integration.md) | Technical | — |
| `WF-PAY-01` | Payment capture | [`../02-requirements/billing-payments.md`](../02-requirements/billing-payments.md) | Business | DEC-005 |
| `WF-PAY-02` | Refund | [`../02-requirements/billing-payments.md`](../02-requirements/billing-payments.md) | Business | DEC-004 |
| `WF-FIN-01` | Day-end close / Z-report | [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) | Business | DEC-004 |
| `WF-FIN-02` | Settlement reconciliation | [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) | Business | DEC-005 |
| `WF-INV-01` | Stock consumption | [`../02-requirements/inventory-recipe.md`](../02-requirements/inventory-recipe.md) | Business | DEC-003 |
| `WF-INV-02` | Cycle count reconciliation | [`../02-requirements/inventory-recipe.md`](../02-requirements/inventory-recipe.md) | Business | DEC-003 |
| `WF-PUR-01` | Requisition → PO → GRN → 3-way match | [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) | Business | DEC-003 |
| `WF-AUTH-01` | Login, shift, PIN switch, elevation | [`../02-requirements/auth-access.md`](../02-requirements/auth-access.md) | Technical | DEC-011 |
| `WF-RPT-01` | Summary aggregation refresh | [`../02-requirements/reporting.md`](../02-requirements/reporting.md) | Technical | DEC-009 |
| `WF-DEV-01` | Story to merge | [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) | Process | — |
| `WF-OPS-01` | Incident response | [`../12-operations/runbook.md`](../12-operations/runbook.md) | Process | — |
| `WF-REL-01` | Release & rollback | [`../11-rollout/rollout-plan.md`](../11-rollout/rollout-plan.md) | Process | — |

---

## As-Built Traces (added 2026-09-04)

The `WF-*` documents above are **specifications** — written up-front, stating intent,
failure paths and transaction boundaries. The documents below are **as-built traces**:
the same processes followed through the code that actually shipped, with `file:line`
and commit citations. They were merged in from a short-lived `docs/workflow/` (singular)
folder, which no longer exists.

| Spec | As-built trace | Covers |
|---|---|---|
| [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md), [WF-KOT-kitchen.md](WF-KOT-kitchen.md) | [WF-ORD-dine-in-as-built.md](WF-ORD-dine-in-as-built.md) | Floor plan → `PosBillingView` → `POST /orders` → KOT creation → KDS state machine → settle |
| [WF-ORD-order-lifecycle.md](WF-ORD-order-lifecycle.md) | [WF-ORD-delivery-pickup-as-built.md](WF-ORD-delivery-pickup-as-built.md) | POS mode tabs vs the public tableless customer entry (CP-25) |
| [WF-INT-integration.md](WF-INT-integration.md) | [WF-INT-aggregator-as-built.md](WF-INT-aggregator-as-built.md) | Channel accounts, webhook ingestion, the CP-20 feed fix |
| [WF-MNU-menu-sync.md](WF-MNU-menu-sync.md) | [WF-MNU-menu-management-as-built.md](WF-MNU-menu-management-as-built.md) | Admin menu edit → `item_availability` → waiter/public propagation, the CP-24 desync fix |

**Read the spec for intent; read the as-built trace for what the code does today.**
Where the two disagree, that gap is real drift and is called out inside the as-built
document — treat it as a finding, not a typo.

---

## Documentation Standard

Every workflow states:

1. **Trigger** — what starts it
2. **Actors** — who/what participates, with the permission required
3. **Flow** — fenced ASCII diagram, numbered steps
4. **Transaction boundaries** — what commits atomically vs what is event-driven
5. **Failure paths** — every step that can fail, and what happens
6. **Audit points** — what gets recorded and when
7. **Open decisions** — what is provisional

A workflow without failure paths is a happy-path sketch, not a specification. The failure paths are where POS systems actually break.
