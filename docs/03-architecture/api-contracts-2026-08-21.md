# 06 — API Contract Design

Status: Draft (Phase 2-3 architecture deliverable). Feeds `contracts/*.yaml`.
Owner: Platform/API architecture. Depends on: docs/03-domain-model (assumed), docs/05-events (assumed).
Date: 2026-08-21.

This document is a **spec-of-specs**: it enumerates every contract file to be created under `contracts/`, and for each of the 13 validated KapMeta feature areas lists concrete endpoints with method, path, purpose, auth/role, and key request/response fields — enough for an engineer to start writing OpenAPI and handlers. It is not itself the OpenAPI source of truth.

All business data (menu items, prices, taxes, print text, outlets, payment types, roles-to-permissions) referenced by these endpoints is DB-backed per CLAUDE.md's no-hardcode rule. Where an endpoint is explicitly the write-path for such data, this is called out.

---

## 1. Contract files under `contracts/`

| File | Scope |
|---|---|
| `contracts/auth.yaml` | Login, token refresh/rotation, session/logout, current-user/permissions introspection. Single-outlet and multi-outlet auth (multi-outlet flagged as unverified — see Open Questions). |
| `contracts/tables.yaml` | Floor/zone/table CRUD, table status transitions, table occupancy (elapsed time, running amount), move-KOT/move-items between tables, table→delivery/pickup conversion. |
| `contracts/orders.yaml` | Order lifecycle (create/build ticket, add/edit/remove line items, split bill, advance/future orders), KOT generation, bill generation, print/e-bill triggers, order history search/list/reprint/edit-with-audit. |
| `contracts/menu-sync.yaml` | Tenant menu catalog CRUD (categories, items, addons, modifiers, online_display_name), and the outbound "push menu to aggregator" sync jobs + their status. Distinct from availability.yaml (menu-sync = content, availability = on/off state). |
| `contracts/availability.yaml` | Per-item / per-addon online availability toggles (bulk and single), per-channel (Swiggy/Zomato/dine-in), and Out-of-Stock marking with multi-channel fan-out. |
| `contracts/aggregator-webhooks.yaml` | Inbound webhook endpoints Swiggy/Zomato call into Kapmeta (new order, status change, menu-sync ack, OOS ack), plus the outbound client wrapper contracts (accept order, mark ready, mark OOS, contact support) as a separate "aggregator-outbound" section within the same file since both sides share the same order/channel model. |
| `contracts/tax.yaml` | Tax Master CRUD — tax rows with type (Backward/Forward), rate, channel_scope (dine-in vs online), outlet association. |
| `contracts/settings.yaml` | Billing screen configuration CRUD (default order/payment type, delivery/container/service charge rules, tax timing, discount basis), Bill/KOT print configuration CRUD (toggles + header/footer/text fields), payment-type master CRUD. |
| `contracts/reports.yaml` | Day-end payment-type summary, complimentary-orders rollup, sales-returns rollup, Item Report (grouped by category, selectable columns, time range, export). All read-only. |
| `contracts/admin.yaml` | Restaurant/system configuration CRUD, reset bill number sequence, reset sync code, trigger DB migration, wipe orders/KOT (destructive + guarded), remove backup files, view logs, connected-machines/sync topology view. |

Global shell actions (feature 13) are not a separate file — they are thin compositions of endpoints already defined in `orders.yaml`, `availability.yaml`, `admin.yaml`, and `auth.yaml`; see §2.13.

All files share `contracts/common/` components: `Error`, `Pagination`, `Money`, `OutletContext`, `AuditFields` schemas, referenced via `$ref`.

**Path convention:** outlet-scoped resources live under `/api/v1/outlets/{outletId}/...`. Tenant-global resources (e.g. cross-outlet admin, aggregator webhook ingress) live under `/api/v1/...` without outlet, or under `/api/v1/tenants/{tenantId}/...` where tenant scope matters. All webhook ingress paths are outlet-scoped since KapMeta/Swiggy/Zomato route per store.

---

## 2. Feature-area endpoint inventories

Role shorthand: `cashier`, `kitchen`, `manager`, `admin`, `system` (service-to-service, e.g. webhook ingestion, sync jobs). See §4 for the full model.

### 2.1 Table/Floor View

- `GET /api/v1/outlets/{outletId}/zones` — list zones. Roles: cashier+.
- `GET /api/v1/outlets/{outletId}/tables?zoneId=&status=` — list tables with live status (vacant/occupied/dirty/reserved), `elapsedMinutes`, `runningAmount`, current `orderId`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/tables` — add table `{zoneId, name, capacity}`. Roles: manager+.
- `PATCH /api/v1/outlets/{outletId}/tables/{tableId}` — edit table (rename, capacity, zone move). Roles: manager+.
- `DELETE /api/v1/outlets/{outletId}/tables/{tableId}` — remove table (soft delete). Roles: manager+.
- `POST /api/v1/outlets/{outletId}/tables/{tableId}/move-kot` — move a KOT (or item subset) to another table `{targetTableId, kotId, itemIds?}`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/convert` — switch dine-in order to delivery/pickup `{newOrderType, deliveryDetails?}`. Roles: cashier+.

Key response fields for table list item: `id, zoneId, name, status, elapsedMinutes, runningAmount, orderId, capacity`.

### 2.2 Order Entry / Billing

- `GET /api/v1/outlets/{outletId}/menu/categories` — category tree with items (DB-backed, no-hardcode source). Roles: cashier+.
- `GET /api/v1/outlets/{outletId}/menu/items?categoryId=` — items with price, tax refs, addon groups. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders` — create order `{orderType: dine_in|delivery|pickup, tableId?, customer: {mobile, name, address?, locality?}?}`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/items` — add line item(s) `{itemId, qty, addons[], notes}`. Roles: cashier+.
- `PATCH /api/v1/outlets/{outletId}/orders/{orderId}/items/{lineId}` — edit qty/addons/notes. Roles: cashier+.
- `DELETE /api/v1/outlets/{outletId}/orders/{orderId}/items/{lineId}` — remove line item. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/split` — split bill `{strategy: equal|by_item, parts: n | itemAssignments[]}` → returns child order/bill ids. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/advance` — mark as advance/future order `{scheduledFor}`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/kot` — generate/print KOT. Roles: cashier+, kitchen (read).
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/bill` — generate bill (locks priced total using tax/settings config). Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/print` — send bill/KOT to print queue `{target: bill|kot|ebill}`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/ebill` — generate e-bill link/SMS. Roles: cashier+.

Order object key fields: `id, outletId, orderType, status, tableId?, customer?, lineItems[], taxes[], charges[], grandTotal, kotIds[], billId?`.

### 2.3 Online Order Live Feed (Swiggy/Zomato)

- `GET /api/v1/outlets/{outletId}/live-orders?channel=swiggy,zomato&status=` — feed of aggregator order cards: `{orderId, channel, kotNo, billNo, otp, riderStatus, prepareInSeconds, status}`. Roles: cashier, kitchen, manager+.
- `GET /api/v1/outlets/{outletId}/live-orders/{orderId}` — full detail incl. items, customer masked contact. Roles: cashier+, kitchen.
- `POST /api/v1/outlets/{outletId}/live-orders/{orderId}/call-customer` — proxy-call via aggregator masked number `{}` → returns dial token/URL. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/live-orders/{orderId}/contact-platform-support` — opens support ticket/channel with Swiggy/Zomato `{reason}`. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/live-orders/{orderId}/mark-food-ready` — `{}` → calls aggregator outbound API (see 2.6). Roles: kitchen, cashier+.
- `POST /api/v1/outlets/{outletId}/live-orders/{orderId}/mark-oos` — shortcut into OOS flow scoped to this order's items; see 2.4.
- (Ambiguous "MFR" bulk button — see Open Questions; provisionally `POST /api/v1/outlets/{outletId}/live-orders/bulk-mark-food-ready {orderIds[]}`, flagged TODO pending confirmation of actual behavior.)

### 2.4 Mark Out-of-Stock

- `POST /api/v1/outlets/{outletId}/menu/items/{itemId}/oos` — `{scope: order|all, orderId?, allowAlternatePick: bool, propagateToChannels: ["swiggy","zomato"], reason?, durationMinutes?}`. Roles: cashier+, manager+.
  - Response: `{itemId, oosId, effectiveScope, channelFanoutResults: [{channel, status, externalRef?, error?}]}`.
  - Internally publishes `menu_item.availability_changed` (see §3) which `services/aggregator-orders` consumes to call Swiggy/Zomato OOS APIs; endpoint response includes fan-out result per channel (may be async — see note).
- `DELETE /api/v1/outlets/{outletId}/menu/items/{itemId}/oos/{oosId}` — restore item, re-propagates fan-out. Roles: manager+.
- `GET /api/v1/outlets/{outletId}/menu/items/oos` — list currently OOS items with scope/channel state. Roles: cashier+.

Fan-out is modeled as async-with-sync-best-effort: the endpoint attempts synchronous calls to both platforms with a short timeout, returns partial results immediately, and any that time out are retried by a consumer of `menu_item.availability_changed`; final state surfaces via `GET .../oos`.

### 2.5 Menu Online-Availability Manager

- `GET /api/v1/outlets/{outletId}/menu/availability?channel=swiggy|zomato|dine_in` — item+addon availability matrix. Roles: manager+.
- `PATCH /api/v1/outlets/{outletId}/menu/availability` — bulk toggle `{channel, itemIds[]?, addonIds[]?, enabled: bool}`. Roles: manager+.
- `PATCH /api/v1/outlets/{outletId}/menu/items/{itemId}` — edit item incl. `onlineDisplayName` per channel `{onlineDisplayNames: {swiggy?, zomato?}}`. Roles: manager+.
  - This PATCH is itself the "admin UI writes to DB table" mechanism for online display names — no hardcoded channel-facing names in code.

### 2.6 Aggregator Outbound (paired with 2.3/2.4/2.11 webhooks)

- `POST /internal/aggregator/{channel}/orders/{externalOrderId}/accept` — system-role, called by order-accept flow.
- `POST /internal/aggregator/{channel}/orders/{externalOrderId}/mark-ready`
- `POST /internal/aggregator/{channel}/items/{externalItemId}/oos`
- `POST /internal/aggregator/{channel}/support/contact`

These are internal service-to-service wrappers around Swiggy/Zomato partner APIs, invoked by `services/aggregator-orders` in response to the customer-facing endpoints above (2.3, 2.4) or by event consumers. Not exposed directly to pos-web.

### 2.7 Order History

- `GET /api/v1/outlets/{outletId}/orders?type=&billNo=&kotNo=&dateFrom=&dateTo=&status=&q=` — search/filter/list. Roles: cashier+ (own shift), manager+ (all).
- `GET /api/v1/outlets/{outletId}/orders/{orderId}` — full order detail incl. audit trail. Roles: cashier+.
- `POST /api/v1/outlets/{outletId}/orders/{orderId}/reprint` — `{target: bill|kot}`. Roles: cashier+ (TODO: confirm same or different permission from edit — see Open Questions; provisionally same role gate as view, distinct from edit).
- `PATCH /api/v1/outlets/{outletId}/orders/{orderId}` — edit incl. grand total override `{grandTotalOverride, reason}` — **mandatory `reason` field, mandatory audit log write** `{editedBy, editedAt, before, after, reason}`. Roles: manager+.

### 2.8 Billing Screen Configuration

- `GET /api/v1/outlets/{outletId}/settings/billing` — current config. Roles: manager+.
- `PUT /api/v1/outlets/{outletId}/settings/billing` — full replace `{defaultOrderType, defaultPaymentType, deliveryChargeRule, containerChargeRule, serviceChargeRule, taxTimingRule: pre_discount|post_discount, discountCalcBasis: subtotal|subtotal_plus_tax}`. Roles: admin.
- `PATCH /api/v1/outlets/{outletId}/settings/billing` — partial update, same fields. Roles: admin.

This is the DB write-path required by CLAUDE.md for all billing-behavior config — no per-outlet rule may be a code literal.

### 2.9 Bill/KOT Print Configuration

- `GET /api/v1/outlets/{outletId}/settings/print` — current template config (the ~13 toggles + text fields). Roles: manager+.
- `PUT /api/v1/outlets/{outletId}/settings/print` — full replace `{toggles: {showLogo, showTaxBreakup, showItemHsn, showAddress, showFssai, showTableNo, showWaiterName, showCustomerGst, showQrCode, showOrderNo, mergeSameItems, showKotNote, showAllergenInfo /* exact 13 TBD from screenshots, structural keys are code constants, values are DB */}, header, footer, restaurantNameOverride, newCustomerMessage}`. Roles: admin.
- `PATCH /api/v1/outlets/{outletId}/settings/print` — partial update. Roles: admin.

Toggle *keys* are structural (enum-like, code-defined) per CLAUDE.md's exemption; toggle *values* and all text fields are tenant data and MUST persist in `db` via this endpoint, never inlined into print templates.

### 2.10 Tax Master

- `GET /api/v1/outlets/{outletId}/taxes?channelScope=dine_in|online` — list. Roles: manager+.
- `POST /api/v1/outlets/{outletId}/taxes` — create `{name, type: backward|forward, rate, channelScope, appliesTo: category|item|order}`. Roles: admin.
- `PATCH /api/v1/outlets/{outletId}/taxes/{taxId}` — edit. Roles: admin.
- `DELETE /api/v1/outlets/{outletId}/taxes/{taxId}` — soft delete (retain for historical order integrity). Roles: admin.

Note: dine-in and online tax records at the same nominal rate (e.g. 2.5%+2.5%) are deliberately **separate rows**, matched by `channelScope`, per the confirmed screenshot finding — never conflate by rate value alone.

### 2.11 Day-End Payment-Type Summary

- `GET /api/v1/outlets/{outletId}/reports/day-end-summary?date=` — `{byPaymentType: [{paymentTypeId, label, total, orderCount}], complimentary: {total, orderCount}, salesReturns: {total, orderCount}}`. Roles: manager+.
- `GET /api/v1/outlets/{outletId}/settings/payment-types` — payment type master (labels are tenant-configurable, e.g. "Room Service"). Roles: manager+.
- `POST /api/v1/outlets/{outletId}/settings/payment-types` — add custom payment type `{label, code}`. Roles: admin.
- `PATCH /api/v1/outlets/{outletId}/settings/payment-types/{id}` — edit/deactivate. Roles: admin.

Payment-type labels are DB rows per no-hardcode rule — report grouping must join against this table, never a switch statement on literal strings.

### 2.12 Item Report

- `GET /api/v1/outlets/{outletId}/reports/items?dateFrom=&dateTo=&categoryId=&columns=qty,revenue,tax,discount,netSales` — grouped-by-category report, `columns` selects which metrics to include. Roles: manager+.
- `GET /api/v1/outlets/{outletId}/reports/items/export?format=xlsx&...same filters` — export. Roles: manager+.

### 2.13 Restaurant/System Configuration & Admin Ops

- `GET /api/v1/outlets/{outletId}/settings/restaurant` / `PUT .../restaurant` — restaurant profile config (name, address, FSSAI, GST, contact). Roles: admin.
- `POST /api/v1/outlets/{outletId}/admin/reset-bill-sequence` — `{confirmationToken, newStartValue}`. **Destructive-adjacent; requires `confirmationToken`** (short-lived token obtained via a preceding `POST .../admin/reset-bill-sequence/confirm-intent` that returns the token after re-auth). Roles: admin.
- `POST /api/v1/outlets/{outletId}/admin/reset-sync-code` — `{confirmationToken}`. Roles: admin.
- `POST /api/v1/outlets/{outletId}/admin/trigger-migration` — `{confirmationToken, targetVersion?}`. Roles: admin (system-level; likely gated further to a super-admin role, see §4).
- `POST /api/v1/outlets/{outletId}/admin/wipe-orders` — **most destructive op**. `{confirmationToken, confirmationPhrase: "WIPE {outletId}", reason}`. Roles: admin only, MUST require re-auth (password/OTP re-entry) to mint `confirmationToken`, MUST write an irreversible audit record before executing, SHOULD require a fresh DB backup confirmation flag `{backupConfirmed: true}`. Roles: admin.
- `DELETE /api/v1/outlets/{outletId}/admin/backups/{backupId}` — remove backup file. Roles: admin.
- `GET /api/v1/outlets/{outletId}/admin/logs?level=&from=&to=` — view logs. Roles: admin.
- `GET /api/v1/outlets/{outletId}/admin/machines` — connected machines (server/client sync topology): `{serverIp, clients: [{machineId, ip, lastSeenAt, role: server|client}]}`. Roles: admin.

All destructive endpoints share a common `confirmationToken` pattern: a two-step flow (`POST .../confirm-intent` → short-TTL token → `POST .../execute` with token) defined once in `contracts/common/destructive-action.yaml` and referenced by admin.yaml, rather than reimplemented per endpoint.

### 2.13b Global Shell Actions (feature 13)

Compositions, not new resources:
- New order → `POST /api/v1/outlets/{outletId}/orders` (2.2).
- Search by bill/KOT no → `GET .../orders?billNo=` / `?kotNo=` (2.7), surfaced as the top-nav global search.
- Item on/off shortcut → `PATCH .../menu/availability` (2.5) with single-item payload.
- "Store" open/close toggle → `PATCH /api/v1/outlets/{outletId}/settings/restaurant {storeStatus: open|closed}` (new field on 2.13's restaurant settings; flagged TODO to confirm this is the correct semantic — see Open Questions).
- Live view → `GET .../live-orders` (2.3) + `GET .../tables` (2.1), likely composed client-side or via a `GET .../dashboard/live` aggregate endpoint (optional, non-blocking addition).
- Alerts feed → `GET /api/v1/outlets/{outletId}/alerts` (new lightweight resource, backed by an events-derived table; TODO to enumerate alert types once event catalog is finalized).
- Logout/auth → `contracts/auth.yaml` (§2.14 / §4).

### 2.14 Auth

- `POST /api/v1/auth/login` — `{username, password}` → `{accessToken, refreshToken, user, roles[], outletIds[]}`. Roles: public.
- `POST /api/v1/auth/refresh` — `{refreshToken}` → new access token. Roles: authenticated.
- `POST /api/v1/auth/logout` — invalidate refresh token. Roles: authenticated.
- `GET /api/v1/auth/me` — current user, roles, permission keys, accessible outlets. Roles: authenticated.

---

## 3. Async / event schema

Events are the integration seam between `services/orders`, `services/sync`, `services/aggregator-orders`, and pos-web's live views. Transport assumed to be an internal event bus (exact tech TBD in infra doc); this section fixes **names and payload shapes** only.

| Event | Publisher | Consumers | Payload (key fields) |
|---|---|---|---|
| `order.placed` | services/orders | services/sync, services/aggregator-orders (for outbound accept), kitchen display, reports | `{eventId, outletId, orderId, orderType, channel: pos\|swiggy\|zomato, lineItems[], grandTotal, placedAt}` |
| `order.status_changed` | services/orders | pos-web (live feed via websocket bridge), services/aggregator-orders (to push status to platform), reports | `{eventId, outletId, orderId, fromStatus, toStatus, changedAt, changedBy}` |
| `order.edited` | services/orders | reports, audit log store | `{eventId, outletId, orderId, editedBy, fields: [{field, before, after}], reason, editedAt}` |
| `menu_item.availability_changed` | services/menu (via 2.4/2.5 endpoints) | services/aggregator-orders (fan-out to Swiggy/Zomato), services/sync | `{eventId, outletId, itemId, addonId?, scope: order\|all, channel: dine_in\|swiggy\|zomato\|all, enabled: bool, reason?}` |
| `sync.outlet_pushed` | services/sync | admin.yaml consumers (status polling), monitoring | `{eventId, outletId, syncType: menu\|availability\|settings, status: success\|partial\|failed, channelResults: [{channel, status, error?}], pushedAt}` |
| `webhook.aggregator_order_received` | services/aggregator-orders (on inbound webhook) | services/orders (creates internal order), live feed | `{eventId, outletId, channel, externalOrderId, rawPayloadRef, receivedAt}` |
| `webhook.aggregator_status_received` | services/aggregator-orders | services/orders | `{eventId, outletId, channel, externalOrderId, externalStatus, mappedStatus, receivedAt}` |
| `oos.fanout_completed` | services/aggregator-orders | admin/monitoring, pos-web (toast/confirmation) | `{eventId, outletId, itemId, channelResults: [{channel, status, externalRef?, error?}], completedAt}` |

Convention: every event carries `eventId` (UUID, idempotency key for consumers), `outletId`, and an ISO-8601 timestamp field. `services/aggregator-orders` is both a publisher (on inbound webhook) and consumer (for outbound fan-out) — it is the boundary service for both directions of aggregator integration.

---

## 4. Auth & permissions model

Proposed roles (structural, code-defined enum — permitted under CLAUDE.md's exemption for permission keys):

| Role | Summary |
|---|---|
| `cashier` | Order entry, billing, table ops, live feed view/action, OOS mark on own orders, reprint. |
| `kitchen` | KOT view, mark food ready, live feed view (kitchen-relevant subset). |
| `manager` | Everything cashier can, plus: order edit/grand-total-override, availability bulk toggles, reports (read), table CRUD. |
| `admin` | Everything manager can, plus: tax master, billing/print settings CRUD, payment-type CRUD, restaurant config, destructive ops (reset sequence, wipe orders, migrations, backups, logs, machines view). |
| `system` | Non-human. Used by webhook ingress, sync jobs, internal service-to-service calls (2.6, event consumers). Never issued to a browser session. |

Design principle per CLAUDE.md: **permission keys** (e.g. `orders.edit.override_total`, `admin.wipe_orders`, `menu.availability.bulk_toggle`) are structural constants defined in code — they map 1:1 to code paths/endpoints and don't change per tenant, so they're exempt from the no-hardcode rule. The **role → permission-key mapping** is NOT hardcoded: it lives in a `role_permissions` DB table, editable via an admin UI (`PATCH /api/v1/tenants/{tenantId}/roles/{roleId}/permissions {permissionKeys: [...]}`, to be added to `auth.yaml`), so a tenant admin can adjust what "manager" is allowed to do without a code change. Every endpoint in §2 is gated by permission key, not by role name directly, e.g. the reprint endpoint checks `orders.reprint`, edit checks `orders.edit.override_total` — these may or may not be the same key (see Open Questions).

Multi-outlet: `auth/me` returns `outletIds[]`; every outlet-scoped endpoint must verify the caller's token carries the target `{outletId}` in its outlet claim set. Exact model (can one user hold different roles per outlet?) is unverified — see Open Questions.

---

## 5. Versioning & webhook security

**API versioning:** all paths prefixed `/api/v1/`. Breaking changes require a new prefix (`/api/v2/`); additive fields/endpoints ship within v1. Deprecation via `Sunset` header + changelog entry, minimum 90-day notice before removal.

**Webhook security (Swiggy/Zomato → Kapmeta):**
- Each aggregator webhook endpoint (`contracts/aggregator-webhooks.yaml`) requires HMAC-SHA256 signature verification: platform signs the raw request body with a per-outlet shared secret (stored in `outlet_integration_credentials` table, never in code/config files), sent as a header (`X-Swiggy-Signature` / `X-Zomato-Signature`).
- Server recomputes HMAC over the raw (unparsed) body and does a constant-time comparison before touching the payload; mismatch → `401` and no processing.
- Timestamp/nonce check to reject replay (reject if `abs(now - payloadTimestamp) > 5 minutes`).
- All inbound webhook calls are logged with raw payload retained (for replay/debug) referenced by `rawPayloadRef` in `webhook.aggregator_order_received`.
- Outbound calls to Swiggy/Zomato (2.6) use per-outlet API keys from the same credentials table, rotated via `admin/reset-sync-code`-style flow (TBD whether shared with sync code or separate — flag as open question if not already resolved in an integrations doc).

---

## 6. Postman collection outline

```
Kapmeta API.postman_collection.json
├── Auth
│   ├── Login
│   ├── Refresh
│   ├── Logout
│   └── Me
├── Tables & Floor
│   ├── List Zones / Tables
│   ├── Add / Edit / Delete Table
│   └── Move KOT / Convert Order Type
├── Order Entry & Billing
│   ├── Menu Browse
│   ├── Create Order / Add Items
│   ├── Split Bill / Advance Order
│   └── KOT / Bill / Print / E-bill
├── Live Feed (Aggregators)
│   ├── List / Get Live Orders
│   ├── Call Customer / Contact Support
│   └── Mark Food Ready
├── Out-of-Stock & Availability
│   ├── Mark/Unmark OOS
│   ├── List OOS
│   └── Bulk Availability Toggle
├── Order History
│   ├── Search / Filter
│   ├── Reprint
│   └── Edit (Grand Total Override)
├── Settings — Billing
├── Settings — Print
├── Tax Master
├── Reports
│   ├── Day-End Summary
│   └── Item Report (+ Export)
├── Admin
│   ├── Restaurant Config
│   ├── Reset Bill Sequence (2-step: confirm-intent → execute)
│   ├── Wipe Orders (2-step)
│   ├── Backups / Logs / Machines
├── Aggregator Webhooks (inbound, for sandbox simulation)
│   ├── Swiggy: New Order / Status Change
│   └── Zomato: New Order / Status Change
└── _environments
    ├── local.postman_environment.json
    ├── staging.postman_environment.json
    └── prod.postman_environment.json (read-only tests only)
```

Each request-level folder should include a pre-request script that fetches/refreshes the auth token from environment variables, and the destructive-admin folder should keep the two-step confirm/execute calls chained via Postman's collection runner with the token passed between them.

---

## 7. Open questions (carried from discovery, not resolved here)

1. **"MFR" bulk button on live orders** — meaning unconfirmed. Provisional endpoint `POST .../live-orders/bulk-mark-food-ready` drafted in §2.3 as a guess (Mark Food Ready, bulk); needs screenshot re-review or client confirmation before finalizing in `contracts/orders.yaml`.
2. **Reprint vs edit permission** — modeled provisionally as distinct permission keys (`orders.reprint` vs `orders.edit.override_total`) in §2.7/§4; needs product confirmation on whether KapMeta treats them as one permission.
3. **Multi-outlet auth model** — only one outlet ("Hotel kapila") was captured in screenshots. §4's `outletIds[]`-on-token model is a reasonable default but unverified against real multi-outlet tenant behavior (e.g., can a role differ per outlet for the same user?). Needs confirmation before `auth.yaml` is finalized.
4. **"Store" toggle semantics** (§2.13b) — assumed open/closed for accepting new orders; not confirmed against screenshots which only showed the shortcut icon, not its effect.
5. **Print config's exact 13 toggles** — this doc used a placeholder set of 13 in §2.9; needs the actual screenshot-derived list substituted before `contracts/settings.yaml` is written.
6. **Sync-code vs aggregator API key rotation** — unclear whether `admin/reset-sync-code` (LAN server/client sync) is the same credential family as Swiggy/Zomato API keys (§5) or entirely separate; treat as separate until confirmed, since conflating them risks breaking POS LAN sync while rotating aggregator creds.
7. **Alerts feed content model** — no event catalog yet maps cleanly to "alert" types; `GET .../alerts` in §2.13b is a stub pending that catalog.
