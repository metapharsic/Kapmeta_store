# Finance & Accounting — Functional Spec

**Source:** none · **Coverage:** 5% · **Status:** DRAFT · **Blocks on:** DEC-004, DEC-005, DEC-010, DEC-011

The source documents mention an invoice being produced and nothing else. **Every business rule in this document is PROPOSED.** No tax rate, no invoice format, no statutory numbering convention, and no retention period has been agreed. Treat this file as a structure to hang decisions on, not as a specification to build from.

Money is `BIGINT` minor units + `currency CHAR(3)`. Everything is outlet-scoped. Invoices, credit notes and ledger entries are append-only; a posted document is corrected by a further document, never by an edit.

## Invoice Generation

Invoice generation is event-driven and idempotent, triggered from order completion (step 11 in [`orders.md`](orders.md)). It runs outside the order transaction and is individually retryable.

```
Order reaches COMPLETED
        ↓
Idempotency check on (outlet_id, order_id)  ── exists → return existing invoice
        ↓
Snapshot pricing: item prices, modifiers, discounts, charges, tax rates
        ↓  (snapshot, not reference — a later menu price change must not alter a past invoice)
Compute tax breakup            ← BLOCKED, DEC-004
        ↓
Reserve invoice number from the outlet's statutory sequence  (gapless)
        ↓
Persist invoices + invoice_items  (append-only)
        ↓
Post ledger_entries              (double-entry, balanced)
        ↓
Render document + audit row (same transaction as the invoice write)
```

Rules:

- The invoice snapshots every price, rate and name. It must be reproducible byte-for-byte years later without reading the current menu.
- Invoice totals must reconstruct exactly from `invoice_items` + charges + tax + rounding. If they do not, the invoice is rejected, not saved-and-corrected.
- One invoice per order. Amendments produce a credit note plus, if needed, a new invoice.

## Invoice Numbering

PROPOSED. Statutory numbering is jurisdiction-specific and is not decided.

| Property | Requirement | Why |
|----------|------------|-----|
| Uniqueness | `UNIQUE (outlet_id, invoice_number)` | Two outlets may legitimately share a numeric value under different prefixes |
| Gapless | No missing numbers within a series | A gap is treated by auditors as a suppressed sale |
| Per outlet | Each outlet has its own series | Outlets are separate statutory filers |
| Monotonic | Strictly increasing within a series | Ordering must be inferable from the number |
| Reset policy | PROPOSED: reset per financial year with a year segment in the prefix | Unagreed |
| Format | PROPOSED: `<outlet_prefix>/<FY>/<zero-padded seq>` | Unagreed |

Implementation constraint that follows from *gapless*: numbers **cannot** come from a PostgreSQL sequence. Sequences leak numbers on rollback. The number is allocated from a per-outlet counter row locked within the invoice transaction, so a rollback releases the number. This is a deliberate throughput trade-off — invoice creation for one outlet serialises. Requires an ADR.

A reserved-but-failed invoice must never leave a hole. If a hole is ever detected, day close blocks.

Credit notes use a **separate** series with the same properties. They never consume invoice numbers.

## Tax Model

**BLOCKED — DEC-004.** Nothing here is decided. The options below exist so the decision can be made explicitly rather than discovered in code.

| Dimension | Option A | Option B | Impact if guessed wrong |
|-----------|----------|----------|------------------------|
| Application level | Line-level (per item/category rate) | Order-level (single rate on subtotal) | Reprinting years of invoices |
| Price interpretation | Tax-inclusive (menu price includes tax) | Tax-exclusive (added at checkout) | Every displayed price and every margin figure |
| Discount interaction | Tax computed after discount | Tax computed before discount | Understated or overstated liability |
| Charges | Service charge taxable | Service charge non-taxable | Direct statutory exposure |
| Rounding | Per line then summed | Summed then rounded once | Cent-level drift across millions of invoices |
| Channel variation | Aggregator orders taxed identically | Aggregator handles some components | Double taxation or none |

Engineering positions (recommendations, not decisions):

- Line-level. Order-level cannot represent mixed-rate carts and cannot be retrofitted.
- Tax rates are versioned rows with validity windows. Recomputing an old invoice with today's rate is a defect.
- The tax breakup is stored on `invoice_items`, not derived at render time. A printed breakup that a report cannot reproduce is worthless.
- Tax logic lives in exactly one module (protocol §4). No report, export or analytics job recomputes tax independently.

Until DEC-004 closes, the invoice tax section cannot be built. Do not ship a placeholder rate.

## Credit Notes

- Every refund produces a credit note. A refund without a credit note leaves the ledger unbalanced and the sales figure overstated.
- Credit notes are append-only, reference the original invoice, carry their own gapless series, and mirror the original invoice's tax treatment — **not** the tax rules in force on the refund date.
- Partial refund → partial credit note, at line-item granularity, matching [`billing-payments.md`](billing-payments.md).
- Sum of credit notes against an invoice may never exceed the invoice total. DB-enforced.
- **Reporting attribution:** the credit note posts against the **original business day** for sales/net-sales purposes, and against its own date for cash-movement purposes. Two dates, deliberately. Any report must state which it uses.

## Day-End Close (Z-Report)

Business day boundary is the outlet's configured `day_start_time` ([`../GLOSSARY.md`](../GLOSSARY.md)), not calendar midnight.

```
Close initiated (manual or scheduled at day_start_time)
        ↓
PRE-CHECKS — all must pass:
   ├─ no open orders in a pre-COMPLETED state
   ├─ no open shifts
   ├─ no payments stuck in INITIATED / REFUND_PENDING
   ├─ every COMPLETED order has an invoice
   └─ no gap in the invoice or credit-note series
        ↓  any failure → close BLOCKED, exception list returned, nothing written
        ↓
Freeze the business day window
        ↓
Aggregate: gross sales, discounts, refunds, tax by rate, net sales,
           tender mix, charges, tips, rounding, cash variance by shift
        ↓
Persist Z-report (immutable, numbered per outlet per business day)
        ↓
Post day-end ledger_entries + audit row
        ↓
Day CLOSED
```

- Close is idempotent. Re-running a closed day returns the existing Z-report; it never regenerates one.
- Close does **not** silently fix problems. A blocked close is the intended outcome of a defect.
- **Restatement:** a late webhook or a refund against a closed day (both expected) invalidates that day's Z-report. It is regenerated as a new version with a restatement reason; the prior version is retained. Z-reports are versioned, never overwritten.
- Tax lines on the Z-report are BLOCKED on DEC-004.

## Settlement Reconciliation

Runs per gateway and per aggregator, against `settlements`. Its **only** output is an exception report. It never writes an adjustment, never marks a payment settled on a guess, and never modifies an order.

| Matched on | Source A | Source B |
|-----------|----------|----------|
| Gateway | `payments.gateway_txn_id` | Gateway settlement file / webhook |
| Aggregator | `orders.channel_order_id` | Aggregator payout statement |

```
Ingest settlement file / payout statement → inbound_events (raw, replayable)
        ↓
Normalise to (external_ref, gross, commission, fee, tax_on_fee, net, date)
        ↓
Match against payments / orders by external ref
        ↓
┌──────────────┬─────────────────────────────────────────────┐
│ MATCHED      │ amounts equal → link settlement, payment → SETTLED │
│ SHORT_PAID   │ net < expected after known commission → EXCEPTION  │
│ OVER_PAID    │ net > expected → EXCEPTION                          │
│ UNMATCHED_EXT│ settlement line with no internal payment → EXCEPTION│
│ UNMATCHED_INT│ captured payment never settled past SLA → EXCEPTION │
│ DUPLICATE    │ external ref already settled → EXCEPTION, no write  │
└──────────────┴─────────────────────────────────────────────┘
        ↓
EXCEPTION REPORT → finance user. Resolution is a human decision that
produces an explicit, audited document (credit note / write-off /
adjustment entry). The reconciler itself writes no money.
```

Commission, gateway fee and tax-on-fee are expenses posted separately. They are never netted into sales — doing so understates gross sales and makes AOV wrong.

Aggregator commission rates are per channel account and versioned. Not decided; blocked on DEC-007 (channel selection) for which channels exist at all.

## Ledger & Export

- `ledger_entries` is double-entry and append-only. Every posting is balanced; an unbalanced posting aborts its transaction.
- Postings originate from: invoice, credit note, payment capture, refund, settlement, commission/fee, cash variance, day-end close.
- Each entry carries `outlet_id`, business day, source document type + id, and correlation id.
- Export to an external accounting system (target system undecided) is a **pull of an immutable, versioned batch**: batches are numbered, re-exportable, and never regenerated with different content. A re-export returns the identical batch.
- Export failure is retryable and idempotent — the accounting system's own idempotency key is the batch number.
- No export job recomputes tax, totals or net sales. It reads posted entries.

Target accounting system, chart-of-accounts mapping, and export cadence: undecided. No DEC exists yet — raise one.

## Retention

**BLOCKED — DEC-010.** Financial records typically carry statutory retention obligations far longer than operational data, and the two must not share a policy.

| Data | Proposed treatment | Status |
|------|-------------------|--------|
| `invoices`, `invoice_items`, credit notes | Retain for the full statutory period; never hard-deleted | BLOCKED — DEC-010 |
| `ledger_entries` | Same as invoices | BLOCKED — DEC-010 |
| `payments`, `refunds`, `settlements` | Same as invoices | BLOCKED — DEC-010 |
| `inbound_events` (payment) | Archive to cold storage after a short window; monthly partitions | BLOCKED — DEC-010 |
| `audit_logs` | Longest of all policies applied | BLOCKED — DEC-010 |
| Customer PII on invoices | Anonymisation vs retention conflicts with statutory retention | BLOCKED — DEC-010, DEC-011 |

Partitioning already assumed by [`../05-database/schema-reference.md`](../05-database/schema-reference.md); the archival trigger point is what DEC-010 must supply.

## Data Touchpoints

`invoices`, `invoice_items`, `payments`, `refunds`, `settlements`, `ledger_entries`, `order_payments`, `order_refunds`, `audit_logs`. Credit-note and Z-report tables do not yet exist in the schema reference and require an ADR.

## Open Decisions

| DEC | Blocks |
|-----|--------|
| DEC-004 | The entire tax model — rates, level, inclusivity, discount interaction, rounding, invoice breakup, Z-report tax lines |
| DEC-005 | Settlement file formats, fee structure, refund semantics feeding the ledger |
| DEC-010 | Retention and archival for all financial records |
| DEC-011 | PII on invoices, access control on financial exports |
| DEC-009 | Whether net sales is tax-inclusive or tax-exclusive |
| DEC-007 | Which aggregators exist, hence which commission models must be reconciled |
| *(none yet)* | Target accounting system and chart-of-accounts mapping — **raise a DEC** |

This module cannot begin implementation beyond table structure and invoice numbering until DEC-004 closes. Numbering, gaplessness, append-only enforcement and the reconciliation exception pipeline are buildable now; nothing that computes a tax figure is.
