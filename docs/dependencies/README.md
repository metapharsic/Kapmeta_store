# Dependencies

**ID:** DEP-INDEX · **Status:** DRAFT · **Owner:** Solution Architect · **Version:** 1.0 · **Updated:** 2026-08-08

Everything this system relies on that it does not control. An unregistered dependency is an unmanaged risk.

---

## Files

| ID | File | Covers |
|----|------|--------|
| `DEP-EXT` | [DEP-EXT-external-services.md](DEP-EXT-external-services.md) | Aggregators, payment gateways, SMS/email, accounting |
| `DEP-INT` | [DEP-INT-internal-modules.md](DEP-INT-internal-modules.md) | Module-to-module dependencies, build order |
| `DEP-TEC` | [DEP-TEC-technical-stack.md](DEP-TEC-technical-stack.md) | Runtime, infrastructure, libraries, hardware |

---

## Registration Requirement

Every external dependency records:

| Field | Why |
|-------|-----|
| Owner | Someone must be accountable when it breaks |
| Criticality | Determines whether an outage stops service |
| Failure mode | What the system does when it is down |
| Fallback | The degraded path, if any |
| SLA | What we are entitled to expect |
| Contract/cert status | Whether we are even allowed to use it in production |

A dependency with no documented failure mode will take the system down in a way nobody planned for. That is not hypothetical — it is the normal outcome.

---

## Criticality Levels

| Level | Meaning | Example |
|-------|---------|---------|
| **P0** | Outage stops order taking | PostgreSQL |
| **P1** | Outage stops a revenue channel | Payment gateway, aggregator |
| **P2** | Outage degrades but service continues | Printer, SMS |
| **P3** | Outage is invisible to customers | Accounting export, analytics |

Design rule: **no P2 or P3 dependency may block a P0 path.** A printer failure must never prevent an order from being taken.
