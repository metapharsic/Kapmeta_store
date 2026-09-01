# Kapmeta — Phase 0 (Discovery) and Phase 1 (UX/UI Design) Execution Plan

Status of this document: execution plan for the two gating phases preceding architecture work. Written against the current repository state (Phase 0 in progress, decision register addendum DEC-013..DEC-024 drafted but not yet closed).

---

## Phase 0 — Discovery

### 1. Objective

Phase 0 converts the evidence gathered from the reference application review (86 screenshots of the live KapMeta installation at "Hotel Kapila," a single-outlet, LAN client-server deployment on v126.0.1) into a closed, unambiguous, sign-off-able set of product decisions. Its output is the contract that every later phase — architecture, schema, services, UI — builds against. Nothing in Phase 2 onward may begin design or implementation work against an open or "assumed" decision; Phase 0's entire purpose is to eliminate that condition. The phase produces no code and no schema; it produces decisions, a requirements traceability matrix, and a locked Definition of Ready/Done for downstream phases.

### 2. Entry criteria

- Repository scaffold exists (`apps/`, `services/`, `packages/`, `db/`, `contracts/`, `infra/`, `tests/`, `docs/`) — satisfied.
- `docs/01-discovery/decision-register.md` exists with DEC-001..DEC-012 recorded (assumed pre-existing baseline).
- `docs/01-discovery/decision-register-addendum.md` (or equivalent) exists with DEC-013..DEC-024 drafted from the 86-screenshot evidence review — satisfied, currently in draft/proposed state.
- The nine per-screen requirement artifact docs exist in `docs/02-requirements/artifact-01-*.md` through `artifact-09-*.md`.
- Draft technical documents exist and are available as decision inputs: DB schema draft (`docs/05-database/`), API contracts draft (`docs/03-architecture/`), sync-architecture draft (`docs/03-architecture/`), business-logic-rules draft (`docs/02-requirements/`).
- CLAUDE.md project rule is in force (no hardcoded business/tenant data — must land as DB table + seed/migration and/or admin UI) and is treated as a standing constraint on every decision closed in this phase, not just on later code.

### 3. Exit criteria / Definition of Done

Phase 0 is complete only when all of the following are true and evidenced in the repo:

1. Every item DEC-001 through DEC-024 in the decision register has `Status = Approved`, a named sign-off owner, and an approval date. No item may carry `Status = Proposed`, `Draft`, `Assumed`, or be unlisted.
2. The six named open-flag ambiguities are each resolved with a written decision (not just discussed) and a DEC number:
   - MFR button meaning and behavior.
   - The sales-return field gap that requires re-capture from the reference app (either the re-capture is completed and the field is specified, or a documented decision to defer/exclude it with rationale).
   - The My-Amount / Grand-Total / Total glossary — one canonical definition per term, cross-referenced against every screen that displays them.
   - A unified order-status enum covering all lifecycle states observed across Table/Floor View, Order Entry, Online Live Feed, and Order History.
   - Tax-mode scope (which tax modes are in-scope for v1, e.g. inclusive/exclusive/slab-based, and which are explicitly out of scope).
   - Multi-outlet in/out-of-scope determination for v1, with the specific downstream schema and UI implication written down (e.g. "single-tenant, single-outlet schema for v1; outlet_id column reserved but not enforced" or equivalent).
3. `docs/01-discovery/definition-of-ready-done.md` is written and approved, defining phase-entry and phase-exit gates for every subsequent phase (2-3 through 16), not just Phase 1.
4. `docs/01-discovery/risk-register.md` is updated with a Phase-0-derived addendum covering risks discovered during decision closure (e.g., reference-app behavior that cannot be reproduced without further hardware access).
5. `docs/01-discovery/requirements-traceability-matrix.md` exists, is signed off, and maps every one of the nine artifact-0X requirement docs to the specific DEC-### items that constrain it, with no artifact doc left unmapped and no DEC item left orphaned (unless explicitly marked N/A with reason).
6. All four existing technical drafts (DB schema, API contracts, sync architecture, business-logic-rules) have been reviewed against the now-closed decisions and either confirmed consistent or flagged with a follow-up ticket for Phase 2-3 to reconcile — this reconciliation review, not a rewrite, is in scope for Phase 0.
7. No decision closed in this phase encodes actual tenant, menu, tax-rate, or outlet business data directly into a document destined to become source code or config; every such fact is flagged for seed/migration or admin-UI treatment per CLAUDE.md.

### 4. Task breakdown

1. **Inventory and gap-check the decision register.** Confirm DEC-001..DEC-012 are still valid against the addendum's evidence (screenshots may surface contradictions with earlier assumptions); flag any conflicts as new sub-decisions rather than silently overwriting.
2. **Walk DEC-013 through DEC-024 to closure**, one at a time, in order: for each, restate the question, cite the supporting screenshot evidence (screenshot ID/filename), state the decision, name the accountable owner, and record approval date. No batch-approval of the block — each item gets its own review.
3. **Resolve ambiguity 1 — MFR button.** Re-examine Order Entry/Billing screenshots (artifact-02) for every observed state of the MFR control; interview/consult whoever has access to the reference system if screenshots are insufficient; write the resolved behavior as its own DEC item.
4. **Resolve ambiguity 2 — sales-return field gap.** Determine whether existing screenshots cover the sales-return flow adequately. If not, schedule and execute a re-capture pass against the reference app before closing this item; if re-capture is infeasible, document the decision to build against a best-effort spec with an explicit acceptance-of-risk note.
5. **Resolve ambiguity 3 — My-Amount / Grand-Total / Total glossary.** Cross-reference every screen in artifact-02 (Order Entry/Billing), artifact-06 (Billing+Print Config), and artifact-08 (Day Summary+Item Report) where these terms appear; produce one glossary entry per term with a formula or precise definition; verify no two screens use the same label for different values.
6. **Resolve ambiguity 4 — unified order-status enum.** Enumerate every status value seen across artifact-01 (Table/Floor View), artifact-02 (Order Entry), artifact-03 (Online Live Feed), and artifact-05 (Order History); reconcile naming collisions between in-house and aggregator-sourced statuses; produce one canonical enum.
7. **Resolve ambiguity 5 — tax-mode scope.** Cross-check artifact-07 (Tax Master) against the business-logic-rules draft; decide which tax modes ship in v1 and record exclusions explicitly.
8. **Resolve ambiguity 6 — multi-outlet scope.** Decide in/out of scope for v1 given the reference app is single-outlet; record the schema and UI implications this decision imposes on Phase 2-3 and Phase 4-6.
9. **Draft and approve the Definition of Ready/Done** for Phases 1 through 16, using the README phase table as the skeleton.
10. **Draft and approve the risk-register addendum** capturing risks surfaced specifically during decision closure (distinct from earlier general project risks).
11. **Build the requirements traceability matrix**, mapping each artifact-01..09 doc to its governing DEC items; circulate for review by domain leads; obtain sign-off.
12. **Reconcile the four technical drafts** (DB schema, API contracts, sync architecture, business-logic-rules) against the newly closed decisions; log any needed corrections as tracked follow-ups for Phase 2-3 rather than editing them in Phase 0.
13. **Final Phase 0 sign-off review** — a single consolidated review confirming every exit-criterion item above is satisfied; record the sign-off in the decision register's summary section.

### 5. Active build-agents this phase

- **Docs/Discovery Agent** — primary and near-sole active agent this phase. Owns walking the decision register to closure, drafting the DoR/DoD, drafting the risk-register addendum, and authoring the requirements traceability matrix. Also owns scheduling/executing any screenshot re-capture needed for the sales-return gap.
- **Domain leads (review-only, not build-agents in the roster sense)** — input reviewers on decisions that touch their eventual area: e.g. Sync/Offline Agent's future owner reviews the order-status enum and multi-outlet decision for downstream feasibility; Aggregator Integration Agent's future owner reviews the order-status enum against Swiggy/Zomato states; Tax domain reviews the tax-mode scope decision. These are advisory reviews recorded as sign-off inputs, not independent deliverables — no other agent produces artifacts in Phase 0.

### 6. Deliverable artifacts

- `docs/01-discovery/decision-register.md` — updated, DEC-001..012 reconfirmed.
- `docs/01-discovery/decision-register-addendum.md` — DEC-013..024, all `Status = Approved`.
- `docs/01-discovery/definition-of-ready-done.md` — new/finalized.
- `docs/01-discovery/risk-register.md` — updated with Phase-0 addendum section.
- `docs/01-discovery/requirements-traceability-matrix.md` — new, signed off.
- `docs/02-requirements/artifact-02-order-entry-billing.md` — amended with MFR button and glossary resolutions if those decisions require updating the artifact doc itself.
- `docs/02-requirements/artifact-05-order-history.md`, `artifact-01-table-floor-view.md`, `artifact-03-online-live-feed.md` — amended if the unified order-status enum requires updating per-screen status references.
- `docs/02-requirements/artifact-07-tax-master.md` — amended with tax-mode scope decision.
- Reconciliation notes appended to `docs/05-database/*` (DB schema draft), `docs/03-architecture/*` (API contracts draft, sync-architecture draft), `docs/02-requirements/*` (business-logic-rules draft) — flags/follow-ups only, not rewrites.

### 7. Dependency wiring

Phase 0 hands Phase 1 (UX/UI Design):
- The fully closed decision register (DEC-001..024, all Approved) as the constraint set that mockups must not contradict.
- The unified order-status enum, feeding the visual status-legend / color-coding requirement for Table/Floor View and Order History mockups.
- The My-Amount/Grand-Total/Total glossary, feeding exact label text in billing-screen mockups.
- The MFR button resolution, feeding its exact placement/label/state design in Order Entry mockups.
- The requirements traceability matrix, which Phase 1 extends by attaching a mockup reference to each artifact doc row.
- The nine artifact-0X requirement docs, now decision-consistent, as the literal per-screen scope list Phase 1 must produce a mockup for.

### 8. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Reference app access is not available for the sales-return re-capture, stalling ambiguity 2 | Time-box the wait; if access cannot be arranged within one week, close the decision as best-effort spec with documented risk acceptance rather than blocking the whole phase |
| Decision closure surfaces a conflict with an already-"assumed" DEC-001..012 item | Treat as a new decision, not a silent edit; log the conflict and resolution explicitly in the register so downstream phases see the history |
| Glossary or status-enum unification reveals the reference app itself is inconsistent (same label meaning different things on different screens) | Document the inconsistency as observed, then make an explicit Kapmeta design decision to standardize — do not silently pick one without recording that a real-world conflict existed |
| Traceability matrix sign-off stalls waiting on domain-lead review availability | Set a fixed review window per domain area; escalate unresponded reviews rather than letting them block the whole matrix indefinitely |
| Multi-outlet scope decision is under-specified and only implicitly assumed rather than written down, causing schema rework in Phase 2-3 | Require the decision to explicitly state schema implication (e.g., outlet_id column reserved/enforced/absent), not just a scope label |

### 9. Estimated duration: 2–3 weeks

- Decision register inventory and gap-check: 0.5 day
- DEC-013..024 closure walk: 3–4 days (parallel review threads, sequential sign-off)
- Six ambiguity resolutions (tasks 3–8): 3–5 days, with sales-return re-capture (task 4) as the swing item — 1 day if screenshots suffice, up to 3 additional days if a live re-capture session must be scheduled
- DoR/DoD drafting and approval: 1 day
- Risk-register addendum: 0.5 day
- Requirements traceability matrix build and sign-off: 2 days
- Technical-draft reconciliation pass: 1 day
- Final consolidated sign-off: 0.5 day

Total: 10–15 working days (2–3 weeks), consistent with the README estimate; the sales-return re-capture is the primary schedule risk that could push toward the upper bound.

---

## Phase 1 — UX/UI Design

### 1. Objective

Phase 1 turns the now-locked requirements (nine artifact docs, closed decision register) into a design system and a complete set of hi-fi mockups covering every screen in scope, plus the shared App Shell component contract that `packages/ui-kit` will implement. Its output gates Phase 2-3 (Architecture + DB) and Phase 4-6 (Core POS build) because those phases need concrete component and interaction contracts — not just requirement prose — to design APIs and implement UI correctly on the first pass. No frontend code is written against `packages/ui-kit` design tokens until they exist in a reviewed, approved form.

### 2. Entry criteria

- Phase 0 exit criteria fully satisfied: decision register complete (DEC-001..024 Approved), six ambiguities resolved, DoR/DoD locked, risk register updated, requirements traceability matrix signed off.
- All nine artifact-0X requirement docs are in their post-Phase-0 amended state (order-status enum, glossary, MFR resolution, tax-mode scope reflected where applicable).
- The 86 reference screenshots remain available as the visual-language source (color usage, spacing, typography, iconography as actually implemented in the reference app), organized/indexed for reference during token extraction.

### 3. Exit criteria / Definition of Done

1. `docs/04-design/design-system.md` exists, is approved, and defines: a full color token set (including a dedicated status-color legend matching the unified order-status enum from Phase 0), a spacing scale, a typography scale (families, weights, sizes, line-heights), and iconography conventions — each token traceable to specific reference screenshots where it originates.
2. Every one of the nine artifact-0X requirement docs has a corresponding approved hi-fi mockup (or mockup set, for multi-state screens) stored under `docs/04-design/mockups/`, cross-referenced in the requirements traceability matrix.
3. The shared App Shell component (navigation, header, status bar, common layout chrome observed across all screens in artifact-09) has a written component contract — props/slots, states, responsive behavior — sufficient for the POS-Web and Admin-Web UI Agents to implement without re-deriving it from screenshots.
4. `packages/ui-kit` contains a checked-in design-tokens source file (e.g. `packages/ui-kit/tokens/design-tokens.json` or equivalent) machine-readable and matching `design-system.md` exactly — no drift between the doc and the token file.
5. Interaction and accessibility notes are written per screen (keyboard/touch interaction expectations given LAN client-server POS terminals, contrast ratios for the status-color legend, focus order for Order Entry/Billing) and are approved.
6. A usability-review checkpoint has been held with at least one representative from each domain area whose screens were reviewed (orders, tables, menu-sync/OOS, tax, settings, reporting) and its findings are either resolved in the mockups or logged as a tracked follow-up with owner and target phase.
7. The requirements traceability matrix (from Phase 0) is updated so each artifact-0X row now also references its mockup file path and design-system component(s) used.
8. No mockup or token encodes actual tenant/menu/tax business data as a hardcoded value in a spec destined to inform source code — sample/demo data in mockups is clearly marked as illustrative, per CLAUDE.md.

### 4. Task breakdown

1. **Extract the design system from the reference screenshots.** Catalogue the observed color palette (with particular attention to the order/table status color-coding, since that becomes the status-color token set), spacing rhythm, type sizes/weights, and icon set actually used in the "Hotel Kapila" reference app across all 86 screenshots.
2. **Reconcile extracted tokens against the Phase 0 order-status enum.** Assign one canonical color per status value; confirm no two statuses share an ambiguous color and that the mapping covers every state in the enum.
3. **Draft `docs/04-design/design-system.md`** with the full token set, rationale, and screenshot citations; circulate for review.
4. **Define the App Shell component contract** by diffing common chrome across all nine artifact docs (what recurs on every screen vs. what's screen-specific); write the contract into `docs/04-design/design-system.md` or a dedicated `docs/04-design/app-shell-contract.md`.
5. **Produce hi-fi mockups per artifact doc**, in dependency order matching downstream build priority: artifact-01 (Table/Floor View), artifact-02 (Order Entry/Billing), artifact-04 (OOS+Menu Availability), artifact-06 (Billing+Print Config), artifact-07 (Tax Master), artifact-05 (Order History), artifact-08 (Day Summary+Item Report), artifact-03 (Online Live Feed), artifact-09 (System Config+App Shell) — App Shell mockup last since it depends on the shell contract already being stable from all prior screens.
6. **Write interaction and accessibility notes per screen** alongside each mockup — input method assumptions (touch vs. keyboard/mouse on LAN terminals), tab/focus order, minimum contrast for status colors, error/empty states.
7. **Publish design tokens into `packages/ui-kit`** as a machine-readable source file, keeping it synchronized with `design-system.md`.
8. **Hold the usability-review checkpoint** with domain representatives; walk each mockup against its source artifact doc and against Phase 0 decisions; log findings.
9. **Resolve or ticket usability findings** — apply direct fixes to mockups where feasible within phase timeline; log anything larger as a follow-up with named owner and target phase (typically Phase 4-6 for interaction refinement).
10. **Update the requirements traceability matrix** to add mockup and component references per artifact doc row.
11. **Final Phase 1 sign-off review** confirming all exit criteria are met.

### 5. Active build-agents this phase

- **Design Agent (new role, introduced this phase)** — owns extraction of the design system from reference screenshots, authoring `docs/04-design/design-system.md`, producing all hi-fi mockups, defining the App Shell contract, writing interaction/accessibility notes, and publishing the token source file into `packages/ui-kit`. This is a design-authority role distinct from any later UI-implementation agent: it produces specs and token sources, not application code. Its outputs are the binding contract that POS-Web UI Agent and Admin-Web UI Agent consume in Phase 4-6 onward, and that Contracts Agent should be aware of when shaping any UI-facing response payloads (e.g., status enum values must match what the Design Agent colored).
- **Docs/Discovery Agent** — continues in a narrower role this phase: updates the requirements traceability matrix with mockup references, coordinates and records the usability-review checkpoint and its findings/follow-ups, and performs the final Phase 1 sign-off consolidation.
- **Domain leads (review-only)** — same advisory-review role as Phase 0, now reviewing mockups instead of decisions: confirm each mockup satisfies its artifact doc and doesn't reintroduce an ambiguity Phase 0 closed.

### 6. Deliverable artifacts

- `docs/04-design/design-system.md` — new, approved.
- `docs/04-design/app-shell-contract.md` (or a section within design-system.md) — new, approved.
- `docs/04-design/mockups/artifact-01-table-floor-view.*` through `docs/04-design/mockups/artifact-09-system-config-app-shell.*` — nine mockup deliverables (one per artifact doc; multi-state screens may produce multiple files under a per-artifact subfolder).
- `docs/04-design/interaction-accessibility-notes.md` (or per-mockup inline notes) — new, approved.
- `docs/04-design/usability-review-findings.md` — new, log of checkpoint findings and resolutions/follow-ups.
- `packages/ui-kit/tokens/design-tokens.json` (or equivalent format the eventual UI stack consumes, e.g. CSS custom properties file) — new, checked in, synchronized with design-system.md.
- `docs/01-discovery/requirements-traceability-matrix.md` — updated with mockup/component reference columns.

### 7. Dependency wiring

Phase 1 hands Phase 2-3 (Architecture + DB):
- The App Shell component contract and per-screen mockups, informing which UI-driven data shapes the API contracts (`contracts/`) and DB schema (`db/`) must support — e.g., if a mockup shows a computed field displayed inline, that field either needs a DB column/view or an API-side computation, and Phase 2-3 must decide which.
- The finalized status-color-to-status-enum mapping, confirming the enum values Phase 0 closed are exactly what the API and DB will need to expose, with no additional states invented at design time.
- The design-tokens source file in `packages/ui-kit`, establishing that `packages/ui-kit` is now a live, versioned package that Phase 2-3's package/module boundary decisions must account for.
- The updated requirements traceability matrix, now carrying a full chain from decision to requirement to mockup, which Phase 2-3 extends further by attaching schema/contract references.

### 8. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Reference screenshots have insufficient resolution/coverage to extract precise color values or spacing | Use closest reasonable approximation and flag any token as "approximated, not measured" in design-system.md rather than presenting false precision |
| Design Agent produces mockups that quietly reintroduce one of the six ambiguities Phase 0 just closed (e.g., a different MFR button treatment) | Require each mockup to be checked against its DEC-### references during the usability-review checkpoint, not just against the artifact doc prose |
| App Shell contract is drafted before all nine screens are mocked, causing rework when a later screen reveals shell chrome the early draft missed | Sequence App Shell finalization last (task 5's ordering), after all screen-specific mockups are done, even though a preliminary draft may start early for reference |
| `packages/ui-kit` token file and `design-system.md` drift apart over the course of the phase as tokens get tuned | Treat design-system.md as the single source of truth during drafting and generate/sync the token file from it at the end of the phase, not incrementally by hand in two places |
| Usability-review checkpoint surfaces findings large enough to require re-deriving requirements, effectively reopening Phase 0 | Distinguish design-level findings (fixable in Phase 1) from requirements-level findings (must reopen a DEC item) explicitly in the findings log; requirements-level findings go back through a mini decision-register amendment before Phase 1 can close, not silently absorbed into a mockup tweak |

### 9. Estimated duration: 3–4 weeks

- Design-system token extraction and status-color reconciliation: 3 days
- design-system.md drafting and review: 2 days
- App Shell contract definition: 2 days
- Hi-fi mockups for nine artifact docs: 8–10 days (roughly 1 day per screen, more for Order Entry/Billing and Online Live Feed given their higher state-count)
- Interaction/accessibility notes: concurrent with mockup production, no separate schedule slot
- Token publication into packages/ui-kit: 1 day
- Usability-review checkpoint and findings resolution: 2–3 days
- Traceability matrix update and final sign-off: 1 day

Total: 15–20 working days (3–4 weeks), consistent with the README estimate; mockup production for the higher-complexity screens (Order Entry/Billing, Online Live Feed) is the primary schedule risk.
