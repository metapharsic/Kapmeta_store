# 0003. Outbox/Inbox Sync Pattern Between Outlet-Server and Cloud

## Status
Accepted

## Context
Given the LAN outlet-server topology (ADR-0002), each outlet-server must periodically synchronize with the cloud backend: pushing locally created orders, bills, and settings changes up, and pulling cloud-originated data — most importantly aggregator orders from Swiggy/Zomato, which can only arrive via cloud webhook, plus any centrally managed menu/settings edits — back down.

The connection between an outlet and the cloud cannot be assumed reliable or continuous. Outlets may be offline for minutes, hours, or (in a bad case) days, and must keep operating locally throughout (per ADR-0002). Any sync mechanism we choose must therefore tolerate long disconnects gracefully, resume cleanly, and make conflict handling something a developer can reason about and test, rather than something that falls out of low-level database replication mechanics.

An earlier sync-architecture planning pass proposed an outbox/inbox pattern with per-outlet-local bill/KOT numbering (formalized separately in ADR-0004); this ADR accepts and formalizes the sync mechanism itself.

## Decision
Sync between an outlet-server and the cloud backend uses two append-only tables per outlet-server:

- **outbox**: every locally originated change that must eventually reach the cloud (new orders, bill closures, local settings edits, etc.) is written as an outbox row inside the same local transaction that makes the change, tagged with an idempotency key (e.g., a UUID generated at write time) and a monotonically increasing local sequence number. A background sync worker reads unsent outbox rows in order and pushes them to the cloud backend's ingest endpoint.
- **inbox**: cloud-originated changes destined for this outlet (aggregator orders, centrally pushed settings/menu changes) are written by the cloud backend to a per-outlet inbox feed. The outlet-server's sync worker polls (or receives, if push is available) new inbox entries and applies them locally inside a local transaction, again keyed by idempotency key so a redelivered entry is a no-op.

Delivery semantics are **at-least-once** in both directions. Every outbox and inbox entry carries an idempotency key, and every consumer (cloud ingest endpoint, outlet-server apply logic) must be written to safely no-op on a duplicate delivery of the same key. We explicitly do not attempt exactly-once delivery at the transport level; idempotency at the application level is the mechanism that makes at-least-once safe.

Consistency model:
- For data that is not on the critical operational path — reporting rollups, analytics aggregates, non-urgent settings mirrors — **eventual consistency** is accepted. A short delay between a local change and its visibility in cloud-side cross-outlet reporting is fine.
- For anything order-critical — an aggregator order that must reach the kitchen, a bill number, a price change that affects what a customer is charged — explicit business rules govern conflict resolution (e.g., "local order state, once billed, is never overwritten by a late-arriving cloud update"; "aggregator order acceptance is server-authoritative and applied by the outlet-server as a new order, never merged into an existing one"). These rules are documented per entity type as each sync-relevant module is built, not left to generic last-write-wins.

## Consequences

**Positive**
- Sync is resumable and auditable: the outbox/inbox tables are a durable, inspectable log of exactly what has and hasn't been exchanged, which makes debugging a "why didn't this order sync" support case tractable.
- At-least-once plus idempotency keys is a well-understood pattern that tolerates arbitrarily long outlet disconnects without special-casing — the outlet-server simply has a backlog to drain when connectivity returns.
- Keeps the outlet-server's core write path entirely local (write to the module's tables + outbox in one local transaction), preserving the offline-first guarantee from ADR-0002 — sync is strictly additive, never a blocking dependency of the write.
- Business-rule-driven conflict handling for order-critical data is explicit and testable, rather than relying on generic replication conflict resolution that would be opaque to the team.

**Negative**
- We are building and owning a real piece of distributed-systems machinery (outbox writer, sync worker, inbox applier, retry/backoff, dedup) rather than getting it from a database feature — this is real implementation and testing effort.
- Eventual consistency for reporting means cross-outlet dashboards can visibly lag local reality; this must be communicated in the UI (e.g., "last synced at HH:MM") so it isn't mistaken for a bug.
- Every module that needs sync must define its own conflict-handling business rules; this is ongoing design work per entity, not a one-time architectural cost.
- At-least-once delivery pushes a correctness burden onto every consumer to be idempotent; a module that gets this wrong can double-apply a change, so this needs to be part of code review checklists and module-level tests, not just a top-level architecture note.

## Alternatives Considered

**Direct logical replication / CDC (change data capture) between local Postgres and a cloud Postgres.** Rejected: while it removes the need to hand-write outbox/inbox plumbing, it pushes conflict resolution and partial-connectivity semantics down into database-replication mechanics that are harder to reason about, harder to unit test, and harder to make idempotent per business entity. It also couples us more tightly to a specific database engine and its replication feature set, which cuts against the local outlet-server possibly running an embedded/lightweight database (ADR-0002). At this stage the operational complexity of running and monitoring CDC pipelines outweighs the plumbing we'd save.

**Synchronous dual-write to both local and cloud on every action.** Rejected: this reintroduces cloud availability as a hard dependency for local writes, directly defeating the purpose of the LAN outlet-server topology in ADR-0002. An order-taking or billing action would either have to block on a cloud round trip or silently skip the cloud write on failure, which is worse than an explicit, durable, retryable outbox.
