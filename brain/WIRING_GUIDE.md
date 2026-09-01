# KapMeta POS Platform — End-to-End Component Wiring Guide

**For:** Gemini, Claude & AI Coding Agents  
**Purpose:** Precise blueprint for wiring Frontend Pages <-> API Routes <-> Domain Services <-> PostgreSQL Schema.

---

## 1. Authentication & Session Wiring

```
[apps/pos-web/pages/login.tsx]
    │  POST /auth/login { email, password, outletId }
    ▼
[apps/api/src/routes/auth.ts]
    │  calls services/auth/src/index.ts (AuthService.login)
    ▼
[PostgreSQL: User, UserRole, Role, RolePermission]
    │  validates bcrypt hash, queries permissions
    ▼
[apps/api returns { accessToken, refreshToken, user: { userId, outletId, permissions } }]
    │  stored in window.localStorage ('kapmeta_pos_session')
    ▼
[apps/pos-web/lib/auth.ts (authedFetch, useAuthGuard)]
    │  injects Authorization: Bearer <accessToken> on all subsequent API calls
```

---

## 2. Order Creation, Kitchen Routing & Stock Deduction Wiring

```
[POS Register UI: apps/pos-web/pages/index.tsx]
    │  POST /orders (Headers: Authorization, Idempotency-Key)
    │  Body: { tableId, items: [{ menuItemId, quantity, modifiers }] }
    ▼
[API Gateway: apps/api/src/routes/orders.ts]
    │  resolves req.outletId from JWT
    │  calls services/orders/src/index.ts (OrderService.createOrder)
    ▼
[PostgreSQL: Order, OrderItem, OrderItemModifier]
    │  INSERT Order (Status: CONFIRMED), OrderItems in single transaction
    ▼
[API Gateway: apps/api/src/index.ts]
    │  emits `order.confirmed` { orderId, outletId } on Event Bus
    ▼
┌───────────────────────────────┴───────────────────────────────┐
▼                                                               ▼
[Kitchen Service: services/kitchen]              [WebSocket Server: apps/api/src/websockets.ts]
│  routes items to KitchenStation                │  broadcasts "kot.created" to connected KDS boards
│  creates KotTicket (Status: QUEUED)            ▼
│  dispatches ESC/POS print job                  [KDS UI: apps/pos-web/pages/kitchen.tsx]
▼                                                   (live ticket appears on screen)
[PostgreSQL: KotTicket, KotItem]
```

---

## 3. Order Completion & Inventory BOM Deduction

```
[Chef marks order SERVED on KDS or Cashier completes settlement]
    │  POST /finance/settle { orderId, payments: [{ method: "CASH", amount: 50000 }] }
    ▼
[Finance Service: services/finance/src/index.ts]
    │  computes 5% GST statutory tax breakdown
    │  INSERT Invoice, Payment; UPDATE Order Status: COMPLETED
    │  writes immutable AuditLog row in same transaction
    ▼
[API Gateway Event Bus: emits `order.completed` { orderId, outletId }]
    │
    ▼
[Inventory Stock Worker: services/inventory/src/stock-deduction.ts]
    │  queries recipes for all items in order
    │  deducts raw ingredient quantities from StockLedger
    ▼
[PostgreSQL: StockLedger (Append-Only consumption)]
```

---

## 4. 86-List (Out-of-Stock) Toggle Wiring

```
[Inventory UI: apps/pos-web/pages/inventory.tsx]
    │  POST /menu/items/:id/toggle-86 { isAvailable: false }
    ▼
[API Gateway: apps/api/src/routes/menu.ts]
    │  verifies permission: 'inventory.stock.adjust'
    │  calls services/menu/src/index.ts (MenuService.toggle86)
    ▼
[PostgreSQL: MenuItem.isAvailable = false + AuditLog written]
    │
    ▼
[WebSocket Hub: broadcasts "item.86_toggled" { menuItemId, isAvailable: false }]
    │
    ▼
[POS Register UI: apps/pos-web/pages/index.tsx]
    (menu item visually disabled and marked 'Sold Out' in real-time)
```
