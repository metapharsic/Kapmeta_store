# 0005. outlet_id on Every Tenant-Scoped Table (Multi-Outlet-Ready Schema, Single-Outlet v1 UI)

## Status
Accepted

## Context
Kapmeta v1 ships for a single outlet per deployment, with no multi-outlet management UI. However, the reference product (and the realistic growth path for any restaurant operator using this system) is multi-outlet: successful restaurants open second and third locations, and the LAN outlet-server topology (ADR-0002) already anticipates multiple outlet-servers syncing to one cloud backend, each outlet owning its own local bill/KOT sequence (ADR-0004).

This decision was originally tracked as DEC-023 during schema design and is formalized here as an ADR. The core question was whether every tenant-scoped table should carry an `outlet_id` column now, even though v1's UI never lets a user manage more than one outlet.

The underlying argument is a cost asymmetry: adding `outlet_id` to a table's schema now, while the table is still being designed and before production data exists, is cheap — a column, an index, a foreign key, and scoping every query by it from day one. Retrofitting `outlet_id` onto an existing table after it has production data, existing queries written without outlet-scoping, existing reports built on top of it, and possibly existing multi-outlet customers depending on correct isolation, is materially more expensive and risky — it requires a data migration to backfill the column, an audit of every query and report to add scoping, and a period where isolation bugs are possible if any query is missed.

## Decision
Every tenant-scoped table in the schema carries an `outlet_id` column (foreign key to the outlets table), including tables that, in v1, will only ever have rows for a single outlet in practice. This applies across all modules (orders, tables, menu, tax, settings, reporting, sync, aggregator-orders, crm, inventory, finance) per ADR-0001's module list, wherever the table's data is naturally outlet-scoped (as opposed to genuinely global config, such as a system-wide feature flag table with no outlet dimension).

`outlet_id` is:
- Required (non-nullable) on all such tables from the first migration that creates them.
- Included in relevant indexes and unique constraints (e.g., `bill_no` is unique per `(outlet_id, bill_no)`, per ADR-0004, not globally unique).
- Enforced in every query at the module's service-interface layer (ADR-0001) — a module's queries always scope by the caller's outlet context, even in v1 where that context is effectively constant.

v1 explicitly does **not** build multi-outlet management UI (outlet switcher, cross-outlet dashboards, per-outlet role assignment across an operator's chain, etc.) — that remains out of scope until there is real demand for it. This ADR only commits to the schema and query-scoping discipline being multi-outlet-ready underneath a v1 experience that looks and behaves as single-outlet.

## Consequences

**Positive**
- No expensive retrofit migration is needed if/when Kapmeta adds multi-outlet UI — the schema and query layer already support it; the work becomes UI and cross-outlet aggregation logic, not a data migration project.
- Query-scoping discipline (always filter by `outlet_id`) is established from day one as a habit and a code-review expectation, rather than being bolted on later when it's easy to miss call sites.
- Directly aligns with the confirmed LAN outlet-server topology (ADR-0002) and per-outlet sequences (ADR-0004), which already assume outlet-scoped data as a first-class concept.
- Cross-outlet reporting (out of v1 scope) becomes a straightforward aggregation query once needed, rather than requiring schema changes first.

**Negative**
- Every table creation and every query in v1 carries a small amount of extra ceremony (the column, the index, the scoping clause) for a dimension that, in v1's actual deployments, never varies — a modest but real ongoing tax on schema and query-writing work.
- If `outlet_id` scoping is forgotten in some query during v1 (since it's a "no-op" in a single-outlet deployment, a missing filter won't visibly break anything yet), the bug is latent and will only surface as a real isolation bug once a second outlet exists — this risk needs to be caught by code review and tests, not by production behavior, since v1 production won't naturally expose it.
- Slightly larger schema and slightly more complex migrations than a genuinely single-tenant design would need.

## Alternatives Considered

**Fully single-tenant schema, with outlet identity implicit or held only in a global config value (no `outlet_id` column on domain tables).** Rejected for the same cost-asymmetry reason driving the decision itself: this is cheaper today but converts into an expensive retrofit — a full data migration plus an audit of every query and report — the moment a second outlet is needed. Given that multi-outlet growth is a realistic and expected path for the product category (and the reference app itself is built this way, per ADR-0002's evidence), paying the small ongoing cost now is the better trade.

**Build full multi-outlet management UI now, ahead of schema needs.** Rejected as scope creep: there is no current evidence of demand for multiple outlets in the pilot phase, and building outlet-switcher UI, cross-outlet role management, and cross-outlet dashboards now would be speculative work with no near-term user. The `outlet_id`-everywhere schema decision already captures the cheap insurance; building the UI on top of it before it's needed goes beyond that insurance into unjustified YAGNI-violating scope.
