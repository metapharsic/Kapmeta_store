# Purchase & Vendor — Functional Spec

**Source:** none · **Coverage:** 0% · **Status:** DRAFT — fully proposed · **Blocks on:** DEC-003

> No source document covers procurement. Everything below is **proposed design**, written to be argued with and amended, not to be implemented as-is. Purchase is downstream of inventory: a goods receipt is only meaningful if stock movements exist, so this module inherits the **DEC-003** blocker in full. Thresholds, tolerances and metric targets stated here are placeholders pending business sign-off — they are not agreed numbers. Release scope is **R2**, not R1.
>
> Related: [`inventory-recipe.md`](inventory-recipe.md), [`../05-database/schema-reference.md`](../05-database/schema-reference.md), [`../GLOSSARY.md`](../GLOSSARY.md), [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md).

## Non-Negotiables Inherited

- All amounts — unit price, line total, tax, PO value, invoice value — are `BIGINT` minor units + `currency CHAR(3)`. **Never float.** Line total is computed server-side from integer quantity × integer unit price with a defined rounding rule; a client-supplied total is never trusted.
- Quantities carry an explicit UOM. Purchase UOM is usually **not** the ingredient's base UOM (buy in cases, hold in grams). Conversion happens once, at goods receipt, using the ingredient's configured factor, and the factor used is persisted on the resulting movement. Receiving "10" without recording whether that meant crates, kilos or pieces is the classic way a purchase module poisons an inventory ledger.
- A goods receipt produces `RECEIPT` rows in `stock_movements`, which are **append-only and immutable** ([`inventory-recipe.md`](inventory-recipe.md), risk R-06). A receipt is never edited. A wrong receipt is corrected by a reversing movement or a vendor return, both of which leave a trace.
- Every table carries `outlet_id`. POs are raised per outlet; vendors may be shared at organization level with per-outlet enablement (DEC-001).
- Approval, price override, tolerance override, receipt posting and vendor return all write an `audit_logs` row **in the same transaction** as the mutation.
- Every mutating endpoint accepts `Idempotency-Key`. A retried receipt must not stock the goods twice.

## Vendor Master

`vendors` — proposed fields.

| Field group | Content |
|-------------|---------|
| Identity | `vendor_code` (unique per organization), legal name, trade name, active flag |
| Tax | GSTIN / tax registration number, PAN, tax treatment (registered / unregistered / composition) |
| Contact | primary contact, phone, email, address — **PII; excluded from logs and lower environments** |
| Commercial | payment terms (net days), credit limit (minor units), currency, default lead time days |
| Banking | account reference — **stored, never logged, never returned in list endpoints** |
| Scope | organization-level record, per-outlet enablement rows |
| Catalog | supplied ingredients with vendor SKU code, pack size, pack UOM, last quoted price |

Rules:

- A vendor is **deactivated, never deleted** — historical POs and receipts must remain resolvable.
- Vendor SKU → ingredient mapping is explicit. An unmapped SKU cannot be received; it blocks at receipt, not silently at consumption time.
- Duplicate detection on tax registration number at create time. Duplicate vendor records split spend history and make price variance detection useless.

## Requisition → PO → Goods Receipt

```
Low-stock alert  ─┐
Manual request   ─┼→  PURCHASE REQUISITION (draft)
Par-level top-up ─┘         │
                            ↓
                    Requisition SUBMITTED
                            ↓
                     approval by value threshold
                            ↓
              ┌── REJECTED (reason + audit) ──→ end
              ↓
                    Requisition APPROVED
                            ↓
                 Convert to PO (vendor selected,
                 prices pulled from vendor catalog)
                            ↓
                       PO DRAFT
                            ↓
                   PO approval by value threshold
                            ↓
                    PO APPROVED ──→ PO SENT (vendor)
                            ↓
                  goods arrive at outlet
                            ↓
              GOODS RECEIPT posted per delivery
              (may be several against one PO)
                 │
                 ├─ qty < ordered  → PO PARTIALLY_RECEIVED
                 ├─ qty = ordered  → PO RECEIVED
                 └─ qty > ordered  → tolerance check → accept / hold / reject
                            ↓
              RECEIPT movements → stock_balances
                            ↓
                  vendor invoice received
                            ↓
                  THREE-WAY MATCH (PO / GRN / invoice)
                            ↓
              ┌── mismatch → EXCEPTION queue (manual)
              ↓
                    matched → approved for payment
                            ↓
                       PO CLOSED
```

### PO State Machine

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT →
        PARTIALLY_RECEIVED → RECEIVED → CLOSED

  ↓ (DRAFT / PENDING_APPROVAL / APPROVED / SENT)
REJECTED
CANCELLED   ← not permitted once any receipt exists against the PO
```

Transitions are validated server-side and appended to a status history table — statuses are never overwritten in place, consistent with [`orders.md`](orders.md).

| From | To | Guard |
|------|----|-------|
| DRAFT | PENDING_APPROVAL | ≥1 line, vendor set, all lines mapped to ingredients, totals computed |
| PENDING_APPROVAL | APPROVED | Approver role matches value threshold; approver ≠ raiser |
| APPROVED | SENT | Delivery date set; vendor contact present |
| SENT | PARTIALLY_RECEIVED | First receipt posted, receipt qty < ordered qty |
| PARTIALLY_RECEIVED | RECEIVED | Cumulative received ≥ ordered, within over-receipt tolerance |
| RECEIVED | CLOSED | Invoice matched or PO force-closed with reason + audit |
| any pre-receipt | CANCELLED | Permission check + mandatory reason + audit row |

## Approval Thresholds

Value-banded, per outlet, configurable. **The numbers below are placeholders, not agreed policy.**

| PO value (minor units) | Approver | Notes |
|------------------------|----------|-------|
| ≤ 10,000,00 | Outlet Manager | Single approval |
| 10,000,01 – 50,000,00 | Area Manager | Single approval |
| > 50,000,00 | Finance | Two approvals; second must be a different user |

Rules:

- The raiser can never approve their own PO, at any value. Enforced server-side.
- Threshold is evaluated on the **PO total at approval time**. Editing an approved PO upward re-triggers approval; it does not stay approved. Otherwise the threshold is trivially bypassed by approving small and editing large.
- Approvals are recorded with approver, role, timestamp, and the threshold configuration version in force. Every approval writes an audit row.
- Emergency / out-of-hours purchase without a PO is a real operational need and is **not designed here**. Retrospective PO creation is an open question.

## Receipt Handling

### Partial Receipt

- Multiple `goods_receipts` may exist per PO. `gr_items` tracks received qty per PO line.
- PO line carries `ordered_qty` and derived `received_qty`; remaining is computed, never stored as an editable field.
- A PO can be **short-closed** with a reason (vendor cannot supply) — remaining quantity is cancelled, the PO moves to CLOSED, audit row written.

### Over-Receipt

Configurable tolerance per ingredient or globally. Placeholder default: 5% or one pack unit, whichever is greater.

| Condition | Behaviour |
|-----------|-----------|
| Within tolerance | Accept; stock the full received quantity; flag the line |
| Above tolerance | HOLD — requires supervisor approval before stock movements post |
| Rejected | Record refusal; no `RECEIPT` movement; notify vendor |

Under-receipt within tolerance does **not** auto-close the line; short-close is always deliberate.

### Quality Rejection

Goods physically received but rejected on quality are **not** stocked and then wasted — they never enter stock. The receipt line records `rejected_qty` with a reason and produces no `RECEIPT` movement for that quantity. Stocking-then-wasting inflates both purchase and wastage figures and misstates food cost.

## Price Variance Detection

At goods receipt, compare the receipt unit price against `ingredients.last_purchase_price` (per base UOM, after UOM conversion — comparing a per-case price against a per-kilogram price generates permanent false alarms).

| Variance | Action |
|----------|--------|
| ≤ ±5% | Accept silently; update `last_purchase_price` and moving average cost |
| ±5% to ±15% | Accept; flag the line; include in the daily price variance report |
| > ±15% | HOLD the receipt line; supervisor acknowledgement with reason required before posting |

Notes:

- First-ever purchase of an ingredient has no baseline. Do not flag it; record the baseline.
- Volatile commodities (produce, seafood) legitimately swing far more than 15%. A per-ingredient tolerance override is required, otherwise the alert is trained away within a week.
- Variance is computed and stored on the receipt line, not recomputed later from a moving baseline — a stored variance stays explainable.

## Vendor Invoice Three-Way Match

Match `purchase_orders` ↔ `goods_receipts` ↔ vendor invoice.

| Dimension | Compared | Tolerance (placeholder) |
|-----------|----------|-------------------------|
| Quantity | Invoice qty vs GRN received qty | 0 — must match exactly |
| Price | Invoice unit price vs PO unit price | ±2% or a fixed minor-unit amount |
| Total | Invoice total vs computed GRN value + tax | Rounding difference only |
| Tax | Invoice tax vs expected per tax rule | 0; tax logic is centralized, see DEC-004 |
| Vendor / PO ref | Invoice references a valid, received PO | Exact |

Outcomes:

```
matched          → approved for payment
qty mismatch     → EXCEPTION: under/over-billed
price mismatch   → EXCEPTION: price dispute
no matching GRN  → EXCEPTION: invoice without receipt — never auto-approve
duplicate invoice number for vendor → REJECT (unique constraint)
```

An exception is resolved by a human, and the resolution is recorded. **Nothing auto-adjusts.** This mirrors the reconciliation rule in [`../GLOSSARY.md`](../GLOSSARY.md): reconciliation produces an exception report, never an automatic adjustment.

Payment execution itself is out of scope for this module and belongs to Finance (`invoices`, `payments`, `ledger_entries`). Where the boundary sits is unresolved.

## Returns to Vendor

Triggered by post-receipt quality failure, wrong item, or expiry near receipt.

- Creates a return document referencing the original `goods_receipts` line — a return can never exceed the received quantity on that line.
- Posts a `RETURN_OUT` movement (see [`inventory-recipe.md`](inventory-recipe.md)) valued at the original receipt cost, not current moving average. Returning at today's cost silently books a gain or loss.
- Requires elevated role, a mandatory reason code, and an audit row.
- Produces an expected credit note. Open credit notes are tracked against the vendor and included in three-way match on subsequent invoices.
- A return is never a deletion of the receipt. The receipt stands; the return offsets it.

## Vendor Performance Metrics

Derived, R2 reporting. No new source-of-truth tables — computed from `purchase_orders`, `goods_receipts` and their timestamps.

| Metric | Definition |
|--------|------------|
| On-time delivery % | Receipts on or before promised date ÷ total receipts |
| Fill rate % | Received qty ÷ ordered qty, per PO line |
| Quality rejection rate | Rejected qty ÷ received qty |
| Price stability | Standard deviation of unit price over trailing period, per ingredient |
| Invoice accuracy % | Invoices matching first-pass ÷ total invoices |
| Return rate | Returned value ÷ received value |
| Average lead time | Actual PO-sent-to-first-receipt days vs configured lead time |

Scoring weights and any resulting vendor rating are **not proposed** — a composite score requires business input and is easy to make meaningless.

## Open Decisions

| ID | Question | Blocks |
|----|----------|--------|
| **DEC-003** | Manual vs automated inventory | Whether goods receipt posts stock movements at all, and therefore whether this module has a purpose |
| DEC-001 | Multi-outlet scoping | Vendor sharing across outlets, consolidated POs, inter-outlet transfers |
| DEC-004 | Tax treatment | Purchase tax on PO and invoice, input credit handling |
| New DEC needed | Approval threshold values and approver roles | Approval configuration; placeholders above are not policy |
| New DEC needed | Over-receipt and price variance tolerance defaults | Receipt hold behaviour |
| New DEC needed | Retrospective / emergency PO without prior approval | A real operational path currently undesigned |
| New DEC needed | Finance boundary: where purchase ends and `invoices` / `payments` begin | Three-way match ownership, payment execution |
| New DEC needed | Vendor portal or EDI ordering vs email/manual PO transmission | "PO SENT" mechanics; currently unspecified |

**Release:** R2. **Owner:** unassigned. Not buildable until DEC-003 closes.
