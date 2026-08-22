# FAQ

Questions every new developer asks here.

---

**Q: Most docs say DRAFT or PROPOSED. Can I build from them?**

Not production code. `DRAFT` means the content is still moving. Build spikes and prototypes freely; wait for `APPROVED` before shipping to a real outlet. This is expected — Phase 0 has not closed.

---

**Q: My module is blocked by an open DEC. What do I actually do?**

Everything that does not depend on it. Scaffolding, tests, contracts, the parts of the flow the decision does not touch. Then escalate the DEC to its owner with a concrete cost: "this blocks X person-days starting Monday." Vague blockers get ignored; dated ones get decided.

Do not implement a placeholder for tax, money, or permissions and plan to swap it later. Those refactors are never cheap.

---

**Q: We're launching one outlet. Why is `outlet_id` on every table?**

Because retrofitting outlet scoping later means touching every table, every query, every permission check, and every report — with live data in production. The column costs nothing now. DEC-001 may confirm multi-outlet anyway.

---

**Q: Why can't I just `JOIN` across modules? It's one database.**

It is one database today. The module boundary is what makes it possible to split later without an archaeology project. A cross-module join also means a schema change in one module silently breaks another. Call the owning module's API.

---

**Q: Where do I put business logic — service, controller, or database?**

Service layer. Controllers validate and translate; the database enforces integrity constraints, not business rules. Pricing, tax, discounts, and state transitions each live in exactly one place, and reports consume that same code rather than re-implementing it.

---

**Q: Why is money an integer?**

`0.1 + 0.2 !== 0.3`. In a tax calculation applied thousands of times a day, float drift becomes a reconciliation dispute with a real tax authority. Store paise as `BIGINT`, format at the edge.

---

**Q: Do I need an ADR for this?**

If it adds/removes a table, breaks an API contract, adds a dependency or infrastructure component, changes auth/money/audit, or implements a DEC — yes. Otherwise no. Five minutes writing one beats a two-hour argument in six months.

---

**Q: The spec and the implementation disagree. Which is right?**

The spec. If the spec is genuinely wrong, fix the spec in the same PR as the code — never leave them divergent.

---

**Q: Why persist the raw webhook before processing it?**

So a processing bug is recoverable. If you parse first and the parse fails, the event is gone and the customer's order simply does not exist. Persist, then process, then replay if needed.

---

**Q: Why does the same order create multiple KOTs?**

One per kitchen station. Tandoor and beverages are different physical places with different prep times. The order is READY only when all its tickets are done.

---

**Q: A customer's order was cancelled but shows in yesterday's report. Bug?**

Probably not. Refunds and cancellations report against the **original** business day so historical totals stay stable. Confirm against DEC-009 before treating it as a defect.

---

**Q: Can I add a library?**

Yes, with an ADR covering: what problem it solves, why not the standard library, license, maintenance status, bundle/runtime cost. CI fails on high/critical advisories.

---

**Q: Do I have to write the audit row? Can't a trigger do it?**

Write it explicitly, in the same transaction as the mutation. Triggers hide the behavior from readers of the code and cannot capture the *reason* for a cancellation or override — which is the part auditors actually want.

---

**Q: Tests are slow / the E2E suite is flaky. Can I skip it?**

Fix it or flag it; do not skip it. The E2E scenarios in `09-testing/test-strategy.md` are the ones that map to money changing hands. A flaky payment-retry test is a warning, not noise.

---

**Q: Production is down. Where do I start?**

[`12-operations/runbook.md`](12-operations/runbook.md). Preserve all transaction data — never delete during recovery. Roll back the app, not the schema; migrations are written backward-compatible precisely for this.

---

**Q: Who decides scope?**

Product Owner, via [`00-governance/change-control.md`](00-governance/change-control.md). Anything not in the frozen R1 list is a CR, and a CR that gets accepted displaces something else. "We'll absorb it" is not an outcome.

---

**Q: This is a lot of process for a POS.**

It handles money, statutory tax, and food already cooked. A dropped order is a refund, an angry customer, and a wasted meal — none of which a redeploy fixes. The process is scoped to that risk, which is why formatting nits are not in it and audit rows are.
