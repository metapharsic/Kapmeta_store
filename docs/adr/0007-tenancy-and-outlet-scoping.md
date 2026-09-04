# ADR-0007: Tenancy and Outlet Scoping Scaffolding

**Status:** Accepted
**Date:** 2026-08-08
**Deciders:** Product Owner, Solution Architect, DBA
**Related:** DEC-001, ADR-0006 (record architecture decisions), ADR-0005 (`outlet_id` everywhere — overlapping scope, see note below), schema-reference.md

## Context

Our restaurant management platform is targeted for chains and franchises, meaning multi-outlet scoping is a hard requirement. In the initial requirements draft, ~40% of the operational logic was undefined. If we design the transactional data schema as a single-outlet model in R1 and defer multi-outlet capability, retrofitting it later (adding `outlet_id`, rewriting composite keys, unique constraints, updating reports, and migrating live data) would carry an estimated cost of 35-60 person-days and present a high risk of cross-outlet data leak bugs.

## Options Considered

* **Option A (Accepted)**: **Outlet-scoped from migration 001**. Every operational table carries `outlet_id NOT NULL`. The session context automatically resolves the outlet, and query structures enforce this filter. UI default is single-outlet in R1.
* **Option B**: **Single-outlet schema now, retrofit later**. Simpler schemas in R1, but extremely expensive and risky migration in R2.
* **Option C**: **Column present, enforcement deferred**. Column is added to schema but no query boundary checks or session scopes are built. (Rejected: promotes developer bad habits of ignoring the column, resulting in hundreds of unscoped queries later).

## Decision

We chose **Option A**. Every operational database table will carry an `outlet_id` column as a primary composite key constituent or a required foreign key from the very first migration (`0001_init_identity_and_org.sql` and onwards).
* The API gateway will resolve `outlet_id` from the secure session JWT claims.
* Request bodies are blocked from specifying or overriding the `outlet_id` manually to prevent privilege escalation.
* We will establish automated linting/query validation tests in the CI pipeline to fail any database queries against operational tables that omit the `outlet_id` predicate.

## Consequences

* **What becomes easier**: Scalability to franchises, chain restaurants, and multi-outlet entities is native and requires zero future schema migrations. Consolidated and per-outlet analytics reporting are built cleanly.
* **What becomes harder**: Every queries and joins must specify the `outlet_id` predicate. Indexes must lead with `outlet_id` to maintain performance.
* **Commitment**: Permanent presence of `outlet_id` on all operational models.

---

## Relationship to ADR-0005 (overlapping scope — read both)

ADR-0005 (`outlet_id` on Every Tenant-Scoped Table) records **the same core
decision** as this ADR, written independently two weeks later (2026-08-21)
during schema design, where it was originally tracked as DEC-023. Both are
retained: neither is redundant, because each carries material the other
lacks, and neither has been rewritten to hide that they overlap.

**Unique to this ADR (0007):** the enforcement mechanism — `outlet_id` is
resolved from the session JWT claims at the API gateway; a request body
that carries `outlet_id` is rejected at the boundary rather than merged
with the session value (privilege-escalation guard); and automated
linting/query-validation tests in CI fail any query against an operational
table that omits the `outlet_id` predicate. It also carries the costed
retrofit estimate (35-60 person-days) inherited from DEC-001.

**Unique to ADR-0005:** the cost-asymmetry rationale in full, the
interaction with per-outlet sequences (`bill_no` unique per
`(outlet_id, bill_no)`, per ADR-0004), the explicit statement that v1
ships **no** multi-outlet management UI, and the rejected alternatives.

**Known discrepancy, deliberately not resolved here:** this ADR states the
rule as "every **operational** database table" with no exception. ADR-0005
states it as "every **tenant-scoped** table", explicitly carving out
"genuinely global config, such as a system-wide feature flag table with no
outlet dimension". These are not the same rule at the margin. ADR-0005 is
the later and more specific formulation, but this ADR has never been
superseded, so both claims stand on the record. A table that is arguably
global config should be treated as an open question for review, not
silently decided by whichever ADR the author happened to read.
