# Gap Analysis — Source Document vs Production Requirements

**Source:** 27-page reference (document arch.docx)

## Coverage by Domain

| Domain | Source Coverage | Gap | Risk | Closure Path |
|--------|----------------|-----|------|--------------|
| Menu / Catalog | 80% | Low | Low | Confirm variants, modifiers, channel pricing |
| Order Management | 60% | Medium | Medium | State machine + cancellation/refund rules |
| KOT / Kitchen | 70% | Medium | Medium | Station routing, timing SLAs, reprint policy |
| Dashboard | 50% | High | Low | KPI formulas (DEC-009) |
| Online Integration | 30% | High | **High** | Partner API docs + certification (DEC-007) |
| Payments | 10% | Critical | **High** | Gateway selection, settlement (DEC-005) |
| Inventory | 0% | Critical | **High** | Full requirements workshop (DEC-003) |
| Finance | 5% | Critical | **High** | Tax rules, invoice format, ledger export (DEC-004) |
| CRM / Marketing | 0% (nav only) | Critical | Medium | Deferred to R3, requirements in R2 |

## Source-to-Plan Traceability

| Source Pages | Feature | Target Doc | Priority |
|--------------|---------|-----------|----------|
| 1-2 | Dashboard + Live Orders | `docs/02-requirements/reporting.md` | Critical |
| 2-3 | All Orders | `docs/02-requirements/orders.md` | Critical |
| 4 | Online Orders (Swiggy/Zomato) | `docs/07-integration/` | High |
| 5 | KOT Management | `docs/02-requirements/kitchen-kot.md` | Critical |
| 6 | Menu Management UI | `docs/02-requirements/menu-catalog.md` | Critical |
| 7-27 | Menu catalogue, 150+ items, 20+ categories | `db/seeds/` | Critical |
| Nav bar | CRM / Marketing modules | R3 backlog | Medium |

## Present in Source

Dashboard/operational screens · menu catalogue (150+ items) · order lifecycle views (Live/All/KOT) · online channel concepts · availability states (On/Off/Partial/Unscheduled).

## Absent from Source

Business rules and tax logic · technical architecture · database schema · API contracts · integration protocols · security controls · multi-outlet, offline and inventory requirements.

**Conclusion:** ~40% of production requirements must close in Phase 0 discovery.
