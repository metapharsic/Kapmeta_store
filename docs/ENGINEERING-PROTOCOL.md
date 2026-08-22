# Engineering Protocol

**The rules for shipping code in this repository.** A PR that violates any MUST here gets rejected regardless of how well it works.

Read [`START-HERE.md`](START-HERE.md) first.

---

## 1. Non-Negotiables

These exist because a POS handles money, tax, and food that has already been cooked. Getting them wrong produces incidents that cannot be undone by a redeploy.

| # | Rule | Why |
|---|------|-----|
| 1 | **Money is `BIGINT` minor units + currency code. Never a float.** | Float arithmetic silently corrupts totals and tax |
| 2 | **Every operational table and query carries `outlet_id`.** | Cross-outlet data leaks are the worst-case bug |
| 3 | **Authorization is enforced server-side, every request.** UI hiding is cosmetic only. | UI-only checks are trivially bypassed |
| 4 | **Outlet context comes from the session, never from the request body.** | Body-supplied outlet ID is a privilege escalation |
| 5 | **Order, payment and inventory state is append-only.** Write status history; never overwrite. | Audit and dispute resolution depend on history |
| 6 | **Every mutating public endpoint and webhook accepts `Idempotency-Key`.** | Retries must not double-charge or duplicate orders |
| 7 | **Privileged mutations write an audit row in the same transaction.** | An audit written afterwards can be lost |
| 8 | **Schema changes only via migration.** No manual DDL in any shared environment. | Environments drift, and drift surfaces in production |
| 9 | **Timestamps stored UTC; presented in outlet timezone.** Business day is config, not midnight. | A restaurant's day ends at 2 a.m., not 12 a.m. |
| 10 | **No secrets in the repo. No PII in logs, fixtures, or lower environments.** | Legal and contractual exposure |
| 11 | **No hardcoded business data; user insertion provision mandatory.** | Content must be dynamic and manageable via UI/DB/API |

---

## 2. Workflow: Story → Merge

```
Story assigned
   ↓
Check DEC blockers (01-discovery/decision-register.md)
   ↓  blocked → escalate, stop
Check Definition of Ready
   ↓  not ready → return to BA, stop
Read module requirement doc + API standards
   ↓
Structural change? → raise ADR, get it merged FIRST
   ↓
Update OpenAPI spec in contracts/  ← spec before implementation
   ↓
Write migration (if schema changes)
   ↓
Implement + tests
   ↓
Self-check against Definition of Done
   ↓
PR (template auto-fills the checklist)
   ↓
Review: 1 approver, +1 from Security for auth/payment/audit changes
   ↓
CI green → merge
```

**Spec before code.** The OpenAPI file is the contract, not documentation of what you happened to build. Frontend works against the spec in parallel.

---

## 3. Branching & Commits

```
main       ← production; tagged releases only
develop    ← integration; CI runs on every merge
feature/POS-123-short-description
fix/POS-456-short-description
hotfix/POS-789-short-description   ← branches from main
```

Conventional Commits. Subject ≤ 50 chars, imperative mood.

```
feat(orders): add cancellation reason code validation

Cancellation after KOT now requires an elevated role and a reason
from the configured code list. Writes an audit row in the same
transaction as the status transition.

Refs: POS-123, DEC-003
```

Body only when the "why" is not obvious from the subject. Reference the story and any DEC/ADR.

---

## 4. Code Standards

### Structure

- Domain modules in `services/` own their tables. **No cross-module table reads** — call the owning module's API. This boundary is what makes later extraction to microservices possible.
- Shared types live in `packages/shared-types`, generated from OpenAPI. Do not hand-write a duplicate interface.
- Business rules (pricing, tax, discounts, state transitions) live in one place per concern. Duplicating tax logic into a report is how two numbers start disagreeing.

### Errors

Throw typed domain errors; the API layer maps them to the error model in [`06-api/api-standards.md`](06-api/api-standards.md). Never leak a stack trace or SQL text to a client.

### Validation

Validate at the boundary — request schema, then business rules. A handler must never trust a field just because the UI populated it.

### Transactions

Order creation + KOT generation share one transaction. Payment capture + invoice + inventory consumption are event-driven, idempotent, and individually retryable. Never hold a transaction open across an external HTTP call.

### Logging

Structured JSON. Always include `correlation_id`, `outlet_id`, `user_id`. Never log card data, tokens, passwords, or customer contact details.

---

## 5. Testing Requirements

| Change type | Required tests |
|-------------|---------------|
| Pricing / tax / discount | Unit tests with boundary cases; a reviewer from Finance |
| State transition | Unit test per legal and illegal transition |
| API endpoint | Contract test + authorization test (correct role, wrong role, wrong outlet) |
| Webhook handler | Duplicate-delivery test proving exactly one internal record |
| Migration | Applies to an empty DB and to a snapshot with existing data |
| UI component | Empty, loading, success, validation error, server error, permission denied |

Coverage targets in [`09-testing/test-strategy.md`](09-testing/test-strategy.md). Coverage is a floor, not a goal — an untested illegal state transition is a defect regardless of the percentage.

---

## 6. When To Raise An ADR

Raise one before implementing if the change:

- adds or removes a table, or changes a relationship
- changes an API contract in a breaking way
- introduces a new dependency, service, or infrastructure component
- changes how auth, money, or audit works
- implements an approved `DEC-xxx`

Template: [`templates/adr-template.md`](templates/adr-template.md). Numbering is sequential.

---

## 7. Definition of Done

Full list in [`00-governance/definition-of-ready-done.md`](00-governance/definition-of-ready-done.md). Short form:

reviewed · tested · migration tested both directions · OpenAPI updated · audit logging present · permissions enforced server-side · performance baseline met · QA passed · UAT recorded · rollback steps written.

---

## 8. Escalation

| Situation | Action |
|-----------|--------|
| Requirement is ambiguous | Ask the BA. Do not decide it in code. |
| Requirement is missing entirely | Check the decision register. If absent, raise a new DEC. |
| Spec and reality conflict | The spec wins; if the spec is wrong, fix the spec in the same PR. |
| Production incident | Follow [`12-operations/runbook.md`](12-operations/runbook.md). Preserve data. |
| Scope grows mid-story | Stop. Raise a CR ([`00-governance/change-control.md`](00-governance/change-control.md)). |

**Never guess at tax, money, or permissions.** Every other ambiguity can be refactored later. These three cannot.

---

**Version:** 1.0 · **Owner:** Solution Architect
