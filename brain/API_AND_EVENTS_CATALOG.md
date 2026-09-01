# KapMeta POS Platform — API Endpoints & Event Bus Catalog

**For:** Gemini, Claude & AI Coding Agents  

---

## 1. REST API Catalog (API Gateway Port 4001)

### Authentication (`/auth`)
- `POST /auth/login` — Authenticate with email, password, and outletId. Returns JWT access & refresh tokens.
- `GET /auth/me` — Returns authenticated user details, outlet metadata, assigned roles, and permission array.
- `POST /auth/verify-pin` — Verify 4-digit terminal unlock PIN against database hash.
- `POST /auth/switch-outlet` — Switch active outlet and mint new scoped token.
- `POST /auth/logout` — Revoke active session token in database.

### Menu & Catalog (`/menu`)
- `GET /menu/categories` — List all 28 hierarchical menu categories.
- `POST /menu/categories` — Dynamic creation of new menu category.
- `GET /menu/items` — List menu items with variants, modifier groups, and 86 status.
- `POST /menu/items` — Dynamic creation of new menu item with pricing.
- `POST /menu/items/:id/toggle-86` — Toggle 86 (out-of-stock) state and broadcast via WebSocket.

### Orders & Tables (`/orders`, `/tables`)
- `GET /tables` — Fetch real-time status (VACANT, OCCUPIED, BILLED) of all floor tables.
- `POST /orders` — Create new order with idempotency key. Emits `order.confirmed`.
- `GET /orders/:id` — Fetch full order details including line items, modifier options, and payments.
- `POST /orders/:id/cancel` — Cancel order with mandatory reason (writes audit log).

### Kitchen Operations (`/kitchen`)
- `GET /kitchen/tickets` — Fetch active kitchen tickets by station (Grill, Fryer, Bar, Pantry).
- `POST /kitchen/tickets/:id/status` — Advance KOT ticket state (`QUEUED` -> `PREPARING` -> `READY` -> `SERVED`).

### Finance & Billing (`/finance`)
- `POST /finance/settle` — Record split payments (Cash, Card, UPI), calculate 5% GST, and mark order COMPLETED.
- `POST /finance/refund` — Issue full or partial refund with audit trail.
- `GET /finance/z-report` — Generate daily shift close Z-report.

---

## 2. Asynchronous Event Bus Topics (`apps/api/src/events`)

| Event Name | Producer | Consumer(s) | Payload Structure |
|---|---|---|---|
| `order.confirmed` | `@kapmeta/orders` | `@kapmeta/kitchen` | `{ orderId: string, outletId: string, timestamp: string }` |
| `order.completed` | `@kapmeta/finance` | `@kapmeta/inventory`, `@kapmeta/crm` | `{ orderId: string, outletId: string, totalAmount: bigint }` |
| `item.86_toggled` | `@kapmeta/menu` | `@kapmeta/pos-web` (via WS) | `{ menuItemId: string, isAvailable: boolean, outletId: string }` |
| `kot.created` | `@kapmeta/kitchen` | `@kapmeta/pos-web` (via WS) | `{ kotTicketId: string, stationId: string, orderId: string }` |

---

## 3. WebSocket Topics (`ws://localhost:4001`)

- `/kitchen` — Real-time stream of incoming KOT tickets and status transitions for KDS screens.
- `/` — System-wide real-time broadcasts (86-list deactivations, table state changes, manager alerts).
