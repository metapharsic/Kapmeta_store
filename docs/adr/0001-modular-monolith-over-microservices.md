# 0001. Modular Monolith Over Microservices

## Status
Accepted

## Context
Kapmeta is a pre-PMF restaurant POS platform. At this stage the realistic deployment footprint is one to a handful of pilot outlets, and the engineering team is small. We need to organize the `services/` directory for the domains identified so far: orders, tables, menu, tax, settings, reporting, sync, admin, aggregator-orders, crm, inventory, and finance.

Microservices architectures buy independent deployability, independent scaling, and fault isolation between services, at the cost of distributed-systems complexity: network calls in place of function calls, distributed transactions or sagas, per-service CI/CD pipelines, service discovery, and duplicated cross-cutting concerns (auth, logging, migrations). That cost is justified when a team has scaled enough that independent teams need independent release cadences, or when specific domains have genuinely divergent scaling profiles. Neither condition holds for Kapmeta today: one team ships one product, and per-outlet request volume is modest (see ADR-0002, each outlet runs its own local server, so there is no single hot path serving many outlets at once).

At the same time, we do not want an undifferentiated codebase where any module can reach into any other module's tables directly. That produces the classic monolith failure mode: implicit coupling that makes the codebase hard to reason about and effectively impossible to split later, because nobody can enumerate what actually depends on what.

## Decision
`services/` will be a single deployable API process — a modular monolith — internally organized into the domain modules listed above (orders, tables, menu, tax, settings, reporting, sync, admin, aggregator-orders, crm, inventory, finance), each as its own top-level module directory.

Module boundary rules, enforced by convention and code review (and by lint/CI rule once tooling allows):
- A module owns its own database tables. No module may issue direct SQL/ORM queries against another module's tables.
- Cross-module interaction happens only through the owning module's exported service interface (a Go/TypeScript/Python interface, function set, or equivalent — language TBD elsewhere), not through shared repositories or ORM models reached across module lines.
- Shared, truly cross-cutting concerns (auth/session, outlet_id scoping, audit logging, error types) live in a common/platform package that all modules may depend on, but that itself has no domain logic.
- Module code may not import another module's internal (non-exported) packages.

This gives us a single deployable unit for operational simplicity now, with internal seams clean enough that any module could be extracted into its own service later if a concrete scaling or team-structure reason emerges.

## Consequences

**Positive**
- One build, one deploy, one process to run locally and in each outlet-server/cloud environment — matches current team size and velocity needs.
- No distributed transaction problems for cross-module operations (e.g., placing an order touches orders, tables, menu, tax modules) — these can use a single local database transaction.
- Lower operational overhead: no service mesh, no per-service observability stack, no inter-service auth to build at MVP stage.
- Clean module boundaries preserve the option to extract a hot module (most likely candidates: sync, reporting, or aggregator-orders) into its own service later without a full rewrite.
- Easier onboarding: one codebase to run, one place to search.

**Negative**
- Module boundary discipline requires ongoing code review vigilance; without tooling enforcement, boundary violations can creep in silently.
- A bug or resource leak in one module can still affect the whole process (no hard fault isolation between modules).
- Deploys are all-or-nothing: a change to the `crm` module ships in the same release as a change to `orders`, so release risk is shared across domains.
- If the team or outlet count grows fast, module extraction is still real work, not free — this decision defers cost, it does not eliminate it.

## Alternatives Considered

**Full microservices from day one** (one deployable service per domain, with its own datastore and API). Rejected: for a pre-PMF product likely running one to two pilot outlets, this is premature operational overhead — standing up service discovery, inter-service auth, distributed tracing, and per-service pipelines for a team of this size would slow delivery without a corresponding benefit. There is no current scaling or team-topology pressure that microservices would solve.

**Single undifferentiated codebase with no module boundaries** (all domains share models/tables freely, no interface discipline). Rejected: this is the path of least short-term resistance but produces implicit coupling that compounds with every feature. It would make ordinary maintenance harder within months, and would make any future extraction (or even isolated testing of one domain) far harder, since dependencies would not be enumerable.
