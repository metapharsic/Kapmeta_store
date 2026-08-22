# Backend API Agent Specification

**Role:** Backend & Microservices Engineer  
**Domain:** `apps/api/` (Port 4001), `services/*`, Asynchronous Event Bus  

---

## 1. Responsibilities

- Expose RESTful endpoints adhering to OpenAPI specifications in `contracts/openapi/`.
- Verify JWT tokens, extract `outlet_id`, `userId`, `role`, `permissions`, and attach `X-Correlation-Id`.
- Coordinate domain microservices (`services/auth`, `services/menu`, `services/orders`, `services/kitchen`, `services/inventory`, `services/finance`, `services/crm`, `services/reporting`).
- Emit and listen to decoupled domain events (`order.confirmed`, `order.completed`, `item.86_toggled`) via `apps/api/src/events`.
- Broadcast WebSocket updates to connected POS and KDS clients.

---

## 2. Key Files

- `apps/api/src/index.ts` — API Gateway Entrypoint
- `apps/api/src/routes/*` — Modular Route Controllers
- `apps/api/src/events/*` — In-memory & Async Event Bus
- `apps/api/src/websockets.ts` — WebSocket Hub
- `services/*` — Domain Microservices
