# Phase 2-3: Architecture + Database — Execution Plan

**Duration window:** 4-6 weeks
**Predecessor:** Phase 1 (UX/UI Design)
**Successor:** Phase 4-6 (Core POS)

---

## 1. Objective

Lock the system architecture — modular monolith service boundaries inside `services/`, and the LAN-first outlet-server-to-cloud sync topology — and freeze the database schema and migration set so that Phase 4-6 can begin implementation against a stable, versioned contract rather than a moving target.

This phase converts three draft artifacts (DB schema draft, API-contracts draft, sync-architecture draft) plus the nine per-screen requirement docs from design intent into committed, reviewable, versioned repository state: real migration files in `db/migrations`, real OpenAPI specs in `contracts/`, real Architecture Decision Records, and a real (if skeletal) `infra/` environment that a developer can bring up locally. Nothing in this phase ships user-facing functionality; its output is the ground that Phase 4-6 stands on.

## 2. Entry Criteria

- Phase 0 decision register is fully approved — every open DEC item from Phase 0 has a recorded resolution or an explicit deferral with owner and target date.
- Phase 1 design system and mockups are approved, including the nine per-screen requirement docs (Table/Floor View, Order Entry/Billing, Online Live Feed, OOS+Menu Availability, Order History, Billing+Print Config, Tax Master, Day Summary+Item Report, System Config+App Shell).
- The three draft artifacts (DB schema draft, API-contracts draft, sync-architecture draft) exist and have been read by every agent active in this phase.
- A named owner exists for each of the still-open decision items (multi-outlet v1 scope, unified order-status enum, tax backward/forward mode scope, My-Amount/Grand-Total/Total glossary) so this phase can chase them down rather than silently deferring them past freeze.

## 3. Exit Criteria / Definition of Done

Phase 2-3 is not complete until all of the following are true:

- Every table named in the DB schema draft (outlets, restaurant_tables, table_sessions, menu_categories, menu_items, menu_item_channel_status, menu_item_availability, taxes, tax_channel_rules, orders, order_items, order_payments, order_audit_log, sales_returns, outlet_billing_settings, outlet_print_settings, payment_type_master, sync_state, backup_jobs, plus `mv_item_sales_daily` and `user_report_preferences`) has a numbered migration file under `db/migrations/` with both `up` and `down` steps, applied cleanly against a fresh database in CI.
- A seed script exists under `db/seeds/` populating realistic sample data modeled on a single reference outlet ("Hotel Kapila"-style: real-looking menu categories, items, taxes, tables) — this sample data lives only in the seed script, never hardcoded into service code, per the CLAUDE.md rule.
- An ERD diagram reflecting the frozen schema is committed under `db/erd/` (or `docs/`) and matches the migrations exactly — no drift between diagram and DDL.
- 100% of the API-contracts draft's endpoints exist as reviewed OpenAPI paths under `contracts/openapi/`, versioned `v1`, one file per domain (orders, tables, menu, tax, settings, reporting, sync, admin), plus a consolidated Postman collection under `contracts/postman/`.
- Async event schemas for the outbox/inbox sync events and aggregator webhook events are committed under `contracts/events/`.
- `packages/types` contains shared TypeScript types mirroring the frozen OpenAPI specs and DB schema, and builds without error.
- ADRs exist for the five biggest architecture calls (see 4a) under `docs/adr/`, each with status `Accepted`.
- `infra/` contains a working local Docker Compose stack (Postgres, outlet-server stub, cloud API stub) that a developer can bring up with one command.
- QA/Test Agent has committed a first pass of contract tests under `tests/contract/` that run against the frozen OpenAPI specs (these will fail against unimplemented services — that failure is expected and tracked, not a blocker for this phase).
- The two schema-sensitive open decisions — sales-return field shape (multi-outlet v1 scope aside) and tax backward/forward mode scope — are either resolved and reflected in the frozen schema, or the affected tables (`sales_returns`, `taxes`/`tax_channel_rules`) are explicitly excluded from the freeze and tracked as a follow-up migration, per the risk mitigation in section 8.
- A non-functional requirements document exists under `docs/nfr.md` covering throughput, latency budgets, and offline tolerance.

## 4. Task Breakdown

### 4a. Architecture Decision Records (ADRs)

Write ADRs for the five largest architecture calls, each following a standard ADR template (context, decision, alternatives considered, consequences):

1. **ADR-001: Modular monolith vs. microservices at launch.** Decision: modular monolith under `services/`, organized by domain module (orders, tables, menu-sync, tax, settings, reporting, sync, admin) with enforced module boundaries and no cross-module direct DB access, to preserve a clean extraction seam for any module that later needs to become a standalone service (most likely candidates: sync, reporting).
2. **ADR-002: LAN outlet-server topology vs. pure cloud-only architecture.** Decision: each outlet runs a local outlet-server (handles table/order/billing operations against local Postgres) that syncs asynchronously to a cloud instance, chosen for POS availability during internet outages — billing must never block on cloud connectivity.
3. **ADR-003: Outbox/inbox sync pattern.** Decision: every outlet-local write of sync-relevant data appends to an outbox table; a sync worker drains the outbox to cloud and drains a cloud-side inbox back down, with idempotency keys and conflict resolution rules documented explicitly (last-writer-wins per field vs. per-row, and which fields are outlet-authoritative vs. cloud-authoritative).
4. **ADR-004: Per-outlet sequence authority for bill and KOT numbers.** Decision: bill and KOT number sequences are generated and owned by the outlet-server, never by the cloud, so numbering continues predictably during an outage; cloud reconciles and namespaces these per outlet_id but never renumbers.
5. **ADR-005: Multi-tenant `outlet_id`-everywhere schema despite single-outlet v1 UI.** Decision: every relevant table carries `outlet_id` from the first migration even if Phase 4-6's UI only supports single-outlet operation, so that multi-outlet is a UI/config change later rather than a schema migration and backfill.

Each ADR must explicitly cross-reference the DEC items in the Phase 0 decision register that it resolves or depends on.

### 4b. Finalize and freeze the ERD; write migrations

Migrations are written and applied in dependency order, each as its own numbered file:

1. `outlets`, `restaurant_tables`, `table_sessions` — the outlet/floor layer everything else hangs off.
2. `menu_categories`, `menu_items`, `menu_item_channel_status`, `menu_item_availability` — the menu layer, dependent on `outlets`.
3. `taxes`, `tax_channel_rules` — dependent on `outlets` and `menu_categories`/`menu_items` for scoping.
4. `orders`, `order_items`, `order_payments`, `order_audit_log`, `sales_returns` — the transactional core, dependent on tables, menu, and tax.
5. `outlet_billing_settings`, `outlet_print_settings`, `payment_type_master` — configuration layer, dependent on `outlets`.
6. `sync_state`, `backup_jobs` — sync/ops layer, dependent on `outlets` and cross-cutting on the transactional tables they track.
7. `mv_item_sales_daily` (materialized view, built once `orders`/`order_items` exist) and `user_report_preferences` (depends on an admin/user table — confirm whether a `users`/`staff` table needs to be added to the schema draft at this stage, since none was listed; flag this gap explicitly rather than silently inventing it).

Each migration includes indices called out in the schema draft (e.g., `orders.outlet_id, orders.status`, `menu_items.outlet_id, menu_items.category_id`) and foreign keys with explicit `ON DELETE` behavior. The ERD is regenerated from the final migration set, not hand-drawn ahead of it, so it cannot drift.

### 4c. Seed scripts

`db/seeds/` gets one seed script per domain layer (outlets/tables, menu, tax, settings, sample orders/history) plus a top-level runner. All sample data is modeled on a single fictional reference property ("Hotel Kapila") with a realistic-looking multi-category menu, a floor plan with a mix of table sizes, standard GST-style tax rules, and a few days of historical order data for reporting screens to render against. This is strictly seed data — no service code may hardcode any of it, per the CLAUDE.md rule; anything the seed demonstrates must be reachable through the DB tables and, where applicable, an admin UI screen.

### 4d. Finalize contracts/

One OpenAPI file per domain under `contracts/openapi/` (orders, tables, menu, tax, settings, reporting, sync, admin), each versioned `v1` in its base path. Every endpoint named in the API-contracts draft and every per-screen requirement doc is accounted for — if a screen doc implies an endpoint the draft didn't list, it gets added here, not silently deferred. A consolidated Postman collection is exported to `contracts/postman/`. Async event schemas (outbox/inbox sync events, aggregator webhook payloads) are written under `contracts/events/` using a schema format consistent across events (JSON Schema recommended, matching whatever the sync-architecture draft assumed).

### 4e. `packages/types`

Shared TypeScript types are generated from (or hand-mirrored against, if generation tooling isn't set up yet) the frozen OpenAPI specs and DB schema, published under `packages/types` for consumption by `apps/pos-web`, `apps/admin-web`, and `apps/api`. Document in the package README whether types are generated on build or committed statically, so Phase 4-6 agents know whether to regenerate after a contract change or edit by hand.

### 4f. `infra/` skeleton

- Docker Compose file bringing up local Postgres, an outlet-server stub, and a cloud API stub, wired to the fresh migrations and seed data.
- Terraform stub for cloud infrastructure (no live apply required this phase — structure and provider config only).
- Monitoring stub (e.g., a Prometheus/Grafana or equivalent config skeleton) sufficient for later phases to extend, not a working dashboard yet.

### 4g. Non-functional requirements doc

`docs/nfr.md` covering: throughput targets (concurrent orders per outlet, peak table turns/hour), latency budgets for hot-path POS actions (e.g., adding an item to a ticket must round-trip locally in under a target threshold, independent of cloud sync latency), and the offline tolerance window (how long an outlet-server must be able to operate fully disconnected from cloud before any functionality degrades, and what degrades first).

## 5. Active Build Agents and Division of Labor

- **DB/Schema Agent** — owns `db/migrations/`, `db/seeds/`, and the ERD. Responsible for task 4b and 4c end to end, including index and foreign-key correctness and confirming migrations apply cleanly in CI.
- **Contracts Agent** — owns `contracts/` (OpenAPI, Postman, event schemas) and `packages/types`. Responsible for tasks 4d and 4e, and for keeping generated/mirrored types in lockstep with the OpenAPI specs.
- **Architecture Agent** (new role, introduced this phase) — owns ADR authorship, the service boundary map (which domain lives in which `services/` module, and what may not reach across a module boundary directly), and the `infra/` skeleton. Responsible for tasks 4a and 4f, and for maintaining the sync-architecture draft as the authoritative source ADR-002 through ADR-004 formalize.
- **QA/Test Agent** — begins writing contract tests under `tests/contract/` against the frozen OpenAPI specs as soon as each domain's spec is marked reviewed. This is deliberate contract-level TDD: tests are written and committed before any service implementation exists, so Phase 4-6 agents inherit a red test suite that turns green as they build, rather than writing tests after the fact.
- **Domain Services Agents, POS-Web UI Agent, Admin-Web UI Agent, Aggregator Integration Agent, Sync/Offline Agent, Docs/Discovery Agent** — not actively building in this phase, but each should review the contracts and schema sections relevant to their future domain and file objections before freeze; their sign-off (or documented dissent) is expected before Phase 4-6 kicks off, since schema changes get materially more expensive once implementation starts.

## 6. Deliverables (exact paths)

- `db/migrations/0001_*.sql` … `db/migrations/00NN_*.sql` (one or more per table/view, in the dependency order of 4b)
- `db/seeds/` (per-domain seed scripts + runner)
- `db/erd/kapmeta-erd.{svg,png,drawio}` (or under `docs/erd/` if that's the repo's existing convention)
- `contracts/openapi/{orders,tables,menu,tax,settings,reporting,sync,admin}.v1.yaml`
- `contracts/postman/kapmeta.postman_collection.json`
- `contracts/events/{outbox,inbox,webhook}.schema.json` (or equivalent per event family)
- `packages/types/` (built package + README documenting generation/mirroring approach)
- `docs/adr/ADR-001-modular-monolith.md` through `ADR-005-outlet-id-everywhere.md`
- `infra/docker-compose.yml`, `infra/terraform/` (stub), `infra/monitoring/` (stub)
- `docs/nfr.md`
- `tests/contract/` (initial suite, one directory per domain matching the OpenAPI files)

## 7. Dependency Wiring — What Phase 4-6 Consumes

Phase 4-6 (Core POS) builds directly against:

- The **frozen schema and applied migrations** in `db/migrations/` — Domain Services Agents write repository/query code against these tables as given; they do not re-derive or informally extend the schema mid-build.
- The **frozen contracts** in `contracts/openapi/` — POS-Web UI Agent and Admin-Web UI Agent build screens against these request/response shapes; Domain Services Agents implement handlers to satisfy them; the contract tests QA/Test Agent already wrote become the acceptance bar.
- The **generated/mirrored types** in `packages/types` — both UI apps and API services import from here rather than redefining request/response or entity shapes locally, keeping frontend and backend from drifting apart silently.
- The **ADRs and service boundary map** — Domain Services Agents place new code inside the correct `services/` module and respect the no-cross-module-DB-access rule from ADR-001; Sync/Offline Agent implements against the outbox/inbox contract fixed in ADR-003 and the sequence-authority rule fixed in ADR-004.

**If this phase is skipped or rushed:** Phase 4-6 agents will each make independent, incompatible assumptions about table shapes, status enums, and endpoint contracts, producing rework that is far more expensive once orders, payments, and print logic are wired against a half-settled schema — a mid-Phase-4-6 schema change is no longer a migration file, it's a migration plus data backfill plus coordinated changes across every service and UI that touched the old shape. The LAN-first sync guarantees (billing must not block on cloud connectivity) are also easy to violate implicitly if the outbox/inbox pattern isn't fixed and documented before service code is written — retrofitting offline-safety into code written cloud-first is a rewrite, not a patch.

## 8. Risks

- **Schema freeze happening before DEC-014 (sales-return fields) or DEC-017 (tax mode scope) are resolved.** Freezing `sales_returns` or `taxes`/`tax_channel_rules` ahead of these decisions risks a disruptive migration later, once Phase 4-6 or 8-9 has already built against the wrong shape. *Mitigation:* explicitly exclude `sales_returns` and the tax tables from the general freeze declared in 4b until DEC-014 and DEC-017 are closed; sequence their migrations last within Phase 2-3, and if they're still unresolved at the end of the window, split them into a tracked short follow-up sub-phase rather than freezing on a guess.
- **Multi-outlet scope ambiguity (open decision item) affecting more than `outlet_id` placement.** Even with `outlet_id` on every table per ADR-005, unresolved multi-outlet scope could affect things ADR-005 doesn't cover — cross-outlet reporting aggregation, permission models, shared vs. per-outlet settings. *Mitigation:* Architecture Agent explicitly scopes ADR-005 to schema-level placement only and flags any multi-outlet implication beyond that as a separate open item for Phase 8-9 (or wherever reporting/permissions land).
- **Order-status enum left unresolved past freeze.** `orders.status` is read by nearly every domain (billing, KOT, reporting, sync); an unresolved or later-changed enum ripples everywhere. *Mitigation:* treat the unified order-status enum decision as a hard blocker for the `orders` migration specifically — do not write that migration until the enum is signed off, even if it delays 4b's ordering slightly.
- **Glossary ambiguity (My-Amount / Grand-Total / Total) leaking into column names.** If migrations are written before the glossary is settled, column names may encode the wrong terminology and require a rename migration later. *Mitigation:* resolve the glossary before writing `order_payments` and any billing-settings migration; if not resolved in time, use provisional, clearly-flagged column names and track a rename as technical debt rather than blocking the whole freeze.
- **`packages/types` drifting from `contracts/` if generation isn't automated.** Manual mirroring is a stale-types risk from day one. *Mitigation:* Contracts Agent should stand up at least a manual regeneration script and a CI check that fails when types are stale, even if full auto-generation tooling isn't ready this phase.
- **Missing `users`/`staff` table.** `user_report_preferences` implies a users/staff table that isn't in the current schema draft list. *Mitigation:* flag this gap explicitly during 4b rather than inventing an under-specified table; resolve with a quick decision item before that migration is written.
- **infra/ skeleton treated as throwaway and neglected.** If the Docker Compose stack isn't kept working, Phase 4-6 agents lose their fastest way to validate against real migrations and seeds locally. *Mitigation:* make `infra/docker-compose.yml` part of CI (spin up, migrate, seed, tear down) so it can't silently rot.

## 9. Estimated Duration (4-6 week window)

- **Week 1:** ADRs (4a) drafted and reviewed; service boundary map drafted; outstanding decision items (multi-outlet scope, order-status enum, tax mode scope, glossary) actively chased to closure in parallel — this week is the forcing function for those decisions, not a wait state.
- **Week 2:** ERD and migrations for the outlet/floor and menu layers (4b, steps 1-2) written and applied in CI; contracts drafting begins in parallel for orders/tables/menu domains (4d).
- **Week 3:** Migrations for tax and the transactional core (4b, steps 3-4) — gated on DEC-017 and the order-status enum closing; contracts for tax/orders/settings domains; `packages/types` scaffolding begins (4e).
- **Week 4:** Migrations for settings and sync/ops layers (4b, steps 5-6); seed scripts (4c) written against the by-now-mostly-frozen schema; remaining contracts and Postman collection and event schemas finalized (4d); QA/Test Agent begins first contract tests as each domain spec is marked reviewed.
- **Week 5:** Materialized view and any remaining tables (4b, step 7, contingent on resolving the users/staff table gap); `infra/` skeleton (4f) built and wired to CI; NFR doc (4g) written; `packages/types` finalized against the now-frozen contracts.
- **Week 6 (buffer, used only if weeks 1-5 slipped):** Close any remaining DEC-014/DEC-017-gated migrations; finish contract test coverage; run full exit-criteria review with all Domain Services Agents, POS-Web UI Agent, and Admin-Web UI Agent signing off on the frozen schema and contracts before Phase 4-6 begins.
