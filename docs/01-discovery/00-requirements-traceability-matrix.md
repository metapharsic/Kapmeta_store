# Kapmeta — Requirements Traceability Matrix

**Status:** Phase 0 (Discovery) capstone deliverable, companion to `00-decision-register-FINAL.md`
**Date:** 2026-08-21

## How to use this matrix

This matrix is the single source of truth linking **evidence → decision → schema → phase → screen** for the 9 per-screen requirement docs (`artifact-01` through `artifact-09` in `docs/02-requirements/`) produced during Phase 0 screenshot evidence review. Each row traces one artifact doc to the decision-register items that constrain or inform it, the DB tables it depends on (per the schema draft), the phase-execution-plan doc that builds it, and its current build status.

A QA/Docs agent should update the **Build Status** column as each phase progresses (e.g. Not Started → In Progress → Built → Verified), and should re-check the **DEC Items** column whenever a decision status changes in the decision register — a DEC item moving from Open to Resolved may unblock or re-scope the artifact rows that reference it. Do not treat this matrix as a one-time snapshot: it should be edited in place across the project's lifetime rather than superseded by new copies, so that it remains the authoritative cross-reference. All rows currently show Build Status = "Not Started" because Phase 0 has not yet formally exited (see the decision register's Phase 0 exit-readiness verdict for the recommended parallel-track exception).

## Matrix

| Artifact Doc | Feature Area | DEC Items (constrain/inform) | DB Tables Depended On | Phase (builds it) | Build Status |
|---|---|---|---|---|---|
| artifact-01 | Table/Floor View | DEC-015 (order status enum incl. Running-KOT sub-state), DEC-023 (outlet_id on every table) | tables, orders, outlets | phase-04-06 | Not Started |
| artifact-02 | Order Entry/Billing | DEC-015 (order status enum), DEC-016 (subtotal/tax/discount/grand-total glossary), DEC-017 (tax mode scope), DEC-022 (manual grand-total-edit policy, open), DEC-023 (outlet_id) | orders, order_items, tax_rows, discounts, outlets | phase-04-06 | Not Started |
| artifact-03 | Online Live Feed (Swiggy/Zomato) | DEC-013 (MFR bulk action), DEC-015 (order status enum), DEC-020 (global order ID scheme, open), DEC-024 (OOS-vs-channel-listing flags, open) | orders, order_items, channel_orders, outlets | phase-07 | Not Started |
| artifact-04 | OOS Modal / Menu Online-Availability Manager | DEC-024 (OOS-vs-channel-listing independent flags, open) | menu_items, channel_availability, outlets | phase-07 | Not Started |
| artifact-05 | Order History | DEC-015 (order status enum incl. Saved/Printed/Cancelled/Paid mapping), DEC-016 (amount glossary), DEC-023 (outlet_id) | orders, order_items, outlets | phase-04-06 | Not Started |
| artifact-06 | Billing Screen Config | DEC-016 (amount glossary), DEC-017 (tax mode scope) | billing_config, tax_rows, outlets | phase-04-06 | Not Started |
| artifact-07 | Bill/KOT Print Config | DEC-015 (kot_sent flag), DEC-021 (carried-forward open item) | print_config, outlets | phase-04-06 | Not Started |
| artifact-08 | Tax Master / Day-End Payment Summary / Item Report | DEC-014 (Sales Return Orders field set — HARD BLOCKER), DEC-016 (amount glossary), DEC-017 (tax mode scope) | tax_rows, day_summary, sales_return_orders, item_report, outlets | phase-10-11 | Not Started |
| artifact-09 | Restaurant/System Config / App Shell | DEC-018 (sync interval/offline-tolerance, open), DEC-019 (standalone-if-server-down, open), DEC-020 (global order ID scheme, open), DEC-023 (multi-outlet scope for v1) | outlets, system_config, sync_state | phase-04-06 | Not Started |

## Notes on phase mapping

- **phase-04-06** builds artifact-01, 02, 05, 06, 07, 09 (core table/order/billing/config surface).
- **phase-07** builds artifact-03, 04 (online-channel-specific surfaces: live feed, OOS/availability).
- **phase-10-11** builds artifact-08 (Tax Master / Day Summary / Item Report), and is the phase explicitly blocked by DEC-014 per the decision register — this row's Build Status should not advance past "Not Started" / "Blocked" until the DEC-014 re-capture action item is closed.

## Maintenance

When a phase begins work on its mapped artifact(s), update Build Status to "In Progress"; when the corresponding phase-execution-plan doc's acceptance criteria are met, update to "Built"; once QA/Docs has verified the built feature against its artifact doc, update to "Verified". If a DEC item referenced in this matrix changes status in `00-decision-register-FINAL.md`, re-review the affected row(s) for re-scoping before continuing implementation.
