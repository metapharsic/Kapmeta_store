# DEC-017: Retrospective PO Policy — Goods Received Without A PO

**ID:** DEC-017
**Status:** OPEN
**Owner:** Finance + Ops
**Raised by:** `REQ-PUR` ([`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Approval Thresholds)
**Due:** Before R2 build start
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md)
**Traced by:** `WF-PUR-01`, goods receipt entry path, three-way match "no matching GRN" exception, PO state machine

---

## Question

May a goods receipt be posted against no prior PO — and if so, under what authorisation, within what value limit, and what document does the system create?

## Context

The spec states it plainly: *"Emergency / out-of-hours purchase without a PO is a real operational need and is **not designed here**."* That is the whole problem. The path exists in reality whether or not it exists in the system.

Concrete cases that will occur in week one of R2:

- The 6 a.m. produce delivery arrives before anyone with approval authority is awake.
- A supplier substitutes an out-of-stock item and delivers something not on the PO.
- The fryer oil runs out mid-service and someone buys it from the cash-and-carry.
- A vendor delivers against a verbal order because the outlet phoned them.

If the system has no path for these, staff do one of three things, all worse than any option below: post the goods against an unrelated PO (corrupting that PO's match), skip the receipt entirely (inventory ledger diverges from the walk-in permanently, since `RECEIPT` movements are append-only and a missing one cannot be inferred), or keep a paper note that reaches Finance a month later with the invoice.

The three-way match already treats **"no matching GRN → EXCEPTION: invoice without receipt — never auto-approve"** as a hard rule. Whatever is decided here must not create a route around that.

**This is a control-environment decision with the strongest route-around pressure of the three (DEC-015/016/017).** Forbidding retrospective POs does not eliminate off-PO purchasing; it eliminates the *record* of off-PO purchasing. Permitting it too freely turns the PO from a commitment control into a data-entry formality performed after the money is spent. The design question is how to make the permitted path record what happened honestly and make it visible enough that it stays exceptional.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Prohibit. No receipt without a prior approved PO.** | Lowest build (~0 — it is the default state machine) | The strongest control on paper and the weakest in practice. Emergency purchases still happen; they simply leave no trace, or are posted against the wrong PO. Produces an inventory ledger that silently disagrees with physical stock and an invoice queue with unmatched invoices nobody can resolve | Yes |
| B | **Permit a distinct `EMERGENCY_RECEIPT` document with mandatory reason code, elevated role, value cap, and post-hoc approval SLA.** The receipt posts stock immediately; a linked retrospective PO is auto-generated in a `PENDING_RATIFICATION` state; it must be ratified by the DEC-015 approver for its value band within N days. Unratified items appear on an exception report and block the vendor's next PO above the cap. | ~10-14 person-days: new document type, ratification state, SLA job, exception report, cap configuration | The value cap and SLA are themselves guesses until tuned. Real risk that "emergency" becomes the normal path if the cap is generous and ratification is not enforced — mitigated only by making the exception report land on someone who cares | Yes; policy values are configuration |
| C | **Permit retrospective PO creation with no distinct document type** — the receipt clerk creates a backdated PO, then receives against it. | ~3-5 person-days | Cheap, and it destroys the distinction between a commitment made before spending and a record made after. `WF-PUR-01` reporting can no longer tell whether the business controls its purchasing, because every PO looks approved. Vendor performance metrics (on-time delivery, lead time) become meaningless for these lines | Technically yes; the historical data is permanently ambiguous |
| D | **Permit, but only for a whitelist of vendors and ingredient categories** (e.g. daily perishables from approved vendors), prohibit otherwise. | ~8-12 person-days plus whitelist maintenance | Narrower blast radius than B, but the whitelist is another thing to maintain and the non-whitelisted emergency still has no path — so the Option A failure mode persists in the tail | Yes |
| E | **Defer; ship R2 prohibiting it, gather the exception volume, decide in R2.1.** | Zero now | The gathering mechanism is exactly what does not exist under prohibition. Deferring here means the data needed to decide is never collected. This is a weaker defer than in most packets | Yes |

## Impact If Wrong

- **Prohibited (Option A), realistically:** an outlet receives ₹40,000 of goods over a month with no receipts posted. Inventory shows stock that is not there and misses stock that is. Recipe-driven depletion (DEC-003) runs against wrong balances, so theoretical-vs-actual variance is garbage for that period and cannot be reconstructed — `stock_movements` is append-only and immutable, so the missing history cannot be honestly backfilled. Meanwhile four vendor invoices sit in the exception queue as "invoice without receipt" and Finance either pays them unmatched or does not pay a vendor who delivered.
- **Permitted too loosely (Option C):** six months in, 60% of POs are created after the goods arrived. The approval thresholds in DEC-015 are still enforced and still meaningless, because approval now happens after the commitment. Nobody notices, because nothing in the data distinguishes the two cases.
- **Permitted with a cap set too low:** the cap is hit routinely, staff split deliveries across documents to stay under it, and the audit trail shows a pattern that looks like deliberate control circumvention — because it is, driven by a policy that made compliance impossible.
- **No ratification SLA enforced:** `PENDING_RATIFICATION` becomes a permanent state holding hundreds of documents. The exception report is 400 lines long and therefore read by nobody.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Purchase (R2) | Goods receipt entry path — the primary screen cannot be finalised without knowing whether a PO-less receipt is reachable from it | 3 |
| Purchase | `WF-PUR-01` completeness; PO state machine additions | 2 |
| Finance | Three-way match handling of emergency-sourced invoices | 1 |
| Inventory | Nothing — `RECEIPT` movements are identical either way | 0 |

*Purchase is R2 and blocked in full on DEC-003.*

## Recommendation

**Option B — permit, but as a first-class, visibly distinct document with a cap, a mandatory reason code, and enforced post-hoc ratification.**

Reasoning:

- The choice is not between control and no control. It is between a recorded exception and an unrecorded one. A system that refuses to represent something that happens daily does not prevent it; it blinds itself to it, and in a module whose stock movements are append-only and immutable, blindness is permanent.
- The distinct document type is the load-bearing part. Option C's cost is not operational, it is analytical: once retrospective and prospective POs are indistinguishable, no report can ever tell Finance how much of its purchasing is actually controlled. Keeping them separate means the exception rate is measurable, and a measurable exception rate is what lets DEC-015's thresholds be tuned on evidence.
- Set the value cap **deliberately generous at first** and tighten it on data. A cap that is too tight produces document-splitting, which is a worse audit signal than a slightly high cap.
- The ratification SLA needs a real consequence or it is decoration. Blocking further above-cap POs to the same vendor is a proportionate one; suspending the outlet's ordering entirely is not.
- Whichever option is chosen, **do not weaken the "invoice without receipt" rule** in three-way match to accommodate this. The emergency path must produce a real receipt, not an exemption from matching.

Finance owns the control strength and the cap; Ops owns whether the ratification workflow is completable by the people who will have to complete it at 6 a.m.

---

## Decision

**Decided:** Option B — permit as a first-class, visibly distinct document type, with a value cap, mandatory reason code, and enforced post-hoc ratification (above-cap POs to the same vendor blocked until ratified).
**Rationale:** Packet recommendation. Keeping retrospective POs distinct from prospective ones preserves the exception rate as a measurable, reportable number, which is what lets DEC-015's thresholds be tuned on real evidence. Value cap set deliberately generous initially, tightened on data — a too-tight cap produces document-splitting, a worse signal than a high cap. "Invoice without receipt" rule in three-way match is NOT weakened for this path.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- If permitted with a distinct document type, the exception rate becomes a standing operational metric and a standing audit question. The business is committing to explaining it.
- Adds a state to the PO lifecycle. Because PO status history is append-only, the new state appears in historical reporting permanently, including for reports written before it existed.
- Prohibiting it commits the business to an inventory ledger whose accuracy depends on an operational discipline the system does not support — a dependency that should be stated explicitly to whoever signs off DEC-003's automation, since recipe-driven variance analysis is only as good as its receipt data.
- The cap and SLA values become configuration with the same versioning obligation as DEC-015 thresholds.

## Follow-Up

- [ ] ADR raised (structural): ADR-NNNN — emergency receipt document and ratification state
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Approval Thresholds and §Receipt Handling, `WF-PUR-01`
- [ ] Reason code list agreed with Ops (a free-text reason field produces unusable data)
- [ ] Exception report recipient named — a report with no owner is not a control
- [ ] Cross-check with DEC-015: tighter approval bands increase pressure on this path
- [ ] Test written proving the emergency path still produces a real GRN that three-way match consumes normally
- [ ] Affected teams notified: Finance, Ops, Engineering
- [ ] Estimate re-baselined if scope changed
