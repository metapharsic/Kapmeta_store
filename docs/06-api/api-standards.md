# API Standards

**Status:** PROPOSED · **Owner:** Backend Lead

## Conventions

- REST over HTTPS. Resource-plural paths: `/api/v1/orders/{orderId}`
- Versioned in the path. Breaking changes require a new version, never an in-place mutation.
- `snake_case` in JSON bodies; UUIDs as strings.
- Money: `{ "amount_minor": 24500, "currency": "INR" }`. Never a float.
- Timestamps: RFC 3339 UTC (`2026-08-08T10:15:30Z`).

## Required Headers

| Header | Use |
|--------|-----|
| `Authorization: Bearer <jwt>` | All authenticated calls |
| `X-Outlet-Id` | Outlet context; server validates against session grants |
| `X-Correlation-Id` | Propagated to logs, queue messages, downstream calls |
| `Idempotency-Key` | Required on all POST that create money or orders |

## Error Model

```json
{
  "error": {
    "code": "ORDER_ITEM_UNAVAILABLE",
    "message": "Item is not available on this channel",
    "details": [{ "field": "items[2].item_id", "value": "…" }],
    "correlation_id": "…"
  }
}
```

Codes are stable machine-readable strings. `message` is for operators, not end users — clients localize from `code`.

| Status | Use |
|--------|-----|
| 400 | Validation failure |
| 401 | Missing/invalid credentials |
| 403 | Authenticated but not permitted (includes wrong outlet) |
| 404 | Not found, or found but not visible to this outlet |
| 409 | State conflict (illegal status transition, version mismatch) |
| 422 | Business rule rejection |
| 429 | Rate limited |

## Pagination

Cursor-based: `?limit=50&cursor=<opaque>`. Response returns `next_cursor` (null at end). Offset pagination is not used on order/event tables.

## Idempotency

`Idempotency-Key` + request fingerprint stored for 24 h. A repeat with the same key returns the original response. A repeat with the same key but a different body returns 409.

## Rate Limits

Per user and per IP. Webhook endpoints are limited per channel account. Limits returned in `RateLimit-*` headers.

## Contracts

OpenAPI specs live in `contracts/openapi/`. CI validates that implementation matches spec — spec is the source of truth, not generated documentation of whatever shipped.
