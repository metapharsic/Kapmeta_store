# Architecture Decision Records — Kapmeta

This directory contains the Architecture Decision Records (ADRs) for Kapmeta, a restaurant POS platform. Each ADR captures one significant, hard-to-reverse architectural decision, the context that drove it, and the alternatives that were rejected and why.

## Index

| # | Title | Summary |
|---|-------|---------|
| [0001](./0001-modular-monolith-over-microservices.md) | Modular Monolith Over Microservices | `services/` is one deployable process organized into clean domain modules (orders, tables, menu, tax, settings, reporting, sync, admin, aggregator-orders, crm, inventory, finance), not separate microservices, for this stage of the project. |
| [0002](./0002-lan-outlet-server-topology.md) | LAN Outlet-Server Topology | Each physical outlet runs its own local outlet-server (with a local database) that POS terminals on that outlet's LAN connect to, independent of cloud connectivity, matching confirmed reference-app behavior. |
| [0003](./0003-outbox-inbox-sync-pattern.md) | Outbox/Inbox Sync Pattern | Outlet-server <-> cloud sync uses append-only outbox/inbox tables with at-least-once, idempotent delivery, rather than direct database replication or synchronous dual-write. |
| [0004](./0004-per-outlet-local-sequence-for-bill-kot-numbers.md) | Per-Outlet Local Sequence for Bill/KOT Numbers | `bill_no`/`kot_no` are outlet-local sequential integers for display only; a global `order_id` (UUID) is the cross-system reference key. |
| [0005](./0005-outlet-id-everywhere-multi-tenant-ready-schema.md) | outlet_id Everywhere (Multi-Tenant-Ready Schema) | Every tenant-scoped table carries `outlet_id` from day one, even though v1 ships single-outlet with no multi-outlet UI, to avoid an expensive future retrofit. |

## How These Fit Together

ADR-0002 establishes the physical topology (local outlet-servers on a LAN, syncing to a cloud backend). ADR-0003 defines the mechanism that topology uses to stay in sync under unreliable connectivity. ADR-0004 and ADR-0005 are schema-level decisions that make the topology work correctly: per-outlet-local numbering avoids needing cloud coordination for something staff need instantly and offline, and `outlet_id` on every table is what makes "per-outlet" a well-defined, enforceable concept throughout the schema. ADR-0001 is orthogonal — it governs how the codebase implementing all of the above is organized internally.

## ADR Template

New ADRs should follow this structure. Copy it into a new file named `NNNN-short-kebab-case-title.md`, using the next sequential number.

```markdown
# NNNN. Title

## Status
Proposed | Accepted | Superseded by ADR-XXXX | Deprecated

## Context
What is the situation? What forces — technical, product, evidence, team — are
in tension and require a decision? Be concrete; cite the evidence (data,
screenshots, prior incidents, constraints) that grounds the decision rather
than asserting a preference.

## Decision
State the decision clearly and specifically enough that an engineer could
implement it without needing to ask follow-up questions. Prefer concrete
rules ("every table carries X", "the API returns Y") over vague direction.

## Consequences

**Positive**
- What this decision makes easier, safer, or cheaper.

**Negative**
- What this decision makes harder, costs, or risks. Every real decision has
  trade-offs; list them honestly rather than only the upside.

## Alternatives Considered
List at least two real alternatives that were seriously considered, and the
specific reason each was rejected. "We didn't think of it" is not a valid
alternative — only include options that were genuinely weighed.
```

## Status Values

- **Proposed** — under discussion, not yet binding.
- **Accepted** — the team's current decision; implementations should follow it.
- **Superseded by ADR-XXXX** — no longer current; a later ADR replaced it. Keep the file; do not delete superseded ADRs, they remain the historical record.
- **Deprecated** — no longer applicable (e.g., the feature it governed was removed), without a direct successor.

## Numbering

ADRs are numbered sequentially and never renumbered or reused, even if an ADR is later superseded or deprecated. This keeps references to `ADR-0004` stable in code comments, PRs, and other documents indefinitely.
