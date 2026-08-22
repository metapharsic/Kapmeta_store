# Kapmeta SDLC — Phase 12-15 (Hardening) and Phase 16 (Rollout)

This document details the execution plan for the final two blocks of the Kapmeta build: the hardening block (Phases 12-15) that converts a feature-complete system into a production-safe one, and the rollout block (Phase 16) that puts Kapmeta into a real outlet. It assumes Phase 0 through Phase 10-11 are complete: Core POS, Online Integration, Inventory+Finance, and CRM+Reporting are all built and functioning end to end, but none of it has been security-reviewed, load-tested, compliance-checked, or run in a live outlet.

---

## PART 1 — Phase 12-15: Hardening (4-6 weeks)

### 1. Objective

Take the feature-complete system produced by Phase 10-11 and make it production-safe across four dimensions — security, performance, regulatory compliance, and operational resilience — without adding any new user-facing functionality. This phase is explicitly a **feature freeze**: the goal is to prove the system that already exists is safe to run a real restaurant on, not to extend it. Any gap discovered here is closed by hardening the existing implementation (patching, adding tests, adding guardrails, adding documentation), never by scoping in a new feature.

### 2. Entry criteria

- All Phase 10-11 exit criteria met and signed off: CRM (customer lookup, Day Summary, Item Report) functioning against real data flows from Core POS, Online Integration, and Inventory+Finance.
- A formal feature freeze declared and communicated to all Domain Services Agents — no new endpoints, screens, or schema changes originate in this phase except as a direct byproduct of a hardening fix.
- The full system (apps/pos-web, apps/admin-web, apps/api, all services/) deployed to a staging environment that mirrors the intended production topology, including a representative LAN outlet-server node.
- tests/unit, tests/contract, tests/integration, and tests/e2e all green on the frozen build; this is the baseline the hardening phase works from.

### 3. Exit criteria / Definition of Done

Hardening is not "done" on a calendar date — it is done when every one of the following is true and documented:

1. **Security**: A penetration test (internal or external) has been run against the frozen build; every Critical and High finding is closed and verified closed by re-test; Medium/Low findings are triaged with either a fix or an explicit, owner-signed risk acceptance recorded in docs/08-security/.
2. **Performance**: Load testing proves the LAN outlet-server sustains the peak concurrency implied by the captured product screenshots — an outlet running roughly 40 active tables with several simultaneous online orders arriving from Swiggy/Zomato — while holding a stated P95 latency budget. **Proposed budget (pending real SLA agreement with the business): P95 ≤ 300ms for an order-item add, P95 ≤ 500ms for bill finalization/print-trigger, P95 ≤ 800ms for an inbound online-order webhook to reach "visible in KOT queue."** These numbers are flagged explicitly as engineering proposals, not committed SLAs, until a stakeholder with operational authority signs off.
3. **Resilience**: A chaos test proves that an outlet-server crash-and-recover cycle preserves all in-flight orders with zero data loss, via replay of the sync outbox. The test must cover at minimum: crash mid-order-entry, crash mid-print, crash mid-online-order-ingestion, and crash during a partially-completed OOS fan-out.
4. **Tamper-evidence**: order_audit_log, stock_movements, and channel_sync_log are proven append-only/tamper-evident — no code path in the entire codebase performs UPDATE or DELETE against these tables, enforced at both the application layer and the database layer (e.g., a trigger or grant that rejects UPDATE/DELETE), and this is covered by an automated test that attempts a mutation and asserts rejection.
5. **Destructive-action hardening**: every destructive System Config action (Reset Bill No, Reset Sync Code, Remove All Orders/KOT, Remove Backup Files) requires: a confirm dialog, a typed confirmation (the user must type the action name or outlet name, not just click "OK"), a role-gated permission check (only Admin/Owner roles, never Cashier/Manager), and its own dedicated audit_log entry recording who, when, and from which machine.
6. **Tax compliance**: a GST/tax-compliance test suite validates the backward-tax (tax-inclusive) and forward-tax (tax-inclusive vs. exclusive computation) split against actual Indian GST rules for restaurant billing (CGST/SGST split, rounding rules, HSN/SAC-linked rate application). **This suite's correctness must be signed off by someone with real Indian tax/compliance expertise — an engineering-only review is explicitly insufficient and is flagged as a residual risk until that sign-off is obtained.**
7. **PII governance**: CRM PII fields (customer phone, address, locality) have a written access-control policy (which roles can view/export raw PII vs. masked) and a data-retention policy (how long PII is kept, what happens on customer deletion request), both documented in docs/08-security/ and enforced in code (query-level masking or role-based field filtering), not just written down.
8. **Documentation freeze**: docs/08-security/ and docs/09-testing/ are complete, reviewed, and frozen for this release; docs/00-governance/ reflects the sign-offs above.

### 4. Task breakdown by sub-phase

**Phase 12 — Security**
- Full authentication/authorization review across apps/api and all services/: verify every endpoint enforces the correct role check, verify JWT/session handling, verify no endpoint trusts a client-supplied role or outlet ID without server-side verification.
- Commission and run a penetration test against staging (web app, API, and where feasible the outlet-server LAN surface).
- Secrets management audit across infra/: confirm no secrets are committed to the repo, confirm Terraform/K8s manifests reference a secrets manager (not plaintext env vars in manifests), rotate any staging/dev secrets that were used during earlier phases and may have leaked into logs or screenshots.
- Webhook signature verification audit: re-review the Swiggy/Zomato webhook handlers built in Phase 7 specifically for signature/HMAC verification correctness, replay-attack resistance (timestamp/nonce checks), and behavior on a forged or malformed payload.
- SQL-injection and general input-validation sweep across every service that accepts external input, with particular attention to any raw-query or dynamic-query construction in reporting endpoints (Item Report, Day Summary) and the admin System Config actions.
- Destructive System Config action hardening (confirm dialog, typed confirmation, role gate, audit entry) — implemented as fixes against existing screens, not new features.

**Phase 13 — Performance**
- Build out tests/performance: load tests simulating the ~40-table dine-in load plus concurrent Swiggy/Zomato order ingestion plus simultaneous KOT print traffic.
- Stress/soak testing: sustained load over a multi-hour window to catch memory leaks, connection-pool exhaustion, and print-queue backlog behavior.
- Database index review against real query patterns pulled from every reporting and lookup path documented across prior phase artifacts — Day Summary, Item Report, customer lookup, stock/recipe queries, due-payment ledger queries — confirming each has a covering index and does not fall back to a sequential scan under realistic data volume.
- LAN sync throughput testing: measure outlet-server-to-cloud sync latency and the sync outbox's drain rate under normal and network-degraded conditions.
- Chaos/resilience testing feeds into Phase 15 but its harness is built here alongside the rest of tests/performance.

**Phase 14 — Compliance**
- GST/tax-compliance test suite: enumerate real Indian restaurant-billing GST scenarios (dine-in vs. takeaway rate differences where applicable, CGST/SGST split, rounding to nearest rupee, tax-inclusive vs. tax-exclusive pricing display, discount-before-tax vs. after-tax ordering) and encode each as an automated test against the tax engine built in Phase 4-6. Flag this suite for external tax-expert sign-off before it is trusted as authoritative.
- PII handling and retention policy for CRM data: document who can see raw phone/address/locality, whether it is masked in reports and exports, how long it is retained after a customer's last visit, and what a deletion request does. Enforce in code.
- Invoice/bill format legal-compliance check: verify the printed bill format (GSTIN display, invoice numbering sequence, mandatory fields) against Indian retail/restaurant billing regulations. **Flagged as needing real legal/tax input — engineering can verify the fields are present and correctly computed, but cannot independently certify regulatory sufficiency.**

**Phase 15 — Operational Resilience**
- Outlet-server crash/recovery drills: scripted kill-and-restart of the outlet-server process (and, separately, the underlying machine) during active service, verifying the sync outbox replays cleanly and no order or KOT is lost or duplicated.
- Backup/restore drills: exercise the existing "Remove Backup Files" and "Database Migration" admin tools as the basis for a formal backup/restore runbook — take a backup, deliberately corrupt/wipe a test database, restore from backup, verify data integrity.
- Monitoring/alerting setup in infra/monitoring/: dashboards and alerts for outlet-server health, sync-outbox depth, API error rate, print-pipeline failures, and OOS fan-out failures.
- Runbook documentation: incident-response runbooks for "outlet-server down," "sync backlog growing," "online-order channel unreachable," and "printer offline," written for on-the-ground restaurant staff and remote support, not just engineers.

### 5. Active build-agents and division of labor

- **Security Agent** (new): owns Phase 12 in full — auth/authz review, pentest coordination and remediation tracking, infra/ secrets hardening, webhook signature audit, input-validation sweep, destructive-action hardening.
- **Performance/SRE Agent** (new): owns Phase 13 in full and co-owns Phase 15's monitoring work — builds out tests/performance, runs load/stress/soak tests, performs the database index review, sets up infra/monitoring.
- **QA/Test Agent** (primary owner overall): coordinates the Phase 14 compliance test-suite build-out, re-engaging the **Tax Service Agent** (from Phase 4-6) specifically to build and validate the GST/tax-compliance suite, and the **CRM Service Agent** (from Phase 10-11) specifically to implement the PII access-control and retention policy in code. QA/Test Agent also owns the chaos-test harness and crash/recovery drill scripts in Phase 15, and aggregates all sub-phase results into the overall exit-criteria sign-off.
- **Docs/Discovery Agent**: owns the documentation freeze — finalizes docs/08-security/ and docs/09-testing/, and drafts the runbooks produced in Phase 15 in coordination with the Performance/SRE Agent.
- **All prior Domain Services Agents** (Core POS, Online Integration, Inventory/Finance, CRM, Tax): on standby, activated only to fix specific defects surfaced by testing in their own domain. They do not pick up new feature work during this window; any request that looks like a feature is escalated back to the feature-freeze policy owner before being actioned.

### 6. Deliverables

- `docs/08-security/` — auth/authz review notes, pentest findings and remediation log, secrets-management policy, webhook-verification audit, PII access-control and retention policy, destructive-action hardening spec.
- `docs/09-testing/` — GST/tax-compliance test plan and results, invoice-format compliance checklist, performance test plan and results summary, chaos/resilience test plan and results.
- `tests/performance/` — load, stress, soak, and LAN-sync-throughput test suites.
- `tests/security/` — SQL-injection/input-validation tests, webhook-forgery tests, destructive-action access-control tests, audit-log immutability tests.
- `infra/monitoring/` — dashboards and alert rules for outlet-server health, sync-outbox depth, API errors, print/OOS failures.
- Runbooks (crash/recovery, backup/restore, incident response) — location TBD by Docs/Discovery Agent, referenced from docs/09-testing/ and docs/11-rollout/.

### 7. Dependency wiring into Phase 16

Phase 16 cannot begin until Phase 12-15 produces a system that is: penetration-tested with Critical/High findings closed, load-tested against the proposed latency budget, chaos-tested for zero-data-loss crash recovery, tamper-evident on its audit tables, hardened on all destructive System Config actions, and has a GST/tax suite and PII policy in place (even if final external sign-off on tax/legal correctness is still pending — see Risks below, this is tracked as an explicit open risk carried into rollout, not a blocker that is quietly ignored). Phase 16 receives a signed-off, tested build plus the full runbook set as its starting inputs.

### 8. Risks

- **Feature creep disguised as hardening**: teams and stakeholders will be tempted to slip in "quick fixes" that are actually new features once the system is in front of them again. Mitigation: an explicit, written feature-freeze policy, with a defined escalation path (any change request during Phase 12-15 must be justified as a defect fix against existing scope, or is deferred to a post-rollout phase).
- **Compliance sign-off (tax/legal) is externally dependent**: the GST-suite and invoice-format sign-offs depend on expertise Kapmeta's engineering team does not control (a tax professional, possibly legal counsel), and their availability/timeline is outside engineering's ability to accelerate. Mitigation: engage compliance/tax/legal reviewers **in parallel starting at the beginning of sub-phases 12-13**, not sequentially after engineering finishes Phase 14 — so external review time overlaps with security/performance work rather than extending the critical path.
- **Load test environment may not faithfully represent real LAN conditions** at a physical outlet (Wi-Fi interference, underpowered hardware, ISP instability). Mitigation: treat staging load-test results as a lower bound and validate again on-site during Phase 16's pilot.
- **Pentest findings arriving late relative to the 4-6 week window**, especially if a Critical is found near the end. Mitigation: commission the pentest as early in Phase 12 as the build allows, not at the end of the sub-phase.

### 9. Estimated duration (4-6 week window)

| Sub-phase | Focus | Duration |
|---|---|---|
| Phase 12 | Security | 1.5 weeks |
| Phase 13 | Performance | 1 week (overlapping with tail of Phase 12) |
| Phase 14 | Compliance | 1.5-2 weeks (external sign-off may extend this; engineering work itself ~1 week, run in parallel with Phases 12-13) |
| Phase 15 | Operational Resilience | 1 week |
| Buffer / consolidated re-test | Cross-cutting fixes, exit-criteria verification | 0.5-1 week |

Total: 4-6 weeks, with Phase 14's external compliance review kicked off in parallel from week 1 so it does not become the critical-path bottleneck.

---

## PART 2 — Phase 16: Rollout (2-4 weeks)

### 1. Objective

Deploy Kapmeta to its first real restaurant outlet(s) through a staged rollout appropriate to the LAN-outlet-server architecture: unlike a pure cloud SaaS product, each physical outlet requires on-site hardware/network setup before the software can run, so rollout is treated as a physical-plus-digital deployment, not a simple release toggle.

### 2. Entry criteria

- Phase 12-15 sign-off complete: security, performance, compliance, and resilience exit criteria all met (or explicitly risk-accepted where sign-off is still pending, per the Phase 12-15 risk log).
- A pilot outlet identified and committed by the business, with a named on-site point of contact.
- Rollback plan drafted and dry-run tested in staging before it is relied upon in production.

### 3. Exit criteria / Definition of Done

- The pilot outlet has run Kapmeta in full production use for a defined consecutive period — **proposed: 14 consecutive days** — with zero P0 incidents (a P0 being any incident that stops billing or order-taking outlet-wide).
- A rollback plan exists, has been tested (not just written), and can be executed within a defined time window if the pilot needs to revert to the old system.
- Staff training materials have been delivered to pilot-outlet staff and staff sign-off obtained confirming they can operate dine-in billing, KOT flow, online-order handling, and end-of-day Day Summary reconciliation without engineer assistance.
- A parallel-run period (old system and Kapmeta operating simultaneously) has been completed, with each day's Day Summary numbers reconciled between the two systems, before full cutover to Kapmeta-only operation.
- Post-launch monitoring window completed with no unresolved Critical/High issues from infra/monitoring alerts.

### 4. Task breakdown

- **Pilot outlet selection**: choose an outlet representative of typical scale (table count, online-order volume) rather than the smallest or largest, so results generalize to the expansion runbook.
- **On-site infrastructure install**: outlet-server hardware provisioning, network setup (LAN topology, Wi-Fi for handheld/POS terminals), software install and configuration. Staff verify Main-Server/Client-Machine connectivity on-site using the existing **"Check Machine"** System Config screen (from artifact-09) as the go-live connectivity check — this is the tool on-site staff and support use to confirm every client machine can reach the outlet-server before opening for business.
- **Data migration/seeding for the pilot outlet**: the pilot's real menu, tax rates, table layout, and other settings are entered through the admin UIs built in Phase 4-6 — no code deploy is required to onboard a new outlet's menu or settings, directly validating the "never hardcode business/tenant data" rule from CLAUDE.md as a real operational benefit rather than just a code-review rule.
- **Staff training**: hands-on training sessions covering dine-in billing, table management, KOT flow, online-order acceptance/rejection, manual grand-total edits (with emphasis on the new audit trail from Phase 12-15), and Day Summary review; sign-off collected per staff member trained.
- **Parallel-run period**: old system and Kapmeta run side by side for a defined window (proposed: 5-7 business days), with daily reconciliation of Day Summary totals between the two systems; any mismatch is investigated and resolved before proceeding.
- **Phased cutover**: move from parallel-run to Kapmeta-only, ideally starting on a lower-volume day, with the old system kept available in a fallback/read-only state for a short grace period.
- **Post-launch monitoring window**: elevated on-call attention (Performance/SRE Agent) for the first days of Kapmeta-only operation, watching infra/monitoring dashboards set up in Phase 15.
- **Expansion runbook**: capture everything learned from the pilot (install steps, common on-site issues, training-session structure, reconciliation gotchas) into a repeatable runbook for onboarding subsequent outlets.

### 5. Active build-agents and division of labor

- **Rollout/DevOps Agent** (new, primary owner): owns infra/ deployment automation for the outlet-server install, writes and executes the on-site install runbook, coordinates the on-site setup visit(s), owns the rollback-plan execution.
- **Performance/SRE Agent**: on-call during the rollout window, watching infra/monitoring dashboards and responding to any performance or resilience issue that surfaces under real-world load (which staging/chaos testing may not have fully replicated).
- **Docs/Discovery Agent**: owns staff training materials, coordinates their delivery, and owns the final rollout retrospective document, which feeds back into docs/00-governance/ as the closing artifact of the initial build.
- **QA/Test Agent**: validates the parallel-run reconciliation process and confirms Day Summary matching before cutover is approved.

### 6. Deliverables

- `docs/11-rollout/*` — rollout plan, pilot outlet selection rationale, cutover schedule.
- On-site install runbook (hardware/network setup, "Check Machine" verification procedure).
- Staff training materials and sign-off records.
- Rollback plan document, including the tested procedure and time-to-execute.
- Expansion runbook for subsequent outlets.
- Rollout retrospective, filed into docs/00-governance/.

### 7. Dependency wiring

Phase 16 is the terminal phase of this initial build plan. Its outputs — the expansion runbook, the rollout retrospective, and the monitoring baseline established during the pilot — are the inputs to whatever comes next: a Phase 17+ maintenance-and-multi-outlet-expansion loop, which is acknowledged here as the natural continuation but is out of scope to detail in this document.

### 8. Risks

- **On-site hardware/network issues outside software control** (unreliable outlet internet, underpowered hardware, electrical/power stability). Mitigation: a pre-install site survey ahead of the scheduled install date, and a documented minimum-hardware/network spec that the pilot outlet must meet before install begins.
- **Staff resistance or training gaps**, given restaurant staff turnover and variable technical comfort. Mitigation: training materials pitched at a non-technical audience, a supervised first-week period with an on-call trainer/support contact, and the "Check Machine" self-verification tool put directly in staff hands rather than only used by engineers.
- **Parallel-run reconciliation mismatch** between old-system and Kapmeta Day Summary numbers, which would indicate an unresolved correctness issue (tax computation, discount handling, or missed orders) and must hold cutover until explained. Mitigation: build the reconciliation check as a required, blocking gate — cutover is not approved by QA/Test Agent until N consecutive days reconcile cleanly — rather than a best-effort comparison that can be waved through under schedule pressure.
- **Old system decommissioned too early**, leaving no fallback if a P0 emerges post-cutover. Mitigation: keep the old system in a read-only/available fallback state for a defined grace period after full cutover, not decommissioned immediately.

### 9. Estimated duration (2-4 week window)

| Task | Duration |
|---|---|
| Pilot outlet selection + pre-install site survey | 2-3 days |
| On-site infra install + Check Machine verification | 2-3 days |
| Data migration/seeding (menu, tax, settings) | 1-2 days (can overlap with install) |
| Staff training | 2-3 days |
| Parallel-run period + daily reconciliation | 5-7 business days |
| Phased cutover | 1-2 days |
| Post-launch monitoring window | 3-5 days |

Total: 2-4 weeks, with the parallel-run and post-launch monitoring windows being the most likely sources of schedule extension if reconciliation issues or stability problems surface.
