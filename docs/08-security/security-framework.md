# Security & Compliance Framework

**Status:** APPROVED · **Owner:** Security Engineer · **Approved by:** Abdul Mannan, Admin · **Date:** 2026-08-09
**Detailed Specification:** [`docs/08-security/user-management-rbac.md`](user-management-rbac.md)

---

## 1. RBAC Matrix Overview

| Role | Menu | Orders | KOT | Payments | Inventory | Reports | Admin |
|------|------|--------|-----|----------|-----------|---------|-------|
| **Super Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (Global) |
| **Outlet Manager** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Outlet-only |
| **POS Operator** | Read | Create/Read | Read | Capture | — | Shift-only | — |
| **Kitchen User** | Read | Read | Update | — | — | — | — |
| **Menu Admin** | ✓ | — | — | — | — | — | — |
| **Inventory User** | — | — | — | — | ✓ | Read | — |
| **Finance User** | Read | Read | — | ✓ | — | ✓ | — |
| **Auditor** | Read | Read | Read | Read | Read | ✓ | — |

*Permissions are strictly outlet-scoped per DEC-001. For the complete granular permission mapping across 35+ actions, see [user-management-rbac.md](user-management-rbac.md).*

---

## 2. Mandatory Controls

- **Backend-Enforced RBAC:** Evaluated server-side on every request using JWT token claims — never client UI-only.
- **MFA on Administrative Accounts:** Required for Super Admin and Outlet Manager accounts performing financial or security mutations.
- **TLS 1.2+ Transit Encryption:** Enforced across all network traffic between POS terminals, API gateways, and microservices.
- **Zero Secrets in Git:** Encrypted secrets management via environment variables or secret vaults.
- **Boundary Validation & Output Encoding:** Strong schema validation at API boundary using Zod / TypeScript shared contracts.
- **Dependency Scanning:** CI/CD automated vulnerability scanning; build fails on High/Critical CVEs.
- **Pre-Go-Live VAPT:** Comprehensive penetration testing required prior to CP-07 sign-off.

---

## 3. Non-Negotiable Audited Actions

The following operations must write an immutable audit row in the **same database transaction**:
* Menu price adjustments & 86-listing status changes
* Order cancellations, bill voids, and post-KOT refunds
* Privilege elevation / Manager override authorizations
* Manual discount applications exceeding standard thresholds (DEC-008)
* Stock adjustments, wastage logs, and purchase order approvals
* User role assignments and permission updates
* Failed authorization and privilege escalation attempts

---

## 4. Threat Model & Mitigations

| Threat | Control Implemented |
|---|---|
| **Forged aggregator webhook** | HMAC-SHA256 signature verification + partner IP allowlisting (DEC-007). |
| **Replayed webhook / duplicate orders** | Mandatory `Idempotency-Key` + unique constraint on external channel order IDs. |
| **Cross-outlet data tampering** | `outlet_id` resolved strictly from JWT session context, never accepted from request body. |
| **Cashier discount abuse** | Threshold-based approval (manager elevation prompt) + immutable transaction audit row. |
| **Card data exposure** | No PAN / cardholder data stored; hosted gateway capture keeps PCI-DSS scope minimal (DEC-005/011). |
| **DPDP Customer erasure vs tax audit** | PII scrubbed on erasure requests while retaining statutory invoice totals and tax ledger rows (DEC-020). |
