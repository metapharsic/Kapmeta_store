# PetPooja POS Platform — Multi-Agent Operational Framework

**Architecture:** Distributed Domain-Driven Multi-Agent Topology  
**Protocol Version:** 2.0  
**Owner:** System Architect & Lead Engineers  

---

## 1. Multi-Agent Hierarchy & Roles

The PetPooja POS platform divides engineering, verification, and operational duties among 7 specialized autonomous and collaborative agents:

```
                          ┌──────────────────────────┐
                          │   ORCHESTRATOR AGENT     │
                          │ (Cross-Domain Conductor) │
                          └────────────┬─────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        │              │               │               │              │
┌───────▼──────┐┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐┌──────▼──────┐
│ FRONTEND UI  ││ BACKEND API │ │  DATABASE   │ │ INTEGRATION ││ QA / TEST   │
│    AGENT     ││    AGENT    │ │ PERSISTENCE │ │     HUB     ││ VERIFICATION│
│ (Next.js/TS) ││(Express/Bus)│ │  (Postgres) │ │(Aggregators)││  (Vitest)   │
└──────────────┘└─────────────┘ └─────────────┘ └─────────────┘└─────────────┘
                                       │
                                ┌──────▼──────┐
                                │   SRE/OPS   │
                                │    AGENT    │
                                │(Logs/Health)│
                                └─────────────┘
```

---

## 2. Invariants for All Agents

1. **Zero Hardcoded Business Data (`AGENTS.md` Rule 1):**  
   Never hardcode menu items, categories, recipes, table numbers, tax slabs, prices, or user credentials. Always provide dynamic user ingestion via UI, API, or CLI seed scripts.
2. **Tenant Scoping:**  
   Every database query and mutation MUST enforce `outlet_id NOT NULL` derived from verified session tokens.
3. **Integer Minor Units:**  
   All monetary amounts MUST be stored and computed as `BIGINT` minor units (paise/cents).
4. **Append-Only Auditing:**  
   All privileged mutations (order cancellations, refunds, manager discounts, 86 toggles) MUST write an immutable record in the `AuditLog` table within the same database transaction.
5. **No Cross-Service Direct Table Reads:**  
   Services communicate strictly via typed APIs or asynchronous domain events (`apps/api/src/events`).

---

## 3. Agent Reference Documents

- [orchestrator-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/orchestrator-agent.md) — Master Conductor
- [frontend-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/frontend-agent.md) — UI/UX & Client Logic
- [backend-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/backend-agent.md) — API Gateway & Domain Services
- [database-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/database-agent.md) — Schema, Migrations & Transactions
- [integration-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/integration-agent.md) — Swiggy/Zomato/Printers
- [qa-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/qa-agent.md) — Testing, Validation & Verification
- [sre-agent.md](file:///c:/Users/Dell/Desktop/PetPooja/agents/sre-agent.md) — Ports, Health & Error Diagnostics
