# DEC-019: PO Transmission Method To Vendors

**ID:** DEC-019
**Status:** OPEN
**Owner:** Ops
**Raised by:** `REQ-PUR` ([`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §Requisition → PO → Goods Receipt)
**Due:** Before R2 build start
**Version:** 1.0
**Updated:** 2026-08-08
**Traces to:** [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md)
**Traced by:** `DEP-EXT`, PO state `APPROVED → SENT` guard, vendor master contact fields, vendor performance metrics

---

## Question

By what mechanism does an approved PO reach the vendor, and what evidence does the system retain that it was sent?

## Context

The PO state machine has `APPROVED → SENT` guarded on "delivery date set; vendor contact present". What `SENT` physically means is unspecified. The spec's own open-decisions table lists *"Vendor portal or EDI ordering vs email/manual PO transmission — 'PO SENT' mechanics; currently unspecified."*

This matters more than it appears, for one reason: **`SENT` is the start timestamp for lead time and on-time delivery in the vendor performance metrics.** If `SENT` means "a user clicked a button and then phoned the vendor", the metric measures our clicking, not the vendor's performance. Every metric in that section is downstream of what this decision means.

Practical reality of the vendor population: small-group restaurant procurement in India runs substantially on WhatsApp and phone calls to a known supplier. A vendor portal that vendors do not log into is worse than email. Any option that assumes vendor-side technology adoption is making a commitment on the vendors' behalf.

Constraints already committed: vendor contact and email are PII, excluded from logs and lower environments; banking references are never returned in list endpoints; a PO document must be reproducible later, which means the transmitted artifact should be stored, not regenerated from current data.

## Options

| Option | Description | Cost | Risk | Reversible? |
|--------|-------------|------|------|-------------|
| A | **Email with attached PDF, plus a stored copy of exactly what was sent.** `SENT` set on successful handoff to the mail provider; delivery/bounce webhooks update a transmission record. | ~8-12 person-days: PDF rendering, template, provider integration, transmission log | Email deliverability to small vendors' addresses is imperfect; bounce handling must be visible or POs silently never arrive. No read receipt — "delivered" is not "read" | Yes |
| B | **Manual / out-of-band, system records the assertion.** User marks PO as sent, optionally attaches how (phone, WhatsApp, in person) and downloads the PDF themselves. | Lowest — ~3-5 person-days | Honest about how ordering actually happens, but `SENT` becomes a self-reported timestamp. Lead-time and on-time metrics are then measuring an operator's diligence. Acceptable if the metrics are explicitly labelled as such; misleading if they are not | Yes |
| C | **Vendor portal.** Vendors log in, see POs, acknowledge, and optionally confirm quantities and dates. | High — ~35-50 person-days: external-facing auth, vendor identity, notification, support surface, and a whole new security boundary (external users touching outlet-scoped data) | Delivers the best data — vendor acknowledgement is a real timestamp — and is the option most likely to go unused. Vendor adoption is not something we control. Also expands DEC-011's scope: external authenticated users is a materially different threat model | No, practically — an external-facing product surface is not quietly withdrawn |
| D | **EDI / direct integration with specific large suppliers.** | ~20-30 person-days per supplier, with their lead times, not ours | Only viable for large national suppliers who already have EDI. Irrelevant for the local produce vendor. Realistically a later addition for one or two suppliers, never the general mechanism | Yes — additive |
| E | **Defer; `SENT` is a manual status flip with no transmission at all in R2.** | Zero | This is Option B without the transmission record, which costs almost nothing to add. Deferring saves a few days and forfeits the audit evidence that a PO was communicated — which matters in a price dispute | Yes |

## Impact If Wrong

- **Portal built, vendors do not use it:** 35-50 person-days spent, plus an external auth surface to secure and maintain permanently, and POs still get communicated by phone. The portal's `SENT` timestamps then reflect only the minority of vendors who adopted, making cross-vendor performance comparison invalid.
- **Email chosen with no bounce handling:** a vendor's address changes, POs bounce silently, deliveries stop, and the outlet discovers it when stock runs out. The PO shows `SENT`, so nothing in the system indicates a problem.
- **Manual chosen without labelling the metric:** vendor performance reports are circulated and used in supplier negotiations. On-time delivery is computed from a timestamp an operator set whenever they got round to it. A supplier is dropped on a number that measures our own admin.
- **No stored copy of the transmitted artifact:** a price dispute six months later requires proving what was ordered. Regenerating the PO from current data gives current vendor catalog prices, not the ones on the document the vendor received. The dispute is unwinnable.

## Blocked Work

| Module | What cannot proceed | Person-days idle per week |
|--------|--------------------|--------------------------|
| Purchase (R2) | `APPROVED → SENT` transition implementation, PO document rendering and storage, transmission log | 2 |
| Purchase | Vendor performance metrics — the definition of lead-time start depends entirely on this | 1 |
| Integrations | `DEP-EXT` entry for a mail or portal provider; provider selection | 1 |
| Security | If a portal: external user authentication model, an addition to DEC-011's scope | 2 (only if C) |

*Purchase is R2 and blocked in full on DEC-003.*

## Recommendation

**Option A (email with a stored artifact and bounce handling) as the mechanism, with Option B's manual path retained as an explicit, separately-recorded alternative — and the vendor performance metrics labelled by transmission method.**

Reasoning:

- Email is the only option that gets a real, externally-witnessed timestamp without assuming vendor-side adoption. It is roughly a third the cost of a portal and does not create an external-facing security boundary.
- Keeping the manual path is not a compromise, it is a requirement — the vendor who only takes phone orders exists, and the DEC-017 pattern applies: if the system has no honest representation of a real path, the path happens anyway and leaves no record.
- **Store the rendered document, not just the data.** This is the cheapest part of the build and the one that resolves disputes. The PO document, like an invoice, must be reproducible byte-for-byte years later without reading the current vendor catalog — the same principle [`../02-requirements/finance-accounting.md`](../02-requirements/finance-accounting.md) applies to invoices.
- **Label the metrics.** On-time delivery computed from an emailed PO and from a manually-flagged one are different measurements. Mixing them into one vendor score produces a number that looks rigorous and is not. Either segment the metric or exclude manual-transmission POs from it.
- A portal is a legitimate later product decision if vendor volume justifies it; it is not the R2 mechanism. EDI is additive per supplier and needs a specific supplier asking for it.

Ops owns this because Ops knows how these vendors actually take orders. If the honest answer is "all of them are WhatsApp", say so — Option B with a good transmission record beats Option A pretending.

---

## Decision

**Decided:** Option A (email with stored artifact + bounce handling) as primary mechanism, Option B (manual/phone) retained as an explicit, separately-recorded alternative. Vendor performance metrics labelled by transmission method.
**Rationale:** Email gets a real externally-witnessed timestamp without requiring vendor-side portal adoption, at roughly a third the cost. Manual path retained because some vendors genuinely only take phone orders — an unrepresented real path just happens off-system with no record (same pattern as DEC-017). Rendered PO document stored (not just data) so disputes can be resolved byte-for-byte years later, same principle as invoice storage.
**Approved by:** Abdul Mannan, Admin
**Date:** 2026-08-09

## Consequences

*To be completed on sign-off. Anticipated:*

- Defines the semantics of `SENT` permanently, and with it the meaning of every lead-time and on-time-delivery figure the platform ever publishes.
- If email: introduces an external delivery provider as a runtime dependency of the ordering path (`DEP-EXT`), with its own outage mode. A PO that cannot be sent must fail visibly, not silently sit in `APPROVED`.
- If portal: creates an externally-authenticated user class, which materially expands the threat model in [`../08-security/security-framework.md`](../08-security/security-framework.md) and reopens DEC-011.
- Stored PO documents become retained artifacts subject to DEC-010's retention policy and to storage cost.

## Follow-Up

- [ ] Vendor communication reality confirmed with Ops (how do the top 20 vendors take orders today?)
- [ ] [`DECISION-LOG.md`](DECISION-LOG.md) updated
- [ ] Downstream artifacts updated: [`../02-requirements/purchase-vendor.md`](../02-requirements/purchase-vendor.md) §PO State Machine and §Vendor Performance Metrics, `DEP-EXT`
- [ ] Bounce/failure handling made visible in the PO list — a failed send must not present as `SENT`
- [ ] Stored PO document retention added to DEC-010's scope
- [ ] Vendor performance metric definitions annotated with transmission method
- [ ] Vendor contact email confirmed as PII in logs/lower-environment exclusion rules
- [ ] Affected teams notified: Ops, Engineering, Finance
- [ ] Estimate re-baselined if scope changed
