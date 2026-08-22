# DEP-INT — Internal Module & Multi-Agent Dependencies

**ID:** DEP-INT · **Status:** APPROVED · **Owner:** Solution Architect · **Version:** 2.0 · **Updated:** 2026-08-09
**Traces to:** `docs/03-architecture/multi-agent-orchestration-and-wiring.md` · `docs/03-architecture/high-level-design.md` · `MODULE-MAP.md`

---

## 1. Multi-Agent & Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND UI AGENT (pos-web)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Synchronous REST / WebSockets
┌──────────────────────────────▼──────────────────────────────┐
│             API GATEWAY & ORCHESTRATION AGENT               │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
   ┌───────┐      ┌───────┐      ┌───────┐      ┌───────┐
   │ Auth  ├─────►│ Menu  ├─────►│Orders ├─────►│Kitchen│
   └───────┘      └───────┘      └───┬───┘      └───┬───┘
                                     │              │
                                     ├──────────────┴──────►┌─────────┐
                                     │                      │ Finance │
                                     ▼                      └─────────┘
                              ┌─────────────┐
                              │Inventory(R2)│
                              └─────────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │  Reporting  │ (Consumes All Events)
                              └─────────────┘
```

---

## 2. Dependency Matrix (Cross-Agent Contracts)

Rows depend on columns. `S` = Synchronous RPC / Service Call, `E` = Asynchronous Domain Event Subscription.

| ↓ depends on → | Auth | Menu | Orders | Kitchen | Finance | Inventory | Integration | Database (PostgreSQL) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Frontend UI** | S | S | S | S | S | S | S | — |
| **API Gateway** | S | S | S | S | S | S | S | — |
| **Auth Service** | — | — | — | — | — | — | — | S |
| **Menu Service** | S | — | — | — | — | — | — | S |
| **Order Service** | S | S | — | E | S | E | S | S |
| **Kitchen Service** | S | — | E | — | — | — | — | S |
| **Finance Service** | S | — | S+E | E | — | — | — | S |
| **Inventory Service**| S | S | E | E | — | — | — | S |
| **Integration Hub** | S | S | S | — | — | — | — | S |
| **Reporting** | S | E | E | E | E | E | E | S (Read-Only) |

*Rule: Strict acyclic graph (DAG). No circular dependencies permitted.*

---

## 3. Boundary & Invariant Rules

1. **No Direct Cross-Module Database Access:** Services must never execute queries across another service's private schema tables. All cross-domain operations go via the module's public API or domain events.
2. **Event-Driven Decoupling:** `Reporting`, `Kitchen`, and `Inventory` subscribe to asynchronous events (`order.confirmed`, `order.settled`, `menu.86_toggled`) to prevent cascading latency spikes on the primary cashier checkout path.
3. **Session-Scoped Security:** `outlet_id` is unconditionally resolved from authenticated JWT token claims by the API Gateway Agent and passed down to Domain Services.
4. **Distributed Idempotency:** The Order Service and Finance Service reject any duplicate payload presenting an identical `Idempotency-Key` within 24 hours.
5. **Atomic Audit Logging:** Privileged mutations (voids, post-KOT cancellations, discounts $> 15\%$, manager overrides) write an immutable audit log record in the **same database transaction**.
