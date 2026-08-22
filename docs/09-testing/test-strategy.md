# Test Strategy

**Status:** DRAFT · **Owner:** QA Lead

## Coverage Matrix

| Level | Coverage | Target | Owner |
|-------|----------|--------|-------|
| Unit | Pricing, tax, validation, state transitions | 80%+ | Developers |
| Component | Forms, tables, filters, POS controls | 70%+ | Frontend |
| API | CRUD, authorization, pagination, idempotency | 90%+ | Backend |
| Integration | Payment, aggregator, printer, inventory flows | 100% critical paths | QA + Integration |
| End-to-end | Order-to-payment workflows | Key scenarios | QA |
| Regression | All existing functionality | Automated suite | QA |
| Performance | Load, stress, spike, endurance | Baseline targets | Performance |
| Security | Auth, injection, RBAC, secrets, API abuse | OWASP Top 10 | Security |
| UAT | Real restaurant workflows | Business scenarios | Business users |

## Critical E2E Scenarios

- Dine-in: order → KOT → serve → payment → completion
- Pickup: order → KOT → ready → handover
- Delivery: order → KOT → dispatch → delivered → settlement
- Online: Swiggy order → inbound → mapping → KOT → fulfillment → callback
- Menu OFF: new orders blocked, existing orders remain valid
- Menu ON: item orderable after channel sync confirms
- Duplicate webhook: exactly one internal order created
- Payment callback retry: exactly one payment transaction
- Cancellation after KOT: permission + reason + audit validated
- Refund: payment, order, and report reconciliation all correct
- Stock shortage: configured behavior (block / alert / substitute)

## Performance Targets

| Scenario | Target |
|----------|--------|
| POS order placement | p95 < 500 ms |
| Menu load (150+ items) | p95 < 800 ms cold, < 200 ms cached |
| Dashboard KPI query | p95 < 1.5 s |
| KOT board refresh | < 2 s end-to-end |
| Sustained load | 60 orders/min/outlet, 20 concurrent terminals |

## Test Data

Seeded from `db/seeds/` — real 150-item catalogue, synthetic customers and orders. No production PII in lower environments, ever.

## Entry / Exit

**Entry to QA:** unit tests green, migrations applied, API contract published.
**Exit to UAT:** zero open critical/high defects, regression suite green, performance baseline met.
