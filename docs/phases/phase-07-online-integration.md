# Phase 7 — Online Integration (Swiggy / Zomato)

**Planned duration:** 4–6 weeks
**Status:** Planning document — no implementation performed in this pass

---

## 1. Objective

Phase 7 connects Swiggy and Zomato to Kapmeta as live, first-class order channels. It has two directions of data flow:

- **Inbound:** aggregator orders arrive as webhooks at the cloud, get normalized into Kapmeta's existing order schema, and flow down to the correct outlet-server, where they render on the new Live Order Feed screen (artifact-03) and print through the existing KOT/bill pipeline exactly as a dine-in or POS-originated order would.
- **Outbound:** operator actions in Kapmeta (accept/reject, food-is-ready, marking an item out of stock, toggling item/addon availability, renaming an item for online display) push back out to the Swiggy and Zomato APIs.

The guiding constraint for this phase is architectural discipline: Phase 4-6 already built a stable Orders API, a unified `order_status` enum, a synchronous local print pipeline, and a tax engine that branches on `order.channel`. Phase 7 must be a *consumer* of all of that, not a parallel implementation. No new order-state machine, no new print logic, and explicitly no new tax logic — correctness here is proven by setting `channel` correctly on ingestion and letting Phase 4-6's already-built tax engine do the rest.

## 2. Entry Criteria

Phase 7 cannot start meaningfully until:

1. Phase 4-6 exit criteria are met and frozen: Orders API is stable and versioned, `order_status` enum is finalized, the local KOT/bill print pipeline (driven by `outlet_print_settings`) is working end-to-end for at least dine-in orders, and the Tax Master engine already branches correctly on `order.channel` (Forward Tax for online, Backward Tax for dine-in) — confirmed against the CGST[Online]/SGST[Online] 2.5%+2.5% split seen in screenshots.
2. The outbox/inbox sync architecture between cloud and outlet-server (drafted earlier) is implemented well enough to carry an arbitrary new sync-channel payload type (aggregator-origin orders), even if this phase is its first "new" payload kind exercising it.
3. **External dependency, outside Kapmeta's control:** Swiggy and Zomato developer/partner API credentials and sandbox environments have been obtained. This is flagged explicitly as a blocking dependency owned by business/ops, not engineering — see Risks.

If (1) or (2) is not true, this phase should not start; if (3) is not true, backend contract and normalization work can still proceed against recorded/fixture payloads, but no live sandbox integration testing can occur (see the QA webhook simulator in Task breakdown, which exists specifically to de-risk this).

## 3. Exit Criteria / Definition of Done

Phase 7 is done when all of the following are demonstrably true, not just implemented:

1. A simulated Swiggy webhook (via the QA sandbox harness) results in a visible order card on the Live Feed screen within a defined latency budget (target: under 5 seconds from webhook receipt to on-screen card, end to end through cloud ingestion → outbox/inbox sync → outlet-server render). The same is true for a simulated Zomato webhook.
2. Every aggregator-origin order is tagged `channel=swiggy` or `channel=zomato` at ingestion, and Forward Tax (CGST[Online] 2.5% + SGST[Online] 2.5%) is applied automatically by the existing Phase 4-6 tax engine, with **zero new tax code written in this phase**. This is verified by an integration test that asserts the tax breakdown on an ingested order without any Phase-7 code touching tax calculation.
3. Marking an item out-of-stock with "propagate to all other online platforms" enabled results in independent API calls to both Swiggy and Zomato, each with its own retry behavior, each logged as a row in `channel_sync_log` (success or failure, per platform, per attempt). A failure on one platform does not silently succeed as a whole — the UI must surface partial failure explicitly (e.g., "Zomato update failed, Swiggy succeeded — retry?"), not report a blanket success.
4. The Prepare-In SLA countdown timer on the Live Feed reproduces the "too late, customer might cancel" warning state matching the captured screenshot behavior (visual/state transition, not just a color change). Whether this warning also creates an entry in the App Shell's Alerts system is a **recommended but explicitly flagged open decision** — if not resolved by build time, ship the on-card warning state only and log the Alerts-integration gap as a follow-up item rather than blocking the phase on it.
5. The MFR bulk-action button has a resolved, documented meaning before UI build starts; if not resolved in time, a fallback interpretation is implemented and clearly flagged in code comments, docs, and this plan's addendum (see Task d and Risks).
6. Both new screens (Live Order Feed, OOS + Menu Availability Manager) are built against artifact-03 and artifact-04 pixel/interaction spec, consuming only the already-frozen backend contracts — no screen-specific backend logic invented ad hoc in the UI layer.
7. A reconciliation job runs on a schedule and detects at least one class of drift (Kapmeta believes item is available, platform says unavailable, or vice versa) in a test scenario, and that drift is visible somewhere an operator can act on it.
8. Webhook idempotency is verified: replaying the same webhook payload (same aggregator order id) twice does not create a duplicate Kapmeta order.

## 4. Task Breakdown (ordered)

**(a) Webhook ingestion endpoints — contract-first**
Define `contracts/aggregator-webhooks.yaml` before writing any handler code. It must specify, per platform (Swiggy and Zomato separately, since their payload shapes and auth schemes differ): endpoint path, expected headers, signature/HMAC verification scheme, payload schema, and the idempotency key used for deduplication (aggregator's own order id, namespaced by platform). Implement signature verification per platform as a first-class concern, not an afterthought — a webhook that fails verification must be rejected and logged, never silently processed. Idempotency: on duplicate delivery (same platform + aggregator order id), the endpoint must be a no-op that returns success without creating a second order or re-triggering print.

**(b) Normalize inbound payloads into Kapmeta's schema**
Produce an explicit field-mapping table (one row per source field) from each platform's payload shape into Kapmeta's `orders`/`order_items` schema, covering at minimum: customer OTP, rider assignment status ("Looking for rider" / rider assigned / "ARRIVED"), item lines and modifiers, pricing components, delivery vs pickup distinction, and the platform's own order id (stored as an external reference, never overwriting Kapmeta's own order id). KOT and bill numbering must be triggered at ingestion using the existing per-outlet local sequence generator from Phase 4-6 — no new numbering scheme. `channel` must be set at this normalization step, since it is the single field that makes the existing tax engine behave correctly.

**(c) Sync-down path**
The webhook-ingested order, once normalized and written through the Orders API, must flow to the correct outlet-server using the existing outbox/inbox sync channel — the same mechanism used for every other outlet-server-bound update, not a bespoke push path. This is what makes it correctly appear on the Live Feed at the outlet. This task is co-owned with the Sync/Offline Agent (see Section 5).

**(d) Build the Live Feed screen (artifact-03)**
Build to spec: order cards with OTP, rider status, Prepare-In SLA countdown with the "too late" warning state, Call Customer / Contact Swiggy-Zomato-Help / Info / Food-Is-Ready actions, and filter tabs (All / Dine-In / Delivery / PickUp / Online / Swiggy / Zomato). Before building the MFR bulk-action button, its meaning must be resolved with whoever owns the artifact-03 spec. If unresolved by the time this task is scheduled, implement it behind a clearly labeled placeholder (disabled or confirmation-gated) with the fallback interpretation documented inline and in this plan's decision log, so it does not block the rest of the screen shipping.

**(e) Build the OOS modal + Menu Availability Manager (artifact-04)**
Two distinct pieces of UI, per spec: (i) per-item mark-out-of-stock modal with the "allow customer to choose alternate item" toggle and the "propagate to all other online platforms" toggle; (ii) a separate per-channel Item On/Off and Addon On/Off availability manager with per-item "Online Display Name" (distinct from POS name), category tree navigation, and search/filter. The propagate toggle drives a fan-out job: independent write to Swiggy's availability API and Zomato's availability API, each with its own retry policy and circuit breaker (so one platform being down does not block or delay the other), with every attempt logged to `channel_sync_log`. Partial failure must be surfaced in the UI, not swallowed.

**(f) Outbound actions**
Food-Is-Ready, accept/reject, Call-Customer and Contact-Support deep links, rider status updates (polling or webhook depending on what each platform supports), and OTP verification handoff. Each of these is an outbound call to the relevant aggregator API, triggered from an existing Orders API action where possible (e.g., "Food-Is-Ready" should map to an existing order-status transition plus a new aggregator-side notification, not a new status).

**(g) Reconciliation job**
A periodically-scheduled job that compares Kapmeta's stored view of channel menu availability against the actual state on each platform (via a read/status API where the platform supports it) and flags drift. This is the safety net for silent fan-out failures or manual out-of-band changes made directly on a platform's own dashboard. Findings should feed the same `channel_sync_log`/alerting surface used for fan-out failures so operators have one place to look.

## 5. Agent Roster and Division of Labor

- **Aggregator Integration Agent (new, primary owner of this phase).** Owns `services/aggregator-orders` and the webhook/outbound logic in `services/menu-sync`. Responsible for tasks (a), (b), (f), (g), and the fan-out/retry logic in (e). Explicitly **must not modify** `services/orders`' core schema or the Tax Master's logic — those are frozen inputs from Phase 4-6. All order writes happen through the existing Orders API/contract, using channel-specific ingestion adapters only.
- **Orders Service Agent (from Phase 4-6, extended not rebuilt).** Provides any narrow, additive extension points the Aggregator Integration Agent needs (e.g., confirming the Orders API accepts external-channel metadata cleanly) without altering existing behavior for dine-in/POS orders. Any change here is additive-only and must not break Phase 4-6's frozen exit criteria.
- **Sync/Offline Agent (from earlier phases).** Extends the outbox/inbox worker to carry aggregator-origin orders down to outlet-servers (task c), reusing the existing sync channel rather than adding a second delivery mechanism.
- **POS-Web UI Agent.** Builds both new screens (Live Order Feed, Menu Availability Manager) strictly against the frozen `contracts/aggregator-webhooks.yaml` and the corresponding Orders/menu-sync API contracts. Can start in parallel with backend implementation as soon as those contracts are frozen — UI work should not wait on backend completion, only on contract sign-off.
- **QA/Test Agent.** Builds a webhook simulator/sandbox harness that can emit valid, signed Swiggy- and Zomato-shaped payloads on demand, so integration tests do not depend on live aggregator sandbox uptime. Owns the idempotency, fan-out partial-failure, and reconciliation-drift test scenarios described in the exit criteria.
- **Docs/Discovery Agent.** Owns closing out the MFR decision item and documenting the field-mapping tables from task (b) as durable reference docs under `docs/`.

## 6. Deliverables (exact paths)

- `services/aggregator-orders/` — webhook ingestion, normalization, idempotency handling
- `services/menu-sync/` — OOS/availability fan-out, per-platform adapters, reconciliation job
- `contracts/aggregator-webhooks.yaml` — frozen contract for both platforms' webhook shapes and Kapmeta's normalized schema
- `apps/pos-web/screens/LiveOrdersScreen/` — artifact-03 implementation
- `apps/pos-web/screens/MenuAvailabilityScreen/` — artifact-04 implementation (OOS modal + availability manager)
- `db/` addition: `channel_sync_log` table (see dependency note below — flagged as ideally belonging to the Phase 2-3 schema freeze; added here as a necessary catch-up if it was not already included)
- `tests/integration/aggregators/` — webhook simulator harness, idempotency tests, fan-out/partial-failure tests, reconciliation tests

## 7. Dependency Wiring

**Depends on (upstream, frozen):** Phase 4-6's Orders API, `order_status` enum, print pipeline, and channel-aware tax engine must be stable and unchanged through this phase. This is treated as a contract, not a new build — if Phase 7 work reveals a genuine gap in Phase 4-6 (e.g., a missing extension point), that gap should be raised as a scoped, additive change owned by the Orders Service Agent, not worked around inside `services/aggregator-orders`.

**Feeds into (downstream, forward-looking hook):** Phase 8-9 (Inventory) will eventually want to drive OOS automatically off stock depletion. This phase does not implement any inventory logic, but the `menu_item_availability` data model introduced here should be designed with that future consumer in mind — i.e., availability state should be stored in a way that a future stock-driven process can write to it through the same path as a manual OOS action, rather than needing a second availability mechanism. This is a design consideration for this phase, not a deliverable.

## 8. Risks

1. **Aggregator API rate limits or sandbox instability blocking QA.** Mitigation: the QA/Test Agent's webhook simulator harness (task g dependency, Section 5) allows integration testing to proceed without live sandbox dependency; live sandbox testing is a final validation pass, not the primary test loop.
2. **MFR button meaning still undecided at phase start.** Mitigation: implement behind a documented placeholder per task (d); do not let this block the rest of the Live Feed screen.
3. **Partial fan-out failure on OOS updates** — one platform's availability write succeeds, the other fails, leaving a real discrepancy (item shown in stock on a platform where it is actually out). Mitigation: `channel_sync_log` records every attempt per platform, the UI surfaces partial failure rather than reporting blanket success, and the periodic reconciliation job (task g) catches drift that slips through in the meantime.
4. **Webhook duplicate delivery causing double orders.** Both aggregators are known to retry webhook delivery on their end without guaranteeing at-most-once delivery. Mitigation: idempotency keyed on platform + aggregator order id, enforced at the ingestion endpoint before any order is written (task a).
5. **Aggregator API credential/sandbox access delay** is an external dependency outside Kapmeta's control (Section 2) — if it slips, backend contract and normalization work (tasks a, b) can proceed against recorded fixture payloads, but live-integration validation and the exit-criteria demo will slip correspondingly. This should be flagged early to whoever owns the external relationship, not absorbed silently into engineering timeline.
6. **`channel_sync_log` schema gap.** If this table was not included in the Phase 2-3 schema freeze, adding it mid-Phase-7 is a minor scope leak into a nominally frozen area. Cross-reference: flag to Phase 2-3 owners that this table should be retroactively considered part of that baseline schema, and treat its addition here as a documented, deliberate exception rather than schema drift.

## 9. Estimated Duration (4–6 week window)

| Week | Focus |
|---|---|
| Week 1 | Contract definition (`contracts/aggregator-webhooks.yaml`), field-mapping tables (task b), MFR decision resolution kicked off, QA simulator harness scaffolding started in parallel |
| Week 2 | Webhook ingestion + signature verification + idempotency (task a); normalization into Orders API (task b) continues; POS-Web UI Agent begins screen builds against frozen contracts |
| Week 3 | Sync-down path integration with Sync/Offline Agent (task c); Live Feed screen build continues (task d); OOS modal + availability manager build begins (task e) |
| Week 4 | Fan-out job with per-platform retry/circuit-breaker + `channel_sync_log` (task e); outbound actions (task f); QA simulator-driven integration tests running continuously |
| Week 5 (if needed) | Reconciliation job (task g); live sandbox validation pass (dependent on external credential availability); MFR resolution finalized or fallback confirmed as shipped |
| Week 6 (buffer) | Bug-fix/hardening buffer, exit-criteria demo, documentation close-out by Docs/Discovery Agent |

Weeks 5–6 are explicitly buffer/contingency capacity, reflecting that this phase carries more external-dependency risk (aggregator sandbox access, platform API quirks) than a purely internal build phase.
