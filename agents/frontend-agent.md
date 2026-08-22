# Frontend UI Agent Specification

**Role:** POS Web & Admin UI Engineer  
**Domain:** `apps/pos-web/` (Port 4444) & `apps/admin-web/` (Port 4445)  

---

## 1. Responsibilities

- Build and maintain touch-first UI components for Cashiers, Waiters, and Kitchen staff (44px touch targets).
- Interact with API Gateway on fixed port `http://localhost:4001` using `lib/auth.ts` (`authedFetch`).
- Render dynamic data from PostgreSQL (never hardcoded menu items or tables).
- Subscribe to real-time WebSocket channels (`/kitchen`, `/`) for live KOT tickets and 86-list deactivations.
- Enforce RBAC permission guards (`useAuthGuard`).

---

## 2. Key Files

- `apps/pos-web/pages/index.tsx` — POS Register Screen
- `apps/pos-web/pages/kitchen.tsx` — KDS Kitchen Display Board
- `apps/pos-web/pages/orders.tsx` — Live Orders & Tables
- `apps/pos-web/pages/inventory.tsx` — Stock Control & 86 toggles
- `apps/pos-web/pages/finance.tsx` — Billing & Settlement
- `apps/pos-web/pages/admin.tsx` — Category/Menu Ingestion
- `apps/pos-web/lib/auth.ts` — Authentication & Session Manager
