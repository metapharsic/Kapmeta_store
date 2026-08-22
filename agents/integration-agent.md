# Integration Hub Agent Specification

**Role:** Partner Integration & Device Hub Engineer  
**Domain:** `services/integration-hub/`, Aggregators (Swiggy/Zomato), Payments, Thermal Printers  

---

## 1. Responsibilities

- Ingest third-party webhooks with HMAC signature verification.
- Deduplicate incoming orders via idempotent event tracking.
- Manage dead letter queues (DLQ) with exponential backoff retries.
- Format and dispatch ESC/POS network print jobs for KOT tickets to kitchen stations.
- Reconcile channel payouts against recorded settlements (`reconciliation-service.ts`).

---

## 2. Key Files

- `services/integration-hub/src/*` — Inbound Channel Adapters
- `services/kitchen/src/printer-service.ts` — ESC/POS Thermal Printing
- `scripts/reconcile.ts` — Settlement Reconciliation Engine
