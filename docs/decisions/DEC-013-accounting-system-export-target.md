# DEC-013: Target Accounting System For Ledger Export

**ID:** DEC-013
**Status:** OPEN
**Owner:** Finance
**Raised by:** `REQ-FIN` ([`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Ledger & Export)
**Due:** Week 3
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md)
**Traced by:** `DEP-EXT-06`, `WF-FIN-02`, `ledger_entries` shape, chart-of-accounts mapping table

---

## Question

Which external accounting system is the ledger export built against, and is the integration a file drop, an API push, or a pull endpoint the accounting side calls?

## Context

[`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) commits to the mechanics already: `ledger_entries` is double-entry and append-only; export is an **immutable, versioned, numbered batch** that is re-exportable and never regenerated with different content; the batch number is the idempotency key; no export job recomputes tax or totals. Those properties hold regardless of target and are not what this decision is about.

What is undecided and cannot be guessed:

- **Which system.** Tally is the dominant answer for Indian restaurant groups and imports XML; Zoho Books and QuickBooks are API-first; SAP/Oracle for larger groups means an IDoc/interface-table conversation with someone else's consultants. These are not interchangeable — Tally's ingest is a file, Zoho's is a REST resource with per-object rate limits.
- **Chart of accounts.** Finance's existing CoA is the mapping target. Engineering does not have it and must not invent one. Every posting source in the spec (invoice, credit note, payment capture, refund, settlement, commission/fee, cash variance, day-end close) needs a debit and credit account assigned by Finance.
- **Granularity and cadence.** Per-invoice postings versus a day-end summary journal per outlet are wildly different volumes. A mid-size outlet at 300 covers/day produces roughly 300 invoice postings/day; the same day summarised is one journal. Most accounting systems will accept either; most accountants only want one.
- **Multi-outlet.** DEC-001 determines whether outlets are separate books, cost centres, or a single set. Unresolved, but the export shape depends on it.

Nothing in R1 blocks on this except the export itself. The `ledger_entries` table can be built now; what it exports to cannot.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Name the target system now; build a native adapter.** Single adapter, format-specific (Tally XML / Zoho REST / etc.), CoA mapping table maintained in-app. | ~15-25 person-days depending on target; Tally XML is fiddly, REST APIs are faster | Locks to one accounting vendor. If the group changes accounting systems (a real event during growth), the adapter is rewritten | Yes — a second adapter can be added, but the first one's assumptions tend to leak into the batch model |
| B | **Build a neutral, documented export format (CSV/JSON journal batch) plus a defined CoA mapping table; no vendor adapter in R1.** Finance imports via the accounting system's own import tooling or a bookkeeper does it. | ~8-10 person-days | Puts a manual step in the month-end close. Acceptable at low outlet counts, painful at high. Some systems' import tooling is genuinely bad, and we will have shipped an "integration" that Finance experiences as a spreadsheet | Yes — this is the natural precursor to A |
| C | **Defer export entirely to R2; build and post `ledger_entries` only.** | Zero now | Finance operates from Z-reports and manual entry through R1. Defensible only if go-live outlet count is small. The risk is discovering at R2 that `ledger_entries` lacks a dimension the target system requires (cost centre, project, tax ledger split) after months of immutable postings exist | Partly — the table is append-only, so a missing column is a migration plus a backfill of derivable-only fields |
| D | **Build A and B (adapter plus neutral format).** | A + B, ~25-35 person-days | Over-investment before a single real reconciliation has been run. But it is the honest answer if the group already runs two accounting systems | Yes |

## Impact If Wrong

- **Wrong system, discovered after go-live:** the adapter is rebuilt, but worse — the batches already exported were accepted by the old system and posted. Re-exporting the same immutable batches into a new system without double-posting requires a documented cutover date and a manual opening-balance journal, done by an accountant, under audit.
- **Missing dimension on `ledger_entries`:** if the target needs a cost-centre or tax-ledger dimension we did not store, it cannot be derived retrospectively for entries already posted. `ledger_entries` is append-only by design — the historical entries stay wrong, and the accounting system receives a partial-fidelity opening period that the auditor will query.
- **Wrong granularity:** exporting per-invoice into a system Finance wanted summarised means their trial balance carries hundreds of thousands of lines per year, their close slows, and the fix (switching to summary) creates a discontinuity in the middle of a financial year that has to be explained in the audit file.
- **Deferred too long with no neutral format:** first month-end after go-live, Finance has no mechanical path from the platform to the books and reconstructs it from Z-reports by hand. That is not a bug, it is a permanent trust problem with the platform's numbers.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Finance | Export adapter, batch endpoint, CoA mapping table and admin UI (`DEP-EXT-06`, `WF-FIN-02`) | 3 |
| Finance | Confirmation that `ledger_entries` carries every dimension the target requires — this is the part that must not wait | 1 |
| Reporting | Whether trial-balance-style reports are ours or the accounting system's | 1 |

## Recommendation

**Option B now, Option A when the system is named — and separately, ask Finance for the chart of accounts and required dimensions this week regardless of which option is chosen.**

Reasoning:

- The batch model, immutability and idempotency are already specified and are the hard parts. Adapters are comparatively cheap and can be added without disturbing them.
- The genuinely urgent item is not the adapter, it is the **dimension list**. `ledger_entries` is append-only; a column we fail to populate now is permanently null for the R1 period. Getting the CoA and the required dimensions from Finance costs Finance an hour and de-risks the whole area, even if the target system stays undecided for another month.
- Naming a target before Finance has confirmed what they actually run — and whether they intend to keep running it through the growth the platform is being built for — is engineering guessing at a business fact.
- Option C is only acceptable if Option B's format work is done anyway; shipping R1 with no mechanical export path is what produces the manual-reconstruction failure above.

Finance owns this outright. Engineering has no basis for preferring one accounting vendor over another and should not pretend otherwise.

---

## Decision

**Decided:** Option B now (accounting adapter interface, no named vendor), Option A once target system is named.
**Rationale:** Batch model, immutability and idempotency are the hard parts and are already specified; adapters are cheap to add later. Chart of accounts and required dimensions to be requested from Finance this week regardless — `ledger_entries` is append-only and an unpopulated dimension column is permanently null for the R1 period.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Fixes the dimensions carried on every `ledger_entries` row. Because the table is append-only, the dimension set chosen here is permanent for all history written under it.
- Determines whether month-end close is a mechanical step or a human one, and therefore Finance's staffing assumption per outlet.
- A named vendor adapter creates an external dependency with its own version and rate-limit lifecycle (`DEP-EXT-06`), including breaking-change exposure we do not control.
- Export granularity, once live, cannot be changed mid-financial-year without an explained discontinuity in the audit file.

## Follow-Up

- [ ] Chart of accounts and required dimensions obtained from Finance — **do this before the decision, not after**
- [ ] ADR raised (structural): ADR-NNNN — ledger export batch model and adapter interface
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Ledger & Export, `DEP-EXT-06`, `WF-FIN-02`, schema reference
- [ ] Cross-check against DEC-001 (outlets as separate books vs cost centres) and DEC-004 (tax ledger splits)
- [ ] Re-export idempotency proven by test: same batch number returns byte-identical content
- [ ] Affected teams notified: Finance, Engineering
- [ ] Estimate re-baselined if scope changed
