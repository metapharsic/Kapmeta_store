# ADR-0002: Tenancy and Outlet Scoping Scaffolding

**Status:** Accepted
**Date:** 2026-08-08
**Deciders:** Product Owner, Solution Architect, DBA
**Related:** DEC-001, ADR-0001, schema-reference.md

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
