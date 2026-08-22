# DEC-001: Single vs Multi-Outlet Architecture

**ID:** DEC-001
**Status:** APPROVED
**Owner:** Product Owner
**Raised by:** Solution Architect
**Due:** 2026-08-15 (Wk 1)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-001, [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) rules 2 and 4, [`schema-reference.md`](../05-database/schema-reference.md) design rule 4
**Traced by:** every row in [`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md) — all `DB-` objects, all `REQ-*`, all `UX-*`

---

## Question

Does the tenancy model carry `outlet_id` on every operational table, query and permission check from the first migration, or does R1 ship a single-outlet schema with multi-outlet deferred to a later release?

## Context

- [`schema-reference.md`](../05-database/schema-reference.md) design rule 4 already **assumes** the answer ("every operational table carries `outlet_id` from day 1, even if launch is single-outlet (DEC-001)"). That is a proposal by the DBA, not an approved decision. It has not been costed or signed.
- [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) non-negotiables 2 and 4 state the same thing as a hard rule. If DEC-001 lands on single-outlet, **two of the ten non-negotiables must be rewritten**, which is itself a protocol change requiring an ADR.
- The source material describes one restaurant's screens. It says nothing about chains, franchise boundaries, central kitchens, cross-outlet stock transfer, or consolidated reporting. Absence of evidence here is genuinely ambiguous: the source is a UI walkthrough, not a scoping document.
- The unresolved sub-question hiding inside this one: is the hierarchy `organization → outlet` (two levels, in the schema today) or `organization → region/brand → outlet` (three)? A two-level commitment is cheap to extend only if `outlets` carries a nullable parent from day 1.
- Franchise ownership is a different axis from outlet scoping. A franchisee who may see their own outlets but not the brand's aggregate P&L is a permission model question, not just a foreign key. If franchising is plausible within 24 months, that shapes the answer more than outlet count does.
- `MAP-REQ` blast radius for DEC-001 reads "Every row above." That is accurate, not rhetorical.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Outlet-scoped from migration 001.** `outlet_id NOT NULL` on every operational table; outlet resolved from session claims; every query filtered; row-level enforcement in the data-access layer with a test that fails any query missing the predicate. UI ships with a single outlet and no outlet switcher. | ~10-14 person-days in R1 (schema, session context plumbing, auth scoping, query-layer guard, test harness). Slightly wider indexes and a mandatory leading `outlet_id` on composite indexes. | Paying for a capability that may never be sold. Developers who do not understand why the column exists will drop it from a query; needs an automated guard, not discipline. | Yes — cheap. Dropping unused scoping later is a nullable-column exercise. |
| B | **Single-outlet schema now, retrofit later.** No `outlet_id`. Simpler queries and joins for R1. | ~0 in R1. Retrofit estimated **35-60 person-days** plus a migration against live production data: backfill every operational table, rewrite every query, re-derive every historic report, re-issue permission grants, and re-key `UNIQUE (outlet_id, order_number)`. | The retrofit lands after go-live, i.e. against real orders, real invoices and real audit rows. A missed predicate in a retrofitted query is a cross-outlet data leak — the worst-case bug named in the protocol. | **No, in practice.** Technically reversible; commercially it becomes a rewrite nobody funds. |
| C | **Outlet column present, enforcement deferred.** Add `outlet_id` to all tables now, default to a single seeded outlet, but do not build session scoping, permission scoping, or the query guard until multi-outlet is sold. | ~3-4 person-days in R1. Enforcement later ~12-18 person-days but with no data backfill. | The dangerous middle. A column that exists but is never enforced trains everyone to ignore it, and code written for 18 months assumes exactly one outlet. Enforcement day finds hundreds of unscoped queries. | Partly — data shape is safe, code habits are not. |
| D | **Defer.** Start on non-operational work (auth primitives, catalog CRUD) and revisit at Wk 3. | Blocks the R1 critical path immediately (see Blocked Work). | Every week of delay is a week of code written against an unknown tenancy model, which is functionally Option B with worse bookkeeping. | n/a |

## Impact If Wrong

**If we ship single-outlet and multi-outlet is later required:** the retrofit runs against a live production database. `orders`, `order_items`, `order_status_history`, `payments`, `invoices`, `stock_movements` and `audit_logs` all need a backfilled `outlet_id`, which means a maintenance window on a system that a restaurant uses from 11:00 to 02:00 — there is no quiet hour. `UNIQUE (order_number)` must become `UNIQUE (outlet_id, order_number)`, and every order number already issued belongs to a namespace that did not exist when it was printed on a customer's bill. Historic reports produced before the retrofit cannot be re-sliced by outlet, so year-on-year comparison breaks at the retrofit date permanently. Every permission grant issued under the old model must be re-derived, and any query the retrofit missed silently returns another outlet's revenue to whoever asks for it.

**If we ship outlet-scoped and it is never needed:** we carry an always-equal column on ~40 tables, a redundant predicate in every query, and roughly two weeks of R1 effort spent. That is the entire downside. It is recoverable and it does not touch customer data.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/auth` (`REQ-AUTH`) | Session claim shape, permission model, `user_roles` scoping — cannot design a role without knowing what it is scoped to | 5 |
| Database / migrations | Migration 001 cannot be written. Nothing downstream of it can start. | 5 |
| `services/orders` (`REQ-ORD`) | `UNIQUE (outlet_id, order_number)` vs `UNIQUE (order_number)`; order number generation strategy | 3 |
| `services/reporting` (`REQ-RPT`) | Summary table grain; every `*_summary` table is either outlet-grained or not | 2 |
| UX (`UX-*`) | Outlet switcher, outlet indicator in header, outlet picker on every report screen | 2 |
| **Total** | | **~17 person-days/week** |

## Recommendation

**Option A.** The asymmetry decides this, not the outlet forecast.

Option A's worst case is two wasted weeks and a redundant column. Option B's worst case is a schema-wide migration against live money and a class of bug the protocol names as worst-case. When one option's failure mode is "we spent 14 days we did not need to" and the other's is "a franchisee can read another franchisee's revenue", the price of A is cheap insurance regardless of how likely multi-outlet actually is.

Option C is the one to actively argue against. It gives the appearance of having decided while delivering none of the safety, and the 18 months of single-outlet-assuming code it produces is the real cost, not the column.

Two conditions on A that should be part of the approval, because they are what makes the estimate hold:
1. Outlet context comes from the session only (protocol rule 4). A request body that carries `outlet_id` is rejected at the boundary, not merged with the session value.
2. The query guard is automated — a test or lint rule that fails any query against an operational table without an `outlet_id` predicate. Without it, Option A degrades into Option C within a quarter.

The Product Owner should overrule this if there is a firm commercial commitment that this product serves exactly one restaurant and will be retired rather than extended. That is a legitimate answer; it just needs to be stated so the protocol can be amended honestly rather than quietly violated.

---

## Decision

**Decided:** Option A — Every operational table carries `outlet_id NOT NULL` and all permissions are outlet-scoped from migration 001. Single outlet UI to start, but the schema will enforce tenancy boundaries from day 1.
**Rationale:** The cost of retrofitting outlet scoping later is estimated at 35-60 person-days of high-risk migrations. Building it from day 1 is cheap insurance against database-wide changes.
**Approved by:** Product Owner & Solution Architect
**Date:** 2026-08-08
**ADR:** ADR-0001

## Consequences

*To be completed on decision. The following applies if Option A is approved.*

**Becomes possible:** multi-outlet, franchise and central-kitchen models without a data migration; per-outlet permission scoping; consolidated and per-outlet reporting from the same summary tables; outlet-level configuration (business day boundary, timezone, tax registration) as a first-class concept.

**Becomes harder:** every query gains a mandatory predicate; every composite index leads with `outlet_id`; every new table needs a scoping justification at review; cross-outlet features (stock transfer, consolidated P&L) need explicit authorization design rather than falling out of the schema for free.

**Permanent commitment:** `outlet_id` becomes load-bearing in the primary keys, unique constraints and index strategy of ~40 tables. Removing it later is a schema-wide migration in its own right. It also fixes the tenancy grain at the outlet — a future need to scope below the outlet (e.g. per-terminal or per-floor ledgers) is a separate decision that this one does not pre-answer.

## Follow-Up

- [ ] ADR raised (structural): ADR-0001 — tenancy and outlet scoping model
- [ ] `DECISION-LOG.md` updated
- [ ] Downstream artifacts updated: all `REQ-*`, [`schema-reference.md`](../05-database/schema-reference.md), [`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md)
- [ ] Confirm organization→outlet depth (2 vs 3 levels) — sub-question, may need its own DEC
- [ ] Confirm franchise permission axis is in or out of scope
- [ ] Query guard (lint/test) added to CI before migration 001 merges
- [ ] Affected teams notified: all
- [ ] Estimate re-baselined if scope changed
