# Architecture Decision Records — Kapmeta

This directory contains the Architecture Decision Records (ADRs) for Kapmeta, a restaurant POS platform. Each ADR captures one significant, hard-to-reverse architectural decision, the context that drove it, and the alternatives that were rejected and why.

`docs/adr/` is the **single canonical home** for ADRs. It absorbed the short-lived `docs/decision/` folder on 2026-09-04 (see Consolidation History below). Do not create a new decision folder — add a numbered file here.

## Scope: ADR vs DEC

ADRs are not the only decision record in this repo, and the other one is deliberately separate:

| Type | Answers | Lives in | Decided by |
|------|---------|----------|------------|
| **ADR-NNNN** | *How we build it* — technical/structural choices | `docs/adr/` (here) | Solution Architect + engineers |
| **DEC-NNN** | *What the business needs* — product/commercial choices, with costed options, blocked work and an owner sign-off | [`../decisions/`](../decisions/) | Business owner (PO, Finance, Ops, Security, Legal) |

An approved DEC with architectural consequence spawns an ADR; the two are not duplicates of each other, and neither folder should be folded into the other. See [`../decisions/README.md`](../decisions/README.md) for the full rationale.

## Index

| # | Title | Summary |
|---|-------|---------|
| [0001](./0001-modular-monolith-over-microservices.md) | Modular Monolith Over Microservices | `services/` is one deployable process organized into clean domain modules (orders, tables, menu, tax, settings, reporting, sync, admin, aggregator-orders, crm, inventory, finance), not separate microservices, for this stage of the project. |
| [0002](./0002-lan-outlet-server-topology.md) | LAN Outlet-Server Topology | Each physical outlet runs its own local outlet-server (with a local database) that POS terminals on that outlet's LAN connect to, independent of cloud connectivity, matching confirmed reference-app behavior. |
| [0003](./0003-outbox-inbox-sync-pattern.md) | Outbox/Inbox Sync Pattern | Outlet-server ↔ cloud sync uses append-only outbox/inbox tables with at-least-once, idempotent delivery, rather than direct database replication or synchronous dual-write. |
| [0004](./0004-per-outlet-local-sequence-for-bill-kot-numbers.md) | Per-Outlet Local Sequence for Bill/KOT Numbers | `bill_no`/`kot_no` are outlet-local sequential integers for display only; a global `order_id` (UUID) is the cross-system reference key. |
| [0005](./0005-outlet-id-everywhere-multi-tenant-ready-schema.md) | outlet_id Everywhere (Multi-Tenant-Ready Schema) | Every tenant-scoped table carries `outlet_id` from day one, even though v1 ships single-outlet with no multi-outlet UI, to avoid an expensive future retrofit. **Overlaps ADR-0007 — read both.** |
| [0006](./0006-record-architecture-decisions.md) | Record Architecture Decisions | The meta-ADR: every structural decision gets an ADR here before implementation; schema and API contract changes require a merged ADR, and an approved DEC with architectural consequence gets a corresponding ADR. |
| [0007](./0007-tenancy-and-outlet-scoping.md) | Tenancy and Outlet Scoping Scaffolding | Outlet scoping is enforced, not just present: `outlet_id` resolves from session JWT claims, a request body carrying `outlet_id` is rejected at the boundary, and CI lint fails any operational query missing the predicate. **Overlaps ADR-0005 — read both.** |
| [0008](./0008-pos-client-architecture-and-offline-model.md) | POS Client Architecture and Offline Model | R1 ships an online-only POS client, but with the three offline enablers baked in (client-generated UUIDv7 identity, mandatory `Idempotency-Key` on every write, per-terminal partitioned order numbering) so offline write lands in R1.1 without a schema rewrite. |
| [0009](./0009-text-ids-not-uuid.md) | Primary/Foreign Key IDs Are TEXT, Not UUID | The live database uses Postgres `text` for id/FK columns despite migrations and `schema.prisma` declaring `uuid`; the live DB wins. New and repaired tables use TEXT ids. One confirmed exception: `integrations`/`channel_accounts.integration_id`. Audit incomplete (TSK-028/TSK-044). |
| [0010](./0010-generic-management-catalog-pattern.md) | Generic Management Catalog Tables | Small admin/settings screens route through three generic outlet-scoped tables (`management_lists`, `management_settings`, `management_activity_logs`) keyed by a discriminator plus a JSON payload, instead of a bespoke table and migration per screen. |
| [0011](./0011-polling-not-websocket-for-live-sync.md) | WebSocket-Primary Live Sync With Polling Backup | Live sync is an authenticated WebSocket (`/ws`) as the primary channel, with an interval re-fetch kept deliberately as a safety net. Corrects an earlier "polling-only, no WebSocket exists" premise, which the code disproves. |

## How These Fit Together

**Topology and sync (0002 → 0003 → 0004 → 0005).** ADR-0002 establishes the physical topology (local outlet-servers on a LAN, syncing to a cloud backend). ADR-0003 defines the mechanism that topology uses to stay in sync under unreliable connectivity. ADR-0004 and ADR-0005 are the schema-level decisions that make it work correctly: per-outlet-local numbering avoids needing cloud coordination for something staff need instantly and offline, and `outlet_id` on every table is what makes "per-outlet" a well-defined, enforceable concept.

**Codebase organization (0001).** Orthogonal to the above — it governs how the codebase implementing all of it is organized internally.

**Process (0006).** The meta-ADR that requires the rest to exist.

**Tenancy, recorded twice (0005 and 0007).** These two ADRs record the same core decision — `outlet_id` on every scoped table from the first migration — written two weeks apart by different passes (0007 from DEC-001 on 2026-08-08; 0005 from schema design, tracked then as DEC-023, on 2026-08-21). Both are retained because each carries material the other lacks: 0007 has the enforcement mechanism and the costed retrofit estimate, 0005 has the cost-asymmetry rationale, the global-config carve-out and the rejected alternatives. They also **disagree at the margin** — 0007 says "every operational table" with no exception, 0005 says "every tenant-scoped table" and exempts genuinely global config. Neither has been superseded, so both claims stand; each file carries a cross-note explaining this.

**Client and runtime behavior (0008, 0011).** ADR-0008 fixes the POS client's identity and idempotency primitives; ADR-0011 documents how running clients actually stay fresh (socket first, poll as backstop).

**Database conventions (0009, 0010).** ADR-0009 fixes the id/FK type convention against the live database; ADR-0010 fixes how low-structure admin data is stored. Both are session-verified against real code and real DB state rather than against the migration files' stated intent.

## Consolidation History

On 2026-09-04 three overlapping decision folders were consolidated into this one:

- **Duplicate numbering repaired.** `docs/adr/` had two files each at 0001, 0002 and 0003 — two independent authoring passes had both started numbering at 0001. The pass that the rest of the repo already referenced by number (modular monolith, LAN topology, outbox/inbox, sequences, `outlet_id`, cited as ADR-001..005 in `docs/phases/phase-02-03-architecture-and-db.md` and indexed in this README) kept **0001-0005**. The colliding trio was renumbered to **0006-0008**, preserving their relative order:
  - `0001-record-architecture-decisions.md` → `0006-...`
  - `0002-tenancy-and-outlet-scoping.md` → `0007-...`
  - `0003-pos-client-architecture-and-offline-model.md` → `0008-...`
- **`docs/decision/` (singular) folded in and deleted.** Its three ADRs became **0009-0011** here. That folder no longer exists.
- **`docs/decisions/` (plural) deliberately left in place** — DEC-NNN business decision packets are a different class of record, not duplicates. See Scope above.

All inbound references elsewhere in `docs/` were updated in the same pass. Because files moved with `git mv`, history follows them.

## ADR Template

New ADRs should follow this structure. Copy it into a new file named `NNNN-short-kebab-case-title.md`, using the next sequential number (the next free number is **0012**).

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

Two heading styles exist in this directory (`# NNNN. Title` and `# ADR-NNNN: Title`), a harmless artifact of the two authoring passes. New ADRs should use the template's `# NNNN. Title` form.

## Status Values

- **Proposed** — under discussion, not yet binding.
- **Accepted** — the team's current decision; implementations should follow it.
- **Superseded by ADR-XXXX** — no longer current; a later ADR replaced it. Keep the file; do not delete superseded ADRs, they remain the historical record.
- **Deprecated** — no longer applicable (e.g., the feature it governed was removed), without a direct successor.

## Numbering

ADRs are numbered sequentially. Numbers are **not** reused, and an ADR is not renumbered once published — references to `ADR-0004` in code comments, PRs and other documents must stay stable indefinitely.

The 2026-09-04 renumbering of 0001-0003 → 0006-0008 documented above is the one-time exception that repaired a genuine collision: three numbers each pointed at two different documents, so those references were already ambiguous and no stable meaning was lost. Every affected reference in the repo was updated in the same change. This is not a precedent — with the sequence now unique, the no-renumbering rule applies normally from 0012 onward.
