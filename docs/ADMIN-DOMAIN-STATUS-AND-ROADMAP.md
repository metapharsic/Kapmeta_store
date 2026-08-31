# Complete Admin Domain Status & Pending Implementation Roadmap

---

## 1. Live Visual Audit Summary (From Current Screenshots)

| Screen / UI Area | Live Screenshot Evidence | Status |
| :--- | :--- | :--- |
| **Sales Analytics & KPIs** | Net Sales (`₹0.00`), Completed Orders (`0`), Avg Order Value (`₹0.00`), Time Range Filter (`Day`/`Month`/`Quarter`/`Year`). | **Operational** |
| **Enterprise Reports Generator** | Export to CSV (Excel) or JSON for Sales, Item Performance, Payments, Channels, and Turnaround. | **Operational** |
| **Leakage & Loss Detection** | Tracks KOT Cancellations, Modifications, Shifts, Bill Reprints, Waived-Off Invoices, and Revenue-at-Risk. | **Operational** |
| **User & Staff Management** | Real staff directory (`admin@restaurant.com`), Dynamic Role Assignment, Role Revocation, and Active Status. | **Operational** |
| **Roles & Permissions System** | 49 Granular System Permissions mapped to roles with custom permission matrix creation. | **Operational** |
| **Menu Catalog & Pricing** | Category CRUD, MenuItem CRUD with minor unit currency (paise) and Veg/Non-Veg toggles. | **Operational** |
| **Table Floor Management** | Dining tables (`T-01` to `T-06`) with section assignment, capacity, and active bill tracking. | **Operational** |
| **CRM & Loyalty Engine** | Searchable customer directory, loyalty point accrual, and DPDP privacy erasure. | **Operational** |
| **Marketing Automation** | Automated campaign triggers (`MANUAL`, `INACTIVE_CUSTOMER`, `BIRTHDAY`) with promo codes. | **Operational** |

---

## 2. What Is Currently Implemented (Fully Operational)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               OPERATIONAL ADMIN FEATURES                                │
├──────────────────────────────┬──────────────────────────────┬───────────────────────────┤
│ • Sales Analytics & KPIs     │ • User & Staff Directory     │ • Category & Menu CRUD    │
│ • CSV/JSON ERP Exporters     │ • RBAC Role & Perm Matrix    │ • Dining Table Layouts    │
│ • Loss & Leakage Audit       │ • Customer CRM & Loyalty     │ • Marketing Campaigns     │
│ • Payment Method Breakdown   │ • DPDP Customer Erasure      │ • Kitchen Station SLAs    │
└──────────────────────────────┴──────────────────────────────┴───────────────────────────┘
```

1. **Authentication & Session Security**:
   - Secure login via JWT tokens, password hashing with `bcryptjs`, and permission inspection (`requirePermission`).
2. **Dynamic Ingestion (No Hardcoded Data)**:
   - All data on `/menu`, `/admin`, `/user-management`, `/crm`, and `/tables` feeds directly from PostgreSQL database rows.
3. **Multi-Tenant Scoping**:
   - Data is strictly partitioned by `outlet_id` to ensure isolation.

---

## 3. Pending Implementation & Enhancement Roadmap (The Manager's Task List)

The visual audit and codebase inspection highlight the following specific items that remain pending or can be enhanced in the Admin section:

```
                               ADMIN PENDING WORKSTREAM
                                          │
       ┌──────────────────────────────────┼──────────────────────────────────┐
       │                                  │                                  │
┌──────▼──────┐                    ┌──────▼──────┐                    ┌──────▼──────┐
│  Feature 1  │                    │  Feature 2  │                    │  Feature 3  │
│Tax Breakdown│                    │Table Occup. │                    │Invoices List│
│ & GST Slabs │                    │ Rate Metric │                    │& Audit Feed │
└─────────────┘                    └─────────────┘                    └─────────────┘
       │                                  │                                  │
┌──────▼──────┐                    ┌──────▼──────┐                    ┌──────▼──────┐
│  Feature 4  │                    │  Feature 5  │                    │  Feature 6  │
│Bulk CSV Menu│                    │ Petty Cash  │                    │Dedicated App│
│   Importer  │                    │Reconcile UI │                    │(admin-web)  │
└─────────────┘                    └─────────────┘                    └─────────────┘
```

---

### Task 1: GST & Statutory Tax Breakdown API
* **Visible on UI:** The **GST Statutory Audit** card on the dashboard currently displays *"Requires a tax breakdown endpoint"*.
* **What Needs to be Done:**
  1. Add a `GET /reporting/tax-breakdown?fromDate=...&toDate=...` endpoint in `apps/api/src/routes/reporting.ts`.
  2. Query `orders` and compute the split across CGST (2.5%), SGST (2.5%), and IGST (5.0%).
  3. Wire the returned JSON into the GST Statutory Audit component in `apps/pos-web/pages/admin.tsx`.

---

### Task 2: Live Table Occupancy Rate Metric
* **Visible on UI:** The **Table Occupancy Rate** KPI card currently shows *"Not available"*.
* **What Needs to be Done:**
  1. Create a helper calculation in `services/tables` or `apps/api/src/routes/tables.ts`:
     $$\text{Occupancy Rate} = \left(\frac{\text{Number of Occupied Tables with Active Orders}}{\text{Total Configured Tables}}\right) \times 100$$
  2. Return this percentage in the dashboard summary API and render it on the KPI card.

---

### Task 3: Recent Settled Invoices List & Receipt Audit Feed
* **Visible on UI:** The bottom card **Recent Settled Invoices** states *"Requires an invoices-list endpoint"*.
* **What Needs to be Done:**
  1. Implement `GET /reporting/invoices?limit=10` in `apps/api/src/routes/reporting.ts`.
  2. Fetch completed/settled orders with invoice numbers, payment methods (`CASH`, `UPI`, `CARD`), bill timestamp, and cashier names.
  3. Render the live table with a "View Receipt / Print Duplicate" action button.

---

### Task 4: Bulk CSV / Excel Menu Catalog Importer
* **Requirement:** Enable restaurant managers to bulk upload 100+ menu items at once instead of entering items one by one.
* **What Needs to be Done:**
  1. Add a `POST /menu/items/bulk-upload` endpoint supporting multipart CSV uploads.
  2. Create a "Bulk Import Menu (CSV)" button with a downloadable sample template in `apps/pos-web/pages/menu.tsx`.
  3. Parse the CSV and insert the categories and menu items inside a database transaction.

---

### Task 5: Cash Drawer & Petty Cash Reconciliation UI
* **What Needs to be Done in `/finance`:**
  1. Add an interactive modal for **Petty Cash Expenses** (e.g. daily milk purchase, ice, local vendor payouts).
  2. Add **Shift End Cash Drawer Verification**: compare expected system cash balance against physical counted cash, logging any shortage or excess to the audit log.

---

### Task 6: Standalone `apps/admin-web` Application Scaffold (Optional / Future Milestone)
* **Context:** Currently, all admin screens run seamlessly inside `apps/pos-web` under protected role guards.
* **If your manager requires a separate standalone admin app:**
  1. Initialize Next.js inside `apps/admin-web`.
  2. Point `apps/admin-web` to the same backend API Gateway (`http://localhost:4001`).
  3. Reuse components from `packages/ui-kit` to run admin independently on port 4445.

---

## 4. Summary Matrix for Your Manager

| Task Item | Priority | Estimated Complexity | Core Files Involved |
| :--- | :--- | :--- | :--- |
| **1. GST Statutory Tax Breakdown** | High | Low (1 Endpoint + UI bind) | `routes/reporting.ts`, `pages/admin.tsx` |
| **2. Table Occupancy Rate Metric** | Medium | Low (Math aggregate) | `routes/tables.ts`, `pages/admin.tsx` |
| **3. Recent Settled Invoices Feed** | High | Medium (List query + modal) | `routes/reporting.ts`, `pages/admin.tsx` |
| **4. Bulk CSV Menu Importer** | High | Medium (CSV parser + DB batch) | `routes/menu.ts`, `pages/menu.tsx` |
| **5. Cash Drawer & Petty Cash UI** | Medium | Medium (Form + Ledger entry) | `routes/finance.ts`, `pages/finance.tsx` |
