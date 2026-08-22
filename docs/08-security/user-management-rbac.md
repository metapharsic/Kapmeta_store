# User Management & Role-Based Access Control (RBAC) Specification

**ID:** SEC-RBAC · **Status:** APPROVED · **Owner:** Security Engineer & Solution Architect · **Version:** 2.0 · **Updated:** 2026-08-09
**Traces to:** `restaurant_pos_project_DETAILED_REQUIREMENTS_AND_DECISIONS_v2.docx` §16.1 · `DEC-011` · `docs/08-security/security-framework.md`

This document defines the complete enterprise User Management Architecture, Authentication Lifecycle, Role Hierarchy, and Granular Permission Matrix for the Kapmeta platform.

---

## 1. User Lifecycle & Authentication Architecture

```
[1. User Provisioned] ──► [2. Role & Outlet Scoped] ──► [3. Shift Login (Password / PIN)]
                                                                    │
                                                                    ▼
[6. Deprovision / Revoke] ◄── [5. Manager Elevation] ◄── [4. Session & Terminal Lock]
```

### A. Provisioning & Credentials
* **User Identity:** Users are uniquely identified by a UUIDv7 `id` and unique `email`.
* **Password Security:** Passwords hashed using `bcryptjs` with salt work factor of 10. Minimum password length is 8 characters with complexity enforcement on admin accounts.
* **Cashier Terminal PIN:** 4-digit numeric PIN for rapid POS terminal unlock during active service shifts (stored hashed).

### B. Session Management & Token Claims (DEC-011)
* **JWT Access Token:** Short-lived (15 minutes), containing:
  ```json
  {
    "sub": "66666666-6666-6666-6666-666666666666",
    "email": "cashier@kapmeta.com",
    "outletId": "11111111-1111-1111-1111-111111111111",
    "role": "CASHIER",
    "permissions": ["order.create", "order.read", "menu.read", "payment.capture"],
    "sessionId": "sess_89410294",
    "exp": 1754739600
  }
  ```
* **Refresh Token:** Long-lived (7 days), stored in Redis session store with rotation on use.
* **Immediate Revocation:** Inactivating a user (`isActive: false`) or revoking a role immediately invalidates active refresh tokens in Redis.

### C. Multi-Outlet Scoping Rule (DEC-001)
* **Non-Negotiable Rule:** The active `outlet_id` is **always resolved server-side from the authenticated JWT session**.
* Any API request attempting to supply an `outlet_id` in the JSON request body or URL query to override permissions is rejected with `403 Forbidden` and flagged in security audit logs.

### D. Terminal Lock & Fast PIN Unlock
* Cashiers can lock their POS terminal (`🔒 Lock`) during brief absences.
* Unlocking requires re-entering the 4-digit cashier PIN on the touch keypad, avoiding full email/password re-authentication while preventing unauthorized orders.

### E. Privilege Elevation (Manager Override Workflow)
When a POS cashier attempts a privileged action exceeding their role's limit:
1. **Triggers:**
   - Applying a manual discount exceeding 15% (DEC-008).
   - Voiding/cancelling an order after KOT has reached `PREPARING` in the kitchen.
   - Performing a price override or post-settlement refund.
2. **Elevation Prompt:** An inline modal prompts for an authorized **Outlet Manager PIN / Credentials**.
3. **Audit Row:** The resulting database transaction writes an immutable audit record containing:
   - `operator_user_id` (the cashier who requested the action).
   - `approver_user_id` (the manager who elevated the privilege).
   - `reason_code` (mandatory cancellation or discount justification).
   - `timestamp` (UTC) and `outlet_id`.

---

## 2. Roles & Deep Responsibilities

The system defines **8 distinct operational roles**:

### 1. Super Admin (Platform Owner)
* **Scope:** Global / Enterprise-wide (all organizations and outlets).
* **Key Responsibilities:**
  - Create and configure organization tenants, branches, and outlets.
  - Manage global security baselines, tax rules (DEC-004), and payment gateway keys.
  - Assign organization-level roles and audit platform administrative access.
  - Review cross-outlet consolidated revenue and executive analytics.

### 2. Outlet Manager (Branch General Manager)
* **Scope:** Outlet-scoped (`outlet_id`).
* **Key Responsibilities:**
  - Supervise daily front-of-house and kitchen operations.
  - Open and close operational business days; verify end-of-day **Z-Reports**.
  - Authorize cashier elevation requests (order cancellations, post-KOT voids, custom discounts).
  - Assign outlet staff shifts and monitor cashier cash drawer floats.
  - Perform weekly physical inventory reconciliations.

### 3. POS Operator / Cashier (Front Desk)
* **Scope:** Terminal & outlet scoped (`terminal_id`, `outlet_id`).
* **Key Responsibilities:**
  - Take customer orders for Dine-In, Takeaway, and Direct Delivery.
  - Customize dishes using variant modifiers (crusts, spice levels, add-ons).
  - Manage table assignments, split bills among guests, and capture payments (Cash, Card, UPI).
  - Issue customer tax invoices and trigger instant kitchen KOT tickets.

### 4. Kitchen User (Executive Chef / Kitchen Staff)
* **Scope:** Kitchen station & outlet scoped (`station_id`, `outlet_id`).
* **Key Responsibilities:**
  - Monitor live Kitchen Display System (KDS) order queue.
  - Transition KOT ticket statuses (`QUEUED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED`).
  - Monitor prep SLA timers and prioritize delayed/breached tickets.
  - Trigger kitchen KOT reprints on local thermal printers when needed.

### 5. Menu Admin (Food & Beverage Manager)
* **Scope:** Menu catalog & brand scoped.
* **Key Responsibilities:**
  - Create and curate food categories, items, descriptions, and dietary tags.
  - Configure item base prices in minor units (`BIGINT`) and assign statutory GST tax slabs.
  - Build modifier option groups with mandatory vs. optional selection limits.
  - Synchronize menu changes with online aggregator platforms (Swiggy / Zomato).

### 6. Inventory User (Store Keeper / Supply Chain)
* **Scope:** Store & outlet inventory scoped.
* **Key Responsibilities:**
  - Monitor real-time raw ingredient levels and trigger **86-listing** (deactivation) when items run out.
  - Record ingredient stock receipts against Purchase Orders (GRN creation).
  - Log daily kitchen wastage and stock spoilage with reason codes.
  - Adjust portion counts and manage vendor master catalogs.

### 7. Finance User (Accountant / Controller)
* **Scope:** Financial accounts & outlet reports.
* **Key Responsibilities:**
  - Audit daily cash, card, and UPI settlement files against payment gateway webhooks.
  - Verify statutory GST collections (CGST 2.5% + SGST 2.5%) for monthly tax filings.
  - Match vendor purchase invoices with Goods Received Notes (3-way matching per DEC-018).
  - Export structured accounting journals to Tally / QuickBooks / ERP formats (DEC-013).

### 8. Auditor (Compliance & Internal Audit)
* **Scope:** Read-only inspection across all tables and audit trails.
* **Key Responsibilities:**
  - Inspect immutable audit trail tables for price overrides, refunds, and discount anomalies.
  - Review RBAC negative security access attempts and authentication logs.
  - Verify compliance with DPDP statutory data retention and right-to-erasure policies (DEC-020).

---

## 3. Granular Permission Matrix

| Permission Action Key | Super Admin | Outlet Manager | Cashier | Kitchen | Menu Admin | Inventory | Finance | Auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Menu & Catalog** | | | | | | | | |
| `menu.category.manage` | ✓ | ✓ | — | — | ✓ | — | — | Read |
| `menu.item.manage` | ✓ | ✓ | — | — | ✓ | — | — | Read |
| `menu.pricing.override` | ✓ | ✓ (Audit) | — | — | ✓ | — | — | Read |
| `menu.86.toggle` | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | Read |
| **Orders & Register** | | | | | | | | |
| `order.create` | ✓ | ✓ | ✓ | — | — | — | — | Read |
| `order.read` | ✓ | ✓ | ✓ | Read (KOT) | — | — | Read | Read |
| `order.discount.apply` | ✓ | ✓ | Up to 15% | — | — | — | — | Read |
| `order.void.pre_kot` | ✓ | ✓ | ✓ | — | — | — | — | Read |
| `order.void.post_kot` | ✓ | ✓ (Audit) | Elevation Req | — | — | — | — | Read |
| `order.table.transfer` | ✓ | ✓ | ✓ | — | — | — | — | Read |
| **Kitchen & KDS** | | | | | | | | |
| `kot.read` | ✓ | ✓ | ✓ | ✓ | — | — | — | Read |
| `kot.status.update` | ✓ | ✓ | — | ✓ | — | — | — | Read |
| `kot.reprint` | ✓ | ✓ | ✓ | ✓ | — | — | — | Read |
| **Billing & Payments** | | | | | | | | |
| `payment.capture` | ✓ | ✓ | ✓ | — | — | — | ✓ | Read |
| `payment.split_bill` | ✓ | ✓ | ✓ | — | — | — | — | Read |
| `payment.refund` | ✓ | ✓ (Audit) | Elevation Req | — | — | — | ✓ (Audit) | Read |
| `billing.invoice.generate` | ✓ | ✓ | ✓ | — | — | — | ✓ | Read |
| **Inventory & Purchasing** | | | | | | | | |
| `inventory.stock.adjust` | ✓ | ✓ | — | — | — | ✓ | — | Read |
| `inventory.po.create` | ✓ | ✓ | — | — | — | ✓ | ✓ | Read |
| `inventory.po.approve` | ✓ | Tier 1-2 | — | — | — | — | Tier 3 | Read |
| `inventory.grn.create` | ✓ | ✓ | — | — | — | ✓ | — | Read |
| `inventory.wastage.log` | ✓ | ✓ | — | — | — | ✓ | — | Read |
| **Reporting & Finance** | | | | | | | | |
| `report.operational.read` | ✓ | ✓ | Shift-only | — | — | Stock-only | ✓ | Read |
| `report.financial.read` | ✓ | ✓ | — | — | — | — | ✓ | Read |
| `report.accounting.export` | ✓ | — | — | — | — | — | ✓ | Read |
| `report.z_report.close` | ✓ | ✓ | — | — | — | — | ✓ | Read |
| **System & Administration** | | | | | | | | |
| `admin.outlet.manage` | ✓ | — | — | — | — | — | — | Read |
| `admin.user.manage` | ✓ | Outlet Staff | — | — | — | — | — | Read |
| `admin.role.assign` | ✓ | Cashier/Kitchen | — | — | — | — | — | Read |
| `audit.log.read` | ✓ | Outlet-only | — | — | — | — | — | ✓ (Global) |

---

## 4. Security & Audit Logging Non-Negotiables

1. **Transactional Audit Logging:** Every mutation marked with `(Audit)` or executed via **Elevation Override** writes a row to `audit_logs` in the **same database transaction**. If the audit write fails, the entire transaction rolls back.
2. **Zero Client Trust:** The frontend UI uses permissions solely to show/hide buttons for ergonomics. Every API endpoint enforces role and permission checks on the server.
3. **Immutable History:** Audit log records and order status history tables have `UPDATE` and `DELETE` permissions permanently revoked from application database users.
