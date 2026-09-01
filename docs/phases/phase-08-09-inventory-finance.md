# Phase 8-9: Inventory + Finance

**Target duration:** 6-10 weeks
**Status of this plan:** reasoned proposal, not evidence-verified — see caveat below before reading further.

---

## 0. Prominent caveat: this phase's evidence gap

Every other phase in the Kapmeta SDLC (Phase 0 through Phase 7, and the Phase 10-11 reporting groundwork this phase feeds) was scoped against a set of 86 captured screenshots of the real KapMeta reference application. Those screenshots covered Table View, Order Entry, Online Live Feed, OOS/Menu Availability, Order History, Billing/Print Config, Tax Master, Day Summary/Item Report, and System Config/App Shell. **None of the 86 screenshots showed an Inventory or Finance screen** — no stock/ingredient screens, no recipe/BOM builder, no purchase order or goods-receipt screens, no supplier management, no chart of accounts, no expense ledger, no accounts-receivable/due-payment view, no P&L or accounting export screen.

That means everything in this document below — every table, every workflow, every field — is **not** a description of what KapMeta actually does. It is Kapmeta's own reasoned proposal, built from three sources only:

- (a) general industry knowledge of what a KapMeta-class restaurant POS platform is known to include in its inventory and finance modules;
- (b) what the already-built Core POS and Online Integration phases will need to feed this phase (`order_items` sales data, `menu_items`, `order_payments`);
- (c) ordinary restaurant-operations domain reasoning (recipes consume ingredients, purchases replenish them, money in/out needs a ledger).

**Recommendation, stated as a hard entry-criterion gap (see Section 2):** before real engineering work on this phase begins, run a dedicated screenshot/requirements capture pass against the real KapMeta Inventory and Finance modules, using the same methodology that produced the 86-screenshot evidence set for the other nine functional areas. Until that capture pass exists, treat every specific detail below — table names, field lists, workflow steps, the chart-of-accounts shape — as a placeholder design, not a locked specification. Wherever a decision materially affects data integrity (exact stock-deduction timing, exact chart-of-accounts structure, whether Kapmeta integrates with external accounting software), this document flags it explicitly as a DEC (Decision-Entry-Criterion) item that should be resolved by real evidence, not by this document's assumptions.

---

## 1. Objective

Build the two remaining backend domains needed before Kapmeta can be considered operationally complete for a single restaurant location:

1. **Inventory**: stock/ingredient tracking tied to recipe-based menu items, so that selling a dish automatically decrements the ingredient stock consumed by that dish's recipe (bill of materials). This includes supplier and purchase-order management to replenish stock, and stock-taking/reconciliation to correct drift between recorded and physical stock.
2. **Finance**: a core financial ledger layer — expense tracking, a configurable chart of accounts, due-payment/credit reconciliation that extends the "Due Payment" and "Not Paid" concepts already modeled in the Day Summary work from Phase 4-6 and referenced again in Phase 10-11 planning, and a basic profit-and-loss data feed combining revenue, cost of goods, and expenses.

This is explicitly Kapmeta's own proposed scope for these two domains, pending the requirements capture pass recommended in Section 0. It is not a verified reproduction of KapMeta's actual Inventory/Finance feature set.

---

## 2. Entry criteria

Standard prerequisites, all must be true:

- Phase 4-6 exit criteria met: Core POS is stable — orders, `order_items`, tax engine, print engine, table/order history, and `order_payments` (including the "Due Payment"/"Not Paid" payment states) are in production-quality shape and generating reliable sales data.
- Phase 7 exit criteria met: Online Integration is live, meaning aggregator-channel orders flow into the same `orders`/`order_items` tables as dine-in/counter orders. This phase needs a complete, unified view of sales regardless of channel — a partial integration would undercount ingredient consumption and revenue.

**Hard gate specific to this phase (do not waive):**

- A dedicated Inventory + Finance discovery/screenshot-capture pass has been completed against the real KapMeta reference application, producing an evidence set comparable in rigor to the 86-screenshot set used for the other nine functional areas, and the DEC items raised by that capture pass have been resolved and folded into a revision of this plan.
  - This gate exists because, unlike every other phase, this phase currently has zero reference-app evidence behind it. Phase 0's discovery work gated the rest of the project on captured evidence; this phase deserves the same discipline rather than being allowed to proceed on assumption alone — particularly for decisions that materially affect data integrity, such as the exact point in the order lifecycle where stock should be deducted, and the exact structure KapMeta uses for its chart of accounts.
  - If business pressure forces this phase to start before the capture pass is complete, that must be an explicit, documented exception, not a silent skip — and the riskiest data-integrity decisions (stock-deduction timing, chart-of-accounts shape) should still be held open pending the capture pass rather than locked in from this document.

---

## 3. Exit criteria / Definition of Done (proposed)

- Every `menu_items` row can optionally have a recipe (bill of materials): a set of ingredient-quantity pairs describing what one unit of that dish consumes.
- A completed/paid order automatically decrements ingredient stock-on-hand by (recipe quantity × quantity sold) for each item on the order, recorded as an audited stock-movement row rather than a silent balance update.
- A low-stock threshold (configurable per ingredient) triggers an alert, wired into the same Alerts affordance already present in the App Shell from Phase 4-6, rather than a new, separate notification surface.
- A Purchase Order can be raised against a supplier, marked received (fully or partially), and receiving it increases stock-on-hand accordingly, again as an audited movement row.
- Manual stock adjustments (wastage, breakage, stock-take correction) are supported and are themselves audited movement rows with a reason code and the acting user.
- A basic expense ledger exists, with expenses categorized against a configurable chart of accounts.
- A due-payment/credit ledger exists that reconciles against the Day Summary numbers already produced in Phase 4-6/10-11 — i.e., the sum of outstanding "Due"/"Not Paid" amounts in this ledger matches the Day Summary's due-payment figure for the same date range.
- A basic P&L data feed is queryable: revenue (from `order_payments`), cost of goods sold (derived from inventory stock-movement cost data), and expenses (from the expense ledger) are combinable into a coarse profit figure, even though the polished reporting UI for this is Phase 10-11's responsibility, not this phase's.
- No business or tenant-specific data is hardcoded anywhere in this phase's code: ingredients, units of measure, suppliers, chart-of-accounts entries, and low-stock thresholds are all DB-backed with an admin UI to manage them, per the CLAUDE.md no-hardcode rule.

All of the above is proposed DoD, not confirmed against reference-app behavior — expect it to be revised once the capture pass in Section 2 lands.

---

## 4. Task breakdown

### 4.1 Inventory sub-track

1. **Ingredients master** — `ingredients` table (name, unit of measure, cost per unit, low-stock threshold, active flag) plus an admin UI screen to create/edit ingredients. No hardcoded ingredient lists anywhere — every restaurant's ingredient set is tenant data.
2. **Recipe / BOM linking** — `menu_item_recipes` linking table connecting a `menu_items` row to one or more `ingredients` rows with a quantity-per-serving, so the system knows what one sold unit of a dish consumes. Recipes are optional per menu item (some items, e.g. bottled beverages, may map 1:1 to a single "ingredient" that is really just the finished product itself, or may have no recipe tracked at all if the restaurant opts out).
3. **Stock-on-hand tracking with movement log** — a `stock_movements` table recording every change to stock: sale-deduction, purchase-receipt, wastage/adjustment, and stock-take correction, each row audited (ingredient, quantity delta, movement type, reference order/PO id where applicable, acting user, timestamp), mirroring the `order_audit_log` pattern already established in Phase 4-6 rather than inventing a new audit mechanism. Current stock-on-hand is derived from (or cached and reconciled against) the sum of movements, not stored as a single mutable balance that can silently drift from its history.
4. **Supplier master + purchase-order workflow** — `suppliers` table (name, contact info, active flag) with admin UI; `purchase_orders` and `purchase_order_lines` tables supporting draft → sent → partially received → fully received states; receiving a PO line generates the corresponding purchase-receipt stock movement.
5. **Low-stock alerting** — background check (on each stock-decrementing movement, or on a schedule) comparing stock-on-hand to the ingredient's configured threshold, firing into the existing App Shell Alerts affordance rather than building a parallel notification system.
6. **Stock-taking / reconciliation flow** — a periodic physical-count entry screen that compares counted stock to system stock-on-hand and generates a correcting adjustment movement for the variance, with a reason code.
7. **Unit-of-measure handling** — support for kg/g, L/ml, and pcs (piece/count) at minimum, with conversion factors so a recipe can specify grams while the ingredient is purchased and stocked in kilograms. Units are DB-configurable, not hardcoded, consistent with the no-hardcode rule.

### 4.2 Finance sub-track

1. **Chart of accounts** — `chart_of_accounts` table, admin-configurable (account code, name, type — asset/liability/income/expense/equity — parent account for hierarchy), with an admin UI. No hardcoded account list, per CLAUDE.md.
2. **Expense entry + categorization** — `expenses` table (amount, date, chart-of-accounts category, vendor/payee, note, entered-by user) with an admin/back-office UI to record ad hoc restaurant expenses (utilities, rent, repairs, etc.), each tagged against a chart-of-accounts entry rather than a free-text category.
3. **Due-payment / credit ledger** — `due_payment_ledger` extending the existing "Due Payment" and "Not Paid" states already present in `order_payments` from Phase 4-6 into a proper accounts-receivable view: which orders/customers have outstanding balances, aging of those balances, and a way to record a later settlement against them. This must reuse and extend the existing payment-state concepts rather than introducing a second, parallel notion of "unpaid."
4. **Basic P&L data feed** — a queryable aggregation combining revenue (from `order_payments`), cost of goods sold (derived from `stock_movements` sale-deduction rows valued at ingredient cost), and expenses (from the `expenses` table) into a coarse profit figure per period. This is a data feed/API, not the polished reporting UI — that belongs to Phase 10-11.
5. **DEC item — external accounting integration**: whether Kapmeta v1 integrates with an external accounting package (e.g., Tally, QuickBooks) for export/sync, or stays fully self-contained with its own chart of accounts and ledgers for v1, is explicitly unresolved. This decision should be driven by the capture pass and by actual restaurant-operator requirements, not decided inside this phase. Build the chart-of-accounts and expense-ledger schema in a way that does not foreclose a later export/integration layer, but do not build the integration itself in this phase unless the capture pass or stakeholders explicitly pull it forward.

---

## 5. Active build-agents, division of labor, and wiring

- **Inventory Service Agent** (new) — owns `services/inventory`: ingredients, recipes/BOM, stock movements, suppliers, purchase orders. Must coordinate directly with the **Orders Service Agent** (owner of Core POS order lifecycle from Phase 4-6) on the precise point in the order lifecycle where stock deduction fires — order placed, KOT printed, or order paid/completed are all plausible trigger points, and the choice materially affects accuracy: deducting on KOT print risks over-deducting if the kitchen later cancels or modifies the item, while deducting only on payment risks stock figures lagging behind what the kitchen has already consumed. This is exactly the kind of decision that should be confirmed by the capture pass rather than locked in unilaterally by the Inventory Service Agent; until confirmed, implement it behind a clearly isolated trigger point so the timing can be changed without restructuring the movement-log design.
- **Finance Service Agent** (new) — owns `services/finance`: chart of accounts, expenses, due-payment ledger, P&L data feed. Must coordinate with the existing `order_payments` and `payment_type_master` tables and the agent(s) that own them from Phase 4-6, extending those concepts rather than duplicating payment logic in a second place.
- **Admin-Web UI Agent** (extended role) — adds Inventory and Finance admin screens (ingredients, suppliers, purchase orders, chart of accounts, expenses) by reusing the settings-table-plus-admin-UI pattern already proven in Phase 4-6's Billing/Print/Tax config screens, rather than inventing a new admin UI convention for this phase.
- **Reporting groundwork** (light touch only) — this phase exposes the raw data feeds (stock movements valued at cost, expense ledger, due-payment ledger) that Phase 10-11 will build full P&L and inventory reports against; this phase does not build polished reports itself.
- **QA/Test Agent** — writes integration tests for the stock-deduction trigger point once chosen, PO receive-and-stock-increase flow, low-stock alert firing, and due-payment ledger reconciliation against Day Summary figures; flags any discrepancy between the two as a defect, since that reconciliation is part of this phase's DoD.
- **Docs/Discovery Agent** — owns flagging this phase's evidence gap (Section 0) prominently in project docs, and owns running the recommended Inventory + Finance discovery/screenshot-capture pass before or in parallel with early build work, producing `docs/02-requirements/inventory-finance-discovery-capture.md` as its output artifact.

---

## 6. Deliverables (proposed paths)

- `services/inventory/*` — Inventory Service Agent's service code (ingredients, recipes, stock movements, suppliers, purchase orders).
- `services/finance/*` — Finance Service Agent's service code (chart of accounts, expenses, due-payment ledger, P&L feed).
- `db/` additions: `ingredients`, `menu_item_recipes`, `stock_movements`, `suppliers`, `purchase_orders`, `purchase_order_lines`, `chart_of_accounts`, `expenses`, `due_payment_ledger`.
- `apps/admin-web/screens/Inventory*` — ingredients, suppliers, purchase order, stock-take screens.
- `apps/admin-web/screens/Finance*` — chart-of-accounts, expenses, due-payment ledger screens.
- `contracts/` updates for the new inventory and finance service APIs, following whatever contract format the existing services already use.
- `docs/02-requirements/inventory-finance-discovery-capture.md` — the output of the recommended capture pass: screenshots and requirements notes for the real KapMeta Inventory and Finance modules, in the same format as the discovery docs behind the other nine functional areas.

---

## 7. Dependency wiring

- **Depends on Phase 4-6 and Phase 7** for a complete, stable `order_items`/`order_payments` sales stream across all channels (dine-in, counter, and online aggregators). This phase's stock-deduction and revenue figures are only as correct as the underlying order data.
- **Does not otherwise depend on Phase 7's online-integration-specific logic.** Beyond needing the shared order data to be complete, this phase has no dependency on aggregator-channel-specific behavior (menu sync, live order feed, OOS propagation) — those are Phase 7 concerns that this phase simply consumes the output of, not mechanisms this phase needs to touch or extend.
- **Feeds Phase 10-11 (CRM + Reporting).** Phase 10-11's full P&L reports, cost-of-goods analysis, and inventory-valuation reports are built on top of this phase's stock-movement cost data and finance ledger data. Phase 10-11 should treat this phase's data feed (Section 4.2, item 4) as its primary input for financial reporting rather than re-deriving cost/expense data independently.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Top risk: building an entire Inventory + Finance module on assumption, with zero reference-app evidence, risks mis-scoping features the real KapMeta module does or doesn't have, and risks a costly rebuild once real evidence surfaces.** | Primary mitigation is the hard entry-criterion gate in Section 2: run the recommended discovery/screenshot-capture pass before or very early in this phase, and treat any specific detail in this document as provisional until confirmed. |
| Stock-deduction-timing ambiguity (order-placed vs. KOT-printed vs. paid) causes inventory to drift from physical reality, especially around cancellations and modifications after KOT. | Isolate the deduction trigger behind a single, clearly-named integration point in the Orders Service Agent's lifecycle hooks so the timing can be changed later without restructuring the stock-movement log; confirm the correct timing via the capture pass before treating the initial choice as final; the stock-taking/reconciliation flow (Section 4.1, item 6) exists specifically as a backstop against drift from this and other causes. |
| Chart of accounts is either too rigid (doesn't match how a real restaurant operator or accountant actually categorizes expenses) or too flexible (an unconstrained free-form structure that produces unusable reports). | Build the chart of accounts as DB-configurable with a sensible but overridable default set of top-level categories (not hardcoded into application logic); validate the default structure against the capture pass and, ideally, input from someone with real restaurant-accounting experience before treating it as final; resolve the external-accounting-integration DEC item (Section 4.2, item 5) before assuming Kapmeta's chart of accounts is the system of record rather than a feed into an external one. |
| Due-payment ledger drifts out of reconciliation with the Day Summary due-payment figure, undermining the exit criterion that the two must match. | QA/Test Agent writes an explicit reconciliation test as part of this phase's DoD verification (Section 5); both figures must be derived from the same underlying `order_payments` due/not-paid states rather than maintained as two independently-updated numbers. |
| No-hardcode rule violated under time pressure (e.g., a hardcoded default chart-of-accounts list or hardcoded unit-of-measure list shipped directly in code). | Explicit code-review checklist item for this phase: every ingredient, supplier, chart-of-accounts entry, and unit of measure must trace to a DB table with an admin UI, per CLAUDE.md; QA/Test Agent checks for this specifically before sign-off. |

---

## 9. Estimated duration (6-10 weeks)

The 6-10 week range already reflects this phase's larger, two-domain scope. Because this phase uniquely lacks reference-app evidence, extra time is reserved up front for the recommended capture pass rather than assuming it can run fully in parallel with build work.

- **Week 0-1 (front-loaded, before or overlapping start of build): Discovery/capture pass.** Docs/Discovery Agent runs the Inventory + Finance screenshot/requirements capture pass and produces `docs/02-requirements/inventory-finance-discovery-capture.md`; DEC items from it are resolved and folded back into this plan before the riskiest build decisions (stock-deduction timing, chart-of-accounts shape) are locked in. If schedule pressure forces build work to start before this completes, the isolated-trigger-point mitigation in Section 8 keeps the door open to revise without a full rebuild.
- **Week 1-3: Inventory sub-track core.** Ingredients master, recipe/BOM linking, stock-movement log and the sale-deduction trigger (at whatever point the capture pass confirms), admin UI for ingredients.
- **Week 3-5: Inventory sub-track continued.** Supplier master, purchase-order workflow (draft → sent → received), low-stock alerting wired into App Shell Alerts, unit-of-measure handling with conversions.
- **Week 4-6 (overlapping): Finance sub-track core.** Chart of accounts and admin UI, expense entry/categorization, due-payment ledger extending `order_payments`.
- **Week 6-8: Finance sub-track continued + P&L data feed.** Cost-of-goods derivation from stock movements, revenue/expense aggregation into the P&L feed, reconciliation of due-payment ledger against Day Summary figures.
- **Week 7-9: Stock-taking/reconciliation flow, admin UI polish, cross-agent integration testing** (Orders Service Agent ↔ Inventory Service Agent trigger-point wiring; Finance Service Agent ↔ existing payment tables).
- **Week 9-10: QA hardening, DoD verification against Section 3, buffer for capture-pass findings that arrived late and require rework.**

This schedule assumes the discovery/capture pass can be scoped and executed quickly (it targets two modules, versus the full nine-area sweep behind the rest of the project); if it surfaces a materially different feature set than proposed here, the task breakdown and duration in this document should be revisited before the affected work continues.
