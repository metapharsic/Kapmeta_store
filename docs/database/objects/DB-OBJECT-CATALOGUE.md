# DB-CAT — Database Object Catalogue

**ID:** DB-CAT · **Status:** APPROVED · **Owner:** DBA · **Version:** 2.0 · **Updated:** 2026-08-09
**Traces to:** `kapmeta/schema.prisma` · **Traced by:** `db/migrations/`
**Gate:** CP-02

Every table in `kapmeta/schema.prisma` (50 models). Status: 🟢 built · 🟡 in migration · ⚪ planned · 🔴 blocked by a decision.

Schema was applied to a real Postgres instance via `prisma db push` (see `docs/checkpoints/CHECKPOINTS.md` CP-02 update note) — all 50 tables are 🟢 built.

---

## Tables — Identity & Access

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-USER` | User | id (uuid) | email (unique), passwordHash, pinHash, firstName, lastName, phone, mfaEnabled, isActive | `users` | 🟢 built |
| `DB-TBL-ROLE` | Role | id (uuid) | name (unique) | `roles` | 🟢 built |
| `DB-TBL-PERMISSION` | Permission | id (uuid) | action (unique) | `permissions` | 🟢 built |
| `DB-TBL-USERROLE` | UserRole | composite (userId, roleId) | userId, roleId, outletId (nullable = org-wide grant) | `user_roles` | 🟢 built |
| `DB-TBL-ROLEPERMISSION` | RolePermission | composite (roleId, permissionId) | roleId, permissionId | `role_permissions` | 🟢 built |
| `DB-TBL-SESSION` | Session | id (uuid) | userId, outletId, tokenHash (unique), userAgent, ipAddress, expiresAt, revokedAt | `sessions` | 🟢 built |
| `DB-TBL-AUDITLOG` | AuditLog | id (uuid) | outletId, userId, approverUserId, action, entityType, entityId, beforeState (json), afterState (json), reasonCode | `audit_logs` | 🟢 built |

---

## Tables — Organization

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-ORGANIZATION` | Organization | id (uuid) | name, taxNumber | `organizations` | 🟢 built |
| `DB-TBL-OUTLET` | Outlet | id (uuid) | organizationId, name, code (unique), address, timezone, currency, dayStartTime, isActive | `outlets` | 🟢 built |
| `DB-TBL-DININGTABLE` | DiningTable | id (uuid) | outletId, tableNumber (unique w/ outletId), capacity, section, isActive | `dining_tables` | 🟢 built |
| `DB-TBL-STATION` | Station | id (uuid) | outletId, name, printerIp | `stations` | 🟢 built |
| `DB-TBL-TERMINAL` | Terminal | id (uuid) | outletId, name, terminalNumber (unique w/ outletId), isActive | `terminals` | 🟢 built |
| `DB-TBL-BUSINESSHOURS` | BusinessHours | id (uuid) | outletId, dayOfWeek (unique w/ outletId), openTime, closeTime | `business_hours` | 🟢 built |

---

## Tables — Menu & Catalog

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-MENUCATEGORY` | MenuCategory | id (uuid) | outletId, name, description, sortOrder, isActive | `menu_categories` | 🟢 built |
| `DB-TBL-MENUITEM` | MenuItem | id (uuid) | outletId, categoryId, name, description, price (BigInt minor units), isVeg, taxRate (Decimal), isActive | `menu_items` | 🟢 built |
| `DB-TBL-MODIFIERGROUP` | ModifierGroup | id (uuid) | outletId, name, minSelect, maxSelect | `modifier_groups` | 🟢 built |
| `DB-TBL-MODIFIEROPTION` | ModifierOption | id (uuid) | outletId, modifierGroupId, name, price (BigInt), isActive | `modifier_options` | 🟢 built |
| `DB-TBL-MENUITEMMODIFIERGROUP` | MenuItemModifierGroup | composite (menuItemId, modifierGroupId) | menuItemId, modifierGroupId | `menu_item_modifier_groups` | 🟢 built |
| `DB-TBL-ITEMAVAILABILITY` | ItemAvailability | id (uuid) | outletId, menuItemId (unique w/ outletId), isStocked, stockQty, version | `item_availabilities` | 🟢 built |

---

## Tables — Orders

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-DISCOUNT` | Discount | id (uuid) | outletId, name, discountType, value (BigInt), maxDiscount, minOrderValue, requiresAuth, isActive | `discounts` | 🟢 built |
| `DB-TBL-ORDER` | Order | id (client-generated UUIDv7) | outletId, terminalNumber, orderNumber (unique w/ outletId), orderType, diningTableId, status, subtotal, discountTotal, taxTotal, grandTotal (all BigInt), idempotencyKey (unique), customerId | `orders` | 🟢 built |
| `DB-TBL-ORDERITEM` | OrderItem | id (uuid) | outletId, orderId, menuItemId, quantity, unitPrice (BigInt), subtotal, notes | `order_items` | 🟢 built |
| `DB-TBL-ORDERITEMMODIFIER` | OrderItemModifier | composite (orderItemId, modifierOptionId) | orderItemId, modifierOptionId, price (BigInt, captured at order time) | `order_item_modifiers` | 🟢 built |
| `DB-TBL-ORDERDISCOUNT` | OrderDiscount | composite (orderId, discountId) | orderId, discountId, amount (BigInt) | `order_discounts` | 🟢 built |
| `DB-TBL-ORDERSTATUSHISTORY` | OrderStatusHistory | id (uuid) | outletId, orderId, status, notes, createdBy | `order_status_history` | 🟢 built |

---

## Tables — Billing & Finance

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-PAYMENT` | Payment | id (uuid) | outletId, orderId, amount (BigInt), method, status, transactionId | `payments` | 🟢 built |
| `DB-TBL-INVOICE` | Invoice | id (uuid) | outletId, orderId, invoiceNo (unique), amount, taxAmount (BigInt) | `invoices` | 🟢 built |
| `DB-TBL-REFUND` | Refund | id (uuid) | outletId, paymentId, amount (BigInt), status, reasonCode, isPartial | `refunds` | 🟢 built |
| `DB-TBL-LEDGERENTRY` | LedgerEntry | id (uuid) | outletId, sourceType, sourceId, account, debitMinor, creditMinor (BigInt), externalRef, status, postedAt | `ledger_entries` | 🟢 built |

---

## Tables — Kitchen / KOT

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-KOTTICKET` | KOTTicket | id (uuid) | outletId, orderId, ticketNumber, status | `kot_tickets` | 🟢 built |
| `DB-TBL-KOTITEM` | KOTItem | id (uuid) | kotTicketId, menuItemId, quantity, notes | `kot_items` | 🟢 built |
| `DB-TBL-KOTSTATUSHISTORY` | KOTStatusHistory | id (uuid) | kotTicketId, status | `kot_status_history` | 🟢 built |

---

## Tables — CRM & Loyalty

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-CUSTOMER` | Customer | id (uuid) | outletId, firstName, lastName, phone (unique), email, loyaltyPoints | `customers` | 🟢 built |
| `DB-TBL-LOYALTYTRANSACTION` | LoyaltyTransaction | id (uuid) | outletId, customerId, orderId, pointsEarned, pointsRedeemed | `loyalty_transactions` | 🟢 built |

---

## Tables — Aggregator Integration

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-CHANNELACCOUNT` | ChannelAccount | id (uuid) | outletId, channel (unique w/ outletId), externalOutletId, status, credentialsRef | `channel_accounts` | 🟢 built |
| `DB-TBL-CHANNELITEMMAPPING` | ChannelItemMapping | id (uuid) | channelAccountId, menuItemId (unique together), externalItemId (unique w/ channelAccountId), channelPrice, syncStatus, version | `channel_item_mapping` | 🟢 built |
| `DB-TBL-CHANNELORDERMAPPING` | ChannelOrderMapping | id (uuid) | channelAccountId, orderId (unique), externalOrderId (unique w/ channelAccountId), partnerStatedTotal, computedTotal (BigInt) | `channel_order_mapping` | 🟢 built |
| `DB-TBL-INBOUNDEVENT` | InboundEvent | id (uuid) | channelAccountId, externalEventId (unique w/ channelAccountId), eventType, rawPayload (json), status, processedAt | `inbound_events` | 🟢 built |
| `DB-TBL-OUTBOUNDEVENT` | OutboundEvent | id (uuid) | channelAccountId, eventType, payload (json), status, sentAt | `outbound_events` | 🟢 built |
| `DB-TBL-SYNCJOB` | SyncJob | id (uuid) | channelAccountId, jobType, status, attempt, scheduledAt, completedAt | `sync_jobs` | 🟢 built |
| `DB-TBL-INTEGRATIONERROR` | IntegrationError | id (uuid) | channelAccountId, source, sourceId, errorCode, message, isResolved, resolvedAt | `integration_errors` | 🟢 built |

---

## Tables — Inventory & BOM

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-INGREDIENT` | Ingredient | id (uuid) | outletId, name, unitOfMeasure, currentStock (Decimal), reorderLevel (Decimal), unitCost (BigInt), isActive | `ingredients` | 🟢 built |
| `DB-TBL-RECIPE` | Recipe | id (uuid) | outletId, menuItemId, version, isActive | `recipes` | 🟢 built |
| `DB-TBL-RECIPEINGREDIENT` | RecipeIngredient | id (uuid) | recipeId, ingredientId (unique together), quantity (Decimal), yieldPercent (Decimal) | `recipe_ingredients` | 🟢 built |
| `DB-TBL-STOCKMOVEMENT` | StockMovement | id (uuid) | outletId, ingredientId, movementType, quantity (Decimal, signed), referenceType, referenceId, reasonCode | `stock_movements` | 🟢 built |

---

## Tables — Vendor Procurement

| ID | Table | PK | Key columns | `@@map` | Status |
|----|-------|----|-----------  |---------|--------|
| `DB-TBL-VENDOR` | Vendor | id (uuid) | outletId, name, contactPerson, phone, email, taxNumber, paymentTerms, isActive | `vendors` | 🟢 built |
| `DB-TBL-PURCHASEORDER` | PurchaseOrder | id (uuid) | outletId, vendorId, poNumber (unique), status, totalAmount (BigInt), approvedBy, approvedAt | `purchase_orders` | 🟢 built |
| `DB-TBL-PURCHASEORDERITEM` | PurchaseOrderItem | id (uuid) | purchaseOrderId, ingredientId, quantity (Decimal), unitCost, totalCost (BigInt) | `purchase_order_items` | 🟢 built |
| `DB-TBL-GOODSRECEIVEDNOTE` | GoodsReceivedNote | id (uuid) | outletId, purchaseOrderId, vendorId, grnNumber (unique), invoiceNumber, receivedDate, status | `goods_received_notes` | 🟢 built |
| `DB-TBL-GOODSRECEIVEDNOTEITEM` | GoodsReceivedNoteItem | id (uuid) | goodsReceivedNoteId, ingredientId, orderedQuantity, receivedQuantity (Decimal), unitCost (BigInt) | `goods_received_note_items` | 🟢 built |

---

## Audit

Audit coverage is provided by `DB-TBL-AUDITLOG` (`audit_logs`, Identity & Access group above) and the append-only `DB-TBL-ORDERSTATUSHISTORY` / `DB-TBL-KOTSTATUSHISTORY` history tables — there is no separate Audit domain group of tables in `schema.prisma`; those three tables together satisfy `docs/database/ERD.md` §3 invariant 3 (append-only history & auditability).

---

## Enums

`schema.prisma` defines **no Prisma `enum` blocks**. Status/type/category fields (`Order.status`, `Order.orderType`, `Payment.method`, `Payment.status`, `Discount.discountType`, `KOTTicket.status`, `StockMovement.movementType`, `PurchaseOrder.status`, `GoodsReceivedNote.status`, `ChannelAccount.channel`, `ChannelAccount.status`, `InboundEvent.eventType`, `InboundEvent.status`, `OutboundEvent.eventType`, `OutboundEvent.status`, `LedgerEntry.sourceType`, `LedgerEntry.status`, `Refund.status`, etc.) are all modeled as `String` columns with allowed values documented inline as Prisma field comments — not as database enum types. No `DB-ENUM-*` objects exist in the built schema.

---

## Views, Materialized Views, Functions & Triggers

None exist in `kapmeta/schema.prisma` — Prisma's `db push` created only the 50 tables listed above (plus their indexes/constraints from `@@id`, `@@unique`, and `@relation`). No `DB-VW-*`, `DB-MVW-*`, `DB-FN-*`, or `DB-TRG-*` objects have been built. Any future reporting views, gapless-sequence functions, or guard triggers must be added here only once they exist as real migrations against this schema — not planned ahead of it.
