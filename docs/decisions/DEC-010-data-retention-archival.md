# DEC-010: Data Retention & Archival

**ID:** DEC-010
**Status:** OPEN
**Owner:** Legal + IT
**Raised by:** Solution Architect
**Due:** 2026-08-29 (Wk 3)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-010 · [`schema-reference.md`](../05-database/schema-reference.md) design rule 9 and Partitioning section
**Traced by:** `DB-TBL-AUDIT_LOGS`, `ACCESS_LOGS`, `INBOUND_EVENTS`, `OUTBOUND_EVENTS`, `REQ-FIN`, `REQ-CRM`, archival jobs

---

## Question

What is the retention period, archival destination and deletion policy for each class of data this system holds — and where a customer erasure request collides with a statutory invoice retention obligation, which one wins and by what mechanism?

## Context

- [`schema-reference.md`](../05-database/schema-reference.md) already commits to monthly range partitions on `audit_logs`, `access_logs`, `inbound_events` and `outbound_events`, "archived per DEC-010". The partitioning mechanism is decided; the *policy it enforces* is not. Partitions with no defined retention simply accumulate.
- [`DECISION-LOG.md`](DECISION-LOG.md) rates this Low-medium with a "contained blast radius". That rating holds for the archival mechanics. It does not hold for the erasure conflict, which is a legal exposure in both directions and is separately tracked as **[DEC-020](DECISION-LOG.md)** — flagged in the log as "the one to escalate first" and explicitly noted as having no obvious technical answer. **DEC-010 and DEC-020 should be reviewed in the same session by the same Legal owner.** Deciding retention without deciding erasure produces a policy that cannot be implemented.
- The data classes have genuinely different drivers and should not share one period:

| Class | Tables | Driver |
|---|---|---|
| Statutory financial | `invoices`, `invoice_items`, `ledger_entries`, `payments`, `settlements` | Tax and companies legislation — a fixed minimum, not a business preference |
| Operational transactional | `orders`, `order_items`, `order_status_history`, `kot_*`, `stock_movements` | Business need, dispute resolution, and — critically — the ability to recompute reports |
| Customer personal data | `customers`, `customer_addresses`, `customer_tags`, `loyalty_accounts` | Data protection law, including erasure rights |
| Audit and access | `audit_logs`, `access_logs`, `configuration_changes` | Security investigation and compliance evidence |
| Integration events | `inbound_events`, `outbound_events`, `sync_jobs`, `integration_errors` | Debugging and dispute; idempotency guards depend on them |
| Derived summaries | `*_summary`, `kot_performance` | Cheap to keep, expensive to lose — but only meaningful if recomputable |

- **The erasure conflict, stated precisely.** A customer exercises a right to erasure. Their name and address appear on invoices that must be retained by law for a fixed statutory period. Deleting the invoice breaks the statutory obligation. Retaining the invoice intact appears to breach the erasure right. The available mechanisms — and this is a menu for Legal, not a recommendation — are roughly: (a) refuse erasure for the statutory subset and document the lawful basis; (b) sever the link between `customers` and `invoices`, keeping the invoice with the name as it was printed but removing all other linkage; (c) pseudonymise the customer record while retaining the invoice's own captured name; (d) delete the customer record and retain the invoice as an immutable document with the name embedded. Each has a different technical consequence and only Legal can say which is lawful.
- **A retention limit on integration events breaks an idempotency guard.** `UNIQUE (channel_account_id, external_event_id)` prevents duplicate order ingestion. Once the partition holding an event is dropped, a re-delivery of that event is no longer detectable as a duplicate. Retention for these tables must therefore exceed the maximum plausible partner re-delivery window, which is a question for [DEC-007](DEC-007-aggregator-apis.md) partners, not a free choice.
- **Retention bounds what reports can ever be recomputed.** [DEC-009](DEC-009-reporting-kpi-formulas.md) recommends retaining order-level detail sufficient to recompute any summary — that is the insurance policy against a KPI definition being wrong. If detail is purged on a shorter cycle than summaries are kept, a definition correction can be applied to recent periods only, and the series has a permanent discontinuity.
- Protocol constraint: no PII in lower environments (rule 10). Any archive that is restorable to a non-production environment for analysis needs a masking step, or the archive itself becomes a PII exposure.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Single retention period for everything** (e.g. keep all data for the longest statutory period, delete nothing else). | Lowest to specify — ~3 person-days. Highest to run: storage grows without bound and query performance on unpartitioned-in-practice tables degrades. | Retaining personal data longer than necessary is itself a data-protection problem, so "keep everything" is not the safe default it appears to be. Also makes erasure requests maximally expensive. | Yes, but data already deleted under any policy is gone. |
| B | **Per-class retention with archival to cold storage.** Each class gets its own period; expired partitions are detached and archived to object storage rather than dropped; restore path defined and tested. | ~12-18 person-days (policy definition, archival jobs, restore tooling, masking for non-production restore). Ongoing storage cost, low. | The restore path is the part that is usually built and never tested, and it is only ever needed under pressure. Archive is also a PII store with its own access-control obligations. | Yes — periods can be extended going forward, but never for data already purged. |
| C | **B plus hard deletion at end of retention, with a documented erasure mechanism.** Archived data is destroyed at the end of its period; customer erasure requests are honoured via the mechanism Legal selects. | B + ~8-12 person-days. | Hard deletion is irreversible by design, which is the point and also the danger. A policy error deletes data that was needed, and there is no recovery. Requires a review gate before any purge job runs in production for the first time. | **No.** Deletion is the one operation on this list with no undo. |
| D | **Defer the policy, build the mechanism.** Ship partitioning and an archival job with an infinite retention period configured; decide actual periods before the first partition would expire. | ~6-8 person-days. Buys roughly a year of runway. | Legitimate for the archival half. **Not legitimate for the erasure half** — the first customer record written to production creates the obligation, and the log already states Legal must decide "before any customer data is stored in production". | Yes for retention; the erasure question is not deferrable past first production customer data. |

## Impact If Wrong

**If a statutory retention period is set too short:** invoices required for a tax assessment or audit have been destroyed. There is no technical remedy — the data is gone, and the exposure is a legal one against the company, not a defect against the software. Under Option C this is a one-way door, which is why the periods themselves must come from Legal in writing rather than from an engineering estimate.

**If erasure is implemented as a hard delete of the customer row without Legal's mechanism:** the foreign key from `invoices` to `customers` breaks, or cascades, and either the invoice is orphaned or it is destroyed along with the customer. If it cascades, statutory records were deleted by a routine customer request — the worst outcome available here, and it happens silently the first time someone exercises the right.

**If personal data is retained indefinitely because no policy was set:** the company holds customer names, phone numbers and addresses for years past any business need. This is the failure mode of doing nothing, and doing nothing is what happens if this decision stays open.

**If integration event retention is shorter than a partner's re-delivery window:** a partner re-sends an old event, the idempotency guard no longer has the row to match against, and a duplicate order is created — cooked, served, and billed a second time.

**If order detail is purged while summaries are kept:** a KPI formula correction under [DEC-009](DEC-009-reporting-kpi-formulas.md) can be applied only to periods with surviving detail. The reported series then contains a permanent discontinuity at the purge boundary that cannot be explained away or corrected.

**If archives are restorable to non-production without masking:** a developer restores a production archive to debug an issue and PII lands in a lower environment, in breach of protocol rule 10 and whatever contractual terms sit above it.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Database / partitioning | Partition retention configuration; whether detach-and-archive or drop; archival job design | 3 |
| `services/finance` (`REQ-FIN`) | Invoice immutability and the customer-linkage model — shaped entirely by the erasure mechanism chosen | 2 |
| `REQ-CRM` (R3) | `customers` model cannot be finalised; **no customer data should be written to production until Legal answers** | 2 |
| `REQ-AUD` | `audit_logs` retention, and whether audit rows are themselves subject to erasure | 2 |
| Infrastructure (`DEC-012` dependent) | Cold storage target, sizing, access control, cost model | 1 |
| **Total** | | **~10 person-days/week** |

## Recommendation

**Option B for R1 with per-class periods, moving to C once Legal confirms both the statutory minimums and the erasure mechanism — and DEC-020 reviewed in the same session.**

Reasoning, separating what engineering can and cannot recommend:

*Engineering can recommend the mechanism.* Per-class retention with detach-and-archive rather than drop is right under every policy, because it makes an over-short period recoverable for as long as the archive exists. Archiving is cheap; deletion is the irreversible step and should be a separate, later, deliberately gated operation. Building B now and enabling C's purge only after the periods are signed converts a one-way door into a two-stage one at negligible cost.

*Engineering cannot recommend the periods.* Statutory minimums for invoices and financial records, the lawful retention basis for personal data, and the correct resolution of the erasure conflict are Legal determinations. Any number engineering supplies would be a guess dressed as a default, and the failure mode is legal exposure rather than rework.

*What Legal needs to bring to the review*, stated as a checklist so the session is 15 minutes rather than a workshop: the statutory minimum for invoices and financial records; the lawful basis and maximum period for customer personal data; whether audit and access logs are themselves subject to erasure; and — the one that unblocks the most work — which of the four erasure mechanisms listed in Context is lawful.

*Three engineering positions that should be approved alongside the policy:*
1. **Order-level detail is retained at least as long as any summary derived from it**, so a [DEC-009](DEC-009-reporting-kpi-formulas.md) formula correction remains applicable across the whole reported series.
2. **Integration event retention exceeds the longest partner re-delivery window** established under [DEC-007](DEC-007-aggregator-apis.md), so idempotency guards remain effective for as long as they can be needed.
3. **No archive restores to a non-production environment without masking** (protocol rule 10), and the restore path is tested before the first archive is written, not when it is first needed.

Option D is acceptable for the archival half only, and only if the erasure question is answered separately and immediately. The register already says Legal must decide before any customer data reaches production; that constraint sits above the convenience of deferring.

---

## Decision

**Decided:** Option B mechanism approved for R1 — per-class retention periods, detach-and-archive (never destructive drop). Numeric periods themselves NOT set here — packet is explicit that statutory minimums are a legal-fact question, not an engineering or admin preference, and a wrong number is legal exposure, not rework. Placeholder periods (see below) apply until real statutory figures are supplied.
**Rationale:** Architecture (per-class, archive-not-drop) is safe to fix now regardless of the numbers, since it converts deletion into a later, separately-gated operation. The specific day-counts require actual statutory research (invoice retention minimums, PII lawful-basis periods per applicable law), which this session cannot substitute for.
**Placeholder periods pending real figures:** invoices/financial records — 8 years; customer PII — 3 years post last activity; audit logs — 7 years, append-only; order/event transactional detail — 2 years hot, archived thereafter. These are conservative planning placeholders only, not sourced from statute — must be replaced with real figures before go-live.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on decision.*

**Becomes possible:** bounded database growth and predictable query performance on the high-volume tables; a defensible answer to a data-protection request; evidence for security investigation within a stated window; audit-ready financial records for the statutory period.

**Becomes harder:** every new table needs a retention classification at review. Any query over data older than the hot window needs an archive restore, so historical analysis stops being an ad-hoc activity. Erasure requests become an operational process with a service level, not a database statement.

**Permanent commitment:** deletion is irreversible. Every period chosen here is a permanent bound on what can ever be answered about that data — a dispute, an audit, a report correction or an investigation beyond the window has no recourse. The customer-to-invoice linkage model chosen for erasure is also embedded in the schema and in every issued invoice, and cannot be restructured retroactively.

## Follow-Up

- [ ] ADR raised (structural): ADR-0010 — retention, partition archival and erasure model
- [ ] `DECISION-LOG.md` updated
- [ ] **Reviewed jointly with DEC-020** (right-to-erasure vs statutory invoice retention) — same session, same Legal owner
- [ ] Legal to supply: statutory minimums, lawful basis and period for personal data, erasure mechanism, audit-log erasability
- [ ] Per-class retention table published and versioned in the repo
- [ ] Detail retention ≥ summary retention confirmed — see [DEC-009](DEC-009-reporting-kpi-formulas.md)
- [ ] Integration event retention > partner re-delivery window — see [DEC-007](DEC-007-aggregator-apis.md)
- [ ] Archive restore path tested, with masking for non-production (protocol rule 10)
- [ ] Purge jobs gated behind an explicit approval before first production run
- [ ] Downstream artifacts updated: `DB-TBL-AUDIT_LOGS`, `REQ-FIN`, `REQ-CRM`, `REQ-AUD`, partitioning section of [`schema-reference.md`](../05-database/schema-reference.md)
- [ ] Estimate re-baselined if scope changed
