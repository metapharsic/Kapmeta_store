# Feature Build Plan — Out-of-Stock Modal & Menu Online-Availability Manager

**Artifact:** 04
**Screens covered:** (A) Mark Out-of-Stock Modal, (B) Menu Online-Availability Manager
**Status:** Draft for engineering — depends on DB schema draft, API-contracts draft, sync-architecture draft, business-logic-rules draft, decision-register (DEC-013..024)
**Author context:** These two screens are documented together because they are two different UI entry points into the *same* underlying data model (`menu_item_availability`, `menu_item_channel_status`, `channel_sync_log`) and the *same* fan-out sync mechanism. The OOS modal is the fast, order-context-triggered path; the Menu Availability Manager is the deliberate, browse-and-manage path. They must stay behaviorally consistent — an OOS mark made from the modal must show up correctly in the Manager's item list and vice versa.

---

## Shared Foundations (read before Part A or B)

### DEC-024 recap
Per the decision register, **OOS status** and **channel On/Off status** are two independent, separately-audited states. An item can be:
- On + In Stock (normal, orderable)
- On + Out of Stock (visible/orderable toggle is on, but flagged unavailable — platform shows "sold out" style state, not delisted)
- Off (deliberately hidden from ordering on that channel, regardless of stock)
- Off + Out of Stock (both true simultaneously — allowed, independently tracked)

This plan treats them as two columns/tables, never collapses them into one flag, and both screens must display them as distinguishable states, not a single toggle.

### Is POS a "channel"?
Flagged as an open question (see Part B §10), but the working assumption for this plan is: **POS is NOT a row in `menu_item_channel_status`/`menu_item_availability`.** POS availability is governed by existing in-house stock/86-list logic (out of scope for this doc). The OOS modal and Manager operate only on aggregator channels (Swiggy, Zomato, and any future channel). Marking OOS from the online-order-triggered modal does **not** silently 86 the item on POS. This needs explicit stakeholder confirmation before build (see open questions).

---

## PART A: Mark Out-of-Stock Modal

### A.1 Purpose & User Story

**Purpose:** Give front-of-house/kitchen staff a fast, in-context way to flag that one or more items in an *incoming online order* are unavailable, right at the moment they discover the shortage while fulfilling that order — without navigating away from the Live Feed.

**User story:** "As a restaurant staff member processing an online order on the Live Feed, when I discover that an item in the order is out of stock, I want to mark it unavailable in a couple of taps, optionally let the customer's app offer an alternate item, and optionally push that unavailability to all other online platforms at once, so that future orders (on this and other platforms) don't include the item until it's restocked."

**Trigger:** A button/icon on an order card on the Online Live Feed screen (e.g., "Mark OOS" affordance next to or under the order's item list). Opens the modal scoped to that specific order's items.

### A.2 UI Spec

**Modal title:** "Mark Out Of Stock"

**Elements, top to bottom:**

1. **Order context header** — order number / platform badge (Swiggy/Zomato/etc.) so staff can confirm they're acting on the right order, non-interactive.
2. **Item list** — one row per distinct line item in the order (not per quantity unit). Each row:
   - Checkbox (unchecked by default) — selects the item for OOS marking.
   - Item name — displayed using **POS item name** here (this is an internal operational screen tied to an order, so operational naming is correct; see A.2.a below for why this differs from the Manager screen).
   - Quantity ordered (context only, not editable).
   - If the item already has an active OOS record on this channel (edge case: order was placed just before another staff member marked it OOS), show a small "already marked OOS" badge next to the row and default the checkbox to checked+disabled, since re-marking is a no-op.
3. **Toggle: "Allow customer to choose alternate item(s)"**
   - Off by default (proposed — flag for confirmation; PetPooja's actual default is unknown to us).
   - When on, the aggregator-side OOS payload includes an `alt_item_allowed = true` flag/equivalent field so the customer's app can prompt for a substitute rather than simply dropping the item. This only matters for the *current* order's fulfillment flow on the platform side, but we also persist it onto the `menu_item_availability` record as the default alternate-item-allowed policy for this item going forward until cleared, since aggregator OOS listings behave the same way outside the context of a single order too.
   - Disabled (greyed) if no items are checked.
4. **Toggle: "Mark the selected item(s) out of stock for all the other online platforms (if any)"**
   - Off by default.
   - When on, this is the fan-out trigger: instead of writing an OOS record only for the platform that this order came from, the system writes/updates OOS records for **every channel the item is currently listed on** (see A.4/Part shared fan-out spec below) and enqueues sync jobs for each.
   - When off, the OOS mark applies only to the originating platform of this order.
   - Label copy should clarify scope — consider tooltip: "e.g. marking this item out of stock for a Swiggy order will also mark it out of stock on Zomato and any other connected platform."
5. **Submit button: "Mark Out Of Stock"**
   - Disabled until at least one item checkbox is checked.
   - On click: synchronous write of `menu_item_availability` row(s) (status → `oos`), then async enqueue of fan-out sync job(s) per A's shared spec below. Modal shows a brief inline spinner/toast state, then closes; Live Feed item row optionally shows a small "OOS" chip immediately (optimistic) with a subtle sync-pending indicator until the platform push confirms (see partial-failure UI in shared fan-out section).
6. **Cancel/close (X)** — discards selections, no writes.

**A.2.a — Why POS name here, Online Display Name in Part B:**
This modal is triggered from a live order and its item list is drawn directly from the order payload as fulfilled internally — staff are matching items against what's on the kitchen ticket, so POS/internal item name is the correct label. The Menu Availability Manager (Part B), by contrast, is a proactive catalog-management screen where staff are managing how items *appear to customers on aggregator apps*, so it must surface `online_display_name` — which can differ from the POS name (e.g., POS name "Chkn 65 (H)" vs online display name "Chicken 65 - Half"). Showing POS name in a catalog-management context risks staff pushing internal shorthand names live to customers; showing online display name in an order-fulfillment context risks staff not recognizing the item against the kitchen ticket. Both are deliberate, opposite choices — flag this rationale in code comments/review so a future refactor doesn't "fix" one to match the other.

**Clock/schedule icon:** Not present in Part A's modal — this only appears in Part B's item list. See B.2 for full treatment.

### A.3 Data Model touchpoints (from this screen)

This modal writes to (does not define new tables — see shared Data Model in B.3, since both screens share the same tables):

- `menu_item_availability` — insert/update per (item, channel) pair touched.
- `channel_sync_log` — insert per outbound sync attempt triggered by the fan-out.

No new columns are required to support Part A specifically beyond what's specified in B.3, except:

- `menu_item_availability.set_via` — proposed new enum column: `order_context` | `manual_manager` | `system_auto`. The OOS modal always writes `order_context`; the Manager screen writes `manual_manager`. This lets audit/reporting distinguish "found OOS while fulfilling an order" from "proactively marked OOS while managing menu" — useful for restaurant-ops analytics later (e.g., how often stockouts are discovered reactively vs proactively). Confirm with stakeholders if this granularity is wanted; if not, drop the column and rely on `channel_sync_log`/an audit table's freeform context instead.
- `menu_item_availability.source_order_id` — nullable FK to the order, populated only when `set_via = order_context`. Enables "show me which order surfaced this stockout" traceability.

### A.4 Fan-out behavior for this screen

See the **Shared Fan-out Sync Job Spec** in Part B §4 — Part A's "all other platforms" toggle is one of the two triggers into that same spec (the other being Part B's Off toggle / bulk OOS actions). The spec, worked example, retry policy, and partial-failure UI behavior are written once and apply to both screens; do not duplicate divergent logic between them.

### A.5 API Endpoints used by this screen

- `POST /api/v1/orders/{order_id}/items/oos` — marks OOS for one or more line items on this order.
  - Body: `{ "items": [{ "menu_item_id": "...", "alt_item_allowed": true }], "fan_out_all_channels": true }`
  - Server resolves `order_id` → originating channel; if `fan_out_all_channels` is false, only that channel is affected.
  - Response: `{ "availability_records": [...], "sync_job_id": "..." }` — `sync_job_id` lets the Live Feed UI poll or subscribe for fan-out completion status.
- `GET /api/v1/sync-jobs/{sync_job_id}` — poll for fan-out completion state (used to update the optimistic "OOS" chip to a confirmed/partial-failure state).

(Full endpoint list, including clear-OOS and bulk operations shared with Part B, is in B.5.)

### A.6 Business Logic / Edge Cases

- **Item already OOS on the originating channel:** checkbox pre-checked and disabled (see A.2), submit is a no-op for that item (skip write, skip sync job) — avoid generating duplicate `channel_sync_log` rows/noise.
- **Item is Off (channel toggle off) on a platform, and staff fans out OOS to "all other platforms":** OOS record is still written for that channel (per DEC-024, OOS and On/Off are independent) but since the item is already hidden, no customer-facing effect occurs there; the sync job still fires to keep aggregator-side state consistent should the item later be toggled back On.
- **Item not listed on a given channel at all (channel-specific menu, item never added there):** skip — no availability record created, no sync call made, since there is nothing to mark unavailable on a platform that has no listing.
- **Order contains an item that has since been deleted/deactivated from the master menu:** show item row with a "no longer on menu" badge, checkbox disabled — cannot mark OOS an item that isn't an active menu item; direct staff to Menu Manager if the underlying issue is a discontinued item.
- **Concurrent order:** two staff open the OOS modal for two different orders containing the same item simultaneously, both check it, both submit. Second write should be idempotent (state ends at `oos`, `cleared_at` untouched, only one meaningful sync fan-out needed) — see idempotency-key handling in shared fan-out spec.
- **Midnight auto-restock interaction:** if this item is subject to a scheduled/temporary OOS window (unlikely from this modal since it has no scheduling UI — OOS marked here is indefinite/manual-clear-only), no special handling needed; manual OOS from this modal never carries an expiry. This is a deliberate contrast with Part B's clock-icon scheduling feature — OOS-from-order is a "stop the bleeding now" action, not a scheduling action.

### A.7 Admin/Config Dependency

Not directly applicable — Part A is an operational action screen, not a config screen. It relies on the channel list (which platforms exist, which are "other online platforms" for fan-out) being sourced from a `channels` reference table (see B.7), never hardcoded. The modal must query active channels dynamically to compute what "all the other online platforms" expands to at submit time.

### A.8 Permissions

- **Mark OOS (this modal):** any staff role with order-fulfillment access (e.g., `staff`, `manager`, `owner` — align to whatever roles exist elsewhere in Kapmeta's auth model). This is a low-risk, easily-reversible, order-linked action and should not require manager approval — speed matters when someone is standing at the pass discovering a stockout.
- **"All other platforms" toggle:** available to the same roles as above — it's still just an OOS action, not a channel visibility change. (Contrast with Part B's full On/Off toggle, which is more consequential and proposed manager-gated — see B.8.)
- **Clear OOS:** not available from this modal at all (no such control in the screenshot) — clearing must happen from Part B's Manager screen or a dedicated "currently OOS items" list (out of scope here, flag as a possible future screen).

### A.9 Test Plan (Part A)

| # | Scenario | Expected result |
|---|---|---|
| A-1 | Open modal from an order with 3 items, check 1, submit with both toggles off | 1 `menu_item_availability` row created (status=oos, set_via=order_context, source_order_id set) for originating channel only; no fan-out sync jobs enqueued |
| A-2 | Same as A-1 but "all other platforms" toggle on, item is listed on Swiggy+Zomato+POS-adjacent channel X | 3 availability rows updated (originating + 2 others), 2 outbound sync jobs enqueued (originating channel doesn't need a push since it already reflects the order's platform reality — confirm with sync-architecture doc whether originating channel also needs a confirmatory push) |
| A-3 | "Allow alternate item" toggled on | `alt_item_allowed=true` persisted on the availability record(s); payload sent to platform(s) includes the alternate-item flag |
| A-4 | Submit with zero items checked | Submit button stays disabled; no request sent |
| A-5 | Item already OOS on originating channel | Row shows pre-checked+disabled; submitting produces no duplicate write for that item |
| A-6 | Two staff mark the same item OOS via two different order modals within the same second | Final state = oos exactly once; no duplicate/conflicting `channel_sync_log` rows beyond the two independent fan-out attempts (each is legitimate, not a race bug) — verify idempotency key scheme prevents double-delivery to the *same* platform if retries overlap |
| A-7 (golden) | Fan-out with 2 target platforms; Swiggy API call succeeds, Zomato API call times out | Availability record for Zomato channel shows a distinguishable "sync pending/failed" sub-state distinct from the OOS status itself; Live Feed and Manager both surface this; retry job picks it up per retry policy; alert fires per shared spec |

---

## PART B: Menu Online-Availability Manager

### B.1 Purpose & User Story

**Purpose:** A dedicated, full-screen catalog-management surface where staff/managers proactively control which items and addons are visible/orderable on which online channels, independent of any specific order — including scheduling future on/off windows, bulk operations by category, and per-channel review of sync health.

**User story:** "As a restaurant manager, I want to browse my full menu by category, see at a glance which items and addons are on or off on each online ordering platform, toggle availability in bulk or individually, schedule an item to automatically go off tonight and back on tomorrow morning, and see the correct customer-facing name for each item, so that my online menu accurately reflects what I can actually serve without me having to remember to do it manually every day."

### B.2 UI Spec

**Layout:** Full-screen, three-zone layout.

**Top: Master tabs**
- `Online` / `Offline` — top-level split. Working assumption: this filters the item list to items currently online (any channel On + in stock) vs currently offline (Off on all channels, or OOS everywhere) — a diagnostic view, not a bulk action. Flag for confirmation: does "Offline" tab mean "off on all channels" or "off on the channel currently selected in the per-channel tab"? Recommend the latter (scoped to selected channel tab) for consistency with the rest of the screen being channel-scoped.

**Second row: Sub-tabs**
- `Item On/Off` vs `Addon On/Off` — switches the right-hand list between menu items and addon/modifier items. Addon on/off cascades to parent-item ordering options; see B.6 cascade rules.

**Third row: Per-channel tabs**
- `Recent` | `All` | `Swiggy` | `Zomato` (extensible — must be data-driven from a `channels` table, not hardcoded, so a new platform can be added via config/seed, not a code change).
- `Recent` — proposed meaning: items with an availability/channel-status change in the last N hours (default 24h), across any channel, useful for "what did I already touch today" recall. Flag for confirmation on exact definition and window.
- `All` — union view across all channels, showing per-item a small multi-channel status cluster (e.g., mini pills per platform) rather than one On/Off state.
- `Swiggy`/`Zomato` (and future channels) — scoped view: one On/Off pill per item reflecting that channel only.

**Left panel: Category tree**
- Hierarchical categories (and sub-categories if the schema supports nesting), sourced from the existing menu/category tables — clicking a category filters the right-hand item list. Include an item/addon count badge per category. Support multi-select or "select category" as a scope for bulk actions (see filter row).

**Right panel: Filter row + item list**

Filter row fields:
1. **Name search** — searches POS item name.
2. **Online Display Name search** — separate field, searches `menu_items.online_display_name`. Kept distinct from #1 deliberately: staff sometimes only know an item by what customers see on the aggregator app (a customer complaint referencing the app's name for the dish), or only by internal POS shorthand — supporting both search paths avoids a dead end either way. UI should visually distinguish the two fields (e.g., a label/tooltip explaining "this is the name customers see on Swiggy/Zomato, which may differ from your POS item name").
3. **Category dropdown** — redundant-but-convenient alternative to the tree click, useful when the tree is collapsed or for filter combinations; should stay in sync with tree selection (selecting one updates the other).
4. **Fourth dropdown (veg/non-veg or subcategory)** — from the screenshot description this is ambiguous; propose it is a **food-type filter** (Veg / Non-Veg / Egg, matching common Indian-market POS conventions PetPooja itself uses) sourced from a `menu_items.food_type` (or similar existing) column, not a new concept. Flag for confirmation against the actual PetPooja screen, since "subcategory" is also plausible if the category tree only goes one level deep. **Do not build both interpretations blind — resolve before implementation**, as they have different data sources and filtering logic.

**Item list rows** (right panel, per item or addon):
- **Online Display Name** as the primary label (not POS name — see A.2.a rationale). Secondary/smaller text shows POS name for staff cross-reference, e.g. `Chicken 65 - Half` (POS: `Chkn 65 (H)`).
- **Clock/schedule icon** — proposed meaning: **opens a scheduling sub-panel to set a future auto-on and/or auto-off time window for this item on the selected channel(s)**, writing to `menu_item_channel_status.scheduled_on_at` / `scheduled_off_at`. Example use case: a kitchen item only served after 6pm can be scheduled to auto-activate daily, or a known short-supply item can be scheduled to auto-deactivate at a set time without staff needing to remember. **This is a design assumption, not confirmed from the screenshot alone — flag explicitly for stakeholder confirmation before building the scheduling sub-panel; if wrong, the icon may instead mean "view change history" or "view current schedule status only" (read-only), which is a materially smaller build.**
  - If confirmed as scheduling: the icon should visually differ when a schedule is currently active vs unset (e.g., filled vs outline icon), and hovering/clicking should show the active window inline.
- **Off/On pill button** — the actual channel-scoped toggle for this item on this channel-tab context. When on the `All` tab, this becomes a cluster of small per-channel pills instead of one pill (per the per-channel-tabs note above).
  - Pill states: `On` (green), `Off` (grey/red), and a third visual state for `On but OOS` (e.g., amber/hatched) so OOS is visible from this list without opening a detail view — critical given DEC-024's requirement that OOS and On/Off remain visually distinguishable, not collapsed.
  - Clicking the pill toggles `menu_item_channel_status.is_on` for that item+channel; does **not** touch OOS status.
- **Row-level OOS control:** the screenshot as described doesn't show an explicit per-row "mark OOS" button distinct from the pill states — propose adding a small overflow/kebab menu per row with "Mark Out of Stock" / "Clear Out of Stock" actions, reusing the same modal from Part A (minus the order-context header, since there's no order here) so the two screens share one component. Flag for confirmation whether this exists in the real PetPooja screen or whether OOS is meant to be Manager-exclusive-view / OOS-only-settable-from-orders — if the latter, drop this control and make the amber pill state read-only here.

**Bulk actions:** With category selected and/or multiple rows checked (propose adding row checkboxes, not fully specified in the screenshot but implied by "select all in category" being a near-universal pattern for this kind of screen) — bulk On, bulk Off, bulk Mark OOS, scoped to the currently selected channel tab. Flag: confirm bulk-OOS is in scope for v1 or defer.

**"Logistics Details" info modal:**
- Triggered from an info icon, likely near the channel tabs or a channel-level settings area.
- Read-only informational modal (per the description) explaining:
  - **Zomato Logistics** — whether Zomato's own delivery fleet is configured for this outlet, and what that implies for order fulfillment expectations (delivery vs self-pickup-to-driver handoff).
  - **Swiggy Self-Delivery** — whether the restaurant is using its own delivery staff for Swiggy orders vs Swiggy's fleet.
- This is **configuration display, not configuration entry**, per the screenshot description ("info modal describing... configuration") — actual logistics setup likely lives in a separate outlet-settings screen out of this doc's scope. Confirm with stakeholders whether this modal needs a link/deep-link to that settings screen, or is purely explanatory (e.g., static help text plus current read-only status pulled from an `outlet_channel_settings` table).
- Data dependency: a `outlet_channel_logistics` (or similarly named) table with columns like `channel`, `logistics_mode` (`platform_fleet` | `self_delivery`), `updated_at` — must not be hardcoded per the no-hardcode project rule; this doc treats it as an existing/adjacent table, not newly designed here, since it's outlet-level config rather than item-level availability. Flag as a dependency to confirm exists or needs its own small schema addendum.

### B.3 Data Model

All three tables below are shared by Part A and Part B — Part A only ever touches a subset of these columns; Part B is the primary management surface for all of them.

#### `menu_item_availability`
Tracks OOS state, one row per (menu_item, channel) — current-state row, not a full history log (history lives implicitly in `channel_sync_log` plus optionally a future `menu_item_availability_history` table if full audit trail is required beyond what sync log captures).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigint PK | |
| `menu_item_id` | FK → `menu_items.id` | |
| `channel_id` | FK → `channels.id` | see B.7 for `channels` table; never hardcode platform identity |
| `status` | enum: `in_stock`, `oos` | current state; default `in_stock` (i.e., no row or an explicit in_stock row both mean orderable — recommend always having a row per item+channel pair for query simplicity, defaulting to `in_stock` on item/channel creation) |
| `oos_reason` | nullable text/enum | free text or enum (`stockout`, `quality_issue`, `staffing`, `other`) — propose enum with an `other` + free-text pair for reporting consistency; flag for confirmation whether the OOS modal in Part A should actually prompt for a reason (screenshot doesn't show one — if not present in v1, column stays nullable/unused until a later iteration) |
| `alt_item_allowed` | boolean | default false; from A.2's toggle |
| `alt_item_id` | nullable FK → `menu_items.id` | if a specific suggested alternate is later supported (not in current screenshots — placeholder for future use, flag as out of scope for v1 unless already planned elsewhere) |
| `set_at` | timestamptz | when marked OOS |
| `cleared_at` | nullable timestamptz | when returned to in_stock; null while currently OOS |
| `set_by` | FK → `users.id` | staff who marked it |
| `cleared_by` | nullable FK → `users.id` | staff/system who cleared it |
| `set_via` | enum: `order_context`, `manual_manager`, `system_auto` | see A.3; `system_auto` used for midnight auto-restock if that policy is confirmed (B.6) |
| `source_order_id` | nullable FK → `orders.id` | see A.3 |
| `created_at` / `updated_at` | timestamptz | standard audit columns |

#### `menu_item_channel_status`
Tracks the On/Off (visibility/listing) state, independent of stock, one row per (menu_item, channel).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigint PK | |
| `menu_item_id` | FK → `menu_items.id` | |
| `channel_id` | FK → `channels.id` | |
| `is_on` | boolean | default true (listed) unless business rule says new items default off pending review — confirm |
| `scheduled_on_at` | nullable timestamptz | proposed for the clock-icon feature; the time this item should auto-turn-on |
| `scheduled_off_at` | nullable timestamptz | the time this item should auto-turn-off |
| `schedule_recurrence` | nullable enum/text | e.g., `once`, `daily` — needed if the clock icon supports recurring daily windows (e.g., "off every night after 10pm") rather than one-off; flag for confirmation, materially affects the scheduler job design (cron-like vs one-shot) |
| `updated_by` | FK → `users.id` | |
| `updated_at` | timestamptz | |
| `created_at` | timestamptz | |

Also applies to addon items if addons are modeled as rows in `menu_items` with an `is_addon` flag/type — otherwise a parallel `addon_channel_status` table with the same shape; recommend reusing one table with a polymorphic `item_type` discriminator (`item` | `addon`) over duplicating the table, for simpler joins in the Manager's unified list.

#### `channel_sync_log`
Append-only log, one row per outbound sync attempt to a platform.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid/bigint PK | |
| `menu_item_id` | FK → `menu_items.id` | |
| `channel_id` | FK → `channels.id` | target platform |
| `action_type` | enum: `mark_oos`, `clear_oos`, `channel_on`, `channel_off` | what state change this call represents |
| `triggering_event_id` | uuid | groups all rows from one fan-out event (see B.4 worked example) — this is the "fan-out batch id" |
| `idempotency_key` | text, unique per (channel, idempotency_key) | see B.4 |
| `payload` | jsonb | outbound request body actually sent |
| `status` | enum: `pending`, `success`, `failed`, `retrying` | |
| `http_status` | nullable int | response code if received |
| `retry_count` | int, default 0 | |
| `last_error` | nullable text | last error message/stack summary |
| `attempted_at` | timestamptz | |
| `completed_at` | nullable timestamptz | |
| `created_at` | timestamptz | |

#### `channels` (reference table — implied dependency, not fully specified elsewhere)
Required so no platform identity is hardcoded per project rule.

| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `code` | text, unique | e.g. `swiggy`, `zomato` |
| `display_name` | text | e.g. "Swiggy", "Zomato" |
| `is_active` | boolean | lets ops disable a channel integration without deleting history |
| `api_base_url` / credential references | — | actual secrets live in a secrets store, not this table; table holds non-secret config/reference only |

### B.4 Fan-out Sync Job Spec (SHARED — applies to Part A's "all platforms" toggle and Part B's Off toggle / bulk actions)

**Trigger conditions:**
1. Part A: OOS modal submitted with "all other platforms" on.
2. Part B: single item Off/On pill toggled.
3. Part B: bulk On/Off/OOS action across a category or selection.
4. `system_auto`: scheduled on/off time reached (B.6), or midnight auto-restock policy firing (B.6).

**Flow:**

1. **UI action** produces one logical intent: "set item X to state Y on channel set {C1, C2, ...}."
2. Backend, in a single transaction, writes/updates the relevant `menu_item_availability` and/or `menu_item_channel_status` rows for each affected channel (this is the source of truth — it's updated immediately, optimistically, regardless of whether the outbound push to the platform succeeds).
3. Backend generates one `triggering_event_id` (UUID) for this whole fan-out event, and enqueues **one sync job per (item, channel) pair** onto a job queue (e.g., a durable queue — SQS/RabbitMQ/DB-backed job table, whichever the sync-architecture doc specifies).
4. Each queued job carries: `menu_item_id`, `channel_id`, `action_type`, `triggering_event_id`, and a generated `idempotency_key` = deterministic hash of `(menu_item_id, channel_id, action_type, triggering_event_id)` — guarantees that if the same job is retried or accidentally double-enqueued, the platform-side API (if it supports idempotency keys, or via our own dedup check before calling) doesn't double-apply.
5. **Ordering:** jobs for different channels are independent and processed in parallel — there is no cross-channel ordering requirement (Swiggy and Zomato don't need to be updated in a particular sequence relative to each other). Jobs for the *same* item+channel must be processed in submission order (FIFO per item+channel) to avoid a later "turn on" racing ahead of an earlier "turn off" — use a per-(item,channel) ordering key if the queue technology supports it (e.g., SQS FIFO group ID = `{menu_item_id}:{channel_id}`), or a DB-level advisory lock / row version check if using a DB-backed queue.
6. **Execution:** worker picks up job, writes a `channel_sync_log` row with status `pending`, calls the target platform's API (per API-contracts doc), updates the log row to `success` or `failed` with `last_error` populated on failure.
7. **Retry policy:** on failure (timeout, 5xx, rate-limit response), retry with exponential backoff — proposed: 3 attempts at 30s / 2min / 10min, then mark `channel_sync_log.status = failed` terminally and flip the job to a dead-letter/needs-attention state rather than retrying indefinitely. A 4xx (e.g., item not found on platform side, invalid payload) should **not** blindly retry — treat as terminal-failed immediately and alert, since retrying an inherently-invalid request wastes attempts and delays alerting.
8. **Partial-failure UI:** since `menu_item_availability`/`menu_item_channel_status` are updated optimistically in step 2, the **source of truth in Kapmeta always reflects intent immediately**. The UI must separately surface *sync* status per channel — proposed: on both the Live Feed (chip on the order) and the Manager item row, show a small per-channel sync indicator (e.g., a tiny dot/badge on each channel's pill: green-check = confirmed synced, amber-clock = pending/retrying, red-! = failed after retries). Clicking it opens a mini sync-status panel showing the relevant `channel_sync_log` rows for that item, with a manual "Retry now" action for managers.
9. **Alerting:** a `channel_sync_log` row reaching terminal `failed` status should raise an internal alert — proposed: a notification/badge count on the Manager screen ("3 items have sync issues") plus, if the project has an ops-alerting channel (Slack/email per infra), a rate-limited digest rather than one alert per failure to avoid noise during a platform-wide outage.
10. **Job completion / fan-out event completion:** the `triggering_event_id` batch is considered "done" once every job under it reaches a terminal state (success or terminal-failed); `GET /api/v1/sync-jobs/{id}` (A.5) aggregates and reports this.

**Worked example — full trace:**

Scenario: Staff opens the OOS modal from a Swiggy order for "Paneer Tikka," checks it, turns on "all other platforms." The item is listed on Swiggy and Zomato (two channels total).

1. `POST /api/v1/orders/ord_9001/items/oos` with `{"items":[{"menu_item_id":"itm_paneer_tikka","alt_item_allowed":false}],"fan_out_all_channels":true}`.
2. Backend resolves order → originating channel `swiggy`. Since fan-out is on, target channel set = `{swiggy, zomato}`.
3. Transaction: `menu_item_availability` upserted for `(itm_paneer_tikka, swiggy)` → `status=oos, set_via=order_context, source_order_id=ord_9001, set_at=now()`; same for `(itm_paneer_tikka, zomato)`.
4. `triggering_event_id = evt_7f3a...` generated. Two jobs enqueued:
   - Job 1: `{item: itm_paneer_tikka, channel: swiggy, action: mark_oos, idempotency_key: hash(itm_paneer_tikka, swiggy, mark_oos, evt_7f3a)}`
   - Job 2: `{item: itm_paneer_tikka, channel: zomato, action: mark_oos, idempotency_key: hash(itm_paneer_tikka, zomato, mark_oos, evt_7f3a)}`
5. API responds `202`-equivalent immediately with `{"availability_records":[...2 rows...], "sync_job_id":"evt_7f3a..."}`. Modal closes; Live Feed shows "OOS" chip with amber sync-pending dots on both platform indicators.
6. Worker picks up Job 1 (Swiggy): writes `channel_sync_log` row (`status=pending`), calls Swiggy's item-availability API, gets `200 OK`, updates log row to `status=success, completed_at=now()`. Live Feed's Swiggy dot flips green.
7. Worker picks up Job 2 (Zomato): writes `channel_sync_log` row (`status=pending`), calls Zomato's API, request **times out** after the configured timeout window. Log row updated to `status=failed, retry_count=1, last_error="timeout after 8000ms"`. Job re-queued per backoff (attempt 2 in 2 minutes).
8. Zomato's dot on the Live Feed/Manager shows amber (retrying), not red yet, since retries remain.
9. At retry attempt 2 (2 min later): Zomato API succeeds. `channel_sync_log` new row (or updated row, depending on log-append-vs-update design — recommend **append**, one row per attempt, since that preserves full retry history for debugging) with `status=success`. Zomato dot flips green. `evt_7f3a` fan-out event now fully complete (both channels synced).
10. If instead attempt 2 and attempt 3 both failed: after attempt 3, Zomato log row stays terminally `failed`; Zomato dot flips red; an internal alert fires ("Paneer Tikka OOS sync to Zomato failed after 3 attempts — manual retry available"); manager can click "Retry now" from the Manager screen's sync-status panel, which enqueues a fresh manually-triggered job (new `idempotency_key`, since it's a new attempt outside the original automatic retry sequence — or reuse the same key if the design intends true idempotent replay; recommend reuse to keep true idempotency semantics against the platform's own API, if that API is confirmed idempotent per the API-contracts doc).

Kapmeta's own state (`menu_item_availability`) is correct and OOS from the moment of step 3, regardless of steps 6-10's outcome — the platform-side sync lag/failure is a *presentation/consistency* problem to surface, not a blocker to the core action.

### B.5 API Endpoints (full set, shared across Parts A & B)

| Method & Path | Purpose |
|---|---|
| `POST /api/v1/orders/{order_id}/items/oos` | Part A: mark OOS from order context (see A.5) |
| `POST /api/v1/menu-items/{item_id}/oos` | Part B: mark OOS directly from Manager (no order context); body includes `channel_ids[]`, `alt_item_allowed` |
| `POST /api/v1/menu-items/{item_id}/oos/clear` | Clear OOS for one item on one or more channels; body `{channel_ids: [...]}` |
| `POST /api/v1/menu-items/bulk/oos` | Bulk OOS across a set of item ids or a category id |
| `POST /api/v1/menu-items/bulk/oos/clear` | Bulk clear |
| `POST /api/v1/menu-items/{item_id}/channel-status` | Toggle On/Off for one item on one or more channels; body `{channel_ids: [...], is_on: true, scheduled_on_at?, scheduled_off_at?}` |
| `POST /api/v1/menu-items/bulk/channel-status` | Bulk On/Off toggle |
| `POST /api/v1/addons/{addon_id}/channel-status` | Addon equivalent of the above |
| `GET /api/v1/menu-items/availability?channel_id=&category_id=&status=&search=&online_display_name_search=&food_type=` | Backing query for the Manager's filtered item list; returns per-item current availability + channel-status + latest sync state summary |
| `GET /api/v1/menu-items/{item_id}/sync-log?channel_id=` | Detail panel: full `channel_sync_log` history for one item(+channel) |
| `GET /api/v1/sync-jobs/{triggering_event_id}` | Poll/aggregate status of one fan-out batch (used by both screens) |
| `POST /api/v1/sync-jobs/{triggering_event_id}/retry` | Manual retry trigger for failed jobs within a batch |
| `GET /api/v1/channels` | Reference data for tabs/filters — never hardcode channel list client-side |
| `GET /api/v1/outlets/{outlet_id}/logistics` | Backing data for the "Logistics Details" info modal |

### B.6 Business Logic / Edge Cases

- **Midnight auto-restock vs manual clear:** flag as an open question requiring explicit product decision — does OOS auto-clear at midnight (common in some POS systems, treating a stockout as a "today only" event) or does it persist until a human clears it? This plan recommends: **manual clear only, no auto-restock**, since silently returning a genuinely-still-unavailable item to sale at midnight is a worse failure mode (selling something you don't have) than the alternative (staff forgets to clear and item stays hidden an extra day, caught on next manual check). If stakeholders want auto-restock, model it as an explicit **opt-in per item** (`menu_item_availability` needs an `auto_restock_at` nullable field, defaulting null/disabled) rather than a blanket policy, and the job that performs it writes `set_via=system_auto`-analogous `cleared_by=null`/system on `cleared_at`.
- **POS OOS vs aggregator visibility relationship:** per the shared-foundations assumption, these are currently modeled as unrelated — marking OOS via this feature does not touch any POS-side 86'd-item mechanism, and vice versa. Flag strongly for stakeholder confirmation, since staff intuition may expect "OOS" to mean "OOS everywhere," and getting this wrong either creates a double-entry burden (staff must mark unavailability twice) or an unwanted side effect (marking OOS for Swiggy accidentally hides item from walk-in POS ordering). This is the single highest-impact open question in this whole document.
- **Addon On/Off cascading to parent item:** proposed rule — turning an addon Off does not remove the parent item's orderability, but does remove that addon as a selectable option within the parent item's customization flow on that channel. If a parent item has an addon group where *all* options are Off, and that group is marked required/mandatory for ordering, this creates an unorderable-but-listed item — the system should detect this state and surface a warning on the parent item's row in the Manager ("this item has no available options for a required addon group on Zomato") rather than silently producing a broken online listing. This detection logic should be a scheduled/on-write check, not purely client-side.
- **Conflicting simultaneous edits from two staff:** e.g., staff A opens Manager and toggles item Off on Zomato while staff B does the same in the OOS modal marking it OOS with fan-out on, within the same second. Both are legitimate independent state changes (Off is not OOS), so both should apply — no real conflict exists at the data level given DEC-024's independence. The only true conflict case is two staff toggling the *same* On/Off pill in opposite directions near-simultaneously; recommend last-write-wins based on `updated_at`, with the Manager UI using optimistic concurrency (send the row's last-known `updated_at`/version on the toggle request; if the server's current version is newer, reject with a `409` and force the client to refresh that row rather than silently overwriting) to avoid staff B's stale-state click clobbering staff A's newer change.
- **Item deleted from master menu while OOS/Off records exist:** availability/channel-status rows should be retained for audit (not cascade-deleted) but excluded from active Manager views; deletion flow should warn if active availability/channel-status/pending-sync rows exist.

### B.7 Admin/Config Dependency (no-hardcode rule)

The Menu Availability Manager **is** the admin UI that satisfies the project's no-hardcode rule for `menu_item_channel_status` and `menu_item_availability`. Specifically:

- The set of channels a restaurant is live on is never hardcoded in source — it is read from the `channels` reference table (B.3/B.5's `GET /api/v1/channels`), and the per-channel tabs in this screen render dynamically from that table. Adding a new aggregator platform in the future means a DB row/seed entry plus API-contracts/sync-architecture additions, not a code change to this screen's tab logic.
- Per-item, per-channel on/off and OOS state is exclusively DB-resident (`menu_item_channel_status`, `menu_item_availability`) and is exclusively mutated through this screen's endpoints (plus the OOS modal) — there is no seed-time or code-time default that bypasses this table (aside from the initial row-creation default of `is_on=true`/`status=in_stock` at item-creation time, which itself should be a migration/seed default, not a magic constant buried in application logic).
- The scheduling feature (clock icon, if confirmed) similarly must be entirely data-driven (`scheduled_on_at`/`scheduled_off_at`/`schedule_recurrence` columns plus a scheduler job that reads them), with no hardcoded time windows.
- The Logistics Details modal's content (Zomato Logistics / Swiggy Self-Delivery status) must read from the `outlet_channel_logistics`-equivalent table rather than static copy describing a fixed configuration.

No further admin surface is needed beyond this screen plus the underlying migrations/seeds for `channels` and (if in scope) `outlet_channel_logistics`.

### B.8 Permissions

- **View Manager screen:** any staff with menu-management access (align to existing role model) — read access can likely be broader than write access.
- **Toggle item/addon On/Off (single):** proposed **manager+ only** (`manager`, `owner`), since this directly controls customer-facing storefront visibility and revenue exposure, distinct from the lower-stakes, easily-reversible OOS action available to all staff in Part A. Flag for confirmation — if the restaurant workflow expects any staff to be able to 86 an item's *listing* (not just stock) during a rush, this should be relaxed; recommend starting restrictive and loosening based on stakeholder feedback, since accidentally-hidden menu items are a bigger business risk than an item staying visible a little longer than ideal.
- **Bulk actions (category-wide On/Off/OOS):** manager+ only, given blast radius.
- **Scheduling (clock icon):** manager+ only.
- **Mark/Clear OOS from Manager (non-order-context):** same roles as Part A's OOS action (all staff with order-fulfillment-adjacent access) — this mirrors Part A's permission level since it's the same underlying action, just accessed from a different screen.
- **Manual retry of failed sync:** manager+ only.
- **Logistics Details modal:** read-only, viewable by any role that can see the Manager screen at all — this is informational, not a control surface (assuming, per B.2, that the modal is display-only and not itself an edit surface).

### B.9 Test Plan (Part B)

| # | Scenario | Expected result |
|---|---|---|
| B-1 | Load Manager, `Swiggy` channel tab, category selected | Item list scoped correctly; pill states match `menu_item_channel_status.is_on` for `(item, swiggy)` pairs; amber pill shown for items with an active OOS record on Swiggy |
| B-2 | Search "Chkn 65" in Name field vs "Chicken 65" in Online Display Name field | Name field matches POS name column only; Online Display Name field matches `online_display_name` only; results differ appropriately when the two names diverge |
| B-3 | Toggle single item Off on Zomato | `menu_item_channel_status.is_on` → false for `(item, zomato)`; fan-out job enqueued for Zomato only (not Swiggy, since this is a single-channel-scoped toggle, not a fan-out-all action); `menu_item_availability` untouched |
| B-4 | Bulk-off an entire category on `All` tab | Every listed item's `is_on` set false on every channel it's listed on; one fan-out event per item×channel combination, all tracked under distinguishable job groupings (or one shared `triggering_event_id` for the whole bulk action — decide and test consistently) |
| B-5 | Set a scheduled on/off window via clock icon (pending confirmation this feature exists as designed) | `scheduled_on_at`/`scheduled_off_at` persisted; a scheduler process flips `is_on` at the correct time and fires the same fan-out job pipeline as a manual toggle, with `set_via`/equivalent marked as system-triggered |
| B-6 | Addon marked Off where it's the only option in a required addon group | Parent item row shows a warning indicator per B.6's cascade rule |
| B-7 | Two managers submit conflicting On/Off toggles on the same item+channel within the same request window | Optimistic concurrency check causes the stale request to be rejected (409) rather than silently overwritten; UI refreshes and prompts the second manager to retry with current state |
| B-8 (golden — shared with A-7) | Bulk-off 5 items where 4 channels succeed and 1 (say Zomato, for item #3) fails after all retries | Manager list shows red sync-failure indicator scoped to exactly item #3 / Zomato; other 4 items and other channels show green; alert fires once (not 5 times) if batched-alerting is implemented; manual retry from the sync-status panel successfully re-syncs just that one failed pair without re-touching the other 4 already-successful pairs |
| B-9 | Logistics Details modal opened | Displays current `outlet_channel_logistics` values without hardcoded/static text; matches actual outlet configuration |
| B-10 | Channel added to `channels` table via seed/migration (simulating a future new platform) with no code change | New per-channel tab appears in Manager automatically; item list and filters function correctly for the new channel |

---

## Open Questions / Flags for Stakeholder (consolidated)

1. **Clock/schedule icon meaning** (B.2) — confirmed as scheduling auto-on/off, or something else (change history / read-only schedule view)? Materially changes scope — a scheduler subsystem vs a display-only feature.
2. **Is POS a "channel" in this model, and does OOS/On-Off here affect POS ordering at all?** (Shared Foundations, B.6) — highest-impact open question in this document; affects data model, UI copy, and staff training expectations.
3. **"Recent" tab definition** — what time window, what event types count as "recent"?
4. **Fourth filter dropdown** — veg/non-veg/food-type vs subcategory; needs the actual screenshot/spec confirmed against real PetPooja screen or product spec.
5. **Does the OOS action need an `oos_reason` capture step in the modal UI**, or is the reason column present in the data model but unused in v1?
6. **Auto-restock at midnight** — in scope at all, and if so, opt-in per item or blanket policy?
7. **Recurring schedules** (`schedule_recurrence`) — is the clock-icon feature one-shot only or does it need daily recurrence in v1?
8. **Row-level OOS control inside the Manager list** — kebab-menu addition proposed in B.2 is an assumption; confirm whether OOS-from-Manager exists in the real product or whether OOS is order-context-only in v1.
9. **Bulk OOS across a category** — in scope for v1, or defer to a later iteration?
10. **Permission level for single-item On/Off toggle** — proposed manager+-only; confirm against actual staff workflow expectations, especially during service rushes.
11. **`outlet_channel_logistics` (or equivalent) table** — confirm whether this already exists elsewhere in the schema/addendum set, or whether it needs its own small design doc before B.2's Logistics Details modal can be built.
12. **Manual retry idempotency-key reuse** (B.4 step 10) — reuse original key (true idempotent replay) or generate a fresh one for manually-triggered retries; depends on whether Swiggy/Zomato APIs are confirmed idempotent per the API-contracts doc.
