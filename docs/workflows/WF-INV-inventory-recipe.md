# WF-INV — Inventory & Recipe Workflows

**ID:** WF-INV-01..04 · **Status:** DRAFT · **Owner:** BA · **Version:** 1.0 · **Updated:** 2026-08-08
**Traces to:** `REQ-INV`, [`../02-requirements/inventory-recipe.md`](../02-requirements/inventory-recipe.md), [`../decisions/DEC-003-recipe-bom-inventory.md`](../decisions/DEC-003-recipe-bom-inventory.md)
**Traced by:** `DB-TBL-STOCK_MOVEMENTS`, `WF-ORD-01` step 10
**Blocked by:** DEC-015, DEC-016, DEC-017, DEC-018, DEC-019 (WF-INV-02 only, purchase/vendor module boundary)

Recipe, UOM, movement-type, and count-reconciliation detail beyond what each workflow needs is not repeated here — see [`../02-requirements/inventory-recipe.md`](../02-requirements/inventory-recipe.md).

---

## WF-INV-01 — Recipe-Driven Stock Consumption on Order Completion

**Trigger:** order reaches `COMPLETED` (per DEC-003, Option B — approved)
**Actors:** System (event consumer) · Kitchen/Ops (alerted on exception, no action required to proceed)

```
1  Order completion event emitted                      ← WF-ORD-01 step 10, async, idempotent
2  For each order line, look up active recipe
        ↓ no recipe found → log exception, alert operator, continue (never blocks)
3  Resolve recipe version pinned at explosion time      ← costs/quantities frozen to this version
4  Explode recipe to ingredient quantities              ← item-level BOM; modifiers not deducted (DEC-003 Option B)
5  Apply yield_percent per line                          ← consumed = required_qty ÷ yield_percent
6  Post CONSUMPTION movement per ingredient    ┐ ATOMIC per order
7  Movement references originating order/txn  ┘         ← reference_type/reference_id, correlation_id
8  Stock balance re-derived from ledger                  ← never hand-written
9  Low-stock check against reorder_level
10 Audit log entry written
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 6-7 | One DB transaction per order | All ingredient deductions for one order post together or not at all — no half-deducted order |
| 1-10 | Event-driven, idempotent, individually retryable | Consumption is asynchronous per ENGINEERING-PROTOCOL §4; a retry or replay must not double-deduct |

Idempotency key: `(reference_type, reference_id, ingredient_id, movement_type)` — a replayed completion event cannot post twice.

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 2 | No recipe for item | Log exception, alert operator, line silently non-deducting — sale is never blocked |
| 6-7 | Transaction fails | Full rollback for that order; event redelivered and retried; no partial deduction |
| 6 | Stock balance would go negative | Movement still posts; alert raised (shortage blocking is out of scope for this workflow — deduction is post-sale, not pre-sale) |
| — | Order cancelled after completion (rare) | Reversing `CONSUMPTION` movement posted, never an edit to the original row — ledger is append-only |

**Audit points:** every CONSUMPTION movement · every missing-recipe exception · every reversal.

---

## WF-INV-02 — Purchase Order → Goods Receipt → Stock Increase

**Trigger:** purchase order created against a vendor
**Actors:** Purchasing/Ops user (`po.create`, `grn.record`)

```
1  Create purchase order (PO)                           ← vendor, ingredients, ordered qty, expected cost
2  PO approval (if above threshold)                      ← BLOCKED: approval policy is DEC-015/016
3  PO sent to vendor
4  Goods receipt (GRN) recorded on delivery              ← received qty vs ordered qty, per line
5  Quality/quantity check
        ↓ discrepancy → partial accept / reject line     ← BLOCKED: discrepancy handling is DEC-017
6  Accepted qty posts RECEIPT movement          ┐ ATOMIC per GRN
7  Movement references GRN / PO document        ┘
8  Stock balance increases via re-derivation from ledger
9  PO status updated (partial / fully received)          ← BLOCKED: PO lifecycle states are DEC-018
10 Vendor invoice matching                                ← BLOCKED: 3-way match scope is DEC-019
11 Audit log entry written
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 6-7 | One DB transaction per GRN | Every accepted line either posts its RECEIPT movement or the GRN did not happen — no stock increase without a source document |

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 4-5 | Received qty ≠ ordered qty | Accept only the received qty; PO remains open for the shortfall — exact partial/backorder handling is DEC-017 |
| 6-7 | Transaction fails | Full rollback for that GRN; no orphan movement |
| 4 | Rejected line (damaged/wrong item) | No movement posted for that line; rejection recorded on the GRN, not as a stock movement |

**Audit points:** PO creation · PO approval · GRN recording · every RECEIPT movement · rejections.

This workflow's exact PO approval thresholds, GRN discrepancy handling, PO lifecycle states, and invoice-matching scope are **not decided** — see Open Decisions below. The step flow above is the proposed stock lifecycle only; do not build the blocked steps until their DECs close.

---

## WF-INV-03 — Wastage & Manual Stock Adjustment

**Trigger:** operator records spoilage, spillage, prep error, or other unplanned loss
**Actors:** Kitchen/Ops user (`wastage.create`) · Approver role (elevation on threshold)

```
1  Initiate wastage / manual adjustment entry
2  Select ingredient, location, quantity
3  Require reason code                                  ← mandatory; free text alone rejected
        (SPOILAGE, SPILLAGE, PREP_ERROR, CUSTOMER_RETURN,
         POST_KOT_CANCELLATION, EXPIRY, COUNT_VARIANCE_LOSS)
4  Value at moving average cost at post time             ← stored on movement, not restated later
5  Above threshold?  ──yes──► require approver role
        ↓ denied → reject + audit the attempt
      ↓ no
6  Post WASTAGE movement            ┐ ATOMIC with wastage_records row and audit row
7  wastage_records row written      ┘
8  Stock balance decreases via re-derivation from ledger
9  Audit log entry written
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 6-7 | One DB transaction | A WASTAGE movement without its `wastage_records` row loses the reason code; the two must exist together or not at all |

Wastage is a distinct movement type from `CONSUMPTION` — it is never inferred from recipe activity, always explicitly posted (per [`../02-requirements/inventory-recipe.md`](../02-requirements/inventory-recipe.md) §35).

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 3 | No reason code supplied | Reject entry; wastage cannot post without a reason |
| 5 | Approval denied | Entry stays pending; no movement posted; denial audited |
| 6-7 | Transaction fails | Full rollback; no orphan movement, no orphan wastage record |

Correction path: a mistaken wastage entry is never edited — a reversing `WASTAGE` entry is posted, with elevated role, per the append-only ledger rule.

**Audit points:** every wastage entry · every approval and denial · every reversal.

---

## WF-INV-04 — Stock Count / Physical Count Reconciliation

**Trigger:** scheduled or ad hoc count session opened (full or cycle count)
**Actors:** Counter (`count.enter`) · Supervisor (`count.approve`, on variance above tolerance)

```
1  Open count session (outlet, location, ingredient scope)
2  Snapshot theoretical qty per line              ← frozen at session open, not read at close
3  Counter enters physical qty                    ← blind; theoretical hidden by default
4  System computes variance = physical − theoretical
5  |variance| ≤ tolerance?
        ↓ yes → auto-approve
        ↓ no  → HOLD, require supervisor review
                   ↓
                recount / accept / reject
6  Post session               ┐ ATOMIC
7    - one ADJUSTMENT movement per non-zero variance line
8    - wastage_records row where variance is attributed loss
9    - audit_logs row for the session and for each override
        ┘
10 Session CLOSED — immutable
```

**Transaction boundaries**

| Steps | Boundary | Why |
|-------|----------|-----|
| 6-9 | One DB transaction | All variance lines for a session post together, or the session is not closed — a half-posted count is worse than no count |

Movements posted between snapshot (step 2) and close (step 10) are not silently discarded — the session records them and either re-baselines or flags the line.

**Failure paths**

| Step | Failure | Behavior |
|------|---------|----------|
| 5 | Variance exceeds tolerance | HOLD; session cannot close until supervisor recounts, accepts, or rejects |
| 6-9 | Transaction fails | Full rollback; session stays open, not partially closed |
| 10 | Post-close correction needed | Not permitted — a closed session is immutable; a new session is opened |

**Audit points:** session open · every entered physical qty override · every supervisor decision · session close.

---

## Open Decisions

| Decision | Affects |
|----------|---------|
| DEC-003 (approved — Option B) | WF-INV-01 in full: automatic ingredient deduction on order completion, item-level recipe, manual adjustments for waste |
| DEC-015 | WF-INV-02 step 2 — PO approval thresholds |
| DEC-016 | WF-INV-02 step 2 — approval routing/elevation policy |
| DEC-017 | WF-INV-02 step 5 — GRN discrepancy / partial-receipt handling |
| DEC-018 | WF-INV-02 step 9 — PO lifecycle states |
| DEC-019 | WF-INV-02 step 10 — vendor invoice 3-way match scope |
</content>
