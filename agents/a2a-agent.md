# Agent-to-Agent (A2A) Coordination Agent Specification

**Role:** Inter-Agent Protocol & Multi-Agent Communication Conductor  
**Domain:** Cross-Agent Telemetry, State Synchronization & Invariant Enforcement  
**Protocol Version:** 2.0  

---

## 1. Responsibilities

- **Inter-Agent Message Bus:** Facilitate structured protocol contracts between domain agents (Frontend, Backend, Database, Integration, QA, SRE, Orchestrator).
- **Conflict Detection & Resolution:** Monitor domain boundary collisions (e.g. routing mismatches, port overlaps, permission loops) and trigger deterministic reconciliations.
- **Unified Telemetry Aggregation:** Collect real-time health, latency, active connections, and gate progress across all active agents.
- **Admin Hub Synchronization:** Surface multi-agent operational states and active tasks to the Admin UI (`/admin`) and CLI status runners (`scripts/status.ts`).
- **Invariant Guardian:** Verify that all agent operations adhere to zero hardcoded business data, tenant scoping (`outlet_id NOT NULL`), and integer minor units (`BIGINT`).

---

## 2. Key Tools & Contracts

- `agents/AGENT_REGISTRY.json` — System-wide agent directory
- `agents/task-board.json` — Cross-agent operational task board
- `agents/STATUS.md` — Multi-agent operational health board
- `apps/api/src/routes/admin.ts` (`GET /admin/agents/status`) — Real-time telemetry endpoint
- `apps/pos-web/pages/admin.tsx` — Live Multi-Agent Operations Board
- `brain/MULTI_AGENT_RESOLVER.md` — 5-Step diagnostic and resolution loop
