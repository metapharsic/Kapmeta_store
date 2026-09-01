# DEC-013 and DEC-014 Resolution — Kapmeta

**Project:** Kapmeta (restaurant POS clone of KapMeta)
**Source material:** 86 validated reference-app screenshots, single outlet "Hotel Kapila", LAN client-server topology, app v126.0.1
**Date:** 2026-08-21
**Prepared against:** Decision-register addendum (DEC-013–DEC-024), artifact-03 (Live Feed), artifact-08 (Day Summary / Item Report), phase-07-online-integration.md, phase-10-11-crm-reporting.md

---

## Item 1 — DEC-013: "MFR" button meaning

### Context and evidence

On the Online Order Live Feed screen (Orders screen, Online/Swiggy/Zomato tabs), a button labeled only "MFR" appears in the top-right action area of the screen toolbar — grouped with a refresh icon and a "View Details" toggle, alongside order-count and filter controls. Critically, it does **not** appear inside any individual order card.

This placement is itself evidence, not just an unresolved label. Every other action that applies to a single order (accept, reject, mark food ready, print) lives inside that order's card in the reference app's established pattern. A control placed in the global toolbar, next to filter and refresh controls, operates on the visible/filtered set of orders as a whole, not on one order. That is a structural convention, not a guess about the letters themselves.

Given that structural read, restaurant-POS domain vocabulary was checked against the letters M-F-R:

- **"Mark Food Ready" (bulk)** — fits the toolbar position exactly, fits standard restaurant-POS terminology, and has a clear operational motivation: each order card already exposes an individual "Food Is Ready" button, so a kitchen that finishes several orders in the same batch (a common real-world event — one fry station or one course finishing for multiple tickets at once) would otherwise require clicking Food-Is-Ready on each card separately. MFR as the bulk counterpart of that exact per-order action removes that friction. This is the strongest candidate on both linguistic and functional grounds.
- **"Manual Force Refresh"** — rejected. A dedicated refresh icon already sits immediately next to MFR in the same toolbar; a second, differently-labeled refresh control in the same cluster would be redundant and is not how the reference app treats other toolbars (no duplicate controls have been observed elsewhere in the 86 screenshots).
- **"Mark For Return"** — rejected. Sales-return handling belongs conceptually and visually to the Day Summary screen (see DEC-014), not to the Live Orders feed, which is exclusively about incoming order lifecycle and food prep status. Nothing in the captured screens shows return handling reachable from Live Orders.
- **"My Food Ready"** — rejected as not a coherent phrase in this domain; included in the original candidate list for completeness only.

### Engineering recommendation

Adopt **"Mark Food Ready (bulk)"** as the working interpretation and build accordingly:

- Implement MFR as a **bulk-select-and-confirm** action, not a silent one-click bulk toggle.
- It calls the **same underlying Food-Is-Ready endpoint** already specified for the per-order button, invoked once per selected order — no new backend contract, no schema change.
- Before executing, show a **confirmation step listing exactly which orders will be marked** ready, since a bulk action touching multiple live customer orders at once carries real mis-click risk that a per-order button does not.

### Status: Closed (Engineering)

This is a genuine, confident closure — not a placeholder. The reasoning rests on two independent supports (toolbar placement/structural convention, and standard POS terminology matching an already-understood per-order action), and the implementation risk is low because it reuses an endpoint that is already fully specified rather than inventing new behavior. If the interpretation later turns out to be wrong, the rework is bounded: rename the bulk action and adjust its trigger condition. There is no schema impact, because MFR as designed is purely a UI-level batching of the existing, already-verified Food-Is-Ready contract.

**Recommended low-cost follow-up:** get a one-line confirmation from the client/reference-app owner during Phase 7 UAT ("does MFR mean bulk-mark food ready across visible orders?"). This is not a blocker on any phase and does not gate further work — it is cheap insurance to catch a wrong guess early, at a point where the cost of correction is still trivial.

---

## Item 2 — DEC-014: Sales Return Orders full field set

### Context and evidence

The Day Summary screen's "Sales Return Orders" section was captured mid-scroll. Only the section header ("Sales Return Orders") and a partial column header row ("Order" / "Total (₹)") are visible in the captured screenshot before it cuts off. No data rows were captured, and the full column set was not captured — the screen simply scrolled past before the capture session recorded further columns.

Artifact-08 already proposes an inferred full schema — `id, order_id, order_item_id, qty, amount, reason, refund_method, approved_by, returned_at` — built from general POS-domain knowledge of what a sales-return record typically needs to support. That schema is explicitly flagged in artifact-08 as unverified/inferred, and that flag is correct and should remain.

### Why this is not being force-closed

The only way to obtain ground truth here is a literal re-capture: returning to the reference KapMeta app and scrolling the Day Summary screen further to record the remaining columns and at least one data row. That requires physical/live access to the reference app, which is outside what this planning exercise can do from within existing screenshots and drafted documents. Declaring DEC-014 "closed" on the strength of a plausible inferred schema would misrepresent the actual evidence — the honest state is that this specific field set is unverified, and no amount of domain reasoning substitutes for looking at the real screen.

### Converted action item (concrete and schedulable)

DEC-014 remains **OPEN**, with the following action item attached:

> Re-run the screenshot capture session against the reference KapMeta app. Navigate to the Day Summary screen and scroll the "Sales Return Orders" section fully to the bottom, capturing:
> 1. The complete column header row (not just "Order" / "Total (₹)").
> 2. At least one populated data row, if any test/demo sales-return records exist in the reference app's sample data for outlet "Hotel Kapila".

### Blocking scope — precise, not blanket

This gap is **not** a blocker for Phase 4-6 core POS build. Sales-return handling can be implemented now against the currently-inferred artifact-08 schema on a best-effort basis, because:

- It is an isolated table with low blast radius.
- The only fields other tables would need to reference are `order_id` and `order_item_id`, both of which are foreign keys into structures that are already fully verified from other screenshots — these are extremely unlikely to be wrong regardless of what the real screen ultimately shows.
- If the recapture reveals additional or differently-named fields (e.g., a different refund-method enumeration, or an additional approval-workflow field), those can be added or adjusted later without disturbing anything already built on top of the order/order-item relationship.

This gap **is** a hard blocker specifically for **Phase 10-11 (CRM + Reporting)** sign-off on the Day Summary report — as the phase-10-11 plan already correctly states. The Day Summary report's Sales Return Orders section cannot be finalized and verified as accurate until the real field set and at least one real data row are known, because that report is exactly the surface where field-level correctness (column names, formatting, computed totals) is user-visible and must match the reference app.

### Status: Open (Action Item Attached)

Not a blocker before Phase 10-11. Hard blocker only for Phase 10-11 Day Summary finalization/sign-off specifically.

---

## Final decision-register text

| ID | Item | Status | Notes |
|---|---|---|---|
| DEC-013 | MFR button meaning | **Closed (Engineering)** | Adopted interpretation: "Mark Food Ready" (bulk), implemented as bulk-select-and-confirm calling the existing per-order Food-Is-Ready endpoint. Low-risk follow-up: one-line UAT confirmation during Phase 7, not a blocker. |
| DEC-014 | Sales Return Orders full field set | **Open (Action Item Attached)** | Action: re-capture Day Summary screen, scroll fully, capture complete columns + a data row if available. Not a blocker before Phase 10-11. Hard blocker for Phase 10-11 Day Summary sign-off only. Current best-effort schema (artifact-08) stands for Phase 4-6 build. |

---

## Downstream documents requiring updates

1. **phase-07-online-integration.md** — Remove the "still open decision" / documented-fallback framing for MFR. Replace with: MFR is closed as bulk Food-Ready; implementation calls the existing per-order Food-Is-Ready endpoint once per selected order behind a confirmation step. Note the low-cost UAT-confirmation follow-up as a non-blocking checkpoint, not a fallback.
2. **artifact-03 (Live Feed) UI spec** — Add the bulk-select-and-confirm interaction detail for MFR: selection mechanism across visible/filtered orders, the confirmation dialog listing the affected orders, and the per-order call pattern into the Food-Is-Ready endpoint.
3. **phase-10-11-crm-reporting.md** — No change to the blocking language; it already correctly scopes DEC-014 as a blocking sub-task for finalizing the Day Summary report. Leave as-is.
4. **artifact-08 (Day Summary / Item Report)** — No change needed. Its inferred Sales Return Orders schema is already correctly flagged as provisional/unverified, which remains the accurate status.
