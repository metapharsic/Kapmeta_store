# Task 5: Cash Drawer & Petty Cash Reconciliation UI — Completion Report

**Project:** KapMeta POS (Kapmeta) &bull; **Domain:** Admin, Finance & Audit &bull; **Date:** 2026-08-25 &bull; **Status:** Completed & Verified

---

## 1. Executive Summary & Objective

In restaurant finance operations, cashiers and managers must account for all physical cash in the drawer at the end of each shift or business day. The daily cash equation requires balancing cash sales from orders against petty cash operational expenses (e.g. daily vegetable purchase, milk run, fuel, courier, maintenance).

Task 5 delivered:
1. Three transactional finance endpoints in `apps/api/src/routes/finance.ts`:
   - `GET /finance/cash-drawer`: Aggregates opening float, cash order collections, cash refunds, and petty cash expenses to compute the exact expected cash drawer balance and shift status.
   - `POST /finance/petty-cash`: Records itemized petty cash expenses and writes immutable audit log entries.
   - `POST /finance/cash-drawer/reconcile`: Records the end-of-shift physical cash count and calculates the exact discrepancy/variance (`Balanced`, `Surplus`, or `Shortage`).
2. An interactive **Cash Drawer & Petty Cash Reconciliation Panel** on [`apps/pos-web/pages/finance.tsx`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/apps/pos-web/pages/finance.tsx) with:
   - Real-time 5-KPI balance overview (`Opening Float`, `Cash Sales Inflow`, `Petty Cash Outflow`, `Expected In Drawer`, `Actual Counted & Variance Status`).
   - **`💸 Log Petty Cash Outflow` Modal** with category selection, vendor name, amount in Rupees, and purpose description.
   - **Today's Petty Cash Outflow Ledger Table** showing timestamp, category, recipient, and amount.
   - **`🔒 End-of-Day Shift Close` Modal** showing cash breakdown, calculated variance preview, closing notes, and locking action.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│               Finance Web (pages/finance.tsx)               │
│   • Cash Drawer Status & Variance KPI Cards                 │
│   • Today's Petty Cash Outflow Ledger                       │
│   • "💸 Log Petty Cash" Modal (Vendor, Category, ₹ Amount)  │
│   • "🔒 End-of-Day Reconcile" Modal (Physical Cash Count)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │ GET /cash-drawer      │ POST /petty-cash      │ POST /reconcile
┌──────▼───────────────────────▼───────────────────────▼──────┐
│                API Gateway (routes/finance.ts)              │
│   • requireAuth + requirePermission("report.read")          │
│   • Scoped strictly by req.auth.outletId                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                PostgreSQL Database (Prisma)                 │
│   • order_payments (where method = 'CASH' & CAPTURED)       │
│   • order_refunds (amount_minor)                            │
│   • audit_logs (FINANCE_PETTY_CASH & CASH_DRAWER_RECONCILED)│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Files Created / Modified

| File | Changes Made |
| :--- | :--- |
| [`apps/api/src/routes/finance.ts`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/apps/api/src/routes/finance.ts) | Implemented `GET /cash-drawer`, `POST /petty-cash`, and `POST /cash-drawer/reconcile` routes with audit log tracking and permission alignment. |
| [`apps/pos-web/pages/finance.tsx`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/apps/pos-web/pages/finance.tsx) | Added `CashDrawerReconciliationApi` and `PettyCashExpenseApi` types, state hooks, Cash Drawer KPI cards, Petty Cash Ledger, Log Expense Modal, and Reconcile Modal. |
| [`CHECKPOINT.md`](file:///c:/Users/Hamza/Downloads/KapMeta/KapMeta/CHECKPOINT.md) | Recorded completion of Task 5. |

---

## 4. Verification Evidence

### A. Endpoint Verification
1. **GET `/finance/cash-drawer` Initial State (HTTP 200 OK):**
   ```json
   {
     "openingFloatMinor": "200000",
     "cashSalesMinor": "0",
     "pettyCashTotalMinor": "0",
     "expectedCashMinor": "200000",
     "isReconciled": false
   }
   ```
2. **POST `/finance/petty-cash` (HTTP 201 Created):**
   ```json
   {
     "id": "16470bc1-...",
     "amountMinor": "35000",
     "category": "Dairy & Milk",
     "description": "5L Fresh Milk for tea & desserts",
     "paidTo": "Local Dairy Farm",
     "loggedBy": "Admin User"
   }
   ```
3. **POST `/finance/cash-drawer/reconcile` (HTTP 200 OK):**
   ```json
   {
     "success": true,
     "expectedCashMinor": "165000",
     "actualCashCountedMinor": "165000",
     "varianceMinor": "0",
     "isReconciled": true,
     "notes": "Evening shift closing verified by Manager"
   }
   ```

### B. UI Features Verified
1. **Cash Drawer 5-Way Balance Cards**: Displays opening float, cash sales, petty expenses, expected balance, and real-time variance pill.
2. **Log Petty Cash Modal**: Seamlessly submits expenses and updates the expected drawer balance without requiring a page refresh.
3. **End-of-Day Shift Close Modal**: Previews calculated variance live as the cashier types their physical count.
