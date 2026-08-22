# DEC-020: Right-To-Erasure vs Statutory Invoice Retention

**ID:** DEC-020
**Status:** APPROVED
**Owner:** **Legal**
**Raised by:** `REQ-CRM`, `REQ-FIN`
**Due:** Week 1 — **before any customer data is stored in production**
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) §Open issue: erasure vs statutory retention, [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Retention
**Traced by:** `customers`, `invoices`, `invoice_items`, `audit_logs`, DEC-010, DEC-011, erasure request workflow

---

## Question

When a customer exercises a right to erasure, what specifically must be done to the personal data held on statutorily-retained invoices — and on what legal basis?

## Context

**This is a legal question with no clean technical answer. Engineering cannot resolve it and this packet does not attempt to.** What follows sets out the conflict precisely, describes the implementable shapes a legal position could take, and states what each costs to build — so that Legal can decide with the constraints visible. The choice of legal basis is Legal's; the implementation is engineering's.

The conflict, stated plainly:

- A customer has a right under the DPDP Act to request erasure of their personal data.
- Tax and company law require invoices to be retained for a statutory period, and an invoice carries customer identity — name, and depending on invoice format, address and tax registration.
- The platform's invoices are **append-only and immutable by design** ([`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md)): a posted document is corrected by a further document, never edited. Invoice numbering is **gapless**, and a detected gap blocks day-close, because auditors treat a gap as a suppressed sale.

So deleting the customer row does not satisfy erasure (identity persists on invoices), and deleting the invoice is not available — it would breach retention obligations and break gaplessness simultaneously.

Additional facts Legal will need:

- **Phone number is the primary customer identifier** ([`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md)), so the identifier itself is the personal data. This is not a case where an internal surrogate key can be kept and the PII dropped without further thought — the surrogate `customer_id` links to orders and invoices.
- Personal data appears in more places than `customers`: order records, delivery addresses (`customer_addresses`), free-text feedback ("may contain PII incidentally"), campaign delivery records, and `audit_logs`. `audit_logs` is append-only with no application role holding `UPDATE` or `DELETE`, and DEC-011 may make it hash-chained — in which case *nothing* in it can be altered without invalidating the chain.
- Aggregator orders carry masked/proxy phone numbers held as channel-local identities.
- DEC-010 has not set retention periods; this decision and DEC-010 must be consistent.

[`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) already names a *likely* resolution — erase or tokenize the CRM profile, retain the invoice, break the link — and is explicit that it is **not approved**. It is recorded there so it is not discovered mid-request. It is reproduced here as Option A, not as a recommendation.

## Options

Each option below is a **legal position with a corresponding implementation**. The legal position is the decision; the implementation cost is offered so Legal knows what it is asking for.

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Pseudonymisation with retained invoice.** Legal position: erasure obligation is satisfied by rendering the CRM profile non-attributable while the invoice is retained under a separate, overriding legal obligation. Implementation: `customers` contact fields irreversibly overwritten with a tombstone; phone hash retained only to prevent re-creation of the same profile; the invoice keeps the identity fields statute requires; the FK from invoice to customer is severed or reduced to a non-resolving reference. | ~15-20 person-days: erasure workflow, cross-module cascade, tombstone semantics, re-identification prevention, verification report | The invoice still contains the person's name. Whether that constitutes continued processing that the erasure right reaches is exactly the legal question — engineering has no view. If a regulator disagrees with the position, the remediation is on data already retained | Not for executed requests. Pseudonymisation is irreversible by design; a customer erased under a position later found insufficient cannot be un-erased to redo it differently |
| B | **Retention-period-bounded erasure.** Legal position: the erasure right is suspended for the statutory retention period and honoured automatically at its expiry. Implementation: request is *recorded* and *scheduled*; CRM profile and marketing data are erased immediately; invoice-borne identity is erased when the retention clock on that invoice expires. Requires a durable scheduled-erasure register that survives years. | ~20-28 person-days: everything in A, plus a long-lived scheduling register, per-record retention clocks, and an execution job that must still work in seven years | Depends entirely on DEC-010 setting the retention period, which is open. The customer is told "yes, in N years", which some regulators accept and some do not. Operationally, a scheduled job with a multi-year horizon is a real reliability commitment — it must survive migrations, re-platforming and staff turnover | No for the immediate erasure; the scheduled portion can be re-specified while pending |
| C | **Legal-basis override, documented refusal.** Legal position: statutory retention is an overriding legal obligation, so the erasure request is lawfully refused in respect of invoice data and honoured for everything else. Implementation: CRM/marketing data erased; invoice untouched; the refusal, its basis and its scope are recorded and communicated to the data principal. | ~10-14 person-days — the least implementation, the most legal documentation | Requires Legal to stand behind the refusal in writing to the data principal and, potentially, to a regulator. Legally cleanest if the basis is sound; the exposure is entirely on the soundness of the basis, not on the implementation | Yes — a refusal can be revisited and the erasure performed later if the position changes |
| D | **Do not collect the personal data that creates the conflict.** Legal position: minimise. Implementation: invoices carry customer identity only where statute requires it for that invoice type (many retail food invoices do not require a named customer at all); CRM identity stays in CRM. Reduces the conflict surface rather than resolving it. | ~8-12 person-days, but must be decided **before** invoice format is fixed | Does not resolve the conflict for invoices that *do* require identity (B2B, GST input-credit invoices where the customer's tax registration is mandatory). Complementary to A/B/C, not a substitute | No — the invoice format, once issued to customers and filed, cannot be retroactively changed |
| E | **Defer.** | Zero now | The register already flags this as the item to escalate first. Deferral is tenable only while zero production customer data exists. The first erasure request arriving without a decided position is a legal event handled under time pressure, ad hoc, by whoever is on shift — and whatever they do to the data is irreversible | Yes, and only until go-live |

**Options are not mutually exclusive.** D is a sensible companion to any of A, B or C. Legal may also differentiate: refuse under C for invoice-borne data while applying A to everything else.

## Impact If Wrong

- **Position too permissive (invoice data altered or deleted):** a statutorily-retained invoice is modified or removed. This breaks the gapless series, which blocks day-close by design and is read by an auditor as a suppressed sale. The record cannot be restored — invoices are append-only, there is no edit path, and a "correction" would itself be a new document with a new number, which does not reconstruct the original. Exposure is tax-law exposure, not privacy exposure.
- **Position too restrictive (nothing erased):** a data principal complains to the regulator. The finding is against the organisation for the full class of requests handled that way, not the single complainant, and the platform has an audit trail proving the pattern was systematic.
- **Erasure executed inconsistently across modules:** the `customers` row is tombstoned but the phone number remains in `customer_addresses`, in a campaign delivery record, in free-text feedback, and in `audit_logs`. The organisation has certified an erasure it did not perform. This is worse than not erasing, because it is a false statement to the data principal and to the regulator.
- **`audit_logs` treated as erasable:** if DEC-011 lands hash-chained audit, any modification invalidates the chain from that row forward — destroying the integrity property for every record after it, including ones unrelated to the request. If audit is not chained, the append-only grants must still be circumvented by a privileged path, which is itself a control weakness that will be found in penetration testing.
- **Decided after go-live:** the first request is handled by improvisation. Whatever irreversible action is taken on that customer's data sets a precedent the organisation then has to either defend or explain.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| CRM | Erasure request workflow; the `customers` tombstone/pseudonymisation model; consent record lifecycle | 3 |
| Finance | Whether `invoices` may hold a resolvable FK to `customers` at all — a schema-level question that must be settled before invoices exist | 2 |
| Database / schema | Cross-module erasure cascade; which columns are erasable, which are frozen | 2 |
| Security | Interaction with `audit_logs` immutability and, if adopted, hash-chaining (DEC-011) | 2 |
| Legal / compliance | Privacy notice wording, data-principal response templates, DPDP request SLA | — (Legal effort, not engineering idle) |
| **All** | **No production customer data may be stored until this is decided** | Gate, not idle time |

## Recommendation

**Engineering has no recommendation on the legal question, and offers none. The legal basis is Legal's call.**

What engineering can usefully state:

1. **Every option except C is irreversible once executed against a real request.** Pseudonymisation cannot be undone; a scheduled erasure that fires cannot be recalled. Option C is the only position that can be revisited later without having already destroyed the data. That is a property of the options, not an argument for choosing C — a refusal that turns out to be unlawful is its own serious exposure. But if Legal is genuinely uncertain and wants time, C preserves optionality in a way the others do not, and Legal should know that.
2. **Option D should be evaluated regardless of what else is decided, and evaluated soon.** Not collecting identity on invoices that do not statutorily require it shrinks the conflict without needing it resolved, and it is only available before the invoice format is fixed. This is the one genuinely cheap move available and it expires.
3. **Whatever is decided must be specified per data class, not once.** `customers`, `customer_addresses`, `customer_tags`, order records, free-text feedback, campaign delivery records, `invoices`, `invoice_items`, and `audit_logs` each need an explicit instruction: erase, pseudonymise, retain, or retain-then-erase-at-date. A single-sentence policy will produce the inconsistent-erasure failure above, which is the failure mode most likely to actually occur.
4. **`audit_logs` needs an explicit and separate answer**, and it should be given alongside DEC-011. If audit is hash-chained, altering it is not a matter of policy — it is technically destructive to the integrity property. Legal should decide knowing that.
5. **Build the erasure workflow behind a two-person authorisation with a dry-run report** whichever position is chosen. The action is irreversible and cross-module; a preview of exactly what will be changed, reviewed before execution, is proportionate.

Engineering will implement whichever position Legal states, and will state honestly if a stated position is not implementable as written.

---

## Decision

**Decided:** Option A — Anonymize customer records (PII) on erasure requests, but preserve invoice metadata, financial totals, and transaction IDs for statutory audit compliance.
**Rationale:** Statutory financial retention takes precedence over full deletion of transactional logs; anonymizing PII is the standard industry compromise.
**Approved by:** Abdul Mannan, Admin (acting as Legal/Product Owner authority)
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Fixes the organisation's answer to every future data-principal erasure request. Requests already executed under this position cannot be redone under a different one.
- Determines whether `invoices` may carry a resolvable foreign key to `customers`. That is a schema decision that must be made before any invoice exists, and it is not cheaply changed afterwards — invoices are append-only.
- Sets the boundary of DEC-010: retention periods must be consistent with the erasure position, and vice versa.
- Commits the organisation to a stated position in its privacy notice and in its responses to data principals. Changing it later means explaining why the previous position was taken.
- If Option B: creates a multi-year scheduled-erasure obligation that must survive every future migration and re-platform. That obligation outlives the current team.

## Follow-Up

- [ ] **Escalated to Legal as the first item at CP-00 kickoff** — this is the register's highest-priority escalation
- [ ] Per-data-class instruction table completed and signed (see Recommendation §3)
- [ ] Explicit position on `audit_logs` obtained, jointly with DEC-011
- [ ] Option D evaluated before the invoice format is fixed — this window closes
- [ ] ADR raised (structural): ADR-NNNN — erasure cascade and pseudonymisation model
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/crm-marketing.md`](../02-requirements/crm-marketing.md) §Open issue, [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Retention, `customers`, `invoices`, schema reference
- [ ] DEC-010 and DEC-011 reconciled against the decided position
- [ ] Privacy notice and data-principal response templates drafted by Legal
- [ ] DPDP request SLA agreed and an owner named for handling requests
- [ ] Dry-run report and two-person authorisation implemented before the workflow is enabled
- [ ] Go-live gate confirmed: no production customer data stored before sign-off
- [ ] Affected teams notified: Legal, Security, Engineering, Finance, Product
- [ ] Estimate re-baselined if scope changed
