# ADR-0003: POS Client Architecture and Offline Model

**Status:** Accepted
**Date:** 2026-08-08
**Deciders:** Product Owner, Solution Architect, IT Lead, Frontend Lead, QA Lead
**Related:** DEC-002, DEC-005, DEC-006, ADR-0001, ADR-0002

## Context

Target restaurant outlets frequently suffer from network drops, broadbands outages, and power brownouts. A purely online thin-client POS will halt dining room and checkout service during these outages. However, building a full local sync engine with write conflict-resolution during Release 1 introduces high delivery risk, as we would be debugging sync issues and the core transactional order model simultaneously.

## Options Considered

* **Option A**: **Online-only thin client**. High operational risk during network outages.
* **Option B**: **Read-only offline**. Caches menu catalog locally, but orders cannot be placed offline.
* **Option C**: **Full offline order capture in R1**. Sync queues and local persistence on the POS terminal from day 1. High engineering overhead.
* **Option D (Accepted)**: **Online-only for R1 with offline enablers baked-in**. The client starts as an online app, but the architecture strictly enforces client-side primitives required for offline replication (client-generated UUIDv7 keys, idempotency headers, terminal-partitioned order sequences).

## Decision

We chose **Option D**. We will launch the R1 POS client in online-only mode, but enforce three critical architectural enablers to allow seamless offline-write capability in R1.1 without schema rewrites:
1. **Client-Generated Identity**: All entities (orders, order items, status changes, KOTs) must use client-generated `UUIDv7` keys rather than server-incremented primary keys.
2. **Mandatory Idempotency Headers**: Every mutating write path must support and require a client-generated `Idempotency-Key` (in accordance with Engineering Protocol Rule 6).
3. **Partitioned Order Numbering**: Terminal order sequences will be partitioned per terminal terminal-level blocks (`UNIQUE (outlet_id, order_number)`) so that two terminals operating independently can never collision-mint duplicate order numbers.

## Consequences

* **What becomes easier**: We buy the right to defer the sync engine to Release 1.1 at zero additional structural cost, since the schema and API design will already be optimized for client-first writes.
* **What becomes harder**: Enforcing these rules strictly across developers during R1. If any dev uses server-generated sequences or drops the idempotency key validation, the offline path breaks.
* **Commitment**: Client-generated UUIDv7s and partitioned order numbering are permanent database design choices.
