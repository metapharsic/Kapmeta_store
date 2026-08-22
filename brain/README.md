# PetPooja POS Platform — AI Architecture Brain

**Target Audience:** Gemini, Claude, and Multi-Agent AI Coding Systems  
**Purpose:** Rapid architectural reasoning, end-to-end component wiring, state model navigation, and autonomous diagnostic resolution.  
**Version:** 2.0  
**Updated:** 2026-08-14  

---

## 1. Cognitive Map & Navigation Index

When constructing, wiring, or debugging features in PetPooja POS, consult the specialized guides in this directory:

```
brain/
├── SYSTEM_ARCHITECTURE.md      # Full topological diagram, fixed ports, communication layers
├── WIRING_GUIDE.md             # Complete step-by-step UI <-> API <-> Service <-> DB wiring
├── DOMAIN_MODELS.md            # Entity relational models, UUIDv7, minor units, outlet_id scoping
├── STATE_MACHINES.md           # Order, KOT, Table, and Payment finite state machines
├── MULTI_AGENT_RESOLVER.md     # Autonomous bug diagnostics, log scanning & fix algorithms
└── API_AND_EVENTS_CATALOG.md   # Complete catalog of REST endpoints, WS topics, and Event Bus
```

---

## 2. Fundamental Operating Rules for AI Models

1. **Zero Hardcoded Business Data (`AGENTS.md` Rule 1):**  
   Never hardcode menu items, categories, ingredients, prices, tables, or tax rates into UI components or service logic. All business entities must originate from PostgreSQL via API endpoints or dynamic seeds (`scripts/seed-dynamic-data.ts`).
2. **Fixed Port Standards:**  
   - Frontend POS Web: `http://localhost:4444` (`PORT=4444`, `POS_PORT=4444`)
   - Backend API Gateway: `http://localhost:4001` (`API_PORT=4001`)
   - PostgreSQL Database: `localhost:5432` (`DB_PORT=5432`)
   - Redis Cache: `localhost:6379` (`REDIS_PORT=6379`)
3. **Database Integrity Standards:**  
   - All financial amounts must be integer minor units (`BIGINT` paise/cents).
   - All tenant-scoped tables must enforce `outlet_id NOT NULL`.
   - Primary keys generated on ingestion interfaces must use UUIDv7.
4. **Append-Only Auditing:**  
   All privileged mutations (order cancellation, refunds, discounts, 86 toggles) must write an immutable audit log record in the same database transaction.
