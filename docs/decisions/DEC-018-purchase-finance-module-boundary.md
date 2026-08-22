# DEC-018: Purchase ↔ Finance Module Boundary — Who Owns Vendor Invoices

**ID:** DEC-018
**Status:** OPEN
**Owner:** Solution Architect + Finance
**Raised by:** `REQ-PUR`, `REQ-FIN`
**Due:** Before R2 build start
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Vendor Invoice Three-Way Match, [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Ledger & Export, [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4
**Traced by:** `DEP-INT`, module ownership map, vendor invoice tables, three-way match ownership

---

## Question

Which module owns the vendor invoice entity — Purchase or Finance — and therefore which module owns the three-way match, the exception queue, and the handoff to payment?

## Context

[`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) ends its three-way match section with: *"Payment execution itself is out of scope for this module and belongs to Finance (`invoices`, `payments`, `ledger_entries`). Where the boundary sits is unresolved."* [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) lists `invoices` under Finance's data touchpoints but describes only **customer** invoices — sales documents generated from order completion. A vendor invoice is a payable, not a receivable, and the two share almost nothing but a word.

The architectural stake is stated in protocol §4: domain modules in `services/` own their tables, **no cross-module table reads** — call the owning module's API. That boundary is the only thing making later extraction to separate services possible. **The failure mode is not a wrong answer to this question; it is no answer, followed by both modules writing the same tables.** Once Purchase writes a row Finance also writes, the modules are fused, and every subsequent "we could split this out later" conversation is fiction.

Facts that constrain the answer:

- Three-way match needs `purchase_orders`, `goods_receipts`, `gr_items` — all Purchase-owned — plus the invoice. If Finance owns the invoice and runs the match, Finance either reads Purchase tables directly (protocol violation) or calls Purchase's API per line (a real, non-trivial API surface).
- Payment execution, the ledger posting and the settlement/reconciliation machinery are unambiguously Finance. Nobody is proposing Purchase issues payments.
- Vendor master, vendor credit notes and open-credit tracking are Purchase-owned per the spec.
- `ledger_entries` postings originate from documents; a payable posting has to originate somewhere with an owner.
- DEC-013 (accounting export target) interacts: whichever module owns payables owns the dimensions those postings carry.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Purchase owns the vendor invoice end-to-end through match approval; Finance owns payment and ledger.** Purchase holds `vendor_invoices`, runs three-way match locally against its own tables, resolves exceptions, and emits an `InvoiceApprovedForPayment` event carrying everything Finance needs. Finance never reads Purchase tables. | ~12-16 person-days; the event contract is the main design work | The payables ledger posting is triggered by an event from a module Finance does not own, which some finance teams find uncomfortable. Requires the event payload to be complete — a missing field means a cross-module read at exactly the wrong moment | Yes, at meaningful cost — moving the entity later means migrating tables between module boundaries |
| B | **Finance owns the vendor invoice; Purchase exposes a match API.** Finance holds `vendor_invoices`, calls `Purchase.matchInvoice(poRef, lines)` and receives a match result. | ~15-20 person-days; the match API is a chattier, more detailed contract than a one-way event | Match logic lives next to the PO/GRN data (correct) but is driven from Finance (adds a synchronous cross-module dependency in the invoice entry path). Exception resolution spans two modules: the exception is Finance's, the data explaining it is Purchase's | Yes, same cost as A |
| C | **Shared ownership: both modules read and write vendor invoice tables.** | Lowest apparent build cost (~8-10 person-days) | **Violates protocol §4 directly.** Permanently fuses the two modules — extraction becomes impossible without unpicking every shared write. Concurrent writes to the same rows from two modules also introduce a class of consistency bug that is genuinely hard to test for. This row is here because it is what happens by default when the decision is not made, not because it is defensible | No, practically |
| D | **Defer; build match inside Purchase without deciding the long-term owner.** | Zero now | This is Option A executed without acknowledgement, which is survivable — but it means the Finance-side event contract is discovered late, likely during the first month-end when payables must reach the ledger | Yes, while no invoice code exists |

## Impact If Wrong

- **Option C, or drift into it:** in eighteen months a decision to extract Purchase as a service finds that `vendor_invoices` is written by both modules in four code paths, three of them inside transactions that also touch Finance tables. The extraction is quoted at several months and does not happen. Every subsequent scaling and team-ownership decision is constrained by that.
- **Boundary drawn but not enforced:** a developer under deadline adds a direct `SELECT` from Finance into `goods_receipts` because the API call was inconvenient. This is invisible in a monolith at runtime — it works perfectly — and only surfaces as a defect years later. The mitigation is a lint or schema-grant rule, not good intentions.
- **Wrong owner for the exception queue:** Finance staff resolve a price-dispute exception but the vendor, PO and receipt context lives in Purchase's screens. They resolve it with incomplete information, or the resolution UI is duplicated in both modules — and duplicated business rules is precisely what protocol §4 exists to prevent.
- **Event payload incomplete (Option A):** the ledger posting is missing a dimension DEC-013 requires, discovered at first export, and `ledger_entries` is append-only so the historical postings stay incomplete.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Purchase (R2) | Three-way match implementation, exception queue, `vendor_invoices` schema | 3 |
| Finance | Payables ledger posting path; whether `invoices` is one table or two (receivable vs payable) | 2 |
| Architecture | Module ownership map, `DEP-INT` contracts, OpenAPI surface between the two modules | 1 |
| Reporting | Which module reports vendor spend and open payables | 1 |

## Recommendation

**Option A — Purchase owns the vendor invoice through to match approval; Finance owns payment execution and ledger posting; the handoff is a single event with a complete, versioned payload.**

Reasoning:

- **Locality of data wins.** Three of the four inputs to a three-way match (PO, GRN, GR lines) are Purchase-owned and Purchase-shaped, including UOM conversion factors and the stored per-line variance from DEC-016. Putting the match anywhere else means either a protocol violation or a fine-grained chatty API that reproduces Purchase's internals across a boundary.
- **The exception queue belongs with the people who can resolve it.** A price dispute is settled by looking at the PO, the vendor catalog and the receipt — all Purchase. Finance resolving it needs a screen that is functionally Purchase's screen.
- The one-way event contract in A is a smaller and more stable interface than B's synchronous match API, and it fails better: a failed event is retried, a failed synchronous call blocks invoice entry.
- **Also recommend, independently of which option is chosen:** rename the Finance customer-invoice entity or the vendor-invoice entity so they are not both "invoices". Two tables called invoices in one system, one receivable and one payable, is a defect generator regardless of who owns them.
- **And enforce the boundary mechanically.** Separate database roles or schema-level grants per module, so a cross-module table read fails in CI rather than working silently. Without this, whatever is decided here erodes within a year.

Finance has legitimate standing to overrule on Option B grounds — payables is conventionally a finance function, and the person who signs the payment run may reasonably want the document in their module. That is a valid organisational argument against an engineering locality argument, and it is the owner's call.

---

## Decision

**Decided:** Option A — Purchase owns the vendor invoice through match approval; Finance owns payment execution and ledger posting. Handoff is a single versioned event, not a synchronous API.
**Rationale:** Locality of data wins — three of four three-way-match inputs (PO, GRN, GR lines) are Purchase-owned. Exception queue belongs with whoever can resolve it (Purchase). One-way event contract fails better than a synchronous call (retry vs block). Additionally approved: rename Finance's customer-invoice vs Purchase's vendor-invoice entities so both aren't called "invoices"; enforce the module boundary mechanically via separate DB roles/schema grants so a cross-module read fails in CI.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Determines whether the modular monolith stays splittable. This is the decision's real content; vendor invoices are the occasion for it.
- Fixes the inter-module contract as a versioned artifact in `contracts/`, subject to spec-before-code (protocol §2) and to breaking-change discipline.
- Sets which module's team owns the payables exception backlog operationally — a staffing consequence, not just an architectural one.
- Whichever module owns the vendor invoice owns the dimensions its ledger postings carry, and therefore inherits a dependency on DEC-013.
- Mechanically-enforced module grants, once introduced, apply to every module — a repo-wide change that gets cheaper the earlier it is made.

## Follow-Up

- [ ] ADR raised (structural, mandatory): ADR-NNNN — Purchase/Finance boundary and vendor invoice ownership
- [ ] ADR raised: ADR-NNNN — mechanical enforcement of module table ownership
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Vendor Invoice Three-Way Match, [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) §Data Touchpoints, module ownership map, `DEP-INT`
- [ ] Vendor-invoice vs customer-invoice naming resolved in the glossary and schema
- [ ] Event/API contract added to `contracts/` before implementation
- [ ] Cross-check event payload against DEC-013 required ledger dimensions
- [ ] Affected teams notified: Engineering, Finance
- [ ] Estimate re-baselined if scope changed
