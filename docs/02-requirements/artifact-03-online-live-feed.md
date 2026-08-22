# Artifact 03 — Online Order Live Feed: Feature Build Plan

Status: Draft for engineering review
Depends on: DB schema doc, API-contracts doc, sync-architecture doc, business-logic-rules doc, decision-register addendum (DEC-013..024)
Related decisions referenced here: DEC-013 (MFR button), DEC-021 (unify order status)

---

## 1. Purpose & User Story

The Online Order Live Feed is the primary working screen for kitchen and counter staff during service. It aggregates every incoming order — in-house dine-in/pickup, and aggregator orders from Swiggy and Zomato — into a single, continuously refreshing list of cards so staff never have to check three separate tablets/apps to know what needs cooking, what needs handing to a rider, and what is at risk of going late.

**Primary user:** kitchen expediter or counter staff member during active service hours.

**User story:**
> As a kitchen/counter staff member, I want to see all live orders from every channel in one feed, know at a glance which ones are running out of prep time, and take the next action (accept, mark ready, call the customer, contact the platform, mark an item out of stock) directly from the card — without switching apps or hunting through a POS order list — so that no order is missed or delivered late.

**Secondary users:**
- Shift manager / outlet manager: uses the same feed to monitor SLA breaches across the floor and to intervene (e.g., escalate a stuck rider, override MFR).
- Support/help-desk staff (multi-outlet operators): may view the feed read-only for triage.

**Why this screen matters operationally:** aggregator SLAs (Swiggy/Zomato) penalize outlets for late "food ready" marks and for orders left unaccepted. This screen is the primary control surface for meeting those SLAs, so its timer logic and action affordances must be unambiguous and fast to operate under kitchen pressure (large touch targets, minimal taps, clear color coding).

---

## 2. UI Spec

### 2.1 Screen layout (top to bottom)

1. **Filter tab bar**
2. **View controls** (New View / Old View toggle, View Details switch)
3. **Bulk action bar** (MFR button + any future bulk actions)
4. **Order card grid/list** (responsive: grid on tablet/desktop, single column on narrow viewports)

### 2.2 Filter tabs

Tabs: `All`, `Dine In`, `Delivery`, `Pick Up`, `Online`, `Swiggy`, `Zomato`

- Single-select, one active tab at a time. Default on screen load: `All`.
- Each tab shows a count badge of orders currently in that filter's active-order set (see §2.6 for what counts as "active").
- Tab semantics:
  - `All` — every order regardless of channel or fulfillment type, in any non-terminal state.
  - `Dine In` — `orders.order_type = 'dine_in'` (channel is normally `pos` but a dine-in order could theoretically arrive from an aggregator kiosk integration in future; filter is by `order_type`, not `channel`).
  - `Delivery` — `orders.fulfillment_type = 'delivery'`, any channel (pos-direct delivery, Swiggy, Zomato).
  - `Pick Up` — `orders.fulfillment_type = 'pickup'`, any channel.
  - `Online` — `orders.channel IN ('swiggy', 'zomato')` OR a future direct-online-ordering channel; i.e., everything that did not originate at the counter/POS. This is a channel-class filter, not a fulfillment filter, so it can overlap with Delivery/Pick Up tabs by design.
  - `Swiggy` — `orders.channel = 'swiggy'`.
  - `Zomato` — `orders.channel = 'zomato'`.
- Tabs are not mutually exclusive in the data sense (an order can match `Delivery` and `Swiggy` simultaneously) — the tab bar itself is single-select UI, but the underlying filter predicates can and do overlap. This must be documented clearly for QA so "why does this order appear when I click Swiggy but not when I click Delivery" isn't treated as a bug when e.g. it's a Swiggy pickup order.
- Tab switch is client-side filtering over an already-fetched/subscribed live order set where feasible (see §5 for polling/streaming approach), to keep switching instant.

### 2.3 New View / Old View toggle + View Details switch

The reference app ships two card layouts ("New View" — condensed, and "Old View" — legacy, denser text list) plus a "View Details" switch that expands/collapses secondary information (full item list, cutlery note, rider status detail) on each card.

**Proposal: build only New View for v1, and deprecate Old View.**

Rationale:
- Maintaining two full card renderings doubles the surface area for every future field addition (SLA timer, rider status, OTP, etc.) and doubles QA cost for a screen that is already state-heavy.
- New View is the more information-dense, action-oriented layout in the reference screenshots (larger action buttons, clearer badge placement) and is very likely PetPooja's intended forward direction — legacy apps commonly carry an "Old View" purely for user habituation during a transition period, not because it is functionally superior.
- Kapmeta is a clean-room rebuild, not a pixel clone; carrying forward a deprecated legacy layout adds cost with no product benefit unless customer research says otherwise.
- Recommendation is to keep the **View Details** expand/collapse switch (it is cheap — a per-card disclosure state, not a second rendering pipeline) since it lets staff choose card density without doubling engineering cost.

**This choice needs stakeholder confirmation before v1 lock** — see §10. If Old View turns out to be required (e.g., a specific customer segment is trained on it and refuses to switch), it should be scoped as a v1.1 follow-up, not blocking this screen's initial ship.

**View Details switch (kept for v1):**
- Global toggle at the top of the screen, default **on**.
- OFF state: card shows platform badge, KOT no., bill no., elapsed timer, customer name, prepare-in countdown, and action buttons only — item lines, cutlery note, and full rider status text are collapsed.
- ON state: full card as described in §2.4.
- State persists per-user in local UI preference (not synced server-side; not tenant config — this is a personal display preference, so it lives in browser/local storage keyed by staff user id, not in the `menu_item_*` or any tenant-config tables).

### 2.4 Order card — full element inventory

Each card renders one `orders` row (joined with `order_items`, latest `aggregator_order_events`, and computed timer state). Elements, top to bottom / left to right as in the reference screenshots:

| Element | Source | Notes |
|---|---|---|
| Platform badge | `orders.channel` | Swiggy = orange badge, "SWIGGY"; Zomato = red badge, "ZOMATO"; POS-direct online / in-house = neutral gray badge "ONLINE" or "POS" per `order_type`. Badge color is a UI token, not tenant-configurable. |
| KOT no. | `orders.kot_number` | Kitchen order ticket number, generated at accept time (see §4.4 in sync-architecture doc for auto-KOT print). |
| Bill no. | `orders.bill_number` | Assigned at order creation/accept per outlet's numbering sequence (existing billing feature; not redefined here). |
| OTP | `orders.delivery_otp` | Delivery-handoff OTP shown only for `fulfillment_type = 'delivery'` orders on channels that require pickup verification (Swiggy/Zomato rider handoff). Masked by default (`••••`), tap-to-reveal, matching the reference app's privacy-conscious display; auto-reveals once rider status = `arrived`. |
| Paid flag | `orders.payment_status` | Pill: "PAID" (green) or "COD" / "PAY ON DELIVERY" (amber) depending on `orders.payment_mode`. |
| Elapsed-time clock | `orders.accepted_at` or `orders.placed_at` | Running "time since order placed" clock, format `MM:SS` then `HH:MM` past 60 minutes. Purely informational, does not drive SLA color (that's the Prepare-In timer, §4). |
| Customer name + phone | `orders.customer_name`, `orders.customer_phone` | Phone is partially masked for aggregator orders per platform privacy policy (Swiggy/Zomato mask real numbers behind proxy numbers already at the API layer — Kapmeta just displays what the webhook gives us, does not attempt to unmask). |
| Rider status text | `aggregator_order_events` latest `rider_status` event | Free text rendering of enum, e.g. "Looking for rider", "Rider assigned — <name>", "ARRIVED". Only shown for `fulfillment_type = 'delivery'` on aggregator channels; hidden for dine-in/pickup/POS-direct. |
| Item lines | `order_items` | Item name, quantity, variant/addon summary, per-line note. Collapsed under View Details OFF. |
| "Don't send cutlery" note | `orders.cutlery_preference` | Rendered only when preference = `no_cutlery`. Plain note row, not an action button. |
| "Too late, customer might cancel" warning banner | Derived, see §4.3 | Red banner, appears only once the Prepare-In timer has bred SLA breach threshold. Not a separate DB flag on its own — computed from `sla_breach = true` plus elapsed-since-breach, escalating text as time passes (see §4.3 for exact copy/threshold logic). |
| Price | `orders.total_amount` | Formatted in outlet's currency (existing currency/locale utility, not redefined here). |
| Prepare In `00:00` countdown | Computed from `orders.prepare_by` | See §4 for full timer spec. |
| **Call Customer** button | action | Initiates a masked call via telephony integration (existing "Call Customer" infra used elsewhere in Kapmeta, if present) or opens `tel:` link to the (possibly proxy) number. Disabled/hidden if no phone number present. |
| **Contact Swiggy/Zomato Help** button | action | Label switches per `orders.channel`. Deep-links to platform support flow — see §5.4. Hidden for non-aggregator orders. |
| **OOS** button | action | Opens the existing OOS-marking modal (separate feature, referenced not rebuilt here) pre-scoped to the item(s) in this order, so staff can flag an item unavailable directly from a live order without navigating away. See §6.4. |
| **Info** button | action | Opens an order-detail drawer/modal with full raw order payload, KOT history, and `order_audit_log` entries for this order — useful for dispute resolution and support escalation. |
| **Food Is Ready** button | action | Primary CTA. Marks `orders.food_ready_at = now()`, stops the Prepare-In countdown, fires outbound "food ready" webhook call to the aggregator (see §5.3), and transitions card into a "ready / awaiting pickup" visual state (green check, dimmed action buttons except Call/Contact). For dine-in/pickup orders this instead transitions to "ready for handoff" without the aggregator webhook call. |

### 2.5 Card states (visual)

1. **New / unconfirmed** — order just arrived, not yet accepted. Card has an "Accept" / "Reject" affordance (this may live on the card itself or be handled by the MFR bulk flow — see §2.6). Border: blue/neutral.
2. **Accepted, preparing** — normal state, Prepare-In timer counting down in green→amber as it approaches threshold.
3. **SLA breach / "too late"** — Prepare-In timer at or past 0, red border, red countdown text (now counting *up* in negative, e.g. `-02:15`), warning banner visible, this order also surfaces in the app-shell Alerts icon (see §4.3).
4. **Food ready** — after "Food Is Ready" tapped; green check state, dimmed to reduce visual competition with still-active cards, but stays in the feed until fully closed out (rider picked up / customer collected) — see §2.6 for what removes a card from the feed entirely.
5. **Rider stuck** — overlay/badge on top of state 2/3 when rider_status has been `looking_for_rider` beyond a configurable threshold (see §6.2). Distinct from SLA breach: this is a rider-side delay, not a kitchen-side prep delay, and should be visually distinguishable (e.g., a small courier icon with a clock, orange, vs. the full red card border for SLA breach) so staff know whether the bottleneck is their kitchen or the platform's logistics.
6. **Cancelled** — order cancelled by customer/aggregator/outlet after being in the feed; shown briefly with a "CANCELLED" strike-through state (per business-logic-rules doc's cancellation-after-accept handling) before being removed, so staff who were mid-prep get a visible signal rather than the card silently vanishing.

### 2.6 MFR bulk action button (DEC-013)

The button is unlabeled/abbreviated in the reference screenshots as "MFR." Per DEC-013 this is an open ambiguity in the decision register. This doc adopts a working assumption to allow design to proceed, and flags it for confirmation.

**Proposed meaning: "Mark Food Ready" — a bulk action that applies "Food Is Ready" to all currently-selected (or all currently-eligible) order cards in one tap.**

Reasoning for this reading over alternatives (e.g., "Manually Force Refresh", "Missed / Failed / Rejected"):
- It sits in a bulk-action bar directly above a feed whose primary per-card CTA is "Food Is Ready" — a bulk version of the single most-tapped button is the most operationally useful bulk action on this screen, and matches the pattern of similar POS kitchen-display systems that offer "mark all ready" during rush periods.
- The decision register's own framing (per project context) associates MFR with "unconfirmed" order handling, which is compatible with a reading where MFR operates over the current filtered set of not-yet-ready orders — i.e., it is a productivity shortcut for busy dinner-rush moments when many items finish cooking together (e.g., a full round of an item type).

**v1 design under this assumption:**
- MFR button sits in the bulk-action bar, disabled (grayed) when zero eligible orders are in the current filtered view.
- Tap opens a lightweight confirmation ("Mark N orders as Food Ready?") rather than firing immediately, because this action is irreversible and touches outbound aggregator webhooks for every affected order — a mis-tap during rush should not silently fire N external API calls.
- Only orders in state 2 or 3 (accepted/preparing, including SLA-breached) within the **currently active filter tab** are eligible — MFR is scoped to what's on screen, not the entire outlet's order set, so a staff member on the `Zomato` tab doing MFR does not accidentally mark Swiggy orders ready.
- Each order's "Food Is Ready" outbound call is queued individually through the existing `channel_sync_log` retry/idempotency mechanism (sync-architecture doc) — MFR is a UI batching convenience, not a new backend bulk endpoint; it issues the same per-order call the single "Food Is Ready" button issues, N times.
- Result toast: "X marked ready, Y failed — retrying" if any individual calls fail, linking to `channel_sync_log` detail for failed ones.

**This is a guess and must be confirmed with the actual PetPooja product owner or via captured production usage/analytics before final copy and behavior lock** — see §10.

### 2.7 Ordering & real-time behavior

- Cards sort by ascending `prepare_by` (soonest deadline first) within each state bucket, with breach/stuck states pinned to the top regardless of sort, so the most at-risk orders are always visually first.
- New order arrival: card animates in at top of "New / unconfirmed" bucket, plus an audible chime (configurable per outlet in an existing sound-settings screen, not redefined here) and, if the tab open doesn't match the incoming order's channel, a badge increment on the relevant filter tab.
- Feed updates via the same real-time channel used by the rest of the POS for order state (see sync-architecture doc's transport — likely WebSocket/SSE layered over the existing polling fallback); this screen does not introduce a new transport, it subscribes to `orders` + `aggregator_order_events` change events already defined there.

---

## 3. Data Model

This screen is read-heavy against `orders`, `order_items`, and `aggregator_order_events`, and write-light (a handful of status-transition writes). Below are the fields this screen requires; fields already defined in the base schema doc are marked (existing) and only new/screen-driving fields are specified in full.

### 3.1 `orders` table — additions/confirmations needed for this screen

| Column | Type | Notes |
|---|---|---|
| `channel` | enum(`pos`,`swiggy`,`zomato`) | (existing) |
| `order_type` | enum(`dine_in`,`pickup`,`delivery`,...) | (existing, confirm naming matches `fulfillment_type` used above — **naming needs reconciliation**, see §10; this doc uses `fulfillment_type` for Delivery/Pick Up tab logic and assumes it is the same column as `order_type` in the base schema, or a synonym — flag for schema-doc alignment.) |
| `kot_number` | varchar | (existing) |
| `bill_number` | varchar | (existing) |
| `delivery_otp` | varchar(6), nullable | New. Set from aggregator webhook payload (`order_placed` event) or generated at accept time for POS-direct delivery. Null for dine-in/pickup. |
| `payment_status` | enum(`paid`,`unpaid`) | (existing) |
| `payment_mode` | enum(`prepaid`,`cod`) | New (or confirm existing) — drives the paid-flag pill's amber/green + label. |
| `cutlery_preference` | enum(`default`,`no_cutlery`) | New. From aggregator payload's cutlery flag; null/`default` for channels without this concept. |
| `placed_at` | timestamptz | (existing) — order creation time, feed's elapsed clock base when `accepted_at` is null. |
| `accepted_at` | timestamptz, nullable | (existing) — set when outlet accepts the order (manual accept tap, or auto-accept per business-logic-rules doc). Starts the Prepare-In timer (see §4.1). |
| `prepare_by` | timestamptz, nullable | **New.** Computed at accept time as `accepted_at + prep_sla_minutes` (prep_sla_minutes sourced per §4.1, not hardcoded). Drives the Prepare-In countdown directly — the UI never recomputes the SLA duration client-side, it just counts down to this stored timestamp, so all clients (and the backend alert job) agree on the same deadline even under clock drift. |
| `food_ready_at` | timestamptz, nullable | **New.** Set when "Food Is Ready" (single or via MFR) is tapped. Non-null flips card into "ready" state (§2.5 state 4). |
| `sla_breach` | boolean, default false | **New.** Server-computed flag, flipped true by a backend job/trigger the moment `now() > prepare_by` and `food_ready_at IS NULL`, not purely a client-side countdown-crossed-zero visual — this ensures the Alerts icon and any manager-facing dashboard see the breach even if no staff member has the live feed open. Cleared (reset false) only on a new order cycle, never flipped back on the same order. |
| `sla_breach_at` | timestamptz, nullable | **New.** Timestamp the breach flag was set — used to compute "how late" for escalating warning-banner copy (§4.3) and for reporting/analytics later. |
| `cancelled_at` | timestamptz, nullable | (existing, confirm) |
| `cancelled_by` | enum(`customer`,`aggregator`,`outlet`), nullable | (existing, confirm) — needed to render the correct cancellation messaging on the card per §6.1. |

### 3.2 `aggregator_order_events` table — fields this screen consumes

(existing table per project context; this screen requires it to carry at least:)

| Column | Type | Notes |
|---|---|---|
| `order_id` | FK → orders | |
| `event_type` | enum(`order_placed`,`order_cancelled`,`rider_assigned`,`rider_arrived`,`rider_looking`,`food_ready_ack`,...) | Needs `rider_looking`, `rider_assigned`, `rider_arrived` as distinct event types if not already present — the card's rider-status text (§2.4) is derived from the **latest** rider-related event per order. |
| `rider_status` | enum(`none`,`looking_for_rider`,`assigned`,`arrived`,`picked_up`) | **New enum needed if not already modeled.** This is the single field the card's "Looking for rider / ARRIVED" text renders from — proposal: store it denormalized on `orders.rider_status` as well (see below) for fast card queries, with `aggregator_order_events` remaining the append-only source of truth/history. |
| `payload` | jsonb | (existing) — raw webhook body, used by the Info-button drawer. |
| `received_at` | timestamptz | (existing) — used for idempotency/ordering (§6.3). |
| `idempotency_key` | varchar | (existing per sync-architecture doc) — see §6.3. |

**Proposed denormalized field on `orders` for feed query performance:**

| Column | Type | Notes |
|---|---|---|
| `rider_status` | enum(`none`,`looking_for_rider`,`assigned`,`arrived`,`picked_up`), default `none` | **New.** Mirrors the latest `rider_status` from `aggregator_order_events` so the feed's main list query doesn't need a correlated subquery/join per card. Updated transactionally whenever a new rider-status event is ingested. Non-delivery orders stay `none` and the UI simply hides the rider-status row. |
| `rider_looking_since` | timestamptz, nullable | **New.** Set when `rider_status` transitions to `looking_for_rider`; used to compute the "stuck" threshold in §6.2. Cleared when status advances past `looking_for_rider`. |

### 3.3 `menu_item_availability` / `menu_item_channel_status`

Not written from this screen directly, but the **OOS button** (§2.4, §6.4) opens a modal that writes to these tables (existing tables per project context — OOS-marking is documented as a separate feature and is out of scope for this doc beyond the entry point). This screen only needs read access to know whether an item is *already* OOS, to swap the OOS button state to "already marked OOS" for a given item if applicable.

### 3.4 `order_audit_log`

Every screen-driven mutation (accept, food-ready single, food-ready via MFR, OOS entry point used) should write an `order_audit_log` row: `order_id`, `actor_user_id`, `action`, `previous_value`, `new_value`, `created_at`, `source_screen = 'online_live_feed'`. This is required for the Info-button drawer's history view and for dispute resolution against aggregator SLA penalty claims.

---

## 4. SLA Timer Logic ("Prepare In" countdown)

### 4.1 What starts the timer

The timer is driven entirely by the stored `orders.prepare_by` timestamp (§3.1), computed once, at the moment the order is **accepted**:

```
orders.accepted_at = now()  (set on manual accept, or auto-accept per business-logic-rules doc)
orders.prepare_by  = orders.accepted_at + prep_sla_minutes
```

`prep_sla_minutes` is **not hardcoded** (per project rule). It is sourced, in priority order:
1. Per-channel SLA override if the outlet has configured one (e.g., a tenant-level setting "Swiggy prep SLA = 12 min", "Zomato prep SLA = 15 min", "in-house = 10 min") — read from an existing/new outlet-config table (see §7).
2. Falling back to a platform-default value defined in outlet-level config, never a literal constant in the order-processing code.

The countdown displayed on the card is simply `prepare_by - now()`, recomputed client-side every second from the stored deadline; the client never invents its own SLA duration.

### 4.2 Countdown display states

| Time remaining | Display |
|---|---|
| > 25% of total SLA window remaining | Green text, format `MM:SS` |
| ≤ 25% remaining, > 0 | Amber text, same format, no banner yet |
| ≤ 0 (breached) | Red text, format switches to `-MM:SS` counting up from zero, red card border, warning banner appears (§4.3) |

(The 25% amber threshold is a proposed UX default, not a business rule sourced from the reference screenshots — confirm with design/product; it should also be config-driven rather than a hardcoded constant, sourced alongside `prep_sla_minutes` in the same config table.)

### 4.3 Breach behavior

The instant server-side `now() > prepare_by` and `food_ready_at IS NULL`:

1. A backend job (or DB trigger, depending on sync-architecture doc's existing pattern for time-based state changes — reuse whatever mechanism already exists there rather than introducing a new one) sets `orders.sla_breach = true`, `orders.sla_breach_at = now()`.
2. This flip is what the app-shell **Alerts icon** subscribes to (existing app-shell notification system) — not a client-side timer crossing zero, so a manager who has the live feed screen closed still gets alerted. The alert payload should include `order_id`, `channel`, `kot_number`, and minutes overdue, enough for the Alerts panel to deep-link back to this screen filtered/scrolled to that card.
3. On the live feed card itself, the warning banner text escalates with elapsed breach time to match the reference app's "too late, customer might cancel" messaging intent:
   - 0–2 min overdue: banner reads "Running late — mark ready as soon as possible."
   - 2 min overdue: banner reads "Too late — customer might cancel." (matches reference screenshot copy)
   - Configurable thresholds, not hardcoded minute values in source — sourced from the same config as §4.1.
4. Breach does **not** auto-cancel or auto-notify the customer — it is a staff/manager-facing signal only. Any customer-facing messaging is the aggregator platform's own responsibility once the breach also causes a platform-side SLA event (out of Kapmeta's control).

### 4.4 Worked example

Assume outlet config: Swiggy prep SLA = 15 minutes, amber threshold = 25% remaining, breach escalation to "too late" copy at 2 minutes overdue.

- `10:32:00` — Swiggy webhook `order_placed` received. `orders.placed_at = 10:32:00`. Card appears in "New / unconfirmed" bucket.
- `10:32:40` — staff taps Accept (or auto-accept fires). `orders.accepted_at = 10:32:40`. `orders.prepare_by = 10:32:40 + 15min = 10:47:40`.
- `10:32:40` → `10:44:25`: countdown shown green, e.g. at `10:40:00` display reads `07:40` remaining.
- `10:44:25`: remaining time = `03:15`, which is `3.75min / 15min ≈ 21.7%` — below the 25% amber threshold — display switches to amber.
- `10:47:40`: countdown hits `00:00`. Server job evaluates `now() > prepare_by`, sets `sla_breach = true`, `sla_breach_at = 10:47:40`. Card border turns red, countdown begins showing `-00:01`, `-00:02`, ... Alerts icon increments by 1.
- `10:47:40` → `10:49:40`: banner reads "Running late — mark ready as soon as possible."
- `10:49:41` (2 min overdue): banner copy escalates to "Too late — customer might cancel."
- `10:50:12`: staff taps **Food Is Ready**. `orders.food_ready_at = 10:50:12`. Countdown freezes/hides, card transitions to "Food ready" state (green check), outbound food-ready webhook fires to Swiggy (§5.3). Total overdue time at completion: 2 min 32 sec — recorded via `sla_breach_at` for later SLA-compliance reporting.

---

## 5. API Endpoints / Webhook Flows

This section specifies the flows this screen depends on; detailed webhook envelope/signature verification is owned by the API-contracts doc — this section covers the payload shape as consumed/produced by this screen specifically.

### 5.1 Inbound webhook: order placed

`POST /webhooks/{channel}/orders` (channel = `swiggy` | `zomato`, per API-contracts doc's existing routing)

Normalized internal shape this screen's ingestion handler should produce (mapping from each platform's raw payload is the API-contracts doc's job; below is the normalized `orders` insert this screen relies on):

```
{
  "external_order_id": "string",
  "channel": "swiggy" | "zomato",
  "order_type": "delivery" | "pickup",
  "customer_name": "string",
  "customer_phone": "string (possibly proxy)",
  "delivery_otp": "string|null",
  "cutlery_preference": "default" | "no_cutlery",
  "payment_mode": "prepaid" | "cod",
  "items": [ { "sku_ref": "string", "qty": number, "notes": "string|null" } ],
  "total_amount": number,
  "placed_at": "ISO8601",
  "idempotency_key": "string"
}
```

Handler behavior:
- Upsert into `orders` keyed by `(channel, external_order_id)`; reject/no-op duplicate deliveries using `idempotency_key` against `channel_sync_log`/`aggregator_order_events` per sync-architecture doc's existing pattern (§6.3 below covers the live-feed-specific implication).
- Do **not** set `accepted_at`/`prepare_by` at this stage unless the outlet has auto-accept enabled (business-logic-rules doc) — otherwise those are set at accept time per §4.1.
- Insert `aggregator_order_events` row, `event_type = 'order_placed'`.
- Publish real-time event so the feed's live subscription picks up the new card immediately (§2.7).

### 5.2 Inbound webhook: order cancelled

`POST /webhooks/{channel}/orders/{external_order_id}/cancel`

```
{
  "external_order_id": "string",
  "cancelled_by": "customer" | "aggregator",
  "reason": "string|null",
  "cancelled_at": "ISO8601",
  "idempotency_key": "string"
}
```

- Sets `orders.cancelled_at`, `cancelled_by`, `status → cancelled` (or per DEC-021 unified status enum — see §10).
- Insert `aggregator_order_events`, `event_type = 'order_cancelled'`.
- Live feed card transitions to "Cancelled" state (§2.5 state 6) rather than disappearing instantly, per §6.1's edge case handling.

### 5.3 Inbound webhook: rider assigned / arrived / looking

`POST /webhooks/{channel}/orders/{external_order_id}/rider-status`

```
{
  "external_order_id": "string",
  "rider_status": "looking_for_rider" | "assigned" | "arrived" | "picked_up",
  "rider_name": "string|null",
  "event_at": "ISO8601",
  "idempotency_key": "string"
}
```

- Updates denormalized `orders.rider_status` (and `rider_looking_since` if transitioning into `looking_for_rider`, §3.2).
- Insert `aggregator_order_events`, `event_type` mapped from `rider_status`.
- `arrived` status triggers the OTP auto-reveal behavior on the card (§2.4).

### 5.4 Outbound: accept order

`POST /integrations/{channel}/orders/{external_order_id}/accept` (issued by Kapmeta to the aggregator, per sync-architecture doc's outbound-call + retry pattern)

Triggered by staff's Accept tap (or auto-accept). Body per sync-architecture doc's existing accept contract; this screen's responsibility is only to trigger the call and reflect the resulting `accepted_at`/`prepare_by` computation (§4.1) once the outbound call is queued/confirmed via `channel_sync_log`.

### 5.5 Outbound: mark food ready

`POST /integrations/{channel}/orders/{external_order_id}/food-ready`

Triggered by the **Food Is Ready** button (single) or by **MFR** (looped per order, §2.6). Request body:

```
{
  "external_order_id": "string",
  "marked_ready_at": "ISO8601",
  "kot_number": "string"
}
```

Queued through `channel_sync_log` with retry + idempotency exactly as sync-architecture doc specifies for other outbound calls — this screen does not introduce a new retry mechanism, it is a new call *type* riding the existing infrastructure.

For dine-in/pickup orders (no aggregator to notify), tapping Food Is Ready only writes `food_ready_at` locally and skips the outbound call entirely.

### 5.6 Outbound: contact platform support (deep link, not a data-mutating call)

**Contact Swiggy/Zomato Help** button opens a deep link, not a Kapmeta-owned API call:
- Swiggy: `https://partner.swiggy.com/support?order_id={external_order_id}` (or the platform's documented partner-support URL scheme — actual URL to be confirmed against Swiggy/Zomato partner documentation, not invented here) opened in-app browser/new tab.
- Zomato: equivalent Zomato partner-support deep link.
- If a phone-based support line is the actual mechanism (rather than a web deep link) per platform partner docs, this button should instead present a tel: link or an in-app call — **needs confirmation against each platform's actual partner support integration**, flagged in §10.
- Kapmeta logs an `order_audit_log` entry (`action = 'contact_platform_support'`) whenever this is tapped, for support-escalation traceability, regardless of which underlying mechanism is used.

### 5.7 Outbound: cutlery preference acknowledgement

If the platform's API expects an ack that the outlet received/honored the cutlery preference (some aggregators require this for compliance/reporting), issue:

`POST /integrations/{channel}/orders/{external_order_id}/cutlery-ack`

This is not directly a button on the card — it can be fired automatically the moment `cutlery_preference` is read and rendered (i.e., ack-on-display), or bundled into the accept call, depending on what the actual platform contract requires (API-contracts doc should confirm whether this is a real requirement or unnecessary — flagged in §10 if unconfirmed).

---

## 6. Business Logic / Edge Cases

### 6.1 Order cancelled by aggregator after kitchen already started prep

- Webhook (§5.2) can arrive at any point, including after `accepted_at` is set and prep is underway.
- Card must **not** silently disappear — transitions to "Cancelled" state (§2.5 state 6) with a visible strike-through and a brief "This order was cancelled by {customer|aggregator}" toast, remaining on screen for a configurable grace period (proposed default 30 seconds, sourced from config not hardcoded) before being removed from the active feed, so a staff member who already started cooking sees the cancellation rather than continuing to prep an order that vanished.
- `order_audit_log` records the cancellation with `previous_value = accepted/preparing`, so downstream reporting can flag "cancelled after prep started" cases distinctly from "cancelled before accept" — this is operationally important for food-waste tracking and for any dispute with the aggregator over compensation for wasted prep.
- Business-logic-rules doc should be the source of truth for whether outlets get any compensation-claim workflow triggered here; this screen only surfaces the state, it does not implement compensation logic.

### 6.2 Rider stuck "looking for rider" beyond threshold

- `orders.rider_looking_since` (§3.2) plus a configurable `rider_stuck_threshold_minutes` (outlet/channel config, not hardcoded) drives a "Rider stuck" visual (§2.5 state 5).
- This is independent of the kitchen-side SLA breach — an order can be `food_ready_at` set (kitchen done) while still showing rider-stuck, in which case the card should read as "Ready, waiting for rider" rather than any kitchen-blame messaging, since the bottleneck has moved off the kitchen.
- No automatic cancellation or reassignment is performed by Kapmeta — this is purely a visibility/escalation signal so staff can use Contact Platform Support (§5.6) proactively.

### 6.3 Duplicate webhook delivery (idempotency)

- Every inbound webhook in §5.1/5.2/5.3 carries `idempotency_key` (per sync-architecture doc's existing convention for outbound calls; the same discipline must apply inbound).
- Ingestion handler checks `aggregator_order_events` for an existing row with the same `(order_id, event_type, idempotency_key)` before applying any state mutation; a duplicate delivery is logged (for observability) but produces no second state transition, no second real-time push to the feed, and no duplicate `order_audit_log` entry.
- Specifically for `order_placed` duplicates: must not create a second `orders` row — upsert keyed on `(channel, external_order_id)` as noted in §5.1, with the idempotency check as a second layer of protection against race conditions where two webhook deliveries are processed concurrently.
- Specifically for `rider-status` duplicates/out-of-order delivery: handler should also guard against an out-of-order older event overwriting a newer one — compare `event_at` against the currently stored `rider_status` event's timestamp before applying, not just dedupe by key.

### 6.4 OOS triggered from this screen

- Tapping **OOS** on a card opens the existing OOS-marking modal (separate feature/doc), pre-populated with the item(s) from that order's `order_items`.
- This screen's only responsibilities: (a) launch the modal with the correct pre-scoped item context, (b) on modal close/save, refresh the card's OOS-button visual state to reflect the item now being unavailable (reading from `menu_item_availability`/`menu_item_channel_status`), (c) write an `order_audit_log` entry noting OOS was initiated from this order's card, for traceability of which live order prompted the flag.
- This screen does **not** re-implement OOS-marking business logic (channel-specific propagation, menu sync to Swiggy/Zomato menu APIs, etc.) — that lives entirely in the OOS feature's own doc.

### 6.5 Contact Swiggy/Zomato support routing per platform

Covered mechanically in §5.6; the business rule is: the button label and destination must switch based on `orders.channel`, never presenting a generic "Contact Support" for an aggregator order, and never appearing at all for POS-direct orders (there is no external platform to contact).

### 6.6 Unify order status (DEC-021 dependency)

This screen's card states (§2.5) are currently specified as UI-layer derived states computed from multiple fields (`accepted_at`, `food_ready_at`, `sla_breach`, `cancelled_at`, `rider_status`) rather than a single canonical `orders.status` enum, because DEC-021 (unifying order status across the system) is still open per the decision register. Once DEC-021 resolves, this screen's card-state derivation should be revisited to read from the unified status field directly where possible, to avoid two systems (this screen's local state machine vs. the canonical order status) drifting out of sync. Flagged in §10.

---

## 7. Admin/Config Dependency

Nothing on this screen is tenant-configured *content* — every element renders live transactional order data, consistent with the project rule against hardcoding business/tenant data in source. However, the screen's **behavior** depends on the following configuration, which must be read from existing (or newly added) config screens/tables rather than hardcoded:

| Config needed | Likely owning screen/table | Used for |
|---|---|---|
| Per-channel prep SLA minutes (Swiggy/Zomato/in-house) | Outlet settings / channel settings (existing or new "SLA settings" panel) | §4.1 Prepare-In timer duration |
| Amber-threshold percentage, breach-escalation minute thresholds | Same SLA settings panel | §4.2, §4.3 |
| Rider-stuck threshold minutes | Same or delivery-settings panel | §6.2 |
| Auto-KOT print on accept (yes/no, printer routing) | Existing print-settings screen | Whether accepting an order on this screen also fires a physical KOT print — this screen triggers the existing print pipeline, does not reimplement it |
| Tax rules per channel | Existing tax-rules config | Card's price display must reflect channel-specific tax treatment already computed by order-total logic elsewhere; this screen only displays `orders.total_amount`, it does not compute tax |
| Sound/chime on new order | Existing notification-settings screen | §2.7 new-order chime |
| Cancellation-card grace period before removal | SLA settings panel (or a general feed-behavior settings panel) | §6.1 |

This screen should not ship with any of the above as literal constants in source — each must resolve through outlet/tenant config lookups, with sane platform-level defaults defined in configuration (not code) for outlets that haven't customized them.

---

## 8. Permissions

Proposed role-permission matrix (to be reconciled against the project's actual role model, which is not detailed in the provided context — flagged in §10 if a formal roles/permissions doc exists elsewhere):

| Action | Kitchen staff | Counter staff | Shift/Outlet Manager | Support/read-only role |
|---|---|---|---|---|
| View live feed | Yes | Yes | Yes | Yes |
| Accept / reject order | Yes | Yes | Yes | No |
| Mark Food Is Ready (single) | Yes | Yes | Yes | No |
| MFR bulk mark ready | With confirmation prompt (§2.6) — proposed **manager-only** given its blast radius across multiple outbound aggregator calls at once | No (proposed) | Yes | No |
| Call Customer | Yes | Yes | Yes | No |
| Contact Swiggy/Zomato Help | Yes | Yes | Yes | Yes (view/escalate) |
| Trigger OOS from card | Yes | Yes | Yes | No |
| View Info/audit drawer | Yes | Yes | Yes | Yes |
| Toggle New/Old View, View Details | Yes (personal pref) | Yes | Yes | Yes |

Rationale for restricting MFR to managers: it is the single highest-blast-radius action on the screen (N outbound aggregator calls fired at once, all irreversible), so gating it behind a manager role reduces the risk of accidental mass-mis-marking during a busy shift by junior staff — **this restriction is a proposal, not sourced from the reference screenshots, and should be confirmed against actual PetPooja role behavior once DEC-013's MFR meaning is confirmed** (§10).

---

## 9. Test Plan

### 9.1 Webhook idempotency test
- **Setup:** Send an `order_placed` webhook for a new external_order_id.
- **Steps:** Immediately replay the identical payload (same `idempotency_key`) 3 times in quick succession, simulating aggregator retry behavior.
- **Expected:** Exactly one `orders` row created, exactly one `aggregator_order_events` row for `order_placed`, exactly one real-time push to the live feed, exactly one card rendered client-side.
- **Variant:** Repeat for `order_cancelled` and `rider-status` webhooks; confirm no duplicate state transitions and no duplicate `order_audit_log` entries.
- **Variant (out-of-order):** Send `rider_status = arrived` followed (out of order, e.g. due to network reordering) by an older `rider_status = assigned` event with an earlier `event_at`. Expected: card still shows `arrived` (or newer of the two), stale event does not overwrite.

### 9.2 SLA breach timer test (using §4.4 worked example)
- **Setup:** Outlet config: Swiggy prep SLA = 15 min, amber threshold = 25%, breach escalation to "too late" copy at 2 min overdue.
- **Steps:** Create order at `10:32:00`, accept at `10:32:40`. Advance clock (test clock injection / freeze-time) to `10:44:25`; assert card shows amber, `03:15` remaining. Advance to `10:47:40`; assert `sla_breach = true`, `sla_breach_at = 10:47:40`, card red, Alerts icon count +1. Advance to `10:49:41`; assert banner copy switched to "too late" variant. Mark Food Is Ready at `10:50:12`; assert countdown stops, card transitions to ready state, `food_ready_at = 10:50:12` stored.
- **Expected:** All transition timestamps match exactly; no drift between server-computed `sla_breach` flag and client-displayed red state (test both the API/job-driven flag and the UI countdown independently, they should agree).

### 9.3 Cancelled-order-after-KOT test
- **Setup:** Order accepted, `accepted_at` set, KOT printed (or KOT-print step simulated/stubbed).
- **Steps:** Send `order_cancelled` webhook with `cancelled_by = 'aggregator'`.
- **Expected:** Card transitions to "Cancelled" state with strike-through and correct attribution text ("cancelled by aggregator"), remains visible for the configured grace period, then is removed from the active feed. `order_audit_log` entry records `previous_value` reflecting the in-progress/accepted state at time of cancellation, so it is distinguishable from a pre-accept cancellation.

### 9.4 MFR bulk action test
- **Setup:** 3 eligible orders visible in the currently active filter tab (e.g., `Zomato` tab): 2 accepted/preparing, 1 already SLA-breached; plus 1 ineligible order (already `food_ready_at` set) also on screen; plus 2 Swiggy orders NOT on the current tab.
- **Steps:** Tap MFR, confirm the confirmation dialog shows "Mark 3 orders as Food Ready?" (matching only the eligible count in the active tab, excluding the already-ready order and excluding the off-tab Swiggy orders). Confirm.
- **Expected:** All 3 eligible orders get `food_ready_at` set and an outbound food-ready call queued via `channel_sync_log` for each; the already-ready order is untouched; the 2 off-tab Swiggy orders are untouched. Simulate one of the 3 outbound calls failing (mock a 5xx from the aggregator sync layer): expected result toast reads "2 marked ready, 1 failed — retrying," and the failed order's card shows a retry-pending indicator, resolved automatically once `channel_sync_log`'s retry mechanism succeeds (or surfaced to Info drawer if it exhausts retries, per sync-architecture doc's existing failure-surfacing pattern).
- **Permission variant:** Attempt MFR as a non-manager role per §8's proposed matrix; expect the action to be unavailable/disabled, confirming the permission gate — this sub-test should be marked pending until §8's role restriction is confirmed with stakeholders.

### 9.5 Additional recommended cases
- View Details OFF/ON toggle correctly collapses/expands item lines, cutlery note, rider status text without losing card action buttons.
- Filter tab counts update in real time as new orders arrive and as orders transition to Cancelled/Food-ready-and-closed-out states.
- OTP masking/reveal: confirm OTP stays masked until `rider_status = arrived`, and confirm it is never present at all for non-delivery orders.
- Rider-stuck visual appears/clears correctly around the configured threshold, independent of and simultaneous-with SLA breach visual, per §6.2.
- Dine-in/pickup order: confirm no rider-status row, no OTP, no "Contact Platform Support" button rendered, and Food Is Ready skips the outbound webhook call entirely.

---

## 10. Open Questions / Flags for Stakeholder

1. **MFR button meaning (DEC-013).** This doc assumes "Mark Food Ready" bulk action, scoped to the current filter tab, manager-gated. This must be confirmed against actual PetPooja product intent/captured usage before v1 UI copy and permission gating are locked. If the real meaning differs (e.g., it relates to unconfirmed-order rejection rather than food-ready), §2.6, §8, and §9.4 need rework.
2. **New View vs Old View sunset.** This doc proposes building only New View and deprecating Old View for v1. Needs explicit stakeholder sign-off — if any current customer segment is contractually or operationally dependent on Old View, this becomes a scoped v1.1 addition rather than a full deprecation.
3. **Unify order status (DEC-021).** This screen currently derives card state from multiple discrete fields (`accepted_at`, `food_ready_at`, `sla_breach`, `cancelled_at`, `rider_status`) rather than one canonical status enum. Once DEC-021 resolves the unified-status design, this screen's state-derivation logic (§2.5, §6.6) should be revisited to consume the unified field, to avoid two parallel state representations drifting apart.
4. **`order_type` vs `fulfillment_type` naming.** §3.1 flags a possible naming mismatch between the base schema doc's `order_type` column and this doc's use of `fulfillment_type` for the Delivery/Pick Up tab filters. Needs a quick reconciliation pass against the actual DB schema doc before implementation.
5. **Contact Support mechanism per platform.** §5.6 assumes a web deep link for both Swiggy and Zomato partner support; actual mechanism (deep link vs. phone number vs. in-partner-app handoff) needs confirmation against each platform's current partner documentation, since this affects whether the button opens a browser tab or places a call.
6. **Cutlery-preference acknowledgement requirement.** §5.7 flags that it's unconfirmed whether either platform's API actually requires an explicit ack call for cutlery preference, or whether displaying the note to staff is sufficient compliance. Needs confirmation from API-contracts doc / platform partner docs.
7. **Amber-threshold and breach-escalation timing values.** §4.2/§4.3 propose default values (25% remaining → amber; 2 minutes overdue → "too late" copy escalation) that are not sourced from the reference screenshots and should be validated against actual PetPooja behavior or product/ops preference before lock, even though they are implemented as configurable rather than hardcoded.
8. **Role/permission model reconciliation.** §8's proposed permission matrix, especially the manager-only gate on MFR, is a proposal not grounded in an existing roles doc from the provided project context. Needs to be checked against Kapmeta's actual role/permission system once that doc is available.
