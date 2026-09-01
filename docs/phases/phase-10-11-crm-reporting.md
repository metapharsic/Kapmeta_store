# Phase 10-11: CRM + Reporting — Execution Plan

**Window:** 6-8 weeks
**Status of evidence:** Split. Reporting is evidence-backed by two fully captured screenshots with a detailed requirements document already written (`docs/02-requirements/artifact-08-day-summary-and-item-report.md`). CRM has zero screenshot evidence — none of the 86 captured screens showed a customer database, loyalty program, campaign tool, or feedback module. This asymmetry shapes everything below: the Reporting sub-track is a build-to-spec exercise, the CRM sub-track is a minimal, evidence-honest slice plus a recommendation to run a dedicated capture pass before going further.

---

## 1. Objective

### Reporting objective
Build the two evidence-backed reporting screens exactly as specified in artifact-08, then extend the same underlying pattern (materialized view + user-configurable column preferences) into a small set of additional, obviously-needed report types. Specifically:

- **Day-End Payment Summary**: a per-day breakdown by Payment Type (Not Paid, Cash, Card, Due Payment, tenant-custom labels such as "Other(Room Service)", Swiggy-Online, Zomato-Online, UPI — each with a Total(₹)), plus a Complimentary Orders section (count + amount) and a Sales Return Orders section (count + amount).
- **Item Report**: a category-grouped sales rollup (Category > Item / Code / Qty / Total(₹)) with a Sub Total per category and a Grand Total, plus Search, Configure-Column (user-customizable visible columns, persisted per user), a Time-Wise toggle, Print, Export-Excel, and a Print-Configuration link.
- **General reporting/analytics layer**: generalize the `mv_item_sales_daily` materialized-view pattern and the `user_report_preferences` table so that additional report types can be added without re-deriving the pattern each time.

This is a build-to-spec objective. Any deviation from artifact-08's field list, section structure, or interaction pattern (Configure-Column, Time-Wise, Export-Excel, Print-Configuration) is a bug, not a design choice, unless a real gap in the spec forces a documented decision (see DEC-014 below).

### CRM objective
Build a customer database whose only evidence-backed input is the Order Entry screen (artifact-02, already built in Phase 4-6), which captures Mobile / Name / Address / Locality on every delivery or pickup order. This is de facto customer data being created at order time, and it is the natural, evidence-backed seed for a `customers` table keyed by phone number — built incrementally from order history rather than requiring a separate manual customer-entry workflow.

Beyond that customer-record-from-orders piece, everything else commonly associated with "CRM" — loyalty points, campaign/marketing tools, SMS/WhatsApp broadcast, feedback surveys — is **reasoned, not evidence-backed**. It is flagged explicitly as proposal-only, deferred pending a dedicated capture pass, and must not be built into the schema or UI this phase. The objective for CRM in Phase 10-11 is deliberately narrow: capture and expose the customer record and its order history, and nothing more.

---

## 2. Entry Criteria

- Phase 4-6 (Core POS) exit criteria met: `orders`, `order_items`, `order_payments`, and `payment_type_master` are live and populated by real order flow, including the Order Entry screen capturing Mobile/Name/Address/Locality.
- Phase 7 (Online Integration) exit criteria met: aggregator order channels (Swiggy, Zomato, etc.) are flowing into the same order tables with channel attribution, since the Day Summary's per-channel payment-type rows depend on this.
- Phase 8-9 (Inventory + Finance) exit criteria met: cost-of-goods and ledger data are available, since the general reporting layer's extension into P&L-capable reports depends on this data existing and being reconciled.
- **CRM-specific hard gate**: before any CRM work beyond the evidence-backed customer-record-from-orders piece is scheduled, the Docs/Discovery Agent must complete a dedicated CRM discovery/capture pass (see Deliverables) and produce `docs/02-requirements/crm-discovery-capture.md`. This mirrors the same evidence-gap pattern already flagged for Phase 8-9 Inventory/Finance. Building loyalty, campaigns, or feedback tooling without this pass is out of process, not just out of scope — there is currently no screenshot evidence of what these screens should even look like or what fields they need.

---

## 3. Exit Criteria / Definition of Done

### Reporting DoD
1. Day Summary screen matches artifact-08 spec exactly, including the full worked reconciliation example from that document, encoded as a passing golden test.
2. Item Report screen matches artifact-08 spec exactly, including: category-rollup sums reconcile to Grand Total (test), Configure-Column selections persist per user across sessions, Time-Wise toggle behaves per spec, Export-Excel produces a file matching the visible/configured columns, and Print-Configuration link is wired (even if the print-configuration screen itself is a stub pending its own capture).
3. General reporting layer supports at least three additional report types built on the same materialized-view + `user_report_preferences` pattern:
   - Sales-by-hour trend (intraday demand curve, useful for staffing).
   - Sales-by-channel comparison (dine-in vs. delivery vs. pickup vs. each aggregator, using the Phase 7 channel attribution).
   - Tax-collected summary for GST filing (aggregating tax fields already captured on orders, needed for statutory filing rather than internal ops).
4. DEC-014 (Sales Return Orders section field list, currently incomplete because the original screenshot was cut off mid-scroll) is resolved — either via re-capture confirming the full field list, or via an explicit written decision if re-capture is not feasible in this phase. **This is a blocking sub-task**: the Day Summary section cannot be marked done with an unresolved DEC-014, since the section's completeness is unverified without it.

### CRM DoD
1. Every order that carries a phone number automatically upserts a `customers` record (create-if-absent, update name/address/locality history if changed) — no separate manual entry step required.
2. Customer order-history lookup by phone number works via a minimal UI screen.
3. Everything beyond that — loyalty points, campaigns, SMS/WhatsApp marketing, feedback surveys — remains **explicitly out of v1 scope** pending the capture pass. Do not build speculative CRM features into the schema this phase, even as placeholder columns or empty tables. Adding schema for features we have no evidence for is a rework risk, not a convenience.

---

## 4. Task Breakdown

### Reporting sub-track
1. Build `mv_item_sales_daily` refresh job — nightly scheduled refresh plus an on-demand refresh trigger (needed for same-day Day Summary / Item Report accuracy at shift close).
2. Build Day Summary screen + API, field-by-field against artifact-08: Payment Type breakdown rows (including tenant-custom labels, which must be read from `payment_type_master`, never hardcoded per CLAUDE.md), Complimentary Orders section, Sales Return Orders section.
3. **Blocking**: resolve DEC-014 before the Sales Return Orders section is considered final — re-capture the cut-off screenshot or document a reasoned field-list decision.
4. Build Item Report screen + API: category-grouped rollup with Sub Total/Grand Total, Search, Time-Wise toggle, Configure-Column with persistence to `user_report_preferences`, Export-Excel, Print, Print-Configuration link wiring.
5. Extend the pattern into the three proposed additional report types (sales-by-hour, sales-by-channel, tax-collected summary), reusing the materialized-view + preferences pattern rather than inventing a new one per report.
6. Encode the artifact-08 worked reconciliation example as a permanent automated regression test (not a one-time manual check).

### CRM sub-track
1. Create `customers` table: phone number as natural/primary key, current name/address/locality plus a history of address changes (a customer who moves or orders from a different locality should not silently overwrite prior history without a record of it).
2. Wire Order Entry (already built in Phase 4-6) to upsert a customer record automatically on every new order going forward. This is additive going forward only — **open question, explicitly flagged, not assumed**: do historical pre-launch orders need a backfill migration to populate `customers` retroactively? Decide and document before Phase 12-15, do not silently assume yes or no.
3. Build a minimal customer-lookup screen: search by phone number, view that customer's order history. This is the **only** in-scope v1 CRM UI.
4. Explicitly list out of scope for v1 / candidates for Phase 12+ pending the capture pass: loyalty points/rewards program, campaign or marketing broadcast tools, feedback/survey collection. These are not to be started, scaffolded, or scheduled until `docs/02-requirements/crm-discovery-capture.md` exists and has been reviewed.

---

## 5. Active Build Agents, Division of Labor, and Wiring

- **Reporting Service Agent** — primary owner of `services/reporting`. Builds Day Summary, Item Report, and the extended report types. Coordinates with the Inventory/Finance Service Agents (from Phase 8-9) for P&L-capable reports (tax-collected summary, and any future cost/margin reporting) and with the Orders Service Agent for **read-only** consumption of `orders`/`order_items`/`order_payments` — the Reporting Service must never write back to order tables, only read and aggregate.
- **CRM Service Agent** (new) — owns `services/crm`. Coordinates specifically with the Orders Service Agent on the upsert-on-order-creation hook: this is implemented as a small addition to the Orders Service's existing order-creation flow (e.g., an event or direct call triggering the CRM upsert), **not** a schema change to the `orders` table itself and not a merge of the two services.
- **Admin-Web UI Agent** — builds the Day Summary screen, Item Report screen, and the Customer Lookup screen, plus the extended report screens as they come online.
- **QA/Test Agent** — must include the artifact-08 reconciliation example as a permanent regression test suite entry (not a manual one-time verification), plus the category-rollup-sums-to-grand-total test and Configure-Column persistence test.
- **Docs/Discovery Agent** — owns producing `docs/02-requirements/crm-discovery-capture.md`, the recommended CRM discovery/capture pass, and owns resolving DEC-014 (coordinating a re-capture session if one is scheduled).

---

## 6. Deliverables

- `services/reporting/*` — reporting service (Day Summary API, Item Report API, extended report APIs, materialized-view refresh job).
- `services/crm/*` — CRM service (customer upsert logic, customer lookup API).
- `db/` additions: `customers` table, `mv_item_sales_daily` materialized view + its refresh job, `user_report_preferences` table.
- `apps/admin-web/screens/DaySummaryScreen`
- `apps/admin-web/screens/ItemReportScreen`
- `apps/admin-web/screens/CustomerLookupScreen`
- `docs/02-requirements/crm-discovery-capture.md` — output of the recommended CRM capture pass (or, at minimum, the discovery brief scoping what that pass needs to capture, if the pass itself cannot be completed within this phase's window).

---

## 7. Dependency Wiring to Phase 12-15 (Hardening)

- Phase 12-15 needs a **stable, tested reporting layer** out of this phase to performance-test (materialized-view refresh under load, report query latency) and to security-review (report data access control — who can see which tenant's Day Summary/Item Report).
- Phase 12-15 needs a **minimal, contained CRM surface** — deliberately kept small in this phase precisely so that its PII footprint (phone numbers, addresses, locality) is easy to security-review and lock down. A CRM surface bloated with speculative loyalty/campaign features at this stage would make that hardening pass harder and riskier; keeping v1 minimal is itself a hardening-phase enabler, not just a scope-discipline choice.

---

## 8. Risks

1. **DEC-014 (Sales Return Orders field gap)**: the Day Summary spec is incomplete for this section until the cut-off screenshot is re-captured or a documented decision is made. Shipping Day Summary without resolving this risks an inaccurate or incomplete reconciliation view at shift close, which is the exact kind of error a POS operator would notice immediately and lose trust over.
2. **CRM schema over-speculation**: the temptation to add "just in case" columns for loyalty tiers, campaign consent flags, or feedback scores during this phase is real, especially since the CRM Service Agent is being stood up now. Doing so without evidence risks building the wrong shape and needing rework once the capture pass actually shows what KapMeta's CRM screens look like. This plan deliberately restricts CRM schema to `customers` (phone, name, address/locality history) and nothing else.
3. **PII handling (phone, address, locality)**: this data is now flowing into a dedicated customer table and being surfaced in a lookup UI. This phase does **not** solve privacy/compliance requirements (data retention, access logging, consent, right-to-deletion) for that data — it is flagged here explicitly as a gap to be coordinated with Phase 12-15's security hardening track, not something to treat as solved by virtue of the table existing. Do not expand CRM data collection or exposure beyond the v1 lookup screen until that coordination has happened.

---

## 9. Estimated Duration (6-8 week window)

| Workstream | Duration | Notes |
|---|---|---|
| `mv_item_sales_daily` refresh job + Day Summary screen/API | 1.5 weeks | Includes DEC-014 resolution as a blocking dependency inside this window; slips if re-capture is needed and scheduling it takes longer than expected. |
| Item Report screen/API incl. Configure-Column, Export-Excel, Print-Configuration wiring | 1.5 weeks | Configure-Column persistence and Export-Excel are the highest-effort sub-items here. |
| Extended report types (sales-by-hour, sales-by-channel, tax-collected summary) | 1.5 weeks | Runs partly in parallel with Item Report work once the materialized-view pattern is proven out on Day Summary. |
| `customers` table + Order Entry upsert hook + Customer Lookup screen | 1.5 weeks | Can start in parallel with Reporting work since it depends only on Phase 4-6 Order Entry, not on Reporting's outputs. |
| CRM discovery/capture pass scoping (Docs/Discovery Agent) | 1 week, parallel throughout | Runs alongside build work; its output gates any Phase-12+ CRM feature work, not this phase's deliverables. |
| Integration, regression test suite (incl. reconciliation golden test), QA pass | 1-1.5 weeks | Includes wiring the golden test into permanent CI, not just validating once. |

Total: 6-8 weeks, with the Reporting and CRM sub-tracks running substantially in parallel across separate agents, converging only at the final QA/regression pass.
