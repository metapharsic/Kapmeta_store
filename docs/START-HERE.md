# START HERE

**Read this file first. Read it fully before writing any code.**

This is the entry point for the Restaurant POS & Operations Platform. It tells you what the system is, what is decided, what is *not* decided, and the protocol you must follow before implementing anything.

---

## 1. What This Project Is

A multi-outlet restaurant POS and operations platform:

| Domain | What it does |
|--------|-------------|
| Menu & Catalog | 20+ categories, 150+ items, variants, modifiers, per-channel availability |
| Orders | Dine-in / pickup / delivery lifecycle, state machine, cancellation, refund |
| Kitchen (KOT) | Station routing, ticket lifecycle, prep tracking, reprint |
| Billing & Payments | Invoices, capture, refund, settlement reconciliation |
| Online Channels | Swiggy / Zomato inbound orders, outbound menu sync |
| Inventory | Ingredients, stock movements, recipe/BOM, wastage |
| Finance | Tax, invoice register, ledger export |
| CRM & Marketing | Customers, loyalty, campaigns |
| Reporting | Operational, sales, payment, inventory, finance, executive layers |

Source of truth for requirements: the 27-page reference document plus this `docs/` tree. Nothing else.

---

## 2. ⚠️ The One Thing You Must Understand

**~40% of production requirements are undefined.** The source document gives UI screens and a menu catalogue. It does not give business rules, tax logic, schema, API contracts, integration protocols, or security controls.

Twenty decisions (`DEC-001` … `DEC-020`) gate development. Live status: [`decisions/DECISION-LOG.md`](decisions/DECISION-LOG.md) — **check this before starting any work.**

**Protocol:** before implementing anything, check whether your module is blocked by an open DEC. If it is — do not guess, do not "pick something sensible and refactor later". A wrong guess on tax, multi-outlet, or offline costs weeks. Raise it, get it decided, record an ADR.

| Module | Blocked by |
|--------|-----------|
| Everything | DEC-001 (multi-outlet), DEC-011 (security scope) |
| POS client | DEC-002 (offline) |
| Inventory | DEC-003 (recipe/BOM automation) |
| Billing / Finance | DEC-004 (tax), DEC-005 (payment gateway) |
| Kitchen printing | DEC-006 (printer hardware) |
| Integration hub | DEC-007 (which aggregators) |
| Pricing engine | DEC-008 (discount rules) |
| Dashboard / reports | DEC-009 (KPI formulas) |
| Data retention | DEC-010 |
| Infrastructure | DEC-012 (deployment target) |

---

## 3. Reading Order

Follow this sequence. Do not skip ahead — later docs assume the earlier ones.

### Everyone (day 1, ~90 min)

1. **This file**
2. [`00-governance/project-charter.md`](00-governance/project-charter.md) — objective, scope, team, success criteria
3. [`01-discovery/decision-register.md`](01-discovery/decision-register.md) — what is still open
4. [`01-discovery/gap-analysis.md`](01-discovery/gap-analysis.md) — where the source document runs out
5. [`03-architecture/high-level-design.md`](03-architecture/high-level-design.md) — system shape, stack, module boundaries, NFRs
6. [`GLOSSARY.md`](GLOSSARY.md) — domain vocabulary. Misusing "KOT" or "channel" in a PR causes real confusion.
7. [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md) — **the rules you must follow to ship code here**

### Backend engineers (day 1-2)

8. [`05-database/schema-reference.md`](05-database/schema-reference.md) — schema groups + the 9 non-negotiable design rules
9. [`06-api/api-standards.md`](06-api/api-standards.md) — errors, pagination, idempotency, headers
10. [`02-requirements/orders.md`](02-requirements/orders.md) — the order state machine, the heart of the system
11. Your module's requirement doc in `02-requirements/`
12. [`08-security/security-framework.md`](08-security/security-framework.md) — RBAC, audited actions

### Frontend engineers (day 1-2)

8. [`04-design/design-system.md`](04-design/design-system.md) — POS-first UI principles, screen inventory
9. [`06-api/api-standards.md`](06-api/api-standards.md) — how you talk to the backend
10. [`02-requirements/`](02-requirements/) — screens and states for your module
11. [`08-security/security-framework.md`](08-security/security-framework.md) — what the UI may hide vs what the server decides

### Integration engineers (day 1-2)

8. [`07-integration/integration-hub.md`](07-integration/integration-hub.md) — adapter pattern, inbound flow, failure matrix
9. [`06-api/api-standards.md`](06-api/api-standards.md) — idempotency contract
10. [`05-database/schema-reference.md`](05-database/schema-reference.md) — event tables and their unique constraints

### QA (day 1-2)

8. [`09-testing/test-strategy.md`](09-testing/test-strategy.md) — coverage matrix, E2E scenarios, perf targets
9. [`02-requirements/`](02-requirements/) — all of it
10. [`00-governance/definition-of-ready-done.md`](00-governance/definition-of-ready-done.md)

### DevOps / SRE (day 1-2)

8. [`10-devops/environments-and-cicd.md`](10-devops/environments-and-cicd.md)
9. [`12-operations/runbook.md`](12-operations/runbook.md)
10. [`11-rollout/rollout-plan.md`](11-rollout/rollout-plan.md)

---

## 4. Full Document Map

| Path | What lives there | Owner |
|------|-----------------|-------|
| [`START-HERE.md`](START-HERE.md) | This file — entry point | Architect |
| [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md) | Rules for writing code here | Architect |
| [`ARTIFACT-REGISTRY.md`](ARTIFACT-REGISTRY.md) | ID scheme + traceability contract for every artifact | Architect |
| [`checkpoints/`](checkpoints/) | `CP-` phase gates and exit criteria | PMO |
| [`decisions/`](decisions/) | `DEC-` live decision log (**check before starting work**) | Product Owner |
| [`mappings/`](mappings/) | `MAP-` traceability in both directions | BA |
| [`workflows/`](workflows/) | `WF-` every process flow | BA |
| [`dependencies/`](dependencies/) | `DEP-` external, internal, technical | Architect |
| [`ui-ux-artifacts/`](ui-ux-artifacts/) | `UX-` screens, components, states, tokens | UX |
| [`database/`](database/) | `DB-` object catalogue, mapping tables, ERD | DBA |
| [`ONBOARDING.md`](ONBOARDING.md) | Day 1-5 checklist, local setup | Tech Lead |
| [`GLOSSARY.md`](GLOSSARY.md) | Domain vocabulary | BA |
| [`MODULE-MAP.md`](MODULE-MAP.md) | Which doc + which folder for each module | Architect |
| [`FAQ.md`](FAQ.md) | Questions every new dev asks | Tech Lead |
| [`12-operations/troubleshooting/`](12-operations/troubleshooting/) | **Something broken? Start here** — routes by symptom | SRE |
| [`00-governance/`](00-governance/) | Charter, [`phases-of-implementation.md`](00-governance/phases-of-implementation.md), risk register, DoR/DoD, change control | Product Owner |
| [`01-discovery/`](01-discovery/) | Decision register, gap analysis, traceability | BA |
| [`02-requirements/`](02-requirements/) | Functional specs per module | BA |
| [`03-architecture/`](03-architecture/) | HLD, [`multi-agent-orchestration-and-wiring.md`](03-architecture/multi-agent-orchestration-and-wiring.md), stack, module boundaries, NFRs | Solution Architect |
| [`04-design/`](04-design/) | Design system, screen inventory, states | UX |
| [`05-database/`](05-database/) | Schema reference, design rules, constraints | DBA |
| [`06-api/`](06-api/) | API standards, error model, idempotency | Backend Lead |
| [`07-integration/`](07-integration/) | Adapters, retry, reconciliation | Integration Lead |
| [`08-security/`](08-security/) | RBAC, [`user-management-rbac.md`](08-security/user-management-rbac.md), controls, threat model | Security |
| [`09-testing/`](09-testing/) | Test strategy, E2E scenarios | QA Lead |
| [`10-devops/`](10-devops/) | Environments, CI/CD, observability, DR | DevOps |
| [`11-rollout/`](11-rollout/) | Releases, pilot, go-live, rollback | PMO |
| [`12-operations/`](12-operations/) | Runbook, SLOs, incident response | SRE |
| [`adr/`](adr/) | Architecture Decision Records | Architect |
| [`templates/`](templates/) | ADR, user story templates | All |

---

## 5. Before You Write Code — Checklist

- [ ] Read the sequence above for your role
- [ ] Found your module in [`MODULE-MAP.md`](MODULE-MAP.md)
- [ ] Confirmed no open `DEC-xxx` blocks your work
- [ ] Story meets Definition of Ready ([`00-governance/definition-of-ready-done.md`](00-governance/definition-of-ready-done.md))
- [ ] Read [`ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md) end to end
- [x] Local environment running ([`ONBOARDING.md`](ONBOARDING.md))

---

## 6. Document Status Legend

Every doc carries a status. Treat it literally.

| Status | Meaning |
|--------|---------|
| `APPROVED` | Signed off. Build to this. Change requires a CR. |
| `REVIEW` | Content stable, awaiting sign-off. Build carefully; expect small changes. |
| `DRAFT` | Working content. Do **not** build production code from it. |
| `PROPOSED` | A recommendation, not a decision. Needs an owner's approval first. |
| `DECISION REQUIRED` | Blocked. Escalate, do not guess. |

Current reality: most docs are `DRAFT` or `PROPOSED`, because Phase 0 has not closed. That is the expected state, not an oversight.

---

**Version:** 1.0 · **Owner:** Solution Architect · **Review:** after Phase 0 exit
