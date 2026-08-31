# Complete Logic Flow & Domain Architecture Specification

**Product:** Kapmeta Restaurant POS & Operations Platform  
**Target:** Production Multi-Outlet POS, Kitchen Display System (KDS), Waiter Mobile Station, Online Aggregator Hub, Inventory & Financial Accounting  
**Standard:** Minor Units (paise/cents integer money), Append-Only Audit Trails, Idempotent Processing, Zero Hardcoding

---

## 1. System Overview & Core Entity Architecture

The Kapmeta POS platform operates on an event-driven, multi-tenant restaurant domain model. All financial amounts are stored as integers in minor currency units (`amount_minor`, e.g., 25000 = ₹250.00).

```mermaid
erDiagram
    OUTLET ||--o{ DINING_TABLE : contains
    OUTLET ||--o{ MENU_ITEM : offers
    OUTLET ||--o{ TERMINAL : registers
    OUTLET ||--o{ ORDER : processes
    OUTLET ||--o{ USER_ROLE : grants
    OUTLET ||--o{ INGREDIENT : stocks

    DINING_TABLE ||--o{ ORDER : hosts
    ORDER ||--|{ ORDER_ITEM : includes
    ORDER ||--o{ KOT_TICKET : generates
    ORDER ||--o{ PAYMENT : settles
    ORDER ||--o| INVOICE : produces
    ORDER }o--o| CUSTOMER : belongs_to

    MENU_ITEM ||--o{ RECIPE_BOM : consumes
    RECIPE_BOM }|--|| INGREDIENT : requires
    PAYMENT ||--o{ LEDGER_ENTRY : posts
```

---

## 2. End-to-End Logic Flows

### Flow 1: Authentication, Session & Role-Based Access Control (RBAC)

```mermaid
sequenceDiagram
    autonumber
    actor User as Staff Member
    participant UI as POS Login UI (login.tsx)
    participant API as Auth Service (POST /auth/login)
    participant DB as PostgreSQL User & Role DB

    User->>UI: Select Role or Enter Email + Password + OutletID
    UI->>API: POST /auth/login { email, password, outletId }
    API->>DB: Query User where email & verify bcrypt(password, hash)
    API->>DB: Verify UserRole where userId & outletId
    alt Valid Credentials & Active Grant
        API-->>UI: 200 OK { accessToken (JWT), refreshToken, user: { roles, permissions, outlet } }
        UI->>UI: Persist in localStorage (kapmeta_pos_session)
        UI->>UI: Route according to highest grant (Admin/Cashier -> '/', Chef -> '/kitchen', Waiter -> '/waiter')
    else Invalid Password or Inactive
        API-->>UI: 401 Unauthorized { error: "INVALID_CREDENTIALS" }
        UI->>UI: Display human error banner
    end

    Note over User, UI: Terminal Unlock / Screen Lock Flow
    User->>UI: Enter 4-digit PIN on CaptainPinLoginModal
    UI->>API: POST /auth/verify-pin { pin }
    API->>DB: Compare bcrypt(pin, user.pinHash)
    API-->>UI: { valid: true / false }
```

**RBAC Permission Matrix:**
- `SUPER_ADMIN` / `OUTLET_MANAGER`: `order.create`, `order.cancel`, `kot.read`, `kot.update`, `payment.capture`, `refund.issue`, `menu.category.manage`, `inventory.stock.adjust`, `finance.zreport`, `rbac.user.manage`.
- `CASHIER`: `order.create`, `kot.read`, `payment.capture`, `tables.read`, `tables.update`.
- `KITCHEN_USER` / `CHEF`: `kot.read`, `kot.update`, `menu.item.toggle86`.
- `WAITER` / `CAPTAIN`: `order.create`, `tables.read`, `waiters.heartbeat`.

---

### Flow 2: Table Floor Plan & Dine-In Lifecycle

```mermaid
stateDiagram-v2
    [*] --> VACANT: Table Initialized
    VACANT --> OCCUPIED: Guest Seated / First Item Punched
    OCCUPIED --> RUNNING_KOT: KOT Issued to Kitchen
    RUNNING_KOT --> FOOD_SERVED: Kitchen Marks Done & Waiter Serves
    FOOD_SERVED --> RUNNING_KOT: Additional Course Punched
    FOOD_SERVED --> BILLED: Bill Printed / Settle Initiated
    BILLED --> SETTLED: Payment Captured in Full
    SETTLED --> VACANT: Table Cleared / Reset
```

**Table Operations Logic:**
1. **Section Segmentation**: Tables partitioned by sections (`AC`, `Non AC`, `Terrace Lounge`, `Family Section`).
2. **Table Status Indicator Colors**:
   - `VACANT`: `#10b981` (Green)
   - `OCCUPIED`: `#ef4444` (Red)
   - `BILLED`: `#3b82f6` (Blue)
   - `KOT_PLACED`: `#f59e0b` (Amber)
3. **Table Shift / Move**: When moving Table $T_A \rightarrow T_B$:
   - Verifies $T_B$ is `VACANT` (or prompts merge).
   - Atomic transaction updates `orders.dining_table_id` from $T_A$ to $T_B$.
   - Appends status history row and emits `table.moved` socket event.

---

### Flow 3: Order Entry, Modifiers, Discounts & Tax Calculation Algorithm

```mermaid
flowchart TD
    Start["Item Selection in Cart"] --> Subtotal["Compute Core Subtotal: sum(qty * unit_price)"]
    Subtotal --> Addons["Compute Add-on Subtotal: sum(addon_qty * addon_price)"]
    Addons --> ItemSubtotal["Item Subtotal = Core Subtotal + Add-on Subtotal"]
    
    ItemSubtotal --> Charges["Compute Channel Charges: Container / Delivery / Service"]
    Charges --> Discount["Resolve Discount: basis (CORE vs TOTAL) * rate"]
    
    Discount --> TaxMode{"Tax Mode Configuration"}
    TaxMode -->|FORWARD Mode| FwdTax["Taxable Base = Item Subtotal + Charges - Discount<br>CGST = Base * 2.5%<br>SGST = Base * 2.5%<br>Grand Total = Taxable Base + CGST + SGST"]
    TaxMode -->|BACKWARD Mode| BwdTax["Inclusive Price Extraction<br>Net Item Base = Subtotal / (1 + TaxRate)<br>CGST = (Taxable Base * 2.5%)<br>SGST = (Taxable Base * 2.5%)<br>Grand Total = Post-Discount Inclusive Total"]
    
    FwdTax --> Rounding["Round Half-Up to nearest rupee / minor currency"]
    BwdTax --> Rounding
    Rounding --> OrderReady["Order Placed with Idempotency Key"]
```

**Formula for Forward Tax Calculation:**
$$\text{Taxable Value} = \text{Item Subtotal} + \text{Charges} - \text{Discount}$$
$$\text{CGST} = \text{round}\left(\text{Taxable Value} \times \frac{r_{\text{CGST}}}{100}\right), \quad \text{SGST} = \text{round}\left(\text{Taxable Value} \times \frac{r_{\text{SGST}}}{100}\right)$$
$$\text{Grand Total} = \text{Taxable Value} + \text{CGST} + \text{SGST}$$

---

### Flow 4: Kitchen Display System (KDS) & Multi-Station Routing

```mermaid
sequenceDiagram
    autonumber
    participant POS as POS Order Entry
    participant Engine as Order & KOT Routing Engine
    participant G_Station as Grill Station KDS
    participant F_Station as Fryer Station KDS
    participant B_Station as Bar Station KDS

    POS->>Engine: Place Order (Tandoori Tikka, Fries, Mojito)
    Note over Engine: Categorizes items by station routing tag
    Engine->>G_Station: Dispatch KOT Ticket #1 (Tandoori Tikka) -> PENDING
    Engine->>F_Station: Dispatch KOT Ticket #2 (Fries) -> PENDING
    Engine->>B_Station: Dispatch KOT Ticket #3 (Mojito) -> PENDING
    
    G_Station->>G_Station: Chef marks Ticket #1 PREPARING -> DONE
    Note over Engine: Order status remains PREPARING (not READY yet)
    F_Station->>F_Station: Chef marks Ticket #2 DONE
    B_Station->>B_Station: Bartender marks Ticket #3 DONE
    
    Note over Engine: All tickets DONE -> Order transitions to READY
    Engine->>POS: Broadcast order.ready notification (Audio Chime + Badge)
```

**KDS Guarantees:**
- **Atomic Creation**: Order header and station tickets commit in a single database transaction.
- **Completion Gate**: An order transitions to `READY` if and only if all child station KOT tickets are marked `DONE`.
- **Course Phasing**: `STARTER` tickets display priority badges over `MAIN` and `DESSERT`.

---

### Flow 5: Orders Management, Post-KOT Cancellation & Audit Logs

```mermaid
sequenceDiagram
    autonumber
    actor Mgr as Outlet Manager
    participant UI as Orders Management UI
    participant OrderSvc as Order Service
    participant AuditDB as Immutable Audit Log Table
    participant InvSvc as Inventory Stock Service

    Mgr->>UI: Request Cancel Order #ORD-101 (Post-KOT)
    UI->>UI: Prompt Manager Auth & Mandatory Reason Code
    Mgr->>UI: Select Reason: "GUEST_CHANGED_MIND"
    UI->>OrderSvc: POST /orders/ORD-101/cancel { reasonCode, notes }
    OrderSvc->>OrderSvc: Verify Caller has 'order.cancel' Permission
    OrderSvc->>AuditDB: Append Immutable Record (actor, orderId, reasonCode, timestamp)
    OrderSvc->>InvSvc: Record Wastage Movement (DEC-003 policy)
    OrderSvc-->>UI: 200 OK (Status -> CANCELLED)
```

---

### Flow 6: Multi-Tender Payments, Bill Split & Fiscal Invoicing

```mermaid
flowchart TD
    OrderBilled["Order Status: BILLED (Grand Total: ₹1,000.00)"] --> PaymentChoice{"Payment Method Selection"}
    
    PaymentChoice -->|Single Mode| SinglePay["Full Tender: Cash / Card / UPI"]
    PaymentChoice -->|Split Tender| MultiTender["Multi-Tender Breakdown:<br>• Cash: ₹400.00<br>• UPI (QR): ₹500.00<br>• Customer Dues / Credit: ₹100.00"]
    PaymentChoice -->|Equal Bill Split| BillSplit["Split Across N Covers (e.g. 4 covers @ ₹250.00)"]
    
    SinglePay --> Capture["POST /finance/payments with Idempotency-Key"]
    MultiTender --> Capture
    BillSplit --> Capture
    
    Capture --> SettleCheck{"Remaining Balance == 0?"}
    SettleCheck -->|No| PartialStatus["Status: PARTIALLY_PAID, Table remains BILLED"]
    SettleCheck -->|Yes| FullSettlement["Status: SETTLED / COMPLETED<br>1. Generate Fiscal Invoice No (fn_next_invoice_number)<br>2. Post Double-Entry Ledger Transactions<br>3. Release Table to VACANT"]
```

---

### Flow 7: Waiter / Captain Mobile Station

```mermaid
sequenceDiagram
    autonumber
    actor Waiter as Captain / Waiter
    participant Mobile as Mobile Web POS (pages/waiter.tsx)
    participant API as POS API Server

    Waiter->>Mobile: Fast PIN Login (e.g., '1234')
    Mobile->>API: Periodic POST /waiters/heartbeat
    Mobile->>Mobile: Render Compact Floor Grid (Table A1..A15)
    Waiter->>Mobile: Tap Table A3 -> Tap "Special Biryani" + "Lime Soda"
    Waiter->>Mobile: Select Course: "MAIN" & Add Note: "Less Spicy"
    Mobile->>API: POST /orders (with waiterId attribution)
    API-->>Mobile: 201 Created (KOT Dispatched)
    Mobile->>Mobile: Show Instant Toast: "KOT #42 Sent to Kitchen"
```

---

### Flow 8: Online Aggregators & Monotonic 86 Item Availability Sync

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Restaurant Admin
    participant UI as Menu / 86 Availability Screen
    participant Hub as Integration Hub Worker
    participant Aggregator as Swiggy / Zomato API

    Admin->>UI: Toggle Item "Paneer Tikka" -> OFF (Out of Stock)
    UI->>Hub: POST /menu/items/123/toggle-availability { status: "OFF" }
    Hub->>Hub: Increment Internal Version: v6 -> v7
    Hub->>Aggregator: Push 86 Status (item_id: 123, status: OFF, version: 7)
    
    alt Inbound Webhook Race Condition (Out-of-order)
        Aggregator-->>Hub: Stale Webhook received with version = 5
        Hub->>Hub: Check (received_version <= current_version)
        Hub->>Hub: DISCARD STALE EVENT (Version 5 dropped silently)
    else Push Confirmed
        Aggregator-->>Hub: 200 OK (Sync Acknowledged)
        Hub->>UI: Update Channel Sync State: "SYNCHRONIZED"
    end
```

---

### Flow 9: Inventory Recipe Consumption & Stock Shortage

```mermaid
flowchart TD
    OrderItemPlaced["Order Item Placed: Chicken Biryani (Qty: 2)"] --> RecipeLookup["Lookup Recipe BOM:<br>• Aged Basmati Rice: 0.25 kg * 2 = 0.5 kg<br>• Fresh Chicken: 0.30 kg * 2 = 0.6 kg<br>• Pure Desi Ghee: 0.05 L * 2 = 0.1 L"]
    
    RecipeLookup --> StockCheck{"Stock Available?"}
    StockCheck -->|Yes| DeductStock["Deduct Stock via StockMovement Record<br>(Source: Order Placed Event ID)"]
    StockCheck -->|No| Policy{"Shortage Policy (DEC-003)"}
    
    Policy -->|BLOCK| RejectOrder["Reject Order Item: ORDER_ITEM_UNAVAILABLE"]
    Policy -->|ALERT| AlertOrder["Allow Order, Post Negative Stock & Raise Low-Stock Alert"]
    Policy -->|SUBSTITUTE| SubOrder["Apply Configured Ingredient Substitute & Annotate KOT"]
```

---

### Flow 10: Financial Accounting & Day-End Z-Report Reconciliation

```mermaid
flowchart TD
    BusinessDayStart["Open Business Date (fn_business_date)"] --> CashFloat["Set Opening Cash Drawer Float (e.g. ₹5,000.00)"]
    
    CashFloat --> Trades["Daily Operations:<br>+ Cash Payments<br>+ UPI Payments<br>+ Card Payments<br>+ Dues / Accounts Receivable<br>- Refunds<br>- Vendor Petty Cash Expenses"]
    
    Trades --> DayEnd["Initiate Day-End Z-Report (POST /finance/z-report)"]
    
    DayEnd --> Reconcile["Automated Reconciliation Engine:<br>1. Gross Sales = Net Sales + Tax + Discounts<br>2. Cash In Drawer = Opening Float + Cash In - Cash Out - Cash Refunds<br>3. Verify Sum(Tenders) == Total Captured Revenue"]
    
    Reconcile --> LedgerClose["Freeze Business Day Ledger & Emit zreport.generated"]
```

---

## 3. Summary of Core Guarantees & Invariants

1. **Monetary Exactness**: No floats in API payloads or DB schemas; everything is minor units (`amount_minor` integer).
2. **KOT Integrity**: An order cannot be confirmed without its associated KOT tickets, and cannot become `READY` until all stations complete.
3. **Idempotency**: All payment captures and order creation requests require an `Idempotency-Key` header.
4. **Audit Trail**: Cancellations, voids, price overrides, and role changes write append-only records.
5. **Channel Availability Monotonicity**: Aggregator sync version numbers are non-decreasing ($v_{n+1} > v_n$). Stale versions are rejected.
