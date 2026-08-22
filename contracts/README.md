# Kapmeta API Contracts

This directory contains the OpenAPI 3.0.3 contract for the Kapmeta backend, split one
file per domain. Each file is a complete, independently loadable OpenAPI document
(`openapi: 3.0.3`, `info`, `servers`, `paths`, `components`) that also `$ref`s shared
definitions out of `common.yaml` where sensible, so common concepts (Money, pagination,
errors, the `X-Outlet-Id` header, auth) stay defined in exactly one place.

## Files

| File | Domain | Screen(s) |
|---|---|---|
| `common.yaml` | Shared components — Money, Pagination, ErrorResponse, OrderStatus enum, `X-Outlet-Id` header, bearer-JWT auth/roles, AuditLogEntry | (cross-cutting) |
| `tables.yaml` | Tables, floor sessions, move-KOT | Table/Floor View |
| `orders.yaml` | Orders, order items, split, print, cancel, grand-total override | Order Entry/Billing, Order History |
| `menu.yaml` | Menu categories/items admin, POS menu tree, channel status, OOS availability | OOS + Menu Availability, Order Entry (menu tree) |
| `tax.yaml` | Taxes, tax-channel rules | Tax Master |
| `settings.yaml` | Outlet billing settings, outlet print settings, payment types | Billing + Print Config |
| `reporting.yaml` | Day summary, item report, report column preferences | Day Summary + Item Report |
| `aggregator-webhooks.yaml` | Swiggy/Zomato inbound webhooks, food-ready (MFR) single + bulk | Online Live Feed |
| `admin.yaml` | Destructive/system admin actions (bill number reset, sync code reset, DB migration, order/KOT purge, backup purge, logs, machine/sync topology) | System Config + App Shell |

## Versioning

All endpoints are served under the `/v1` path prefix (see each file's `servers` block,
e.g. `https://api.kapmeta.com/v1`). Breaking changes to any resource shape will ship as
`/v2` of the affected domain file(s) rather than mutating `/v1` in place; additive,
backward-compatible changes (new optional fields, new endpoints) may land in `/v1`
directly.

## Design decisions encoded in these contracts

- **order_status** is the canonical enum `open | running | printed | paid | cancelled`.
  `kot_sent` is tracked as a separate boolean, not folded into the status enum, since a
  KOT can be sent while an order is still `open` or `running`.
- **Money fields** are standardized as `subtotal_amount`, `tax_amount`,
  `discount_amount`, `grand_total_amount` everywhere an order carries totals.
- **`outlet_id`** (or the `X-Outlet-Id` header) is required on nearly every request —
  the schema is multi-outlet-ready even though v1 UI targets a single outlet per
  deployment.
- **Tax model** supports channel-scoped tax rows (`tax-channel-rules`), distinguishing
  `dine_in` vs online channels and `forward` vs `backward` tax computation.
- **Grand-total override** is a dedicated, audited `POST /orders/{id}/override-total`
  endpoint (not a silent `PATCH`), requiring a `reason` field and always producing an
  `order_audit_log` entry — see the design note at the top of `orders.yaml`.
- **Bulk "mark food ready"** (`POST /orders/aggregator/mark-food-ready-bulk`) returns a
  per-order result array so partial failure is visible, never swallowed into a single
  pass/fail flag.
- **All `admin.yaml` endpoints** are destructive or sensitive by nature (bill number
  reset, sync code reset, DB migration, order/KOT/backup purges). Each requires
  `role: admin`, an explicit `confirm: true` request-body field, and always returns an
  `audit_log_entry` — closing the "one-click, no confirmation" hardening gap found in
  the reference application during the Phase 12-15 hardening review.
- **No hardcoded business/tenant data**: every configurable concept referenced by a
  screen (tables, menu, taxes, billing/print settings, payment types, report column
  preferences) is backed by a real CRUD API in this contract, per project rule.

## Contract testing

These specs are written to be directly usable with contract-testing tooling — Dredd,
Prism (mock server + proxy validation), or Schemathesis — once real implementations
exist behind them:

- Every operation has an `operationId`, realistic status codes (`200`/`201`/`400`/
  `401`/`403`/`404`/`409` as applicable), and concrete request/response JSON Schemas
  (no bare `{}` bodies), so generated mocks and response validators have something
  real to check against.
- Run `swagger-cli bundle` (or equivalent) per file to resolve the `common.yaml` `$ref`s
  into a single document if your tooling doesn't resolve cross-file refs natively.
- Suggested first pass: `prism mock orders.yaml` (after bundling) to stand up a mock
  server, then point a Dredd run at it with example request bodies drawn from the
  schemas above to validate hooks before wiring the real backend.
