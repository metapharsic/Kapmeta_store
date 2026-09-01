# Plan — Seat-Level Table Division & Hardened Table Merging

**Status:** PROPOSAL — not implemented
**Authored by:** multi-agent survey (agent-a2a, agent-database, agent-backend, agent-frontend, agent-qa)
**Date:** 2026-09-01
**Gate:** CP-10 (proposed)
**Related:** `docs/02-requirements/artifact-01-table-floor-view.md`, `agents/a2a-agent.md`

---

## 0. Scope

Two capabilities, one shared substrate:

- **A. Chair/seat-level division** — a table is divisible into seats; items, KOTs, bills and payments carry a seat identity; a bill can be split and settled per seat with its own invoice.
- **B. Hardened merging** — merging tables becomes an atomic, auditable, reversible, concurrency-safe operation that preserves money and seat identity.

These are coupled and must ship together: **merging two tables today destroys seat identity** (two "seat 1" rows collapse into one bill bucket). Building seats without fixing merge produces a system that mis-bills the moment two tables join.

---

## 1. Current state — what exists

| Concern | Today |
|---|---|
| Table | `DiningTable` (`kapmeta/schema.prisma:182`): `capacity Int @default(4)`, `section String`, `status String` (only `VACANT`/`OCCUPIED` used), `mergeGroupId String?`, `mergePrimaryTableId String?` |
| Area/zone | No `Area` model. Denormalized `section` string. |
| Seat | `OrderItem.seatNumber Int?` (`:297`) and `Payment.seatNumber Int?` (`:454`). No entity, no FK, no validation. |
| Covers / pax | **Nowhere.** Only in the orphaned `table_sessions.covers` from dead migration `0004`. |
| Merge group | Two loose columns. No owning row, no history, no audit, no FK. |
| Merge logic | `apps/api/src/orchestration/table-merge.ts` (332 L, 11 exported fns) |
| Merge API | `POST /tables/merge` (`tables.ts:1243`), `POST /tables/unmerge` (`:1245`), `POST /tables/transfer` (`:780`) |
| Seat API | `GET /orders/:id/bill/by-seat` (`orders.ts:853`) — read-only reporting, nothing consumes it |
| Seat UI | POS terminal: **none**. Captain tablet (`pages/waiter.tsx`): partial |
| Tests | `table-merge.ts`: **zero**. One shallow E2E asserting `length === 2`. |

---

## 2. Defects to fix (pre-requisite, ship as its own PR)

These are live bugs, independent of the new features. **Do these first.**

| # | Defect | Location | Impact |
|---|---|---|---|
| D1 | Merge does not move `Payment` rows; they orphan on the CANCELLED donor order | `table-merge.ts:208-215` | Cash reconciliation breaks. Survivor `dueMinor` overstated. |
| D2 | Merge not atomic — `applyMergeGroup` + label stamp run after the transaction commits | `tables.ts:1176-1187` | Crash leaves money folded but tables unmerged |
| D3 | Split-bill floors the remainder | `BillSplitModal.tsx:26` | Paise lost per split. Correct algorithm already exists in `tests/unit/tax-engine.test.ts:47-64` |
| D4 | KOT partial-transfer tax split truncates in BigInt | `tables.ts:848-851` | source tax + target tax ≠ original |
| D5 | `resolveAnchorTable` implicitly CREATES a table on unknown id | `table-merge.ts:136-160` | Typo'd id spawns junk tables on live floor |
| D6 | Hardcoded demo alias `tbl-07 ⇄ B1` in production path | `table-merge.ts:124,138` | Violates the no-hardcode invariant |
| D7 | `dissolvePaidEmptyMergeGroups` mutates state inside `GET /tables` | `tables.ts:113` | N+1 on hottest poll; GET races the merge POST |
| D8 | Debug beacons `fetch("http://127.0.0.1:7323/ingest/…")` in prod paths | `tables.ts:117,253,991,1083,1113,1167`; `order-lifecycle.ts:56,89` | Fire on every merge/transfer/list |
| D9 | Unmerge has no transaction, no audit log, no live-state guard | `tables.ts:1245-1310` | Unlogged financial-adjacent action; satellites forced VACANT with live KOTs |
| D10 | `POST /tables/merge` has no `requirePermission` (peers have `settings.manage`) | `tables.ts:1243` | Spec `artifact-01:359` requires manager escalation |
| D11 | WS `broadcast` is global — no `outletId` scoping, `/ws` handshake unauthenticated | `apps/api/src/websockets.ts` | Multi-outlet floor-state cross-leak |

---

## 3. Target data model

All new tables carry `outlet_id UUID NOT NULL` (FK → `outlets`, indexed). All money `BigInt` minor units. Prisma camelCase ↔ `@map("snake_case")`.

### New enums
```
enum dining_table_status { VACANT SEATED OCCUPIED RESERVED MERGED_MEMBER DIRTY BLOCKED }
enum table_merge_status  { ACTIVE CLOSED }
enum seat_status         { EMPTY SEATED ORDERED BILLED SETTLED }
```
`DiningTable.status` moves from `String` to the enum (backfill migration). This also closes the missing "seated but not yet ordered" micro-state flagged at `artifact-01:401`.

### New models

**`TableMergeGroup`** → `table_merge_groups`
`id, outletId, primaryTableId (FK DiningTable), status table_merge_status @default(ACTIVE), totalCapacity Int?, covers Int?, openedAt, closedAt?, createdBy?, reason String?`
Partial unique `(outlet_id, primary_table_id) WHERE status='ACTIVE'`.

**`TableMergeMember`** → `table_merge_members`
`id, outletId, mergeGroupId (FK cascade), diningTableId (FK), isPrimary Boolean, joinedAt, leftAt DateTime?`
Partial unique `(dining_table_id) WHERE left_at IS NULL` — a table is in at most one active merge.
**This gives unmerge history for free** and satisfies the spec's `merged_out` retention requirement (`artifact-01:135`).

**`TableSeat`** → `table_seats`
`id, outletId, diningTableId (FK), seatNumber Int, label String?, status seat_status @default(EMPTY), guestName String?`
Unique `(outlet_id, dining_table_id, seat_number)`. Seeded from `DiningTable.capacity` — **via a seed/CRUD path, not literals** (no-hardcode invariant).

**`OrderSeatBill`** → `order_seat_bills`
`id, outletId, orderId (FK), seatNumber Int, splitGroupId Uuid?, subtotal, discountTotal, taxTotal, serviceChargeTotal, tipTotal, grandTotal, paidTotal (all BigInt), status, settledAt?`
Unique `(outlet_id, order_id, seat_number)`. **This is the gap that makes per-seat settlement auditable instead of recomputed on every read.**

**`OrderItemSeatShare`** → `order_item_seat_shares` (phase 3, shared items)
`id, outletId, orderItemId (FK), seatNumber, shareNumerator, shareDenominator, allocatedSubtotal BigInt`
Represents "one naan split three ways" without fractional quantities.

### Field additions
- `DiningTable`: `version Int @default(1)` (optimistic lock), `covers Int?`
- `Order`: `mergeGroupId Uuid?`, `covers Int?`, `splitMode String?` (`NONE|BY_SEAT|BY_ITEM|EQUAL`), `mergedIntoOrderId String?`
- `Order.status`: add `MERGED` — donors must stop being `CANCELLED` (they currently pollute void reports)
- `OrderItem`: `seatId Uuid?` (FK TableSeat), `splitGroupId Uuid?`, `isShared Boolean @default(false)`, `originTableId String?` (enables un-fold)
- `KOTItem`: `outletId Uuid` (**missing tenant scope today — invariant violation**), `seatNumber Int?`, `seatId Uuid?`
- `Payment`: `seatId Uuid?`, `orderSeatBillId Uuid?`; type `id/outletId/orderId` as `@db.Uuid`
- `Invoice`: unique moves from `(orderId)` to `(orderId, seatNumber)` — required for per-seat GST invoices

### Migrations
`0025_dining_table_status_enum` · `0026_table_merge_groups_and_members` (backfill from existing `merge_group_id`) · `0027_table_seats` (backfill from `capacity`) · `0028_order_item_seat_fk_split_group` · `0029_order_seat_bills` · `0030_kot_items_outlet_and_seat` · `0031_invoice_per_seat_unique`
Each needs a `+migrate Down` and outlet-scoped indexes matching the `idx_*_outlet` convention.

**Also decide:** drop the dead `restaurant_tables` / `table_sessions` lineage (migration `0004`), or promote its `covers`/session lifecycle. Right now it is dead weight that confuses the merge story.

---

## 4. Target API surface

### Merge — safe
| Method | Path | Notes |
|---|---|---|
| `POST` | `/tables/merge/preview` **(new)** | `{sourceTableIds, targetTableId}` → `{blockers[], resultingLabel, resultingCapacity, ordersToFold, totalDueMinor}`. Captain sees conflicts before committing. |
| `POST` | `/tables/merge` **(changed)** | + `expectedVersions: Record<tableId,number>`, `idempotencyKey`, `reason`. Returns `{mergeGroupId, survivorOrderId, foldedOrders[], version}`. `409 MERGE_CONFLICT` on stale version; `409 BILL_PRINTED` if a member has a printed/part-paid bill. Add `requirePermission`. |
| `POST` | `/tables/unmerge` **(changed)** | + `mode: "DISSOLVE"\|"DETACH"`, `unfold?: boolean`, `idempotencyKey`. `unfold` reverses the fold via `mergedIntoOrderId` + `OrderItem.originTableId`. |
| `GET` | `/tables/merge-groups` **(new)** | Replaces the mutating `dissolvePaidEmptyMergeGroups` call inside `GET /tables` (fixes D7). |

### Seat / chair
| Method | Path | Notes |
|---|---|---|
| `GET` | `/tables/:id/seats` **(new)** | per-seat `{occupied, itemCount, subtotalMinor, paidMinor, dueMinor}` |
| `PATCH` | `/orders/:id/items/:itemId/seat` **(new)** | assign/clear a line's seat |
| `POST` | `/orders/:id/seats/reassign` **(new)** | bulk renumber — **required after a merge** to resolve seat collisions |
| `POST` | `/orders/:id/split` **(new)** | `{mode:"SEAT"\|"ITEM"\|"EQUAL", seats?, itemIds?, parts?, targetTableId?}` → creates real child orders so each can be invoiced |
| `GET` | `/orders/:id/bill/by-seat` **(changed)** | + `taxMinor, serviceChargeMinor, dueMinor, grandTotalMinor` per seat; `?allocation=EVEN\|PROPORTIONAL` for the unassigned bucket |
| `POST` | `/orders/:id/seats/:seatNumber/settle` **(new)** | per-seat invoice. Requires relaxing one-invoice-per-order at `settle-order.ts:250`. |
| `POST` | `/tables/transfer` **(changed)** | + `transferMode:"SEAT"`, `seatNumbers[]` — the "guest moved to the other table" case, impossible today |

---

## 5. Target UI (POS terminal)

- **Seat-aware cart.** Seat selector strip above the cart (`Seat 1..N / Unassigned`); punching while a seat is active tags the line; each row gets an editable seat chip; group-by-seat with per-seat subtotals. `CartItem` (`PosBillingView.tsx:80`) gains a seat field and actually sends it (`:522,:619` currently drop it).
- **Seat markers on floor cards.** Render chair markers around the table card perimeter from `capacity`, colored by `seat_status`. Card shows `3/4` occupancy.
- **Covers gate.** Tapping a VACANT table interposes a "Guests" numpad sheet, driven by the outlet's "No. of Persons Mandatory" setting. Persist to `Order.covers` / `DiningTable.covers` — the CHANGELOG already claims a `[−] 2 Pax [+]` stepper that has nowhere to write.
- **Real split-bill.** Rewrite `BillSplitModal` as a two-pane allocator: unallocated lines ← → payer/seat columns auto-seeded from seat tags, per-column running total, split-a-quantity control, per-column Print/Settle wired to the seat-scoped `recordPayment`. Fix the contract mismatch at `PosBillingView.tsx:1263` (modal passes an object, handler reads `.length`, alert always says "undefined parts") and the confirm handler that currently does nothing but `alert()`.
- **Unified transfer sheet.** Collapse "🔀 Merge Tables" and "Move KOT / Items" into one drawer with scopes Whole-table / KOT / Items / **Seat**, legal-target filtering, a preview, and a confirm step. Today these are two mental models for one operator intent (`MoveKotModal.tsx:98` says "Move Entire Table (Merge / Switch)" while a separate button does the real merge).
- **Merge cluster + unmerge.** Draw merged tables as one outlined cluster with one shared total; child cards get a `→ T5` chip and route taps to the primary (`waiter.tsx:904` already does this correctly; the POS floor does not). Add an Unmerge action in the inspect modal with per-table detach.
- **Assign-to picker.** Replace the hardcoded `const [waiterName] = useState("Captain 1")` (`PosBillingView.tsx:79`) with a staff-list dropdown + captain badge on floor cards + a "My tables" filter.
- **Live-state hygiene.** Drop the blind 10s poll (`TableViewFloor.tsx:147`) to a long safety interval, apply WS payloads as targeted per-table patches instead of full refetch, coalesce bursts, add a Live/Reconnecting indicator, replace `alert()` paths with the inline banner.

---

## 6. A2A registration (full sync with the app)

Per `agents/a2a-agent.md` §2 and the resolver loop:

1. **Registry** — `agents/AGENT_REGISTRY.json`: append the new paths to `agent-database` (`table_seats`, `table_merge_groups` migrations), `agent-backend` (`orchestration/table-merge.ts`, `orchestration/table-split.ts`, `routes/tables.ts`), `agent-frontend` (`components/SeatStrip.tsx`, `BillSplitModal.tsx`, `TableViewFloor.tsx`). Bump `version` + `lastSync` (currently stale at `2026-08-14`).
2. **Task board** — `agents/task-board.json`: add `TSK-007 Seat-Level Division & Merge Hardening`, `assignedTo: agent-backend`, `relatedGate: CP-10`. Mirror into `agents/STATUS.md` (18 days stale, and no table/seat task exists on the board today).
3. **Telemetry** — extend the enrichment switch in `apps/api/src/routes/admin.ts:~124` with `activeMergeGroups` and `seatedCovers` metrics. Add a `CHECK` constraint on `agent_telemetry.status` and reconcile the `READY` (registry) vs `ONLINE` (table) vocabularies. Wire `scripts/provision-agent-telemetry.ts` into `npm run db:migrate` — it is currently in no script.
4. **Events** — new topics, `<domain>.<past_tense>`:
   `table.seat_assigned` · `table.seat_cleared` · `table.merged` (payload + `mergeGroupId`, `memberIds`) · `table.unmerged` (**must now fire from the manual unmerge path — today it only fires from settlement**) · `order.split_created` · `order.seat_settled`
   Anything money-touching goes through `enqueueOutbox()` inside the same transaction (pattern at `settle-order.ts:42`), not fire-and-forget `broadcast()`. Every payload carries `outletId`.
5. **Client subscription** — add every new topic to `FLOOR_EVENT_TOPICS` in `apps/pos-web/lib/useKapmetaSocket.ts`, **otherwise it is silently dropped** (hardcoded allowlist = guaranteed drift point).
6. **Docs + gate** — record in `brain/API_AND_EVENTS_CATALOG.md` + `brain/WIRING_GUIDE.md`, then `npm run test:unit` → `npm run status` → `npm run checkpoint:update CP-10 PASSED`.

---

## 7. Verification plan

**Blocking pre-req:** decide the code home. Either delete `services/tables/*` per `CHECKPOINT.md`, or port `orchestration/table-merge.ts` into it. Do not add seat logic to both. **The surviving one must be the one under test** — today the tested code is not the shipped code.

- **Unit** — `table-merge.ts`, every exported function (currently zero coverage). Critically: `foldOrdersInto` must assert **money conservation in BigInt** — `sum(donor subtotal+tax+discount+serviceCharge+payments) === survivor totals`, no `Number` coercion anywhere. `dissolve*` idempotent on second call.
- **Integration** (real transactional DB) — merge with a partial payment → assert the chosen policy (this closes the open decision at `artifact-01:404`); merge where target already has a live order; merge of a vacant table → 400; **cross-outlet negative test** (sources from another `outletId` must fail); **audit row written in the same transaction**, and rolled back with the merge; **concurrency** — two parallel merges naming the same source, exactly one succeeds.
- **Seat** — per-seat sums + unassigned bucket must equal `order.grandTotal` to the paise including tax and service-charge apportionment (replaces the `length === 2` assertion at `tests/e2e/13-captain-tablet-operations.spec.ts:75`). Seat-count vs `capacity` validation. **Seat collision across a merged group** — the core new failure mode. Item move between seats must not re-fire KOT (`artifact-01:288`).
- **Frontend** — `TableViewFloor` merge-mode state machine incl. cancel mid-selection and error path. `BillSplitModal` regression: remainders distributed, not floored.
- **E2E** — new `14-table-seat-merge-split.spec.ts` against the **real API**, not `tests/e2e/fixtures/mock-pos-server.ts`: merge two occupied tables → combined total equals sum of priors and absorbed table clears → split back → assert the reverse.
- **No-hardcode compliance** — seat maps and table numbers come from seed/CRUD, never literals. Add a test asserting this.

---

## 8. Sequencing

| Phase | Content | Gate |
|---|---|---|
| **P0** | Defects D1–D11. Payment-fold fix + full transaction + split remainder. No new features. | must ship alone |
| **P1** | Code-home decision; `table-merge.ts` unit + integration tests written **against current behaviour** to lock it before refactor | CP-10a |
| **P2** | Schema: enums, `TableMergeGroup`/`Member`, `version`, `Order.MERGED`, `originTableId`. Merge API v2 (preview, idempotency, optimistic lock, unfold, audit-in-txn). | CP-10b |
| **P3** | Schema: `TableSeat`, `covers`, `OrderItem.seatId`, `KOTItem.outletId+seat`. Seat APIs. Seat-aware cart + seat markers + covers gate. | CP-10c |
| **P4** | `OrderSeatBill`, per-seat invoice, real split allocator UI, `transferMode:"SEAT"`. | CP-10d |
| **P5** | `OrderItemSeatShare` (shared items), positional floor canvas, reservations. | future |

**P0 is not optional and must not be bundled.** It is a cash-reconciliation fix.

---

## 9. ADDENDUM — Full-CRUD Audit (Menu Management + All Other Admin Tabs)

**Status:** PROPOSAL — not implemented
**Added:** 2026-09-01 (second multi-agent survey pass: agent-frontend, agent-qa, agent-backend)
**Trigger:** user report — "menu management is hardcoded, unable to update/edit/delete/append" + same pattern suspected across other tabs.

### 9.1 Verdict

Confirmed. **Every admin/config tab except `user-management.tsx` is missing at least one of Update/Delete.** Most are Create+Read only — data goes in, never comes back out or changes. Two whole domains (Tax master, Print/Billing settings) have **fully-built backend CRUD services that are never wired into the API router** — the code exists, the door to it does not.

`user-management.tsx` is the one page that does it right (User/Role/Permission: full C-R-U-D, consistently permission-gated). It is the reference pattern every other tab should be brought up to.

### 9.2 Menu Management — detail

| Concept | C | R | U | D | Notes |
|---|---|---|---|---|---|
| Category | ✅ `POST /menu/categories` | ✅ `GET /menu/categories` | ❌ | ❌ | No rename/reorder/deactivate anywhere |
| Item | ✅ `POST /menu/items` + CSV bulk-upload | ✅ `GET /menu/items` | ❌ | ❌ | Items table (`menu.tsx:414-436`) is fully read-only — no row actions at all |
| Variation/Size | ❌ | ❌ | ❌ | ❌ | No schema model. Only client-side portion multipliers hardcoded in `MenuCustomizerModal.tsx:34` (HALF=0.65, FULL=1.4) |
| Addon/Modifier Group | ✅ `POST /menu/modifier-groups` | ❌ **no list endpoint at all** | ❌ | ❌ | Created groups are invisible — write-only into a void |
| Addon Item | ⚠️ `POST /menu/modifier-options` **is broken** — targets `prisma.modifier_options` which doesn't exist in schema (only unrelated `modifiers` model). Will throw at runtime. | ❌ | ❌ | ❌ | Real bug, not just a gap |
| Item↔Modifier link | ✅ `POST /menu/items/:id/modifiers/:groupId` | ❌ | ❌ | ❌ (no unlink) | No UI at all |
| Item 86/availability | ✅ | ✅ | ✅ `PATCH /menu/items/:id/availability` — **backend fully solid, version-locked, audited** | n/a | Menu Management console has **no toggle wired to it** — quick win, plumbing already exists |
| Item image | ❌ | ❌ | ❌ | ❌ | No field on schema, no upload UI |
| Price by channel | ❌ | ❌ | ❌ | ❌ | Single `price` field only |

**Hardcoded catalog literals** (menu.tsx itself is clean — the leak is elsewhere):
- `apps/pos-web/pages/waiter.tsx:261-421` — `DEFAULT_WAITER_MENU_ITEMS`, ~160 hardcoded items (names/prices/categories/emoji) used as the captain tablet's *initial state*. **Menu edits made in the console will not reach the captain tablet** until a live fetch happens to overwrite it.
- `apps/pos-web/components/menu/MenuCustomizerModal.tsx:38-44` — hardcoded 5-item addon list shown for *every* item regardless of what's actually configured.

### 9.3 Every other tab — ranked worst to best

| Rank | Page | Worst gap |
|---|---|---|
| 1 | `crm.tsx` | Customer: C+R only. No edit typo'd phone/name, no delete. Only `POST /crm/customers/:id/anonymize` exists (GDPR wipe, not a real edit). |
| 2 | `inventory.tsx` | Vendors, Recipes(BOM), Purchase Orders: all create-once, list-forever. Ingredient PATCH exists but only for stock-adjust, not editing name/unit/reorder-level. No PO cancel — a "Cancel" button just closes the modal. |
| 3 | `marketing.tsx` | Campaign: C+R only. Once queued, **cannot be paused, edited, or deleted** — a bad campaign runs to completion with no kill switch. |
| 4 | Tax master (backend-only, no page) | `services/tax/src/TaxRepository.ts` has full CRUD (create/update/delete/list) **fully built and never imported by any route file**. Zero HTTP surface. Tax slabs are unreachable from any admin UI. |
| 5 | Print/Billing settings (backend-only, no page) | Same pattern: `services/settings` has `updatePrintSettings`/`updateBillingSettings`, `services/printing` has render logic — neither wired into `apps/api/src/routes`. KOT/bill formatting is unconfigurable. |
| 6 | Special notes | Doesn't exist anywhere — no route, no service, no schema. (Reference product has this as a preset-message master, per earlier PetPooja screenshot survey.) |
| 7 | Areas/sections | Not a real entity — `GET /tables/sections` is a `SELECT DISTINCT` over `tables.section` with a **hardcoded fallback**: `tables.ts:641` literally returns `"AC Dining", "Main Hall", "Outdoor Garden", "First Floor"` when no section data exists. No create/rename/delete. |
| 8 | `integrations.tsx`/`channel-availability.tsx` | Otherwise solid — only gap is no `DELETE` for a stale channel-item mapping. |
| 9 | `finance.tsx` | Append-only ledger/reports — **by design**, not a defect. No action needed. |
| — | `user-management.tsx` | ✅ Full CRUD, consistently permission-gated. **Reference implementation.** |
| — | `admin.tsx` | Read-only dashboards by design. Out of CRUD scope. |

**Permission-gate defects found alongside** (mutating endpoints with no `requirePermission`):
- `POST/PATCH /settings/outlet-status`, `/settings/store-status` (`settings.ts:71-74`) — **any authenticated user, any role, can flip the outlet online/offline.**
- `POST /tables` (create) and `PATCH /tables/:id/status` (`tables.ts:563,1315,1377`) — only `requireAuth`, inconsistent with the PUT/DELETE on the same resource which *do* require `settings.manage`.
- `/user-management` quick-links sub-resource (382, 403, 439) — `requireAuth` only, unlike the rest of that file.

### 9.4 Proposed endpoint additions

**Menu — fill the U/D and fix the break:**
`PATCH /menu/items/:id` · `DELETE /menu/items/:id` · `PATCH /menu/categories/:id` · `DELETE /menu/categories/:id` · `GET /menu/modifier-groups` (list — currently missing entirely) · `PATCH/DELETE /menu/modifier-groups/:id` · `DELETE /menu/items/:id/modifiers/:groupId` (unlink) · **fix** `POST /menu/modifier-options` to target a real schema model (add `ModifierOption` to `kapmeta/schema.prisma`, it does not exist today).

**Tax master — wire the existing service in, don't rebuild it:**
`GET/POST /settings/taxes` · `PATCH/DELETE /settings/taxes/:id` · `GET/POST/PATCH /settings/taxes/channel-rules` — all thin wrappers over the already-built `TaxRepository`.

**Print/Billing settings — same, wire don't rebuild:**
`GET/PUT /settings/print` · `GET/PUT /settings/billing` · optional `POST /settings/print/test-print`.

**Special notes (new):**
`GET/POST /special-notes` · `PATCH/DELETE /special-notes/:id`.

**Areas/sections (promote from derived string to real entity):**
`POST /tables/sections` · `PATCH/DELETE /tables/sections/:id` (keep existing `GET`).

**Customers:**
`PATCH /customers/:id` · `DELETE /customers/:id` (hard-delete, complementing the existing anonymize).

**Inventory:**
`PATCH/DELETE /vendors/:id` · `PATCH/DELETE /recipes/:id` · `PATCH /purchase-orders/:id` (edit draft) · `POST /purchase-orders/:id/cancel`.

**Marketing:**
`PATCH /campaigns/:id` · `DELETE /campaigns/:id` · `POST /campaigns/:id/pause`.

**Channel mappings:**
`DELETE /integrations/mappings/:mappingId`.

**Permission fixes (no new endpoint, add the gate):**
`requirePermission("settings.manage")` on outlet-status/store-status toggles and table create/status-patch.

### 9.5 Multi-agent execution wiring (A2A — same registration pattern as §6)

Full-CRUD is a **cross-cutting** change touching every domain agent, so each domain's CRUD fill-in is registered as its own sub-task under one umbrella gate, not one giant task:

| Sub-task | Owner agent | Registry files to extend |
|---|---|---|
| `TSK-008a` Menu CRUD completion + modifier-options schema fix | `agent-backend` + `agent-database` | `apps/api/src/routes/menu.ts`, `kapmeta/schema.prisma` (ModifierOption model), `services/menu/src/menu-catalog-repository.ts` |
| `TSK-008b` Wire Tax service into API | `agent-backend` | `apps/api/src/routes/settings.ts` (or new `taxes.ts`), `services/tax/src/TaxRepository.ts` (no changes needed, just import) |
| `TSK-008c` Wire Print/Billing settings into API | `agent-backend` | new route file, `services/settings/src/SettingsRepository.ts`, `services/printing/src/PrintingService.ts` |
| `TSK-008d` Special notes (new feature) | `agent-database` + `agent-backend` | new migration, new route file |
| `TSK-008e` Areas/sections → real entity | `agent-database` + `agent-backend` | migration promoting `section` string to a table, `tables.ts:641` fallback removed |
| `TSK-008f` Customers, Inventory, Marketing, Integrations CRUD fill-in | `agent-backend` | `crm.ts`, `inventory.ts`, `marketing.ts`, `integration.ts` |
| `TSK-008g` Menu Management UI: Edit/Delete rows, 86-toggle wiring, modifier UI | `agent-frontend` | `apps/pos-web/pages/menu.tsx`, new modifier-group UI |
| `TSK-008h` All-tabs UI: Edit/Delete controls for CRM, Inventory, Marketing, Integrations | `agent-frontend` | `crm.tsx`, `inventory.tsx`, `marketing.tsx`, `integrations.tsx` |
| `TSK-008i` Fix `waiter.tsx` hardcoded catalog + `MenuCustomizerModal` hardcoded addons | `agent-frontend` | `apps/pos-web/pages/waiter.tsx`, `apps/pos-web/components/menu/MenuCustomizerModal.tsx` |
| `TSK-008j` Permission-gate fixes (outlet-status, table create/status, quick-links) | `agent-backend` | `settings.ts`, `tables.ts`, `user-management.ts` |

Gate: **CP-11** ("Full CRUD Parity — All Admin Tabs"), umbrella over TSK-008a..j in `agents/task-board.json`. Each sub-task closes independently via the resolver loop (`brain/MULTI_AGENT_RESOLVER.md`): fix → `npm run test:unit` → `npm run status` → mark sub-task COMPLETED. Gate CP-11 flips PASSED only when all ten are COMPLETED.

**Events to add** (so a CRUD change reflects live, per §6 sync rules): `menu.item_updated`, `menu.item_deleted`, `menu.category_updated/_deleted`, `menu.modifier_group_created/_updated/_deleted`, `settings.tax_updated`, `settings.print_updated`, `crm.customer_updated/_deleted`, `inventory.vendor_updated`, `inventory.recipe_updated`, `marketing.campaign_updated/_paused`. Every one added to `FLOOR_EVENT_TOPICS` in `useKapmetaSocket.ts` per the existing drift-trap rule (§6.5) — a topic not added there is silently dropped.

### 9.6 Sequencing addendum

| Phase | Content |
|---|---|
| **P0'** | Fix the broken `POST /menu/modifier-options` (references a non-existent Prisma model — this throws in production today, not just "missing feature"). Add the three missing permission gates (§9.3). Ship alongside P0 (§8) — both are defect fixes, not new capability. |
| **P6** | TSK-008a/b/c/d/e — backend CRUD completion + wiring existing services (menu, tax, print, special-notes, areas). No UI changes yet — unblocks P7 by giving it real endpoints to call. |
| **P7** | TSK-008f/g/h/i — frontend: Edit/Delete controls across all tabs, menu 86-toggle wiring, modifier-group UI, kill the two hardcoded catalogs. |
| **P8** | TSK-008j + full audit-log/permission-gate sweep across every newly-added mutating endpoint (consistency pass — match the `user-management.tsx` reference pattern exactly: gate, audit, optimistic version where relevant). |

P6–P8 can run **parallel to P1–P5** (seat/merge track) — different files, different agents, same gate discipline. Both tracks report into the same `agents/STATUS.md` board so a human sees one combined picture, not two competing plans.
