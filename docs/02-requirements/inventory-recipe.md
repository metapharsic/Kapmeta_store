# Inventory & Recipe — Functional Spec

**Source:** none · **Coverage:** 0% · **Status:** DRAFT — fully proposed · **Blocks on:** DEC-003

> Nothing in this document comes from a source document. Every rule below is **proposed design** authored to give the module a shape to argue with. The central question — whether stock is maintained manually or deducted automatically from recipes on order activity — is **DEC-003 and is open**. Until DEC-003 closes, do not treat any consumption, shortage, or costing rule here as settled, and do not build against it. Release scope is **R2**, not R1.
>
> Related: [`orders.md`](orders.md), [`kitchen-kot.md`](kitchen-kot.md), [`purchase-vendor.md`](purchase-vendor.md), [`../05-database/schema-reference.md`](../05-database/schema-reference.md), [`../GLOSSARY.md`](../GLOSSARY.md), [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md).

## Non-Negotiables Inherited

Per [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §1, and restated because inventory is where they get violated first:

- `stock_movements` is **append-only and immutable**. There is no update path and no delete path. A mistake is corrected by posting a reversing movement, never by editing the original. This is the mitigation for risk **R-06** (silent stock drift with no reconstructable history).
- `stock_balances` is **derived or trigger-maintained** from `stock_movements`. It is a cache. No API, job, screen, or support script hand-edits a balance. If a balance disagrees with the movement ledger, the ledger is right and the balance is rebuilt.
- All cost and valuation money is `BIGINT` minor units + `currency CHAR(3)`. **Never float.** Unit cost included — a per-gram cost is still an integer in minor units at a defined precision, not a decimal.
- Every table carries `outlet_id`. Stock is outlet-scoped; there is no organization-level pooled balance.
- Every adjustment, wastage, count variance posting and recipe change writes an `audit_logs` row **in the same transaction** as the mutation.

## Concepts

| Term | Meaning |
|------|---------|
| **Ingredient** | A stock-tracked raw material or purchased good. Distinct from a menu **Item** (see [`../GLOSSARY.md`](../GLOSSARY.md)) — an Item is sold, an Ingredient is consumed. |
| **Stock location** | A physical place stock sits inside an outlet: main store, kitchen floor, bar, cold room. Balances are per `(outlet_id, ingredient_id, stock_location_id)`. |
| **Base UOM** | The single unit an ingredient's balances are stored in. Never changes after first movement. |
| **Movement** | One immutable append to `stock_movements`. The only way stock changes. |
| **Recipe** | The bill of materials mapping a sellable item/variant to ingredient quantities. |
| **Prep item / sub-recipe** | An intermediate product that is both produced and consumed (gravy base, dough, marinade). |
| **Yield** | Usable output fraction of an input after prep loss. |
| **Theoretical stock** | What the ledger says you should have. |
| **Physical stock** | What a count says you actually have. |
| **Variance** | Physical − theoretical. Never silently absorbed; always posted as an explicit movement. |

## Ingredient Master

`ingredients` — outlet-scoped master record.

| Field group | Content |
|-------------|---------|
| Identity | `ingredient_code` (unique per outlet), name, category, active flag |
| Measurement | `base_uom`, `purchase_uom`, `recipe_uom`, conversion factors |
| Costing | `last_purchase_price`, `moving_average_cost` — both `BIGINT` minor units per base UOM |
| Control | `is_perishable`, `shelf_life_days`, `reorder_level`, `reorder_qty`, `par_level` |
| Sourcing | preferred vendor (FK to `vendors`), lead time days |
| Tracking | `tracking_mode` — see DEC-003 discussion; per-ingredient override of automation is one proposed option |

### Unit of Measure and Conversions

UOM handling is the single largest source of inventory drift in POS deployments, and it fails quietly: a recipe authored in grams against an ingredient held in kilograms understates consumption by 1000×, and nobody notices until a physical count is 40 kg short with no explanation. This is not a hypothetical — it is the default failure mode. Design accordingly.

Proposed rules:

- Three UOM classes only: **mass** (kg, g), **volume** (L, ml), **count** (each, dozen, piece). Conversion **across classes is forbidden by default** — converting litres of oil to kilograms requires a per-ingredient density factor that must be explicitly configured, and is rejected if absent.
- Each ingredient declares exactly one `base_uom`. All `stock_movements.quantity` rows are stored in base UOM. Purchase UOM and recipe UOM are *input conveniences* converted at write time.
- Conversion factors are stored as integer numerator/denominator pairs, not floats, and applied with integer arithmetic plus a defined rounding rule.
- `base_uom` is **immutable once any movement exists** for the ingredient. Changing it would silently reinterpret history. If it must change, the ingredient is deactivated and a new one created.
- Every movement row persists the source UOM and the factor applied, so a historical quantity can be re-derived and a bad factor can be found rather than guessed at.

| Class | Base UOM (proposed) | Permitted alternates | Cross-class |
|-------|---------------------|----------------------|-------------|
| Mass | g | kg (×1000) | Only via explicit density |
| Volume | ml | L (×1000) | Only via explicit density |
| Count | each | dozen (×12), pack (×n, per ingredient) | Never |

**Open:** whether a fractional base UOM (g/ml) causes unacceptable integer sizes on high-volume outlets, and whether per-ingredient rounding precision needs to be configurable. Unresolved.

## Stock Locations

`stock_locations` — outlet-scoped. Proposed:

- At least one location per outlet, created on outlet setup, flagged `is_default`.
- A movement always names a location. A transfer names two and posts **two rows** (one out, one in) sharing a `transfer_group_id`, in one transaction.
- Negative balances are permitted or blocked per DEC-003 shortage policy (below). Whichever way it lands, the rule is enforced server-side at movement post time, not in the UI.

## Movement Types

All rows land in `stock_movements`. `direction` is derived from type and is not client-supplied.

| Type | Direction | Trigger | Source document | Reversible by |
|------|-----------|---------|-----------------|---------------|
| `RECEIPT` | IN | Goods receipt against a PO | `goods_receipts` / `gr_items` | `RETURN_OUT` |
| `CONSUMPTION` | OUT | Recipe explosion on order activity — **timing is DEC-003** | `orders` / `kot_tickets` | Reversing `CONSUMPTION` on order cancellation |
| `TRANSFER_OUT` | OUT | Stock moved to another location or outlet | transfer record | Paired `TRANSFER_IN` |
| `TRANSFER_IN` | IN | Receiving side of a transfer | transfer record | Paired `TRANSFER_OUT` |
| `WASTAGE` | OUT | Spoilage, spillage, staff error, post-KOT cancellation | `wastage_records` | Reversing entry only, with elevated role |
| `ADJUSTMENT` | IN or OUT | Physical count variance, correction | count session | Further `ADJUSTMENT` |
| `RETURN_OUT` | OUT | Return to vendor | vendor return doc | Reversing entry |
| `PRODUCTION_IN` | IN | Prep item produced from a sub-recipe | prep batch | Reversing entry |
| `PRODUCTION_OUT` | OUT | Ingredients consumed producing a prep item | prep batch | Reversing entry |

Required on every row: `outlet_id`, `ingredient_id`, `stock_location_id`, `movement_type`, `quantity` (base UOM), `unit_cost` (minor units), `reference_type`, `reference_id`, `business_day`, `created_by`, `correlation_id`. `business_day` is the outlet's configured trading day, not calendar date — see [`../GLOSSARY.md`](../GLOSSARY.md).

Movement posting is idempotent on `(reference_type, reference_id, ingredient_id, movement_type)` so a retried event or replayed webhook cannot double-deduct.

## Recipe / BOM Structure

`recipes` (header) + `recipe_items` (lines).

- A recipe attaches to a **menu item or a specific variant**. Half and Full are different recipes, not one recipe scaled by a guess.
- A `recipe_items` line references **either** an ingredient **or** another recipe flagged as a prep item. This is what makes sub-recipes work.
- Lines carry: quantity, UOM, `yield_percent`, optional `is_optional`, optional modifier linkage.
- Recipes are **versioned**. A consumption movement records the `recipe_version_id` it exploded, so costing a six-month-old order does not use today's recipe. Editing a live recipe creates a new version; the old version is retained, never overwritten.

### Sub-Recipes / Prep Items

```
Recipe: Butter Chicken (Full)
  ├─ Chicken thigh        250 g   yield 85%
  ├─ [PREP] Makhani base  180 ml            ← sub-recipe, resolved recursively
  │     ├─ Tomato puree   120 ml  yield 100%
  │     ├─ Butter          30 g   yield 100%
  │     └─ Cream           40 ml  yield 100%
  └─ Coriander              5 g   yield 60%
```

Two proposed resolution modes, and they are **not equivalent**:

| Mode | Behaviour | Consequence |
|------|-----------|-------------|
| **Stocked prep** | Prep item is itself an ingredient with a balance. A prep batch posts `PRODUCTION_OUT` for components and `PRODUCTION_IN` for the batch. Selling the dish deducts the prep item only. | Accurate; needs kitchen to record prep batches. |
| **Exploded prep** | Prep item holds no balance. On sale, the tree is flattened to leaf ingredients. | No kitchen data entry; loses visibility of prep-stage loss and makes batch-level wastage unattributable. |

Recursion depth must be capped (proposed: 5) and a **cycle check is mandatory** at recipe save time — a prep item that transitively contains itself will otherwise hang or explode consumption. Reject at write, not at read.

**Open:** which mode is default, and whether it is per-ingredient configurable. Blocked on DEC-003.

## Consumption Trigger — DEC-003

This is the decision. It is open. The options are not interchangeable and each is wrong in a different way.

| Option | Deduct when | Pros | Cons | Cancellation handling |
|--------|-------------|------|------|----------------------|
| **A — Manual only** | Never automatic; stock changes only via explicit movements | Simplest; no false deductions; no recipe accuracy dependency | No theoretical-vs-physical variance signal; no live stock; food cost is retrospective only | N/A |
| **B — On order confirm** | Order transitions `CONFIRMED` (see [`orders.md`](orders.md)) | Earliest signal; stock reflects committed demand; simple hook | Deducts food that was never cooked if the order is cancelled pre-kitchen; over-reports consumption during high void periods | Reversing `CONSUMPTION` on cancel; **no** wastage |
| **C — On KOT complete** | All `kot_items` for the line reach `DONE` (see [`kitchen-kot.md`](kitchen-kot.md)) | Closest to physical reality — food was actually cooked | Stock lags real-time by prep duration; needs reliable item-level KOT completion, which stations skip under pressure | Post-KOT cancellation posts **`WASTAGE`**, not a reversal — the food exists and is unsellable |
| **D — Periodic / EOD batch** | Scheduled job aggregates the business day's completed orders | Cheapest to run; no hot-path cost; tolerant of intraday chaos | No live stock, so no live low-stock alerting or shortage blocking; a bad recipe is discovered a day late | Handled by whatever the order state is at batch time |

Cross-cutting constraints regardless of option:

- Consumption must be idempotent and individually retryable — it is explicitly listed as event-driven, not part of the order transaction, in [`../ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md) §4.
- Consumption must never block or fail an order. A recipe missing for an item logs an exception and raises an operator alert; it does not reject a sale.
- Items with no recipe are silently non-deducting. That gap must be reported, or theoretical stock quietly becomes fiction.
- Modifiers change consumption (extra cheese, no onion). Whether modifiers carry their own recipe lines is unresolved and is a sub-question of DEC-003.

**No option should be implemented before DEC-003 closes.** They differ in event source, cancellation semantics, and cost model — this is not a config flag that can be flipped later without rework.

## Yield and Wastage

**Yield** is planned loss (trim, peel, evaporation). `consumed = required_qty ÷ yield_percent`. Yield lives on the recipe line, is versioned with the recipe, and is a *plan* — it does not produce its own movement.

**Wastage** is unplanned loss and always produces a `WASTAGE` movement plus a `wastage_records` row. Proposed reason codes: `SPOILAGE`, `SPILLAGE`, `PREP_ERROR`, `CUSTOMER_RETURN`, `POST_KOT_CANCELLATION`, `EXPIRY`, `COUNT_VARIANCE_LOSS`. Reason is mandatory; free text alone is rejected. Wastage above a configurable value threshold requires an approver role. Wastage is valued at moving average cost at post time, stored on the movement so later cost changes do not restate history.

Post-KOT cancellation wastage is the direct link to [`kitchen-kot.md`](kitchen-kot.md) and [`orders.md`](orders.md) and only exists under DEC-003 option C.

## Physical Count / Cycle Count Reconciliation

Full counts freeze an outlet. Cycle counts rotate a subset (proposed: by ABC value class — A weekly, B fortnightly, C monthly) without freezing.

```
Open count session (outlet, location, ingredient scope)
   ↓
Snapshot theoretical qty per line  ← frozen at session open, not read at close
   ↓
Counter enters physical qty (blind — theoretical hidden by default)
   ↓
System computes variance = physical − theoretical
   ↓
   ├─ |variance| ≤ tolerance ──────────→ auto-approve
   └─ |variance| >  tolerance ─────────→ HOLD, require supervisor review
                                            ↓
                                       recount / accept / reject
   ↓
Post session (single transaction):
   • one ADJUSTMENT movement per non-zero variance line
   • wastage_records row where variance is attributed loss
   • audit_logs row for the session and for each override
   ↓
Session CLOSED — immutable. Corrections require a new session.
```

Rules:

- Movements posted between snapshot and close are **not** silently discarded; the session records them and either re-baselines or flags the line. Ignoring in-flight movements is how counts appear to fix drift while creating more.
- Blind counting is the default; showing the counter the expected number produces expected numbers.
- Tolerance is per-ingredient or per-value-band, configurable, defaulting to zero for high-value ingredients.
- A closed session is immutable, consistent with append-only. Nothing about a count is editable after posting.

## Low-Stock Alerting

- Triggered on balance crossing `reorder_level` downward, evaluated at movement post time (options B/C) or on the batch job (option D). Under option A it can only be evaluated on manual movements — a further reason A gives weak operational signal.
- Alert carries: ingredient, location, current balance, reorder level, suggested order qty (`par_level − balance`), preferred vendor, lead time.
- Alerts are **debounced** per `(ingredient, location)` — a hysteresis band prevents an item oscillating around the threshold from alerting on every movement.
- Alerts optionally seed a purchase requisition — see [`purchase-vendor.md`](purchase-vendor.md). Auto-creating a PO from an alert is explicitly **not** proposed; a human approves.
- Expiry alerting for perishables (`shelf_life_days` from receipt date) is proposed but depends on batch/lot tracking, which is not currently in scope and would require a new table.

## Stock Shortage Behaviour

What happens when a sale would drive a balance below zero. **Pending decision**, coupled to DEC-003 — under option A or D there is no live balance to check, so only B and C can enforce anything at sale time.

| Option | Behaviour | Pros | Cons |
|--------|-----------|------|------|
| **Block** | Reject the order line; item forced OFF for the channel | Prevents selling what cannot be made | A single bad recipe or stale count halts revenue. High blast radius from data quality problems. |
| **Alert** | Allow the sale, permit negative balance, raise an operator alert and flag the movement | Never blocks revenue; surfaces the problem | Negative balances accumulate; staff learn to ignore alerts |
| **Substitute** | Consume a configured substitute ingredient | Matches how kitchens actually behave | Needs a substitution table, priority order, and cost impact handling; complex; easy to make costing wrong |

Proposed default if forced to choose today: **Alert**, with Block available per-ingredient for controlled/high-value items only. That is a proposal, not a decision. Selling is never blocked by inventory data in R1 because inventory does not exist in R1.

## Reporting Surface

Proposed, R2: theoretical vs physical variance by ingredient and period; food cost percentage by item and category; wastage by reason and by station; consumption vs sales mix; slow-moving and expiring stock; count accuracy by counter. All read from `stock_movements`, never from a separately maintained aggregate that can diverge.

## Open Decisions

| ID | Question | Blocks |
|----|----------|--------|
| **DEC-003** | Manual stock vs auto-deduct; if auto, which trigger (A/B/C/D) | The entire consumption path, shortage behaviour, live alerting, food costing |
| DEC-003a | Sub-recipe mode: stocked prep vs exploded prep | Prep batch workflow, prep-stage wastage visibility |
| DEC-003b | Do modifiers carry recipe lines | Consumption accuracy |
| DEC-003c | Shortage behaviour: block / alert / substitute | Order placement path in [`orders.md`](orders.md) |
| DEC-001 | Multi-outlet scoping | Inter-outlet transfers |
| DEC-010 | Retention / partitioning | `stock_movements` growth — high-volume append-only table, likely needs monthly partitions |
| New DEC needed | Costing method: moving average vs FIFO vs standard cost | Valuation, food cost reporting, variance value |
| New DEC needed | Batch/lot and expiry tracking in or out of scope | Expiry alerting, recall handling, new tables |

**Release:** R2. **Owner:** unassigned. Nothing here is buildable until DEC-003 closes.
