# TS-LOGIC — Broken Logic

**ID:** TS-LOGIC · **Status:** DRAFT · **Owner:** Tech Lead + Finance · **Version:** 1.0 · **Updated:** 2026-08-08

The system runs, nothing errors, and the numbers are wrong. The worst category — it is silent, it reaches invoices, and it is usually found by an accountant weeks later.

---

## Diagnostic Order

```
1. Is it wrong, or is it a DIFFERENT DEFINITION?   ← check this first, always
2. Reproduce with one known record
3. Compare stored vs recomputed
4. Find when it started (audit_logs, deploy history)
5. Determine blast radius — how many rows carry the wrong value
6. Fix forward + restate; never silently correct history
```

**Step 1 catches most reports.** "Net sales is wrong" usually means Finance and the dashboard are using different definitions of net sales — which is exactly what DEC-009 exists to prevent. Confirm the formula before debugging the code.

---

## TS-LOGIC-01 — Order Total ≠ Sum Of Items

```sql
SELECT o.id, o.total_minor,
       (SELECT sum(oi.qty * oi.unit_price_minor) FROM order_items oi WHERE oi.order_id = o.id) AS items_sum,
       (SELECT sum(m.price_delta_minor) FROM order_items oi
        JOIN order_item_modifiers m ON m.order_item_id = oi.id WHERE oi.order_id = o.id) AS mods_sum
FROM orders o WHERE o.id = $1;
```

| Gap equals | Cause |
|-----------|-------|
| Modifier total | Modifiers excluded from the total calculation |
| Tax amount | Inclusive/exclusive confusion (DEC-004) |
| Discount | Discount applied to display but not persisted, or vice versa |
| A few paise | **Rounding — see TS-LOGIC-02** |
| Nothing recognizable | Item edited after the total was computed without recomputing |

---

## TS-LOGIC-02 — Rounding Drift

Symptom: totals off by 1-2 paise, inconsistently.

| Cause | Detection | Fix |
|-------|-----------|-----|
| Float anywhere in the money path | `grep -rE "NUMERIC|FLOAT|REAL|DOUBLE|parseFloat"` in pricing/tax code | Integer minor units only |
| Rounding at the wrong step | Per-line vs per-order rounding | One documented rounding point |
| Percentage as a decimal | Tax rate stored as `0.05` not `500` bps | Basis points, integer |
| Division before multiplication | Code review | Multiply first |

`0.1 + 0.2 !== 0.3`. Applied thousands of times a day across a tax calculation, that becomes a filing discrepancy with a real tax authority. This is protocol rule 1 for a reason.

**If float is found in the money path: stop, assess how many invoices are affected, escalate to Finance.** The fix is easy; the restatement is not.

---

## TS-LOGIC-03 — Tax Wrong On Invoice

Blocked context: DEC-004 is open. If tax rules were implemented before that decision closed, the rules are invented and this is expected.

```sql
SELECT ii.description, ii.amount_minor, ii.tax_breakup
FROM invoice_items ii WHERE ii.invoice_id = $1;
```

| Symptom | Check |
|---------|-------|
| Tax on the wrong base | Applied before or after discount? Which is correct is a DEC-004 answer |
| Wrong rate | `tax_rules.effective_from` — did a rate change mid-period? |
| Tax on a tax-exempt item | Item's HSN/category mapping |
| Inclusive shown as exclusive | Display vs storage convention |
| Two invoices, same order, different tax | Rule changed between generation attempts |

Invoices are immutable statutory documents. A wrong invoice is corrected by a **credit note plus a new invoice**, never by editing the original.

---

## TS-LOGIC-04 — Report Disagrees With Z-Report

The most common false alarm. Work through in order:

| Check | Wrong version | Right version |
|-------|--------------|---------------|
| Date basis | `created_at::date` | `business_date` via `fn_business_date` |
| Timezone | UTC displayed raw | Outlet timezone |
| Order states counted | All orders | Only qualifying states (DEC-009) |
| Refund attribution | Refund date | **Original** business day |
| Cancelled orders | Included | Excluded |
| Tax treatment | Gross vs net inconsistent | Per DEC-009 |
| Data source | Live `orders` table | Summary table |
| Replica lag | Stale replica read | Check `pg_stat_replication` |

Two of these — business day and refund attribution — account for most reported discrepancies. Both are deliberate design, and both look like bugs to anyone who has not read `REQ-RPT`.

---

## TS-LOGIC-05 — Stock Balance Drift

```sql
SELECT sb.qty AS balance,
       (SELECT sum(sm.qty) FROM stock_movements sm
        WHERE sm.ingredient_id = sb.ingredient_id AND sm.location_id = sb.location_id) AS movements_sum
FROM stock_balances sb
WHERE sb.ingredient_id = $1;
```

Balance must equal the sum of movements. Always. If it does not:

| Cause | Fix |
|-------|-----|
| `trg_stock_balance` failed or disabled | Re-derive balances from movements — movements are the truth |
| Direct UPDATE on `stock_balances` | **Protocol violation.** Find and remove that code path. |
| UOM conversion error | kg/g or L/ml mismatch in a recipe |
| Recipe yield not accounted | Yield vs wastage handling |
| Consumption double-fired | Non-idempotent event consumer |

Movements are append-only and authoritative. Balances are derived. A drift means something wrote a balance directly — that is the bug, not the number.

---

## TS-LOGIC-06 — Duplicate Records

| Duplicate | Guard that should have prevented it |
|-----------|-------------------------------------|
| Order from a channel | `uq_inbound_events_external` |
| Payment | `uq_payments_gateway_txn` |
| Invoice number | `uq_invoices_outlet_number` |
| KOT ticket | Application logic + reprint (not re-create) |
| Stock movement | `source_event_id` idempotency |

**If a duplicate exists, the unique constraint is missing, dropped, or was never added.** Application-level deduplication loses races under concurrent delivery — the database constraint is the actual guarantee. Verify the constraint exists before hunting through application code.

```sql
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'payments'::regclass;
```

---

## TS-LOGIC-07 — Permission Behaving Unexpectedly

| Symptom | Likely truth |
|---------|-------------|
| User can do something they should not | Server-side check missing — **security defect, S1** |
| User cannot do something they should | Role grant, not a bug |
| UI shows a button that then 403s | UI/permission map out of sync — cosmetic, but confusing |
| Works for one outlet, not another | Outlet-scoped grant. Working as designed. |

A UI-only permission check that hides a button is cosmetic. If the server allows the action, the button being hidden proves nothing (protocol rule 3).

---

## After Fixing

1. **Quantify the blast radius.** How many rows carry the wrong value?
2. **Restate, do not silently correct.** Historical financial data changing without a record is worse than the original error.
3. **Add a regression test** with the exact failing input.
4. **Add the case to this file.**
5. If invoices or tax were affected → Finance decides the restatement approach, not engineering.
