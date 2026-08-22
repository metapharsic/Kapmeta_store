# Kapmeta — Decision Register (FINAL, Phase 0 Capstone)

**Status:** Phase 0 (Discovery) closure document
**Supersedes:** the earlier decision-register addendum (DEC-013..024 draft)
**Date:** 2026-08-21

## Purpose and scope

This is the consolidated, single-source decision register for Kapmeta (restaurant POS clone of PetPooja), assembled at the end of Phase 0 — Discovery. Phase 0 produced 86 validated screenshots of the reference PetPooja app (single outlet "Hotel kapila", LAN client-server topology, v126.0.1) covering 13 feature areas, which fed 9 per-screen requirement docs (artifact-01..09), a DB schema draft, an API contracts draft, a sync-architecture draft, a business-logic-rules draft, and 7 phase-execution-plan docs. During evidence review, 6 ambiguities were flagged (DEC-013..017, DEC-023) and resolved in parallel by dedicated resolution work; 6 further items (DEC-018..022, DEC-024) were logged but not re-litigated in this pass. This document folds all of that into one register.

DEC-001 through DEC-012 predate this capstone and are presumed pre-existing from the original discovery phase. Their original text is not reproduced here (not available to this pass) — they are carried forward unmodified and listed for completeness only.

## Decision table

| ID | Title | Status | Resolution Summary | Owner | Date Closed / Target |
|---|---|---|---|---|---|
| DEC-001..012 | (original discovery items) | Carried forward | Status carried forward from original discovery phase; not modified by this pass. Refer to the original discovery-phase decision log for full text. | Discovery team (original) | N/A — pre-existing |
| DEC-013 | MFR button meaning | Resolved (Engineering-closed) | Interpreted as "Mark Food Ready (bulk)": a toolbar-level bulk action applying the same effect as a per-order-card "Food Is Ready" button to all selected/filtered visible online orders at once, gated by a confirmation step. Basis: toolbar placement among global/bulk controls (not inside a per-order card), fit with restaurant domain conventions, and low rework risk since it only batches an already-understood endpoint. A lightweight UAT confirmation is recommended in Phase 7 as a non-blocking follow-up, not a gate. | Engineering | 2026-08-21 |
| DEC-014 | Sales Return Orders full field set | Open — action item attached | The original capture cut off mid-scroll on the Day Summary screen's Sales Return Orders table, so the full field set is unconfirmed. Action item: re-run the screenshot capture session and scroll the Day Summary screen fully to capture the complete table. Not a blocker for Phase 4-6 — a best-effort inferred schema (id, order_id, order_item_id, qty, amount, reason, refund_method, approved_by, returned_at) can be built now given the isolated, low-blast-radius nature of this table. IS a hard blocker for Phase 10-11 Day Summary report finalization and sign-off. | Discovery/Evidence team | Target: before Phase 10-11 start |
| DEC-015 | Unified order status enum | Resolved (Provisionally Closed — engineering may proceed) | Canonical 5-value enum: `open` / `running` / `printed` / `paid` / `cancelled`. The Table View "Running-KOT Table" sub-state is represented as `running` plus a separate `kot_sent` boolean rather than its own enum value, keeping the enum small and the KOT-sent concept independently reusable. Mapping — Table View: Blank→open, Running→running(kot_sent=false), Running-KOT→running(kot_sent=true), Printed→printed, Paid→paid; Order History: Saved→running/printed depending on print state, Printed→printed, Cancelled→cancelled, Paid→paid. | Engineering | 2026-08-21 |
| DEC-016 | My-Amount/Grand-Total/Total glossary | Resolved (Closed — arithmetic-verified) | Verified against observed data: My Amount ₹189.52 + Tax ₹8.48 − Discount ₹0.00 = Grand Total ₹198.00 (exact). Confirmed: My Amount = pre-tax subtotal → schema field `subtotal_amount`; Tax → `tax_amount`; Discount → `discount_amount`; Grand Total = final customer-charged amount → `grand_total_amount`. Order Entry footer "Total" and Day Summary "Total(₹)" both refer to `grand_total_amount`, just re-labeled per screen — a UI-label consistency note only, no schema ambiguity. Any future aggregator-commission/payout tracking is a wholly separate new field and must not be conflated with this. | Engineering | 2026-08-21 |
| DEC-017 | Tax mode scope (backward vs forward) | Resolved (Provisionally Closed — engineering may proceed; pending final stakeholder confirmation before production sign-off) | The four simultaneous tax rows (CGST/SGST backward for dine-in; CGST[Online]/SGST[Online] forward for online) do not contradict the "ignore this setting if using forward tax configuration" helper note — that note describes a simpler single-mode alternate path for outlets not needing channel differentiation. "Hotel kapila" deliberately uses the richer channel-differentiated mode. Data model must support both an outlet-level default tax mode and full per-channel tax-row differentiation; channel-scoped tax rows are the primary architecture, not an edge case. | Engineering | 2026-08-21 (stakeholder sign-off pending) |
| DEC-018 | Sync interval / offline-tolerance policy | Open — pending sign-off | Pending stakeholder/product sign-off per original DEC addendum; not re-litigated in this closure pass. | Product | TBD |
| DEC-019 | Local-client-standalone-if-server-down policy | Open — pending sign-off | Pending stakeholder/product sign-off per original DEC addendum; not re-litigated in this closure pass. | Product | TBD |
| DEC-020 | Globally-unique order identifier scheme atop per-outlet-local sequences | Open — pending sign-off | Pending stakeholder/product sign-off per original DEC addendum; not re-litigated in this closure pass. | Product/Engineering | TBD |
| DEC-021 | (carried forward — reconcile numbering against original addendum) | Open — pending sign-off | Carried forward as Open pending reconciliation of numbering against the original addendum; not re-litigated in this closure pass. | Product | TBD |
| DEC-022 | Manual grand-total-edit approval/audit policy | Open — pending sign-off | Pending stakeholder/product sign-off per original DEC addendum; not re-litigated in this closure pass. | Product | TBD |
| DEC-023 | Multi-outlet scope for v1 | Resolved (Provisionally Closed) | Multi-outlet UI/workflow (outlet-switcher, combined cross-outlet reporting) is OUT OF SCOPE for v1. The `outlet_id`-on-every-table schema design IS confirmed and must be kept exactly as drafted, given near-zero cost to carry now versus high-risk retrofit later. Does not block any engineering through Phase 15; needs real product/business roadmap confirmation before Phase 16 scales to a second outlet. | Product/Engineering | 2026-08-21 (Phase 16 gate pending) |
| DEC-024 | OOS-vs-channel-listing independent-flags confirmation | Open — pending sign-off | Pending stakeholder/product sign-off per original DEC addendum; not re-litigated in this closure pass. | Product | TBD |

## Rollup summary

Of the 12 new items opened in this evidence-review pass (DEC-013 through DEC-024):

- **3 of 12 fully engineering-closed:** DEC-013, DEC-015, DEC-016
- **2 of 12 provisionally closed pending stakeholder sign-off:** DEC-017, DEC-023
- **1 of 12 still open with an attached action item:** DEC-014
- **6 of 12 still open, carried forward for later sign-off (not re-litigated this pass):** DEC-018, DEC-019, DEC-020, DEC-021, DEC-022, DEC-024

**3 + 2 + 1 + 6 = 12.**

## Phase 0 exit readiness — verdict

Phase 0's own exit criterion, as stated in `phase-00-01-discovery-and-design.md`, is: *"all DEC items Approved with named owner+date."*

**Honest assessment: this criterion is NOT 100% met.** DEC-014 (Sales Return Orders field set) is genuinely open with no owner-approved resolution, only an attached action item, because the source evidence itself is incomplete (mid-scroll capture cut-off). Six further items (DEC-018, 019, 020, 021, 022, 024) remain open pending stakeholder/product sign-off and were not addressed in this pass. Strictly read, Phase 0 cannot be declared clean-closed today.

**Recommended pragmatic path (calculated, explicitly-approved exception to strict phase-gating):**

1. Declare Phase 0 **substantially complete**, not clean-closed — record this document as the evidence.
2. Allow **Phase 1 (Design)** and **Phase 2-3 (Architecture / DB)** to proceed **in parallel** with the still-open DEC-014 re-capture task, because DEC-014 only blocks the Day Summary report work in **Phase 10-11** specifically — it does not touch table/order/tax/status schema work done in earlier phases.
3. Run the DEC-014 screenshot re-capture (full scroll of the Day Summary Sales Return Orders table) as a tracked, alongside action item with a target completion date before Phase 10-11 begins.
4. Treat DEC-018, 019, 020, 021, 022, 024 as a standing stakeholder/product sign-off backlog to be cleared before their respective dependent phases (sync architecture, order-ID scheme, and audit-policy items should be resolved no later than Phase 2-3/Phase 4-6, well ahead of their build phases).
5. This exception should be **explicitly approved by the project owner**, not treated as a silent gap — record that approval alongside this register once given.

This is a deliberate, scoped exception, not a bypass of Phase 0 governance: the only genuinely blocking open item (DEC-014) is scoped to a specific downstream phase, and all other opens are non-blocking sign-off items that do not stop earlier-phase engineering work.
