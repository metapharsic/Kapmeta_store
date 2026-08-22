# Authentication & Access Control — Functional Spec

**Source:** none · **Coverage:** 0% · **Status:** DRAFT · **Blocks on:** DEC-011, DEC-001

The source document contains nothing on authentication or access control. The RBAC matrix in [`08-security/security-framework.md`](../08-security/security-framework.md) is the **PROPOSED** baseline and is reproduced below unchanged. Role names are fixed by that document — do not invent new ones here or in code. Release scope **R1**: nothing else ships without this.

Tables owned by this module: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`.

## Non-Negotiables

Restating, because everything below depends on them:

1. **Authorization is enforced server-side on every request.** UI hiding is cosmetic only. A hidden button is not a control.
2. **Outlet context comes from the session, never from the request body.** A body- or query-supplied `outlet_id` is a privilege escalation vector and must be rejected, not merely ignored. If a handler needs to know the outlet, it reads it from the resolved session. If a user legitimately works across outlets, they switch outlet through an explicit, audited session operation — which re-issues the session — not by varying a request field.
3. Every authorization failure is logged and audited (protocol rule 7, security framework "Audited Actions").

## Authentication Methods

Two populations, two models. They are not interchangeable.

| Population | Method | Rationale |
|------------|--------|-----------|
| Administrative / back-office (Super Admin, Outlet Manager, Menu Admin, Inventory User, Finance User, Auditor) | Email + password + **MFA (mandatory)** | Low-frequency, high-privilege, personal device or desk. MFA cost per login is negligible; blast radius of a compromised admin account is the whole organization |
| POS floor (POS Operator, Kitchen User) | **PIN**, against a terminal that already holds an authenticated shift session | High-frequency, shared hardware, wet/greasy hands, queue of customers. A password + MFA prompt per order is not usable and will be defeated by staff sharing one logged-in account — which destroys attribution |

### Why POS needs a different model

The failure mode of forcing admin-grade auth onto a POS terminal is not "slow logins" — it is that the outlet leaves one account permanently signed in and every cancellation, discount and refund becomes unattributable. The PIN model exists to preserve **per-action attribution**, which is what the audit trail is for.

The tradeoff is explicit: a 4-6 digit PIN is weak authentication. It is acceptable **only** because:

- The terminal itself is authenticated and trusted (see [Terminal Registration](#terminal-registration--device-trust)). A PIN is worthless off a registered terminal.
- The PIN authenticates *within* an already-established, outlet-bound shift session. It never establishes outlet context by itself.
- PIN-holding roles have deliberately narrow permission sets — no Admin, no Reports, no Inventory.
- Elevated actions require a separate manager approval (see [Elevated Actions](#elevated-action-approval)).

PIN rules: unique per user within an outlet, minimum 6 digits, hashed with the same algorithm class as passwords, never logged, no sequential/repeated trivial values, rotated on staff departure.

## Session & Token Lifecycle

```
                 ┌─────────────────────────────────────────────┐
                 │  ADMIN SESSION                              │
                 └─────────────────────────────────────────────┘
  credentials ──► verify password ──► MFA challenge ──► issue session
                        │ fail             │ fail            │
                        ▼                  ▼                 ▼
                   lockout counter    lockout counter   access token (short TTL)
                                                        refresh token (long TTL,
                                                          rotating, single-use)
                                                              │
        ┌─────────────────────────────────────────────────────┤
        ▼                          ▼                          ▼
   access expires            explicit logout            refresh reuse detected
        │                          │                          │
   refresh → new pair        revoke session family       revoke ENTIRE family
        │                                                     │
        └──────────────► absolute lifetime reached ───────────┴──► re-authenticate


                 ┌─────────────────────────────────────────────┐
                 │  POS TERMINAL SESSION                       │
                 └─────────────────────────────────────────────┘
  registered terminal ──► shift open (manager or operator credentials)
              │
              ▼
      SHIFT SESSION  (outlet_id bound here, ONCE, for the whole shift)
              │
      ┌───────┴────────┬─────────────────┬──────────────────┐
      ▼                ▼                 ▼                  ▼
   PIN entry      PIN entry          idle timeout       shift close
   user A         user B          → locked, shift    → session ended,
      │              │               still open         all user contexts
      ▼              ▼                    │              cleared
  user context   user context             ▼
  swapped in     swapped in          PIN to resume
  (outlet_id UNCHANGED)
```

| Property | Admin session | POS shift session | POS user context |
|----------|---------------|-------------------|------------------|
| Established by | Password + MFA | Terminal identity + credentials | PIN |
| Access token TTL | Short (order of minutes) | Short | Inherits shift session |
| Absolute lifetime | Fixed cap; re-auth required after | Bounded by shift close | Until swap, idle lock, or shift close |
| Carries `outlet_id` | Yes, from grant selection | Yes, bound at shift open | No — inherited, never re-derived |
| Revocable | Yes, per session and per user | Yes, per terminal | Implicit on swap |

Sessions are rows in `sessions`, not stateless-only tokens: revocation must be immediate. A token whose session row is revoked or expired is rejected regardless of signature validity. Concrete TTL values are a DEC-011 output.

## Permission Model

Three levels, no shortcuts:

```
permission   'orders.cancel'          ← the atomic, code-referenced unit
     ▲
role_permissions
     │
role         'Outlet Manager'         ← a named set of permissions
     ▲
user_roles   (user_id, role_id, outlet_id)   ← the grant, always scoped
     │
user
```

- **Permissions** are stable string codes in `resource.action` form: `orders.create`, `orders.cancel`, `orders.refund`, `menu.price.update`, `payments.capture`, `payments.override`, `inventory.adjust`, `reports.read`, `customers.pii.read`, `users.manage`, `roles.manage`. Code checks reference the permission code, **never** a role name. `if (user.role === 'Outlet Manager')` is a defect.
- **Roles** are permission sets. They exist for administration convenience and carry no logic of their own.
- **Grants** live in `user_roles` and are scoped: `(user_id, role_id, outlet_id)`.
  - `outlet_id` set → the grant applies to that outlet only.
  - `outlet_id` **NULL** → organization-wide grant, all outlets present and future. Reserved for Super Admin and, where the organization chooses, Auditor.

Authorization check, every request:

```
resolve session → user_id + active outlet_id  (SESSION ONLY)
        ↓
load effective permissions for (user_id, active outlet_id)
        =  perms from grants where outlet_id = active outlet
        ∪  perms from grants where outlet_id IS NULL
        ↓
required permission present?
        ↓ no                              ↓ yes
  403 + audit row (failed authz)     proceed; handler additionally
                                     filters data by active outlet_id
```

Multi-outlet grant semantics are contingent on DEC-001. If it lands single-outlet, `outlet_id` on grants degenerates to a constant — but the column stays, because retrofitting scoping later is exactly the rewrite DEC-001 warns about.

## Roles

Reproduced from [`08-security/security-framework.md`](../08-security/security-framework.md). This table is the source of truth for role names.

| Role | Menu | Orders | KOT | Payments | Inventory | Reports | Admin |
|------|------|--------|-----|----------|-----------|---------|-------|
| Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Outlet Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Outlet-only |
| POS Operator | Read | Create/Read | Read | Capture | — | — | — |
| Kitchen User | Read | Read | Update | — | — | — | — |
| Menu Admin | ✓ | — | — | — | — | — | — |
| Inventory User | — | — | — | — | ✓ | Read | — |
| Finance User | Read | Read | — | ✓ | — | ✓ | — |
| Auditor | Read | Read | Read | Read | Read | ✓ | — |

Additional constraints not expressible in the grid:

| Role | Constraint |
|------|-----------|
| Super Admin | Only role that may hold a NULL-outlet grant by default; may manage roles and permissions; cannot be the only account with `users.manage` (break-glass second account required) |
| Outlet Manager | "Outlet-only" Admin means user and configuration management confined to their granted outlets. Cannot create or elevate a Super Admin |
| POS Operator | `orders.cancel`, `payments.override` and refund permissions are **excluded**; those route through elevated approval |
| Auditor | Read-only everywhere, including audit tables. Must not hold any write permission. This is the role most likely to be quietly widened — treat any write grant to Auditor as a review failure |
| Kitchen User | KOT status updates only; no pricing or customer data visibility |

Authentication method per role is fixed: PIN for POS Operator and Kitchen User, password + MFA for all others.

## Terminal Registration & Device Trust

`sessions` distinguishes user sessions from terminal-bound shift sessions; terminal identity is a prerequisite for the PIN model to be defensible.

1. A terminal is registered by an Outlet Manager or Super Admin, producing a terminal record bound to exactly one outlet.
2. Registration issues a device credential stored in the terminal's secure storage. It is not a shared secret across terminals.
3. Every POS request presents both the device credential and the session token. A valid session on an unregistered or revoked terminal is rejected.
4. A terminal's outlet binding is immutable after registration. Moving hardware between outlets requires de-registration and re-registration, both audited.
5. Terminals can be revoked remotely. Revocation terminates the shift session and all user contexts on it.
6. Lost/stolen terminal is an incident: revoke, then rotate PINs for staff at that outlet.

PIN authentication is accepted **only** on a registered terminal. Admin credentials on a POS terminal are accepted but do not confer PIN-swap behavior.

## Elevated Action Approval

Actions above the operator's permission set do not fail silently and do not require a full logout/login cycle.

Applies to: post-KOT cancellation (see [`orders.md`](orders.md)), discount above threshold (DEC-008), refund, payment override, price override, till adjustment.

```
Operator initiates action
        ↓
Permission check fails → server returns APPROVAL_REQUIRED (not 403)
        ↓
Terminal prompts for approver credential (manager PIN or password)
        ↓
Server verifies approver AND that approver holds the required permission
   at the SAME outlet as the session          ← outlet from session, always
        ↓ fail                                 ↓ pass
   deny + audit (failed authz)          action executes under the
                                        OPERATOR's user_id, with
                                        approved_by = APPROVER's user_id
                                        + reason code, one audit row,
                                        same transaction as the mutation
```

Rules:

- Approval is **per action**. It does not grant a window, a mode, or an elevated session. There is no "manager mode".
- Approval is never client-asserted. The terminal cannot send `approved: true`; it sends the approver credential and the server decides.
- The acting user remains the operator. Recording the manager as the actor destroys attribution and is a defect.
- Reason code is mandatory, from a configured list, consistent with the cancellation rule in [`orders.md`](orders.md).
- Self-approval is permitted only where the operator already holds the permission — in which case no approval flow occurs at all.

## Account Lockout & Password Policy

| Control | Rule |
|---------|------|
| Password minimum | 12 characters; screened against a known-breached password list; no composition rules that force predictable substitutions |
| Password storage | Memory-hard hash (argon2id or bcrypt with a reviewed cost factor). Never reversible encryption |
| Password rotation | Not forced on a schedule. Forced immediately on suspected compromise, and on first login for an admin-created account |
| MFA | Mandatory for all password-authenticated roles. TOTP baseline; enrolment cannot be skipped or postponed. Recovery codes issued once, hashed at rest |
| Password lockout | Progressive delay, then temporary lock after a threshold of consecutive failures. Counter is per account **and** per source IP |
| PIN lockout | Stricter — the keyspace is small. Low failure threshold, lock requires manager unlock at the terminal, and the lock is audited |
| Enumeration | Login and reset responses are identical for existing and non-existing accounts, and constant-time where feasible |
| Reset | Single-use, short-lived, out-of-band token. Reset invalidates all existing sessions for that user |
| Deactivation | Deactivating a user revokes all sessions immediately and removes PIN acceptance. Users are deactivated, never deleted — audit rows reference `user_id` |
| Rate limiting | Per user and per IP on all auth endpoints, per security framework |

Exact thresholds, MFA factor list and lockout durations are DEC-011 outputs. The controls themselves are not optional pending that decision.

## Audit Requirements

Every event below writes an audit row, in the same transaction as the change where one exists:

| Event | Recorded |
|-------|----------|
| Login success / failure | user (or attempted identifier), method, terminal, IP, outcome |
| MFA challenge success / failure | user, factor type, outcome |
| Logout, session revocation, refresh-token reuse detection | session id, reason |
| Outlet switch within a session | from outlet, to outlet, re-issued session id |
| PIN swap on a terminal | terminal, previous user, new user, shift session id |
| Shift open / close | terminal, opening user, outlet, timestamps |
| Failed authorization (403) | user, permission code required, outlet, endpoint |
| Elevated-action approval | operator, approver, permission, reason code, target record |
| Role/permission grant or revoke | actor, subject user, role, outlet scope, before/after |
| Terminal registration / revocation | actor, terminal, outlet |
| Password/PIN change, reset, lockout, unlock | actor, subject, mechanism |

Audit rows are append-only; no application role holds `UPDATE` or `DELETE` on audit tables. Audit records carry `user_id`, `outlet_id` and `correlation_id`, and **never** credentials, tokens, PINs, MFA codes, or customer contact details (protocol rule 10). Failed logins record the attempted identifier — which may be an email, and is therefore PII subject to the retention rules in [`crm-marketing.md`](crm-marketing.md) and DEC-010.

Retention period for access audit data is undecided (DEC-010). Audit depth is undecided (DEC-011). Both are needed before R1 sign-off, not after.

## Open Decisions

| ID | Blocks |
|----|--------|
| DEC-011 | Token TTLs, lockout thresholds, MFA factor list, audit depth, PII handling in auth logs, PCI-adjacent constraints on terminal trust |
| DEC-001 | Whether outlet-scoped grants and NULL-outlet organization grants are real or degenerate |
| DEC-010 | Retention of session, audit and failed-login records |
| DEC-002 | Offline POS: whether a terminal must authenticate and authorize while disconnected, and how PIN verification and audit rows reconcile on sync. Currently unsolved and potentially model-breaking |
| DEC-008 | Discount approval thresholds that drive the elevated-action flow |
