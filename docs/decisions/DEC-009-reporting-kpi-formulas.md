# DEC-009: Reporting KPI Formulas

**ID:** DEC-009
**Status:** OPEN
**Owner:** Finance + Product Owner
**Raised by:** Solution Architect
**Due:** 2026-08-22 (Wk 2)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-009 · source page 1 (partial) · [`schema-reference.md`](../05-database/schema-reference.md) Reporting group
**Traced by:** `REQ-RPT`, all `*_SUMMARY` tables, `kot_performance`, every dashboard `UX-`

---

## Question

What is the signed, written formula for each R1 reporting KPI — starting with net sales — expressed in terms of specific columns and stated inclusions and exclusions?

## Context

- Source page 1 gives partial reporting evidence: dashboard tiles exist and are named. What the numbers in them mean is not defined anywhere. `daily_sales_summary`, `hourly_sales_summary`, `item_sales_summary`, `payment_summary` and `kot_performance` are all proposed against this open decision.
- **The failure mode here is different from the rest of the register.** Nothing crashes. Every dashboard renders a plausible number, and nobody notices until two people compare figures — typically Finance's month-end against the owner's daily dashboard. At that point it is a reconciliation incident, not a bug: the numbers do not disagree because the code is broken, they disagree because two definitions were never reconciled and both were implemented somewhere.
- The definitional questions that actually cause this, each of which has more than one defensible answer:
  - **Net sales** — gross of tax or net of it? Before or after discounts? Which discounts (see [DEC-008](DEC-008-discount-promotion-rules.md) — partner-funded promotions in particular)? Do delivery charges, packaging charges and service charge count as sales or as recovery? Are cancelled and voided orders excluded, and what about orders cancelled after KOT where food was cooked and cost incurred?
  - **Order count** — orders placed, or orders completed? Does a split bill count once or twice? Does an aggregator order count as one order or one order per delivery?
  - **Average order value** — net sales over which order count? The two questions above multiply, so AOV has at least four defensible definitions before anyone argues.
  - **Covers / guests** — captured at all? If not, "sales per cover" cannot exist regardless of demand for it.
  - **Business day** — protocol rule 9 already says the business day is configuration, not midnight. So a report's date boundary depends on outlet config and timezone. A 01:30 order belongs to the previous business day. This must be applied identically in every summary or two reports over the same period will disagree by a handful of orders.
  - **Refunds** — do they reduce the sales of the original day or the day of the refund? Both are defensible; only one can be implemented.
  - **`kot_performance`** — prep time measured from what event to what event? Order placed, KOT printed, KOT accepted, item bumped, order served. The available events depend on [DEC-006](DEC-006-printer-kot-hardware.md); paper produces almost none of them.
- Constraints already committed:
  - Business rules live in one place ([`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4): "Duplicating tax logic into a report is how two numbers start disagreeing." The reporting module must call the pricing engine rather than reimplement totals.
  - Timestamps stored UTC, presented in outlet timezone; business day is config (rule 9).
  - Append-only order state (rule 5) means the summary can be derived from history rather than from a mutable current state — which is what makes correct restatement possible later.
- **This decision cannot be fully answered before [DEC-004](DEC-004-tax-calculation-rules.md) and [DEC-008](DEC-008-discount-promotion-rules.md).** Net-of-tax has no meaning until the tax model exists; net-of-discount has none until the discount model does. Sequencing matters here.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Signed formula catalogue before build.** Finance and PO agree a written definition per KPI — columns, inclusions, exclusions, business-day rule — reviewed and signed. Implemented once in a shared calculation layer; dashboards consume it. | ~5-8 person-days of definition work (mostly stakeholder time, not engineering) + normal build. | The cost is calendar time and the difficulty of getting two stakeholders to commit in writing. Some definitions will be argued for longer than seems reasonable — that argument is the deliverable, and having it now costs a meeting rather than a reconciliation. | Definitions can change, but restatement of published history is the expensive part. |
| B | **Build against reasonable defaults, ratify at UAT.** Engineering picks defensible definitions, documents them, and stakeholders confirm during UAT. | Lowest apparent cost; no upfront blocking. | Ratification at UAT is ratification under deadline pressure, which in practice means it is not scrutinised. Disagreements surface after go-live instead, when the numbers have been used. Also: engineering picking the definition of net sales is precisely the "never guess at money" case in [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §8. | Poorly — see Impact If Wrong. |
| C | **Configurable definitions.** Make inclusions and exclusions runtime configuration so each stakeholder can define their own view. | ~15-25 person-days plus permanent complexity. | This is the wrong solution to a governance problem. It guarantees two stakeholders with two configurations produce two numbers and both are "correct", which is the exact incident the decision exists to prevent — now with the system's blessing. Also makes any cross-outlet or cross-period comparison meaningless. | The config surface, once used, is very hard to withdraw. |
| D | **Minimal R1 KPI set, formally defined; defer the rest.** Sign formulas for a small set (net sales, order count, AOV, payment mix, top items) and explicitly ship no other numbers in R1. | A's definition cost but over fewer KPIs — realistically 2-4 person-days of stakeholder time. | Dashboards look sparse and someone will ask for more within a month. But an unshipped KPI is a feature request; a wrong shipped KPI is an incident. | Yes — adding KPIs later is additive and safe, provided the underlying event data is retained. |

## Impact If Wrong

**Two stakeholders disagreeing on net sales after go-live is a reconciliation incident, not a bug.** The concrete shape: the owner's daily dashboard has reported a figure every day for three months; Finance's month-end close reports a different one. Neither is wrong in code. Everything downstream of either number is now suspect — staff incentives paid on dashboard sales, vendor negotiations argued from item mix, the food-cost percentage in the board pack. Re-deriving the correct series is possible only if the underlying event data was retained at sufficient grain (see [DEC-010](DEC-010-data-retention-archival.md)); if summaries were computed and the detail archived, it is not recoverable at all.

**If the business-day rule is applied inconsistently across summaries:** `daily_sales_summary` and `hourly_sales_summary` disagree for the same day by the orders taken between midnight and close. Small, permanent, and it will be found by the first person who adds up the hours.

**If refunds are attributed to the wrong day:** a day that has already been reported, incentivised on, and possibly filed changes retroactively when a refund is processed. A report run in September for July no longer matches the one run in July — and someone made a decision from the July run.

**If summary tables are populated before formulas are signed:** the stored rows carry the old definition. Changing the formula means either recomputing history (possible only from retained detail) or holding two definitions and knowing which applies to which date range — permanently.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/reporting` (`REQ-RPT`) | Every summary table's columns and grain; the aggregation jobs; the shared calculation layer | 4 |
| UX — all dashboards | Tile definitions, labels, drill-down paths. A tile whose formula is unknown cannot be designed honestly. | 3 |
| `services/kitchen` | Which lifecycle events must be timestamped for `kot_performance` — if the event is not captured, the metric can never be computed for that period | 2 |
| QA (`TST-PERF-*`) | No expected values to assert against | 1 |
| **Total** | | **~10 person-days/week** |

## Recommendation

**Option D — a minimal, formally signed KPI set for R1 — sequenced after [DEC-004](DEC-004-tax-calculation-rules.md) and [DEC-008](DEC-008-discount-promotion-rules.md) close.**

Reasoning: Option B is the default that happens when nobody chooses, and it is the one that produces the incident described above. Its apparent cheapness is entirely an artefact of moving the cost past go-live, where it is paid in trust rather than days. Option C should be actively rejected — configurable KPI definitions institutionalise the disagreement instead of resolving it.

D over A only on scope, not on rigour: the definition discipline is identical, applied to fewer numbers. Every KPI that ships in R1 should have a signed formula; the way to keep that affordable is to ship fewer of them. A dashboard with five trustworthy numbers is worth more than twelve provisional ones, and the twelve-number version is the one that gets used in a board pack before anyone checks it.

The specific mechanism recommended, which matters as much as the option:

1. **One calculation layer.** Summary tables are derived by a single shared implementation that calls the pricing engine. No dashboard, export or ad-hoc query recomputes revenue independently. This is [`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4 applied literally.
2. **Formula catalogue as a versioned artefact in the repo**, with each KPI stating its columns, inclusions, exclusions and business-day handling, and each summary row recording which formula version produced it. This is what makes a later definition change a forward change rather than a silent retroactive one.
3. **Retain order-level detail at sufficient grain to recompute any summary.** This is the insurance policy for every definitional mistake in this packet, and it makes [DEC-010](DEC-010-data-retention-archival.md) a dependency rather than an unrelated decision.
4. **Start with net sales.** If Finance and the PO can agree that one formula in writing, the rest follow quickly. If they cannot, that disagreement is the single most valuable output of this packet and it is far cheaper discovered now.

---

## Decision

**Decided:** Option D — minimal, formally signed KPI set for R1.
**Rationale:** Packet recommendation. Single shared calculation layer (no independent recomputation), versioned formula catalogue in-repo, order-level detail retained at sufficient grain to recompute any summary — all three mechanisms approved as specified.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on decision.*

**Becomes possible:** dashboards whose numbers survive scrutiny; a defensible month-end reconciliation between operational reporting and finance; KPIs added later without re-opening the definition of the existing ones.

**Becomes harder:** every new KPI needs a signed formula before it can ship, which slows dashboard delivery. Reporting cannot take shortcuts around the pricing engine even when a direct query would be faster, which constrains query optimisation.

**Permanent commitment:** the published KPI definitions. Once a number has been reported to stakeholders for a period, changing its formula means either restating published history or carrying two definitions with a cutover date. The retention grain chosen in [DEC-010](DEC-010-data-retention-archival.md) also becomes permanent here — detail that is archived beyond recall bounds what can ever be recomputed.

## Follow-Up

- [ ] ADR raised (structural): ADR-0009 — reporting calculation layer and formula versioning
- [ ] `DECISION-LOG.md` updated
- [ ] **Signed formula catalogue produced** — start with net sales; columns, inclusions, exclusions, business-day rule per KPI
- [ ] Sequenced after [DEC-004](DEC-004-tax-calculation-rules.md) and [DEC-008](DEC-008-discount-promotion-rules.md)
- [ ] Formula version recorded on every summary row
- [ ] Kitchen lifecycle events confirmed for `kot_performance` — depends on [DEC-006](DEC-006-printer-kot-hardware.md)
- [ ] Refund day-attribution rule decided
- [ ] Detail-retention grain confirmed sufficient to recompute any summary — see [DEC-010](DEC-010-data-retention-archival.md)
- [ ] Downstream artifacts updated: `REQ-RPT`, all `*_SUMMARY` tables, every dashboard `UX-`
- [ ] Estimate re-baselined if scope changed
