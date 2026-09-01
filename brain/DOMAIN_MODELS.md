# KapMeta POS Platform — Domain Models & Data Dictionary

**For:** Gemini, Claude & AI Coding Agents  

---

## 1. Core Architectural Standards

- **Primary Key Standard:** Primary keys are generated as time-ordered **UUIDv7** strings.
- **Monetary Unit Standard:** All currency amounts (`price`, `subTotal`, `taxAmount`, `discountAmount`, `totalAmount`, `amount`) MUST be stored and computed as **integer minor units (`BIGINT` paise / cents)**. Example: ₹250.50 is stored as `25050`.
- **Multi-Tenant Boundary:** Every operational record MUST include `outlet_id NOT NULL` referencing the active `Outlet`.

---

## 2. Core Model Schemas (Prisma)

### 1. `Order` & `OrderItem`
```prisma
model Order {
  id              String         @id @default(uuid())
  outletId        String         @map("outlet_id")
  orderNumber     String         @map("order_number")
  type            OrderType      @default(DINE_IN)
  status          OrderStatus    @default(DRAFT)
  tableId         String?        @map("table_id")
  guestCount      Int?           @map("guest_count")
  subTotal        BigInt         @map("sub_total")
  taxAmount       BigInt         @map("tax_amount")
  discountAmount  BigInt         @default(0) @map("discount_amount")
  totalAmount     BigInt         @map("total_amount")
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")

  items           OrderItem[]
  payments        Payment[]
  invoice         Invoice?
}

model OrderItem {
  id          String    @id @default(uuid())
  orderId     String    @map("order_id")
  menuItemId  String    @map("menu_item_id")
  quantity    Int
  unitPrice   BigInt    @map("unit_price")
  totalPrice  BigInt    @map("total_price")
  notes       String?
  status      String    @default("PENDING")
}
```

### 2. `KotTicket` & `KotItem`
```prisma
model KotTicket {
  id          String       @id @default(uuid())
  outletId    String       @map("outlet_id")
  orderId     String       @map("order_id")
  ticketNumber String      @map("ticket_number")
  stationId   String?      @map("station_id")
  status      KotStatus    @default(QUEUED)
  createdAt   DateTime     @default(now()) @map("created_at")
  items       KotItem[]
}
```

### 3. `Invoice` & `Payment`
```prisma
model Invoice {
  id             String    @id @default(uuid())
  outletId       String    @map("outlet_id")
  orderId        String    @unique @map("order_id")
  invoiceNumber  String    @map("invoice_number")
  subTotal       BigInt    @map("sub_total")
  cgstAmount     BigInt    @map("cgst_amount")
  sgstAmount     BigInt    @map("sgst_amount")
  totalAmount    BigInt    @map("total_amount")
  status         String    @default("PAID")
  createdAt      DateTime  @default(now()) @map("created_at")
}
```

### 4. `AuditLog` (Append-Only)
```prisma
model AuditLog {
  id          String    @id @default(uuid())
  outletId    String    @map("outlet_id")
  userId      String    @map("user_id")
  action      String
  entityType  String    @map("entity_type")
  entityId    String    @map("entity_id")
  metadata    Json?
  timestamp   DateTime  @default(now())
}
```
