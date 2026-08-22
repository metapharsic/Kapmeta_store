# DEC-004: Tax Calculation Rules

**ID:** DEC-004
**Status:** OPEN
**Owner:** Finance + Tax
**Raised by:** Solution Architect
**Due:** 2026-08-15 (Wk 1)
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`DECISION-LOG.md`](DECISION-LOG.md) DEC-004 · [`schema-reference.md`](../05-database/schema-reference.md) Pricing & Tax group · [`MAP-REQ`](../mappings/MAP-REQ-requirement-to-implementation.md) reverse lookup: `invoices*`, `ledger_entries`, `tax*` authorized by DEC-004 (no source)
**Traced by:** `REQ-BIL`, `REQ-FIN`, `REQ-RPT`, `DB-TBL-TAX_RULES`, `DB-TBL-TAXES`, every invoice and every report

---

## Question

What tax model must the pricing engine implement for R1 — which GST scheme, which rate structure, applied at what grain, on prices that are inclusive or exclusive — such that a generated invoice is filing-grade?

## Context

**Nothing in the source material specifies tax.** `taxes`, `tax_rules`, `invoices` and `ledger_entries` exist in the schema on the authority of this open decision alone. Every number they will hold is currently a guess.

[`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §8 closes with "Never guess at tax, money, or permissions." This packet exists so that instruction can be followed.

**The option space, as it appears in Indian GST for the restaurant sector. Everything below must be confirmed by a qualified tax practitioner before implementation — it is presented as the shape of the question, not as settled fact.**

The variables that appear to interact:

1. **Scheme.** Composition scheme (a flat turnover-based rate, no input tax credit, restricted invoice format and no tax charged to the customer as a separate line) versus the regular scheme (tax charged and shown on the invoice). These produce structurally different invoices, not just different numbers. A composition dealer's bill is a bill of supply, and printing a tax breakup on it may itself be non-compliant.
2. **Rate.** The restaurant sector commonly attracts a concessional rate without input tax credit, while certain premises — notably those located in specified hotel accommodation above a room-tariff threshold — attract the standard rate with credit available. Which applies is a property of the outlet, not of the software, and it can change if the hotel's tariff crosses the threshold mid-year.
3. **Input tax credit.** Whether ITC is available follows from (2) and materially changes the finance module: with ITC, purchase-side tax must be captured, categorised and carried to `ledger_entries`; without it, purchase tax is simply cost. This changes `REQ-PUR` and `REQ-FIN`, not only `REQ-BIL`.
4. **CGST/SGST vs IGST split.** For a restaurant serving on premises the supply is intra-state and splits into two components, each of which must appear separately on the invoice and in the return. Whether any transaction can ever be inter-state (delivery across a state boundary, aggregator-mediated supply) is a question for the practitioner and directly affects `REQ-INT`.
5. **Inclusive vs exclusive pricing.** Whether the menu price already contains tax. This is arguably the single most consequential engineering variable here, because inclusive pricing requires back-calculation from a gross figure and back-calculation produces rounding residue on every single line. It is also a commercial decision (menu presentation), not only a tax one.
6. **Per-item HSN/SAC classification.** Whether every menu item carries its own classification code and potentially its own rate, or whether the whole outlet's food supply attracts one rate. Bottled water, packaged goods and alcohol are the usual reasons an outlet cannot use a single rate. **Alcohol in particular sits outside GST and under state excise/VAT** — if the outlet serves it, the software needs a second, parallel tax regime, and that is closer to a separate decision than a parameter.
7. **Rounding.** Per line item, per tax component, or on the invoice total; and the direction. This is not a detail — it determines whether the invoice total equals the sum of its parts, which is the first thing a return-filing reconciliation checks.
8. **Aggregator-mediated orders.** Where the aggregator is liable to collect and pay the tax on the supply, the restaurant's own invoice for that order is treated differently. If DEC-007 brings aggregators into R1, this interacts.

**Committed constraints that bound the answer:**
- Money is `BIGINT` minor units, never float ([`ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) rule 1). Inclusive-price back-calculation must therefore be specified as exact integer arithmetic with a stated rounding rule, not as a float division.
- Tax logic lives in exactly one place (§4, "Duplicating tax logic into a report is how two numbers start disagreeing"). The reporting module must call the pricing engine, not reimplement it.
- Orders and payments are append-only. A tax rate change must therefore be a new `tax_rules` row with an effective date, never an update of an existing one — and every order must record which rule version priced it.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Single hard-coded rate, exclusive pricing.** One rate for the outlet, applied to the order subtotal, split into two components. No per-item classification. | Lowest — ~5 person-days. | Only correct if the outlet has a genuinely uniform supply and no packaged goods or alcohol. Wrong the day the outlet adds bottled water. Also cannot represent a rate change without a code deploy, which is a compliance failure the first time rates move. | Poorly. Every invoice already issued under it is fixed. |
| B | **Configurable rate table, outlet-level, exclusive pricing.** `taxes` + `tax_rules` with effective-dated rows; one applicable rule set per outlet; rate resolved at pricing time and the resolved `tax_rule_id` stamped on every `order_item`. | ~10-14 person-days. | Handles rate changes and outlet variation. Does not handle an outlet whose menu spans more than one rate. Whether that is acceptable is exactly what the practitioner must confirm. | Yes — extends to C without re-pricing history, provided the rule ID is stamped from day 1. |
| C | **Per-item HSN/SAC classification, configurable rules, exclusive pricing.** Every menu item carries a classification; the rule is resolved per line, not per order. Supports mixed-rate menus. | ~18-25 person-days, plus the data burden: someone must classify every menu item, and misclassification is a filing error, not a display bug. | The classification data is the risk. An incorrectly classified item produces confidently wrong tax on every sale of it until someone notices — typically at filing, typically months later. Needs a practitioner sign-off on the initial classification set, not just on the design. | Granularity is reducible; issued invoices are not. |
| D | **Option C plus inclusive pricing support.** As C, with a per-price-list flag for tax-inclusive menu prices and exact integer back-calculation. | C + ~6-8 person-days, and roughly doubles the tax test matrix. | Back-calculation rounding is where this goes wrong: the residue must land somewhere deterministic, and the sum of line taxes must reconcile to the invoice tax. Getting it wrong produces invoices that are off by one minor unit — small enough to ship, large enough to fail a reconciliation. | Adding inclusive pricing later is feasible; changing the rounding rule after invoices are issued is not. |
| E | **Defer.** Continue on non-billing modules; revisit at Wk 3. | Halts the R1 critical path (see Blocked Work). | This is the one option with no honest upside. Tax is the highest-cost-of-delay item on the register alongside DEC-001 and DEC-011, and unlike those it has a statutory failure mode. | n/a |

## Impact If Wrong

Every order row written before the fix carries the wrong tax. Those rows have already been printed as invoices, handed to customers, and — once a return period closes — filed. Correcting them is not a data migration; it is a restatement exercise: each affected invoice must be identified, a credit note or amended document issued per the practitioner's instruction, the difference recovered from or refunded to the customer (in practice, absorbed), and the return revised. For a single outlet at a modest 300 orders a day, one undetected month is roughly 9,000 invoices.

Specific failure shapes, each with a different remedy:
- **Wrong rate:** every invoice understates or overstates output tax. Understatement is a liability with interest; overstatement is tax collected from customers that must still be paid over, and cannot be quietly kept.
- **Wrong inclusive/exclusive interpretation:** menu prices were presented to customers as one thing and taxed as another. The revenue figure and the tax figure are both wrong, in opposite directions, and the daily sales summary has been reporting a gross number as net for the entire period.
- **Wrong rounding rule:** invoice totals do not equal the sum of their lines. Individually trivial, collectively a reconciliation that will not close, and the discrepancy is spread across every invoice rather than isolated to a few.
- **Missing rule versioning:** a rate change is applied by updating the rule row rather than adding one. Every historic order silently re-prices when a report is re-run, so a report run in September no longer matches the same report run in July — and the July filing was made from the July run.

There is no redeploy that undoes any of this. The invoices left the building.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| `services/finance` — billing (`REQ-BIL`) | The pricing engine's entire tax path. Invoice document layout is also blocked: a bill of supply and a tax invoice are different documents. | 5 |
| `services/finance` — accounting (`REQ-FIN`) | `ledger_entries` shape; whether purchase-side tax is captured at all (depends on the ITC answer); `tax_rules`/`taxes` schema | 4 |
| `services/reporting` (`REQ-RPT`) | Every revenue figure. Net-of-tax vs gross is undefined until this closes — see [DEC-009](DEC-009-reporting-kpi-formulas.md), which cannot be answered before this one. | 3 |
| `services/menu` (`REQ-MNU`) | Whether `menu_items` carries an HSN/SAC column and whether price lists carry an inclusive flag | 2 |
| `services/orders` (`REQ-ORD`) | Order total composition; interaction between discount and tax base — see [DEC-008](DEC-008-discount-promotion-rules.md) | 2 |
| **Total** | | **~16 person-days/week** |

## Recommendation

**Option C, with the inclusive-pricing flag designed in but not necessarily implemented in R1** — and with a qualified tax practitioner confirming the substance before any of it is built.

Reasoning, separating what engineering can properly recommend from what it cannot:

*Engineering can recommend the shape.* Effective-dated rule rows with the resolved `tax_rule_id` stamped onto every `order_item` at pricing time is the only structure that survives a rate change without corrupting history. This should be treated as non-negotiable regardless of which rate is chosen, because it is what makes a future correction a forward change rather than a restatement. Per-item classification (C over B) is recommended not because the menu certainly spans rates today, but because adding the column later is cheap while re-classifying issued invoices is impossible — the asymmetry runs the same way as [DEC-001](DEC-001-outlet-architecture.md).

*Engineering cannot recommend the substance.* Which scheme, which rate, whether ITC applies, and how aggregator-mediated supply is treated are not architectural questions and no engineering recommendation on them should be relied upon. The Finance owner should bring a practitioner's written answer to the review on: scheme; applicable rate(s) and the trigger conditions for each; ITC availability; the treatment of any non-GST items (alcohol especially); the required invoice document type and mandatory fields; and the rounding convention.

*One thing to settle in the same review because it is cheap now and expensive later:* the rounding rule, stated as an algorithm over integer minor units — per line, per component, direction, and where the residue lands. It should be written into the packet as an approved formula and covered by boundary tests, per the testing requirement that pricing changes need a Finance reviewer.

If a practitioner cannot be engaged before the due date, the correct action is to escalate the due date, not to pick an option. Option E is listed for completeness; choosing it deliberately is defensible only if the alternative is guessing.

---

## Decision

**Decided:**
**Rationale:**
**Approved by:**
**Date:**

## Consequences

*To be completed on decision.*

**Becomes possible:** filing-grade invoices; a tax summary that reconciles to the return; rate changes handled by configuration rather than deployment; mixed-rate menus; a defensible audit trail showing which rule priced which order.

**Becomes harder:** every pricing change now requires a Finance reviewer and boundary tests. Menu item creation gains a mandatory classification field, which slows menu onboarding. Any report touching revenue must call the pricing engine rather than computing its own totals, which constrains the reporting architecture.

**Permanent commitment:** the rounding rule and the tax-component structure become embedded in every issued invoice. Both are effectively immutable once the first return period closes — a later change applies forward only, and the system must then hold two conventions simultaneously and know which applies to which date range.

## Follow-Up

- [ ] ADR raised (structural): ADR-0004 — tax rule resolution and invoice composition
- [ ] `DECISION-LOG.md` updated
- [ ] **Qualified tax practitioner's written confirmation obtained** — scheme, rate(s), ITC, non-GST items, invoice document type, rounding convention
- [ ] Rounding rule specified as integer arithmetic and covered by boundary tests
- [ ] Rule versioning confirmed: effective-dated rows, `tax_rule_id` stamped per `order_item`
- [ ] Alcohol / non-GST parallel regime — confirm in or out of scope; raise a separate DEC if in
- [ ] Cross-check [DEC-008](DEC-008-discount-promotion-rules.md): is the tax base pre- or post-discount
- [ ] Cross-check [DEC-009](DEC-009-reporting-kpi-formulas.md): net sales definition depends on this
- [ ] Cross-check [DEC-007](DEC-007-aggregator-apis.md): aggregator-mediated supply treatment
- [ ] Downstream artifacts updated: `REQ-BIL`, `REQ-FIN`, `REQ-RPT`, `REQ-MNU`, `DB-TBL-TAX_RULES`
- [ ] Estimate re-baselined if scope changed
