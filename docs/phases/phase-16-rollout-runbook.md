# Phase 16 Rollout Runbook — Kapmeta POS Pilot Outlet

## On-Site Install
1. Install server + client apps per standard build (no new code this phase).
2. Connect client(s) to outlet LAN; confirm server reachable at its LAN IP.
3. Open System Config > Check Machine on each client. Confirm status shows server reachable, DB connected, and clock sync OK. Do not proceed until all clients pass.
4. Confirm printer/scanner/cash drawer peripherals detected.

## Seeding Real Outlet Data (Admin UI only — no deploy)
1. Menu: enter categories, items, prices, modifiers via Admin > Menu. Cross-check against outlet's paper/legacy menu.
2. Tax: configure applicable tax rates/rules via Admin > Tax Settings; verify against local tax requirement.
3. Settings: outlet name, receipt footer, business hours, service charge, rounding rules, user/staff accounts and roles.
4. Spot-check by ringing 3–5 test transactions covering common items, a discount, and a tax-inclusive item; void/refund one to confirm workflow.

## Staff Training Checklist
- Login/logout, shift open/close, cash drawer count-in/count-out
- Order entry, modifiers, holds/fires, splits/merges
- Payment types accepted at this outlet (cash, card, e-wallet)
- Void, refund, discount — who is authorized, approval flow
- Day-end/Z-report generation
- Basic troubleshooting: reprint receipt, offline/reconnect behavior, who to call for support
- Sign-off sheet: each staff member confirms hands-on run-through completed

## Parallel Run & Reconciliation
- Run Kapmeta alongside the old system for a minimum of 5 full trading days (extend if outlet has weekly cycle variance, e.g. include one weekend).
- Each day: close both systems, pull day summary (gross sales, tax, discounts, voids, payment-type breakdown) from each.
- Reconcile line-by-line; log and root-cause any variance. Acceptable tolerance: <0.5% on gross sales, exact match on transaction count.
- Escalate unresolved variances to project lead before continuing parallel run.

## Cutover Criteria
All of the following must hold for 3 consecutive parallel-run days before cutover:
- Day summary variance within tolerance, no unresolved discrepancies
- Zero unresolved Check Machine connectivity failures
- All rostered staff signed off on training checklist
- No unresolved P1/P2 defects logged during parallel run
- Outlet manager and project lead both sign cutover approval

## Rollback Triggers
Roll back to old system immediately if, post-cutover:
- Server/client connectivity failure blocking sales for >15 minutes without workaround
- Day summary cannot be produced or is materially wrong (>2% variance) with no fast fix
- Data loss or corruption of transactions/menu/tax config
- Payment processing failure affecting live transactions
- Any P1 defect with no same-day fix

Rollback procedure: revert outlet to old system for that trading day, preserve Kapmeta logs/DB snapshot for root-cause, notify project lead, re-attempt parallel run before next cutover attempt.
