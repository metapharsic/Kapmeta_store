# API Contracts

Spec is the source of truth. Implementation follows the spec; CI fails when they diverge.

---

## ⚠️ `openapi.yaml` Is Superseded

This folder briefly held two conflicting descriptions of the same API. Resolved 2026-08-08:
the **modular set** (`common.yaml` + `auth.yaml` + `menu.yaml` + `orders.yaml` + `kitchen.yaml`)
is authoritative because it matches [`docs/06-api/api-standards.md`](../../docs/06-api/api-standards.md)
exactly — OpenAPI 3.1.0, `snake_case` bodies, cursor pagination, required `X-Outlet-Id` /
`X-Correlation-Id` / `Idempotency-Key` headers.

`openapi.yaml` (OpenAPI 3.0.3, camelCase, `/kitchen/kots`, partial headers) is marked
SUPERSEDED in its own `info.description` and kept only as a reference. **Do not implement or
generate clients against it.** A follow-up ADR should formally retire the file — per the
artifact registry, we supersede rather than delete, so it stays until that ADR lands.

---

## Inventory

| File | Scope | Status |
|------|-------|--------|
| `common.yaml` | Error model, pagination, headers, money, audit fields, shared enums | ✅ written |
| `auth.yaml` | Login, refresh, MFA, PIN shift switch, sessions, elevation | ✅ written |
| `menu.yaml` | Categories, items, variants, modifiers, availability, channel sync | ✅ written |
| `orders.yaml` | Order CRUD, transitions, cancellation, refund initiation | ✅ written |
| `kitchen.yaml` | KOT tickets, item completion, reprint, stations, routes | ✅ written |
| `openapi.yaml` | Standalone aggregate spec | ⚠️ conflicts with the above |
| `payments.yaml` | Payment/refund enums, order-payment linkage, read-only payment views. Capture, gateways, settlement — **blocked — DEC-005** | ✅ written (blocked scope) |
| `inventory.yaml` | Ingredient master, stock locations, read-only stock balances, generic (non-consumption) stock movements. Recipes, consumption trigger, shortage handling — **blocked — DEC-003** | ✅ written (blocked scope) |
| `reporting.yaml` | Operational (real-time) counts only: live orders, pending KOTs, integration failures. Sales/KPI/finance layers — **blocked — DEC-009** | ✅ written (blocked scope) |
| `webhooks.yaml` | Generic inbound webhook envelope: signature, raw persistence, idempotency, quarantine/replay. Aggregator- and gateway-specific payloads — **blocked — DEC-007, DEC-005** | ✅ written (blocked scope) |

The four specs above are deliberately written as SKELETONS: only the gateway/aggregator/formula-
agnostic surface is modelled. Each file's `info.description` states exactly which endpoints, fields
and payload shapes are withheld and which DEC blocks them. Writing the blocked business logic itself
would encode invented tax rules, gateway shapes and KPI formulas — the exact failure the decision
register exists to prevent.

---

## What The Written Specs Deliberately Omit

| Omission | Blocked by |
|----------|-----------|
| Tax fields on order totals | DEC-004 |
| Discount codes and stacking rules | DEC-008 |
| Payment capture / gateway shapes | DEC-005 |
| Offline replay and reconciliation endpoints | DEC-002 |
| Wastage records on post-KOT cancellation | DEC-003 |
| Printer configuration | DEC-006 |

Each is marked in the relevant file's `info.description`. Do not fill these in without the decision.

---

Conventions: [`docs/06-api/api-standards.md`](../../docs/06-api/api-standards.md).
Async event schemas: [`contracts/events/`](../events/).

```bash
npm run contracts:validate
```
