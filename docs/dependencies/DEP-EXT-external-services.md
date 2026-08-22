# DEP-EXT — External Service Dependencies

**ID:** DEP-EXT · **Status:** DRAFT · **Owner:** Integration Lead · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** `REQ-INT`, `REQ-BIL`, DEC-005, DEC-007 · **Traced by:** `WF-INT-*`, `12-operations/runbook.md`

---

## Register

| ID | Dependency | Type | Crit. | Owner | Failure mode | Fallback | Status |
|----|-----------|------|-------|-------|-------------|----------|--------|
| `DEP-EXT-01` | Swiggy API | Aggregator | P1 | Integration Lead | Inbound orders stop; menu sync stale | Manual order entry from partner dashboard | 🔴 Not contracted — DEC-007 |
| `DEP-EXT-02` | Zomato API | Aggregator | P1 | Integration Lead | Inbound orders stop; menu sync stale | Manual order entry from partner dashboard | 🔴 Not contracted — DEC-007 |
| `DEP-EXT-03` | Payment gateway | Payments | P1 | Finance | Card/UPI capture fails | Cash-only mode; order still takeable | 🔴 Not selected — DEC-005 |
| `DEP-EXT-04` | SMS provider | Notifications | P2 | Ops | OTP + order notifications fail | In-app/printed order number | ⚪ Not selected |
| `DEP-EXT-05` | Email provider | Notifications | P3 | Ops | Receipts/reports not emailed | Download from UI | ⚪ Not selected |
| `DEP-EXT-06` | Accounting system | Finance export | P3 | Finance | Ledger export blocked | Manual CSV export | 🔴 Target system undecided — **new DEC needed** |
| `DEP-EXT-07` | Cloud provider | Infrastructure | P0 | IT | Total outage | Multi-AZ; DR per RPO/RTO | 🔴 Not selected — DEC-012 |
| `DEP-EXT-08` | Secrets manager | Security | P0 | Security | Deploys fail; running app unaffected | Cached secrets at runtime | 🔴 Pending DEC-011/012 |

---

## Aggregator Detail (DEP-EXT-01/02)

**The schedule risk.** Partner certification takes weeks regardless of our readiness — this is RSK-11, rated high impact and high probability.

| Requirement | Status |
|-------------|--------|
| Partner API documentation | 🔴 Not obtained |
| Sandbox credentials | 🔴 Not obtained |
| POS-partner certification | 🔴 Not started |
| Outlet ID mapping | 🔴 Blocked on above |
| Menu item ID mapping | 🔴 Blocked on above |
| Settlement file format | 🔴 Blocked on above |

**Action: engage partners in week 1 of Phase 0.** Every week of delay here is a week of R1.1 delay that cannot be compressed later by adding engineers.

**Isolation:** each aggregator sits behind an adapter (`WF-INT-01`). An API change reaches the adapter and stops there — no domain module knows Swiggy exists. This is the mitigation for RSK-02.

---

## Payment Gateway Detail (DEP-EXT-03)

Blocked on DEC-005. The choice determines:

- capture vs authorize-then-capture flow
- settlement file format, which determines the reconciliation design (`WF-FIN-02`)
- PCI scope, which determines the security architecture (DEC-011)
- webhook signature scheme and retry semantics
- refund API shape and timing

**Do not build a generic abstraction over an unselected gateway.** An abstraction designed without a concrete implementation abstracts the wrong things — pick the gateway, build to it, extract the interface when a second one arrives.

---

## Hardware

| ID | Dependency | Crit. | Failure mode | Fallback | Status |
|----|-----------|-------|-------------|----------|--------|
| `DEP-HW-01` | Kitchen printers | P2 | KOT not printed | Kitchen display + operator alert | 🔴 DEC-006 |
| `DEP-HW-02` | Receipt printers | P2 | No printed receipt | Digital receipt | 🔴 DEC-006 |
| `DEP-HW-03` | Cash drawer | P2 | Manual open | Physical key | 🔴 DEC-006 |
| `DEP-HW-04` | POS terminals | P0 | That terminal cannot take orders | Another terminal | ⚪ Not specified |
| `DEP-HW-05` | Kitchen display screens | P2 | Board invisible | Printed tickets | ⚪ Not specified |
| `DEP-HW-06` | Card reader / EDC | P1 | Card payment fails | Cash / UPI QR | 🔴 DEC-005 |

**Rule:** `DEP-HW-01` and `DEP-HW-02` are P2 by design. A printer failure raises an alert and degrades to display — it never blocks order taking (`WF-KOT-01`).

---

## Network

| ID | Dependency | Crit. | Failure mode | Fallback |
|----|-----------|-------|-------------|----------|
| `DEP-NET-01` | Outlet internet | P0 | **Everything stops** unless offline mode exists | 🔴 **DEC-002** |

This single row is why DEC-002 is a week-1 decision. Restaurant connectivity is not reliable, and the answer changes the entire client architecture — it is not a feature flag added later.

---

## Review Cadence

Reviewed at every checkpoint. A dependency whose status is still 🔴 at CP-00 blocks the gate.
