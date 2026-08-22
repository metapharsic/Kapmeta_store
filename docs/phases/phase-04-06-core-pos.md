# Phase 4-6: Core POS — Execution Plan

## 1. Objective

Phase 4-6 delivers the largest single slab of Kapmeta's build: a fully working, single-outlet, LAN-server-backed, offline-tolerant point-of-sale core covering dine-in, pickup, and delivery order taking. By the end of this phase a cashier must be able to run a complete real-world shift — open the app, work the table floor plan, take an order, apply the correct tax and charges, print a KOT and a bill, look the order back up, and (with an audit trail) correct it — entirely on functionality shipped in this phase.

This phase explicitly builds six of the nine already-designed POS/admin screens:

- artifact-01 — Table / Floor View
- artifact-02 — Order Entry / Billing (the largest single document in the set: the full tax, discount, and container-charge calculation engine, with worked ₹ examples that become golden tests)
- artifact-05 — Order History
- artifact-06 — Billing + Print Config (admin)
- artifact-07 — Tax Master (admin)
- artifact-09 — System Config + App Shell (admin + shared shell)

**Explicitly out of scope for this phase** (called out here so no build agent scope-creeps into them):

- artifact-03 Online Live Feed and artifact-04 OOS/Menu Availability — these belong to **Phase 7 (Online Integration)**. This phase does not touch aggregator order ingestion, live-order feeds, or item availability toggles beyond what is needed for a static, admin-curated menu.
- artifact-08 Day Summary/Item Report — belongs to **Phase 10-11 (CRM + Reporting)**. This phase produces the underlying orders/order_items data that report will read, but builds no reporting UI or aggregation service.
- Inventory and Finance (Phase 8-9) and CRM (Phase 10-11) are not touched.

The deliverable of this phase is a working core loop, not a complete product: no multi-outlet sync conflict resolution beyond what Phase 2-3 architecture already defined, no aggregator webhooks, no inventory deduction, no loyalty/CRM.

## 2. Entry Criteria

Phase 4-6 cannot start work until Phase 2-3 has formally exited:

- Database schema is frozen and migrated in the dev/staging environment (`db/migrations/*` applied cleanly from a blank database).
- API contracts for all services this phase touches (`contracts/orders`, `contracts/tables`, `contracts/tax`, `contracts/settings`, `contracts/printing`, `contracts/admin`) are frozen and versioned — no schema or contract edits are in scope for this phase's Domain Services Agents beyond what is described in Section 5.
- All architecture decision records (ADRs) relevant to this phase are approved, specifically:
  - **DEC-017 (tax-mode resolution)** — the exact rule set for Backward Tax vs Forward Tax selection by channel, and how it composes with discount-basis toggles, must be closed and documented before Wave 5 (billing engine) can start.
  - The **unified `order_status` enum decision** (reconciling the 5 table-view states with the 4 order-history states) must be closed before Wave 4 starts, since it is a foreign concept touched by Tables, Orders, and History from day one.
- Dev/infra skeleton (local LAN server, apps/api boot, apps/pos-web and apps/admin-web scaffolds, CI pipeline, seed-data harness) is running locally and in CI.

If either DEC-017 or the order-status enum decision is not closed by the scheduled start date, this phase's start is blocked — see Risks (Section 8).

## 3. Exit Criteria / Definition of Done

Phase 4-6 is done when all of the following are true and demonstrable, not merely coded:

**Functional DoD**

1. A cashier can open apps/pos-web and see the table floor plan, and every table on it correctly reflects one of the 5 captured visual states (Blank, Running, Printed, Paid, Running-KOT), each state driven by the canonical `order_status` enum plus the table's linked order/session — not by ad hoc client-side flags.
2. A cashier can create a Dine-In order against a table, a Pickup order, and a Delivery order, and add items from a category-organized menu populated entirely from `db` menu tables (zero hardcoded item names, prices, or categories in client or service code).
3. Container/delivery/service charges apply per outlet-configured rules: each of the 3 channel toggles (Delivery/PickUp/DineIn) and each of the 3 calculation modes (Item-wise/Order-wise/Fix-per-item) is independently exercised by a passing test, including all toggle-off cases.
4. Tax is computed by the correct formula per channel: Backward Tax (CGST 2.5% + SGST 2.5%, tax-inclusive-derivation) for dine-in, Forward Tax (CGST[Online] 2.5% + SGST[Online] 2.5%, tax-added-on-top) for online/delivery channels, matching the Tax Master screenshot's locked rates and matching every worked example in artifact-02 and artifact-07 to the paisa.
5. A cashier can print a KOT and a bill, and the printed content differs correctly across at least 3 distinct `outlet_print_settings` configurations exercised in tests (e.g. show/hide tax breakup, show/hide item-level discount, single vs multiple copies) — with zero literal template strings for business-controlled print text in code.
6. The grand total on an open order is editable via the pencil-icon manual-override flow, and every such edit writes exactly one `order_audit_log` row capturing old value, new value, user, and timestamp — verified by an integration test that edits a total and asserts the audit row.
7. Order History lists, filters, and allows reprint of past orders, and edits made in Order History (including grand-total edits) go through the same audited path as live billing.
8. An admin, using apps/admin-web, can perform full CRUD on Billing + Print Config, Tax Master entries, and System Config (bill/KOT numbering reset, sync code reset, etc.) with changes reflected live in pos-web without a redeploy — and every one of these is backed by a DB table + seed/admin UI per CLAUDE.md's no-hardcoding rule, including payment-type labels and print text fragments.
9. Bill and KOT numbers are generated as a per-outlet local sequence, and the "Reset Bill No." admin action correctly resets that sequence and is reflected in the next order created.
10. The App Shell (navigation, auth context, outlet/session context) is a single shared component consumed identically by every pos-web screen in this phase — no per-screen duplicate shell code.

**Test-coverage DoD**

- 100% of the worked-example golden calculations documented in artifact-02 (order entry/billing) and artifact-07 (Tax Master) pass as automated unit tests under `tests/unit/core-pos/`.
- Integration tests cover the Tables↔Orders session lifecycle (table opened → order created → KOT printed → bill printed → paid → table freed) end to end against a real (test) database.
- At least one e2e test per channel (dine-in, pickup, delivery) walks the full UI flow from table/menu selection through printed bill in apps/pos-web against a running services stack.
- Every `outlet_print_settings` boolean has at least one test asserting its effect on rendered print output (positive and negative case where feasible).
- CI gate: no merge into the phase's integration branch is accepted with failing golden-calculation tests, unaudited grand-total-edit paths, or any literal business string flagged by the hardcoding lint check (see Section 5).

## 4. Task Breakdown by Wave

### Wave 4 — Tables + Order Entry Happy Path

Goal: get a real order created, saved, and visible end to end, deliberately deferring tax/discount/charge complexity and print polish.

1. Confirm and document the frozen `order_status` enum values and their mapping to the 5 table states and 4 history states (Docs/Discovery Agent writes the mapping table into `docs/`, all agents consume it — no re-litigating during Wave 5/6).
2. Tables Service Agent: implement `services/tables` read/write endpoints for floor layout, table state transitions, and table→order session linkage against the frozen `table_sessions` schema.
3. Orders Service Agent: implement `services/orders` create/read/update endpoints for order header + order_items, with a minimal (no-tax) subtotal calculation, against the frozen `orders`/`order_items` schema.
4. Contracts Agent: confirm/publish the finalized OpenAPI/schema contracts for the two services above (already frozen at a structural level from Phase 2-3; this step is about filling in request/response examples the two service agents will build against) so POS-Web UI Agent is never blocked waiting on a live service.
5. POS-Web UI Agent: build artifact-01 Table/Floor View (5-state rendering) and the happy-path shell of artifact-02 Order Entry (menu browse by category, add/remove item, save order) wired to the Wave-4 service endpoints, with tax/charges/print stubbed as fixed placeholders.
6. Settings Service Agent: stand up `services/settings` with a minimal read-only endpoint serving outlet/menu/category data so Wave 4 UI has real (non-hardcoded) menu content from day one.
7. Admin Service Agent: minimal seed/admin UI (can be a barebones internal tool, not the polished artifact-09 screen yet) to create/edit menu items and categories, since menu data must never be hardcoded even at this early stage.
8. QA/Test Agent: stand up `tests/integration/core-pos/table-order-lifecycle` covering table open → order create → order save → table state change, running in CI from the first merged commit of this wave, not after the wave ends.
9. Exit check for Wave 4: a table can go Blank → Running by creating an order, items can be added and saved, and the change is visible in both apps/pos-web and directly via the Orders API — all with zero hardcoded menu/table data.

### Wave 5 — Billing Engine, Print Engine, Tax Master Admin

Goal: layer the full calculation and print correctness onto the Wave-4 happy path.

1. Tax Service Agent: implement `services/tax` — Tax Master CRUD, and a calculation endpoint (or shared calc library consumed by Orders Service) implementing Backward Tax and Forward Tax per channel per the locked Tax Master screenshot rates, gated on DEC-017 being closed.
2. Orders Service Agent: extend order calculation to call the tax engine, apply discount-basis toggle (pre-tax vs post-tax discount, per DEC-017), and apply the 3-toggle/3-mode container charge matrix and delivery/service charges, matching every artifact-02 worked example.
3. Orders Service Agent: implement the manual grand-total override endpoint — validates the override, writes the new total, and writes an `order_audit_log` row transactionally in the same request; no code path may change grand_total without producing an audit row.
4. Settings Service Agent: implement `services/settings` write endpoints for Billing Config and outlet-level charge/discount toggles (artifact-06 backing), and the `outlet_print_settings` table (13+ boolean flags) with full CRUD.
5. Printing Service Agent: implement `services/printing` — a synchronous, locally-invoked KOT/bill rendering service that reads `outlet_print_settings` at render time and produces print output with zero literal business template strings (all print text fragments — headers, footers, tax-breakup labels, payment-type labels — sourced from settings/DB).
6. POS-Web UI Agent: wire the Order Entry screen's calculation display to the real tax/charge engine (live ₹ breakdown matching worked examples), add the pencil-icon manual grand-total edit flow with confirmation and audit-visible history, and wire real KOT/bill print buttons to Printing Service.
7. Admin-Web UI Agent: build artifact-07 Tax Master screen (CRUD on tax rows, channel-mode assignment) and artifact-06 Billing + Print Config screen (charge toggles/modes, print settings flags) against Tax and Settings services.
8. QA/Test Agent: port every artifact-02 and artifact-07 worked example into `tests/unit/core-pos/billing-golden/*` and `tests/unit/core-pos/tax-golden/*`; add integration tests for the audit-log-on-edit invariant and for each of the 13+ print-setting flags' effect on rendered output; these run continuously and gate every merge in this wave, not just at wave close.
9. Exit check for Wave 5: every golden calculation passes, every print-setting flag has a passing positive/negative test, grand-total edits are always audited, and Tax Master/Billing Config are editable end to end from admin-web with immediate effect in pos-web.

### Wave 6 — Order History, System Config, App Shell, Hardening

Goal: close out the remaining two screens, the shared shell, and stabilize the whole slice for phase exit.

1. Orders Service Agent: implement Order History query endpoints (filter by date/status/channel/table), reprint endpoint (re-invokes Printing Service against the historical order), and edit-with-audit endpoint reusing the Wave-5 audit mechanism.
2. Admin Service Agent: implement `services/admin` System Config actions — Reset Bill No. (per-outlet sequence reset), Reset Sync Code, DB Migration trigger (invokes the existing migration runner, does not author new migrations), Remove Orders/KOT (soft-delete with audit), Remove Backups, Logs viewer (read-only tail of service logs), Check Machine / sync-topology view (read-only display of node/outlet sync status per the Phase 2-3 sync-architecture doc).
3. Orders Service Agent + Admin Service Agent jointly: implement per-outlet local bill/KOT numbering as an atomic, race-safe sequence (e.g. DB sequence or row-locked counter scoped by outlet_id), with the Reset Bill No. admin action resetting it cleanly without colliding with an order mid-creation.
4. POS-Web UI Agent: build artifact-05 Order History screen (list/filter/reprint/edit) against the Wave-6 Orders endpoints.
5. Admin-Web UI Agent: build artifact-09 System Config screens against the Wave-6 Admin endpoints, and finalize the shared App Shell (nav, auth/session context, outlet context) so it is the single shell import used by every pos-web and admin-web screen delivered across all three waves — retrofit Wave 4/5 screens onto the finalized shell if they were built against a placeholder shell.
6. QA/Test Agent: add `tests/e2e/core-pos/*` covering the full shift simulation (open table → order → print → history lookup → reprint → admin bill-no reset → new order picks up reset numbering); add integration tests for every System Config action, especially Reset Bill No. under concurrent order creation.
7. All Domain Services Agents + POS-Web/Admin-Web UI Agents: joint hardening pass — run the CLAUDE.md hardcoding lint/audit across every file touched in this phase (menu items, tax rows, payment-type labels, print text are named explicitly in that rule) and fix any violation found.
8. Docs/Discovery Agent: finalize phase-exit documentation — updated API docs for orders/tables/tax/settings/printing/admin, the order_status enum reference, and a short "what Phase 7 and Phase 10-11 can rely on" handoff note (see Section 7).
9. Exit check for Wave 6 (= phase exit): full DoD checklist in Section 3 is green, all three waves' tests pass together in CI on a clean environment, and the phase-exit handoff note is published.

## 5. Agent Roster, Division of Labor, and Wiring

**Active per wave**

- Wave 4: Tables Service Agent, Orders Service Agent, Settings Service Agent (read-only), Admin Service Agent (minimal), POS-Web UI Agent, QA/Test Agent, Docs/Discovery Agent (enum mapping doc). Contracts Agent consulted, not authoring new contracts (frozen); DB/Schema Agent consulted for clarification only, not editing migrations.
- Wave 5: Tax Service Agent, Orders Service Agent, Settings Service Agent (full), Printing Service Agent, POS-Web UI Agent, Admin-Web UI Agent, QA/Test Agent (continuous).
- Wave 6: Orders Service Agent, Admin Service Agent, POS-Web UI Agent, Admin-Web UI Agent, QA/Test Agent (continuous), Docs/Discovery Agent (phase-exit handoff).

**Schema/contract coordination without collision.** The DB schema and the service API contracts were both frozen at the end of Phase 2-3, so nothing in this phase edits `db/migrations/*` or the structural shape of `contracts/*`. The specific point of friction is the `table_sessions` ↔ `orders` relationship: Tables Service Agent owns reads/writes to `table_sessions` and table-state transition logic; Orders Service Agent owns reads/writes to `orders`/`order_items`. Neither agent edits the other's tables directly. They coordinate purely at the API layer: Tables Service exposes a `link_session_to_order(table_session_id, order_id)` contract call, and Orders Service exposes an `order_status_changed` event/callback (or is polled) that Tables Service consumes to drive its 5-state table rendering. Any ambiguity in who is the source of truth for "is this table occupied" is resolved by rule: `table_sessions.status` is table-truth, `orders.order_status` is order-truth, and Tables Service is the only writer that maps order-truth into table-truth — Orders Service never writes to `table_sessions` directly. This division is written into `contracts/tables` and `contracts/orders` request/response docs during Wave 4 task 4 so both agents build against the same understanding from day one.

**POS-Web UI Agent as a pure API consumer.** POS-Web UI Agent never talks to a database directly and never encodes business rules (tax formulas, charge modes, print flag semantics) client-side beyond what is needed for optimistic UI feedback; all authoritative calculation happens server-side in Orders/Tax services, and the client's job is to call Orders/Tables/Tax/Settings APIs, render their responses, and re-fetch/reconcile on save. This keeps the calculation engine single-sourced and testable independent of any UI framework choice.

**Printing Service Agent invoked synchronously, locally.** Per the Phase 2-3 sync-architecture doc, the LAN server is local to the outlet, so KOT/bill printing is not a cloud round-trip: POS-Web UI Agent calls Printing Service's render endpoint synchronously (same LAN, sub-second expected latency) and the response is either sent directly to a configured local printer driver/spooler or returned as print-ready content for the client to hand to the OS print pipeline, depending on the printer integration approach locked in Phase 2-3. Printing Service Agent must not assume network unavailability handling beyond what's already covered by the platform's general offline-tolerance design — this phase treats printing as functionally synchronous and blocking for the cashier flow, with a clear (tested) error state if no printer is configured or reachable, surfaced back to POS-Web UI Agent as a normal API error rather than a silent failure.

**QA/Test Agent runs continuously, not at the end.** Starting with Wave 4 task 8, QA/Test Agent's test suites are wired into CI and gate merges for every subsequent task in every wave — a Wave 5 change to the tax engine cannot merge if it breaks a Wave 4 table-lifecycle test, and a Wave 6 print-settings retrofit cannot merge if it breaks a Wave 5 golden calculation. This is the mechanism that prevents the three waves from silently diverging or reintroducing hardcoded data as new screens are built.

## 6. Deliverables (exact paths)

```
services/tables/            # table state, table_sessions API, floor layout
services/orders/            # order/order_items CRUD, calc orchestration, audit-on-edit, history queries
services/tax/               # Tax Master CRUD, backward/forward tax calc
services/settings/          # outlet config, billing config, outlet_print_settings CRUD, menu/category read
services/printing/          # KOT/bill render engine, settings-driven templating
services/admin/             # system config actions: bill-no reset, sync code reset, migration trigger,
                             #   remove orders/KOT, remove backups, logs viewer, machine/sync-topology view

apps/pos-web/screens/table-floor-view/          # artifact-01
apps/pos-web/screens/order-entry-billing/       # artifact-02
apps/pos-web/screens/order-history/             # artifact-05
apps/pos-web/shell/                             # shared App Shell consumed by all pos-web screens

apps/admin-web/screens/billing-print-config/    # artifact-06
apps/admin-web/screens/tax-master/              # artifact-07
apps/admin-web/screens/system-config/           # artifact-09 admin portion
apps/admin-web/shell/                           # shared App Shell consumed by all admin-web screens

tests/unit/core-pos/billing-golden/             # artifact-02 worked examples as unit tests
tests/unit/core-pos/tax-golden/                 # artifact-07 worked examples as unit tests
tests/integration/core-pos/table-order-lifecycle/
tests/integration/core-pos/audit-log-on-edit/
tests/integration/core-pos/print-settings-matrix/
tests/integration/core-pos/bill-kot-numbering/
tests/e2e/core-pos/dine-in-shift/
tests/e2e/core-pos/pickup-shift/
tests/e2e/core-pos/delivery-shift/
tests/e2e/core-pos/admin-reset-bill-no/

docs/order-status-enum.md                       # canonical enum + state-mapping reference
docs/phase-exit/phase-04-06-handoff.md           # what Phase 7 and Phase 10-11 can rely on
```

## 7. Dependency Wiring — What This Phase Hands Downstream

**To Phase 7 (Online Integration).** Phase 7 plugs aggregator order ingestion into whatever this phase produces, so this phase must hand off: a stable, versioned Orders API (`services/orders`) capable of accepting an order created by a channel other than the in-house POS UI without modification to its core create/update contract; the finalized `order_status` enum, since aggregator-originated orders must map onto the same states the table view and order history already render; and a working, callable KOT/print pipeline (`services/printing`) that Phase 7 can invoke for aggregator orders exactly as pos-web invokes it for walk-in orders. Phase 7 should not need to alter `services/orders`' core data model, only add an ingestion adapter in front of it.

**To Phase 10-11 (CRM + Reporting).** Phase 10-11's Day Summary and Item Report screens (artifact-08, and CRM features) read historical orders/order_items data. This phase must leave that dataset queryable and complete: every order, regardless of channel, ends up with correct tax breakdown, applied charges, and final grand total (including any audited manual overrides) persisted in a shape that supports aggregation without reprocessing business logic. This phase does not build any reporting or aggregation endpoints itself — it only guarantees the underlying data is correct and complete.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| DEC-017 (tax-mode/discount-basis resolution) not closed before Wave 5 start | Blocks the entire billing engine — Tax Service, Orders Service calc orchestration, and both admin/pos-web calc UI all depend on it simultaneously | Hard-gate: Wave 5 cannot start any task until DEC-017 is formally marked closed and its resolution is written into `contracts/tax`. Wave 4 proceeds in parallel using stubbed/no-tax calculation so schedule is not fully blocked. |
| Unified `order_status` enum decision arrives late or changes after Wave 4 has started | Forces simultaneous rework across Tables, Orders, and History, since all three are built against the enum from their first commit | Hard-gate: no Wave 4 task begins until the enum is closed and documented in `docs/order-status-enum.md`. This is treated as a harder gate than DEC-017 precisely because it is structural to three services and two UI screens at once, not one calculation engine. |
| `outlet_print_settings` flag set (13+ booleans) is incomplete or ambiguous relative to actual printer output needs discovered during Wave 5 build | Printing Service Agent either hardcodes a missed case (violating CLAUDE.md) or ships incorrect print output | Any newly discovered print variation is resolved by adding a new settings flag/table row (with seed/admin UI), never a code-level special case; QA/Test Agent's print-settings-matrix tests are extended to cover it before merge. |
| Manual grand-total override becomes a bypass for the tax/charge engine if not carefully scoped | Cashiers could silently zero out or misstate tax liability with no correction path | Override endpoint only ever changes `grand_total` and always writes `order_audit_log`; it never suppresses or rewrites the underlying tax/charge line items, so the computed breakdown remains visible and auditable even when the total is overridden. |
| Per-outlet bill/KOT numbering race conditions under concurrent order creation, especially around a Reset Bill No. action | Duplicate or skipped bill numbers, which is a compliance-sensitive defect for a billing system | Implement numbering as an atomic DB-level sequence or row-locked counter (Wave 6 task 3); dedicated concurrency integration test (Wave 6 task 6) specifically exercises simultaneous order creation across a Reset Bill No. call. |
| Hardcoding rule violations creep in under schedule pressure (a fallback default tax label, a placeholder print footer left in "temporarily") | Violates CLAUDE.md directly and produces tenant-specific behavior baked into code | Wave 6 task 7 runs an explicit lint/audit pass across the whole phase's changed files before phase exit is declared; QA/Test Agent treats any literal business string found as a merge-blocking defect, not a style note. |
| Printing Service's local/synchronous invocation assumption doesn't hold for some printer integration path decided in Phase 2-3 | Print flow silently degrades to unacceptable latency or fails ungracefully | Printing Service Agent confirms the exact printer integration approach against the Phase 2-3 sync-architecture doc before Wave 5 task 5 starts; any mismatch is raised as a blocking question rather than assumed away. |

## 9. Estimated Duration

Total window: 8-12 weeks, budgeted across the three waves as follows (using the 10-week midpoint as the reference plan; compress/extend proportionally within the 8-12 week band based on actual team velocity and how quickly DEC-017 and the order-status enum decision close):

- **Wave 4 — Tables + Order Entry happy path:** 2.5-3 weeks. Includes the enum-mapping documentation task, minimal admin menu tooling, and the first continuous CI test gate coming online.
- **Wave 5 — Billing engine + Print engine + Tax Master admin:** 4-5 weeks (the largest wave, matching artifact-02 being the largest single design document). Includes DEC-017-gated start; if DEC-017 closes later than planned, this wave's start slips but Wave 4 work continues in parallel up to that point.
- **Wave 6 — Order History + System Config + App Shell + hardening:** 2.5-3.5 weeks, including the explicit hardening/lint pass and full e2e shift-simulation suite, plus phase-exit documentation.

Recommended checkpoint cadence: a go/no-go review at the end of each wave against that wave's exit check (Section 4), with the Wave 5 checkpoint being the hardest gate since it carries the highest schedule risk (DEC-017 dependency) and the most golden-test surface area.
