# Decision Closure: DEC-016 and DEC-023

Project: Kapmeta (restaurant POS clone of KapMeta)
Date: 2026-08-21
Source evidence: 86 validated reference screenshots (single outlet "Hotel kapila", R-327038, LAN client-server topology, KapMeta app v126.0.1)

---

## DEC-016 — My-Amount / Grand-Total / Total money-column glossary

### Context and evidence

Three screens in the reference app use three different labels for order-level money values:

- **Order Entry / Billing screen** (artifact-02): a single footer field labeled **"Total"**, shown for an in-progress, not-yet-settled ticket.
- **Order History table** (artifact-05): four separate per-row columns — **"My Amount (₹)"**, **"Tax (₹)"**, **"Discount (₹)"**, and **"Grand Total (₹)"**.
- **Day Summary / Item Report** (artifact-08): a **"Total(₹)"** column per payment-type row in the reporting rollup.

The open question was whether "My Amount" is a pre-tax/pre-discount subtotal, or something unrelated to the bill arithmetic entirely — specifically, whether it represents the merchant's net payout after an aggregator (Swiggy/Zomato) commission deduction, with "Grand Total" being the larger, customer-facing price on the aggregator platform.

### Arithmetic verification

A visible Order History row carried these values:

- My Amount: ₹189.52
- Tax: ₹8.48
- Discount: ₹0.00
- Grand Total: ₹198.00

Check: 189.52 + 8.48 − 0.00 = **198.00**, which equals Grand Total exactly.

This is a closed arithmetic identity, not an approximation. If "My Amount" were a post-commission merchant payout, there would be no reason for it to combine with Tax and Discount to reproduce Grand Total to the paisa — commission deductions are not additive with tax and discount in that way, and a commission-adjusted number would not equal (Grand Total − Tax + Discount) on a coincidence-free basis across a real transaction. The identity confirms a simple billing decomposition:

> My Amount (subtotal) + Tax − Discount = Grand Total

"Total" as shown in the Order Entry footer and in the Day Summary is the same concept as Grand Total — the final, customer-charged amount — just relabeled per screen context (an in-progress ticket total in one case, a payment-type rollup total in the other).

### Resolution

**Settled definitively by the arithmetic:** "My Amount" is the pre-tax, pre-discount **subtotal** of the order (sum of line-item prices before tax and discount are applied). It is not a merchant payout figure and has no relationship to aggregator commission.

Aggregator commission (the cut Swiggy/Zomato retain before remitting to the restaurant) is a **separate, unrepresented concept** in this screen set. None of the 86 screenshots evidence a commission field. If Kapmeta needs to track actual aggregator commission for reconciliation purposes — e.g., to reconcile bank settlement amounts against POS-recorded order values — that requires a distinct future field (e.g., `platform_commission_amount` on `order_payments`, or a dedicated aggregator-settlement table) and must not be confused with, or backed into, the `my_amount` / subtotal figure. This is flagged as a candidate future decision item, not resolved here, and not required for v1.

**Standardization approach:** the underlying data model should use one consistent set of field names regardless of which screen surfaces the value; the screens themselves are free to keep their existing, screen-appropriate UI labels ("My Amount", "Total", "Grand Total") since those labels are drawn directly from the reference app and preserve user familiarity.

### Decision-register entry

```
DEC-016 — My-Amount / Grand-Total / Total money-column glossary
Status: Provisionally Closed (2026-08-21)
Resolution: "My Amount" = pre-tax/pre-discount order subtotal. Verified by
arithmetic identity on Order History row data (189.52 + 8.48 - 0.00 = 198.00,
matching Grand Total exactly). Grand Total = final customer-charged amount
(subtotal + tax - discount). "Total" (Order Entry footer, Day Summary) is the
same concept as Grand Total under a context-appropriate label. Data model
standardizes on subtotal_amount / tax_amount / discount_amount /
grand_total_amount; UI labels remain screen-specific per the reference app.
Aggregator commission is confirmed OUT OF SCOPE of this glossary and, if
needed, is a separate future field (platform_commission_amount) — not to be
conflated with my_amount/subtotal_amount.
```

### Downstream documents requiring updates

- **DB schema draft — `orders` table**: confirm/rename money columns to the standardized names (see Schema Impact below).
- **artifact-02 (Order Entry)**: add a UI-label consistency note — footer "Total" maps to `grand_total_amount` in the data model.
- **artifact-05 (Order History)**: add a UI-label consistency note — "My Amount" maps to `subtotal_amount`, "Grand Total" maps to `grand_total_amount`.
- **artifact-08 (Day Summary / Item Report)**: add a UI-label consistency note — "Total(₹)" per payment-type row maps to a sum of `grand_total_amount` for orders of that payment type.
- **business-logic-rules draft**: record the billing identity (`subtotal_amount + tax_amount - discount_amount = grand_total_amount`) as a validated invariant, and note that commission tracking (if built) is a separate, additive concern applied at the payment/settlement layer, not the order-total layer.

### Schema impact

Confirmed/renamed `orders` table money columns:

| Reference-screen label | Standardized data-model column |
|---|---|
| My Amount (₹) | `subtotal_amount` |
| Tax (₹) | `tax_amount` |
| Discount (₹) | `discount_amount` |
| Grand Total (₹) / Total | `grand_total_amount` |

Invariant to enforce (application-level check or generated column): `subtotal_amount + tax_amount - discount_amount = grand_total_amount`.

---

## DEC-023 — Multi-outlet scope for v1

### Context and evidence

All 86 captured screenshots reflect exactly one outlet, "Hotel kapila" (R-327038). The DB schema draft was already written defensively with `outlet_id` as a foreign key on nearly every table (tables, orders, menu, settings, tax, sync_state — 15+ tables in total). The Restaurant/System Configuration screen's "Machines" panel shows one outlet-server per physical location on a LAN, a topology that is equally consistent with (a) a single-outlet v1, or (b) a multi-outlet-later design where each outlet keeps a local server and syncs to a shared multi-outlet cloud. Phase 2-3 (Architecture + DB) hard-gates schema freeze on this decision.

### Resolution

**Multi-outlet is OUT OF SCOPE for v1 feature-building.** No outlet-switcher UI, no combined/cross-outlet reporting, and no cross-outlet menu sync workflow will be built in the initial release. Every screen and workflow in the validated reference set assumes a single active outlet, and there is no product requirement or captured evidence demanding multi-outlet UX for v1.

**The `outlet_id`-everywhere schema design is CONFIRMED as correct and must be retained exactly as drafted.** This is not merely "no change needed" — it is an explicit affirmative decision that the defensive design was the right call, for the following cost/risk reasons:

- **Add now, unused (chosen path):** carrying an `outlet_id` foreign key on every relevant table in a system that will only ever have one outlet row costs essentially nothing — a single indexed column, populated with the same constant value on every insert, adds negligible storage and no meaningful query overhead. It requires zero additional UI or workflow logic in v1, since the column is simply always the current outlet.
- **Retrofit later, high migration risk (rejected path):** adding `outlet_id` after the fact to 15+ tables that already carry production data would require: schema migrations across every affected table, backfilling a default outlet value on every existing row, adding the column to every insert/update code path retroactively, auditing every existing query for missing outlet-scoping (a correctness and data-leakage risk, not just a schema task), and doing all of this under live-system constraints rather than at initial design time. This is materially more expensive and materially riskier than the near-zero cost of carrying the column from day one.

The asymmetry is decisive: near-zero cost now versus a costly, risky, correctness-sensitive migration later. Keep the schema as drafted.

This decision does not block any engineering work through Phase 15. It does, however, warrant an explicit business/product confirmation before Phase 16 rollout activities begin scaling toward a second physical outlet — that confirmation is a go-to-market/roadmap decision, not an engineering one, and should be revisited with real growth plans in hand rather than assumed.

### Decision-register entry

```
DEC-023 — Multi-outlet scope for v1
Status: Provisionally Closed (2026-08-21)
Resolution: Multi-outlet operation (outlet-switcher UI, combined/cross-outlet
reporting, cross-outlet menu sync) is OUT OF SCOPE for v1 feature-building.
The outlet_id-on-every-table schema design is CONFIRMED CORRECT and retained
unchanged: carrying an always-single-value outlet_id column now is near-zero
cost, whereas retrofitting outlet_id across 15+ tables after production data
exists would be a costly, correctness-risky migration. Does not block
engineering work through Phase 15. Requires an explicit product/business
confirmation on the multi-outlet growth roadmap before Phase 16 rollout
begins scaling to a second outlet — that confirmation is a business
decision, to be revisited separately, not assumed.
```

### Downstream documents requiring updates

- **DB schema draft**: confirm `outlet_id` retained on all currently-drafted tables — **no structural change required**; add a comment/annotation citing this decision as the rationale for keeping it.
- **phase-02-03-architecture-and-db.md**: update the ADR on outlet scope to record this as a closed decision (multi-outlet UI deferred, schema multi-outlet-ready), unblocking the schema-freeze gate.
- **phase-10-11-crm-reporting.md**: update reporting-scope language to explicitly state "single-outlet reports only in v1" — remove any ambiguity that combined/cross-outlet reporting might be in scope.
- **phase-08-09-inventory-finance.md**: same update — explicitly scope finance/inventory reporting language to "single-outlet only in v1."
- **phase-12-16 rollout plan**: add "second outlet onboarding" as an explicit, named early post-v1 milestone rather than leaving multi-outlet expansion implicit or assumed to happen automatically; flag it as gated on the product/business confirmation noted above.

### Schema impact

`outlet_id`-everywhere pattern: **confirmed, no changes needed** — retain the foreign key on all currently-drafted tables (tables, orders, menu, settings, tax, sync_state, and others) exactly as designed.
