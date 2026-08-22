# Kapmeta — Feature Build Plan: Table / Floor View

**Doc ID:** ARTIFACT-01
**Screen:** Table / Floor View (POS home screen for dine-in operations)
**Status:** Draft for engineering handoff
**Depends on:** DB schema draft (restaurant_tables, table_sessions, outlets, orders, order_items, order_payments), API-contracts doc, sync-architecture doc, business-logic-rules doc, decision-register (DEC-013..024)
**Author note:** This plan assumes DEC-023 (outlet_id scoping applied everywhere now) and DEC-021 (unified order-status enum) are in force. Every table below carries `outlet_id`.

---

## 1. Purpose & User Story

### Who uses this screen
- **Waiters / Captains** — the primary users. They open this screen at the start of a shift and return to it between every order action. It is the "home base" of dine-in service.
- **Cashiers / Billing staff** — use it to identify which tables are ready to bill (green "printed" state) and to trigger payment collection.
- **Restaurant Managers / Outlet Admins** — use it to monitor floor occupancy, reassign tables, and manage table setup (via the Add Table action, which opens into admin-configured zones).
- **Kitchen-facing staff generally do not use this screen** — KOT views are separate, but this screen is the trigger point for "Move KOT/Items" when a guest changes tables.

### When it's used
- Start of service: staff scans the floor to see which tables are free (grey/blank).
- Mid-service: staff taps an occupied table to open its running order, add items, or view details (eye icon).
- End of a table's visit: staff prints the bill (printer icon), collects payment, and the table transitions back to blank once settled and the session is closed.
- Continuously in the background: the grid must reflect near-real-time state so two staff members don't both seat guests at the same table, and so a manager can see turn times at a glance.

### Why it exists
PetPooja-style table service restaurants run multiple concurrent orders across a physical floor plan. Without a floor view, staff must remember table-to-order mapping manually, which causes billing errors, double-seating, and missed KOTs. The floor view is the single source of truth for "what is happening on the floor right now."

---

## 2. UI Spec

### 2.1 Top Toolbar
| Element | Behavior |
|---|---|
| **Legend key** | Static/collapsible popover showing the 5 state colors and their labels (Blank, Running, Running-KOT, Printed, Paid). Pulled from a config table, not hardcoded strings (see §7). |
| **Manual refresh icon** | Triggers an immediate re-fetch of the table grid (`GET /api/v1/outlets/{outlet_id}/tables/grid`), bypassing the normal poll interval countdown. Shows a spin animation for the duration of the request. Disabled (greyed, non-clickable) for 2 seconds after each use to prevent hammering the API. |
| **Add Table** | Opens a modal to create a new table in a zone. Only enabled for roles with `table:create` permission (see §8). If no zones exist yet for the outlet, the modal redirects to "Add Zone" flow first (admin config, §7) — never silently creates an unzoned table. |
| **Delivery** | Navigates to the Delivery order-entry screen (out of scope for this doc — cross-referenced only). Does not consume a table card. |
| **Pick Up** | Navigates to the Pick Up order-entry screen (out of scope for this doc). |
| **Move KOT/Items** | Opens a two-step picker: "From table" then "To table" (or free-form order search), then confirms the move. Only enabled when at least one occupied table exists. Disabled entirely if the staff member lacks `order:move` permission. |

### 2.2 Zone Grouping
- Tables are grouped under **zone headers** (e.g. "AC", "Non AC", "Garden", "Rooftop") — each a horizontal section with a sticky label.
- Zones render in `display_order` ascending (admin-configurable, see §7).
- A zone with zero tables is hidden from the view entirely (not shown as an empty section) — reduces clutter and avoids implying a broken zone.
- Zone header optionally shows an occupancy summary, e.g. "AC (7/15 occupied)" — computed client-side from the fetched grid payload, not a separate query.

### 2.3 Table Card
Each card is a fixed-aspect-ratio tile (recommend square-ish, ~96–120px, actual sizing responsive per §2.5) showing:

- **Table code** (e.g. "A1", "B12") — large, centered, primary label. Sourced from `restaurant_tables.table_code`, never hardcoded.
- **Background color** per state (see §2.4 for the state→color mapping and §3.2 for how state is derived):
  - Grey = Blank (no active session)
  - Blue = Running (active session, order placed, KOT not yet all printed — actually: order open, at least one item ordered, kitchen has not completed KOT print cycle) — see exact definition in §3.2
  - Yellow = Running-KOT (a KOT has just been sent to kitchen and is pending acknowledgment/print, i.e. transient "in-flight" sub-state)
  - Green = Printed (bill has been printed, awaiting payment)
  - Orange = Paid (payment captured, session pending close/table pending clear by staff — a brief "just paid, not yet cleared" state)
- **Elapsed time** (occupied cards only) — "MM:SS" or "Hh Mm" since `table_sessions.seated_at` (or `opened_at`), refreshed client-side every 60s via local timer, not re-fetched from server each tick (see §5).
- **Running amount** (occupied cards only) — current order total including tax, e.g. "₹1,240" — sourced from the grid payload's `running_amount` field (server-computed, see §3.4), not computed client-side from line items (client doesn't have line items on this screen).
- **Quick-action icons** (occupied cards only, bottom-right corner of card):
  - **Printer icon** — "Print Bill" — triggers bill print for that table's active order without navigating away. Disabled/hidden if order has zero items.
  - **Eye icon** — "View" — navigates to the Order Detail / Billing screen for that table's active session.
- **Session/order badge** (optional, small corner tag) — e.g. covers count ("4 pax") if captured at seating.

### 2.4 State → Color Legend (config-driven, not hardcoded)
| State enum | Color | Label shown in legend |
|---|---|---|
| `blank` | Grey `#9E9E9E` | Blank |
| `running` | Blue `#2196F3` | Running |
| `running_kot` | Yellow `#FFC107` | KOT Running |
| `printed` | Green `#4CAF50` | Bill Printed |
| `paid` | Orange `#FF9800` | Paid |

These pairs live in a `table_state_display_config` table (outlet_id-scoped, with sane global defaults) — see §7. Never inline these hex codes as "business logic" in components beyond a theme-token layer; the state **enum** itself is fixed application logic (code), but its **color/label presentation** is configurable per the no-hardcode rule since PetPooja's own admin allows recoloring the legend in some deployments. If stakeholder confirms colors are always fixed system-wide, this can collapse to a static theme constant — flagged in §10.

### 2.5 Layout Behavior
- **Grid**: CSS grid / flex-wrap per zone section, fixed card min-width (e.g. 100px) with `auto-fill`, so cards reflow to fill available width and wrap to new rows.
- **Scroll**: The whole screen scrolls vertically (toolbar sticky at top, zone headers sticky within their section optionally). No horizontal scroll — cards always wrap.
- **Responsive**: On narrow viewports (tablet portrait, common for POS terminals), reduce columns naturally via `auto-fill`; card min-width may shrink to ~80px with font-size scaling. On very small viewports, consider collapsing zone sections into an accordion (default: expanded).
- **Empty states**:
  - No zones configured at all for the outlet → full-screen empty state: "No tables set up yet" + CTA button "Add your first zone" (admin flow).
  - Zones exist but a specific zone has 0 tables → zone section hidden (per §2.2).
  - All tables blank (normal slow period) → grid renders normally, no special empty state needed.
- **Loading states**:
  - Initial load → skeleton grid (grey placeholder cards matching last-known zone/table count if cached locally; otherwise a generic 3-zone skeleton).
  - Manual refresh → spinner on refresh icon only; existing grid stays visible (no full-screen loading flash) until new data arrives, then diffs in.
  - Background poll refresh → silent; no loading indicator at all (avoid flicker), grid updates in place when data changes.
- **Stale/offline indicator**: If the local outlet-server is unreachable (see §5.3), show a small persistent banner: "Showing last known state — reconnecting…" with a timestamp of last successful sync, and cards that may be stale get a subtle diagonal-hatch overlay or reduced opacity.

---

## 3. Data Model

### 3.1 `restaurant_tables` (proposed full column list)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID / bigint PK | |
| `outlet_id` | FK → outlets.id, NOT NULL | DEC-023 scoping |
| `zone_id` | FK → table_zones.id, NOT NULL | see §3.3 new table |
| `table_code` | varchar(10), NOT NULL | e.g. "A1"; unique per (outlet_id, zone_id) |
| `display_order` | int, NOT NULL default 0 | ordering within zone grid |
| `capacity` | smallint, nullable | seating capacity, optional display use |
| `shape` | enum(`square`,`round`,`rect`), nullable | future floor-plan visual use; not required for MVP grid but cheap to add now |
| `is_active` | boolean, NOT NULL default true | soft-disable a table without deleting (e.g. table removed from floor temporarily) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | soft delete |

Note: `restaurant_tables` does **not** store current state — state is always derived (see §3.2). Storing a mutable `current_state` column directly on the table row is tempting for read speed but creates a dual-source-of-truth risk against `table_sessions`/`orders`; MVP recommendation is derive-on-read with a materialized/cached view for performance (§3.4), and revisit only if query load demands denormalization.

### 3.2 `table_zones` (new table, not yet in schema — flagging as required addition)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID / bigint PK | |
| `outlet_id` | FK → outlets.id, NOT NULL | |
| `name` | varchar(50), NOT NULL | e.g. "AC", "Non AC" |
| `display_order` | int, NOT NULL default 0 | |
| `is_active` | boolean, NOT NULL default true | |
| `created_at` / `updated_at` | timestamptz | |

**Flag for schema doc owner:** this table must be added to the DB-schema draft; it is a prerequisite for `restaurant_tables.zone_id`.

### 3.3 `table_sessions` (proposed full column list)

A session represents one continuous occupancy of a table from seating to clearing.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID / bigint PK | |
| `outlet_id` | FK → outlets.id, NOT NULL | |
| `table_id` | FK → restaurant_tables.id, NOT NULL | |
| `order_id` | FK → orders.id, nullable | null until first order is created for this seating; a session can theoretically exist with no order yet (table marked occupied pre-order in some workflows) — see open question in §10 |
| `status` | enum(`open`,`closed`,`merged_out`) | `merged_out` used when this session's order was moved into another session via table-merge (§6.1), preserving history without deleting the row |
| `seated_at` | timestamptz, NOT NULL | when session opened / table marked occupied |
| `pax_count` | smallint, nullable | covers, if captured |
| `closed_at` | timestamptz, nullable | when session ended (post-payment + table cleared) |
| `opened_by_staff_id` | FK → staff/users.id | who seated / opened |
| `closed_by_staff_id` | FK → staff/users.id, nullable | who cleared |
| `created_at` / `updated_at` | timestamptz | |

**Derived table state (`blank`/`running`/`running_kot`/`printed`/`paid`)** is computed from a join of the *currently open* `table_sessions` row (if any) for a table against its linked `orders` row:

```
if no open table_session for the table            -> blank
else look at orders.order_status (DEC-021 enum) and orders.kot_state:
  order_status = 'draft' / no items yet             -> running (or arguably still blank until 1st item; see §10)
  a KOT was just fired and not yet ack'd by kitchen  -> running_kot
  order has items, no bill printed yet               -> running
  order.bill_printed_at IS NOT NULL AND
    order_payments has no completed payment           -> printed
  order_payments has a completed payment covering
    order total AND session still open (not cleared)  -> paid
```

This logic depends on fields that must exist on `orders` (already drafted, per API-contracts doc): `order_status`, `bill_printed_at`, and a running total. It also depends on a `kot_state` concept — **flag:** confirm with business-logic-rules doc owner whether `running_kot` (yellow) is tracked at the order level or per-KOT-batch level (an order could have KOT batch #1 acknowledged and KOT batch #2 just fired — table should probably still show yellow if *any* batch is pending ack). Recommend adding `orders.last_kot_fired_at` and `orders.last_kot_ack_at`; `running_kot` = `last_kot_fired_at > last_kot_ack_at` (or ack is null).

### 3.4 Elapsed minutes & running amount — computation strategy

- **Elapsed minutes**: `now() - table_sessions.seated_at`. Computed at query time on the server for the initial payload (`elapsed_seconds` returned as an integer), then the client runs its own local ticking timer (updates the displayed value every 60s) rather than re-querying the server every minute. This avoids both server load and clock-drift-sensitive designs; the server value is treated as the authoritative anchor, client just increments visually.
- **Running amount**: computed server-side from `SUM(order_items.quantity * order_items.price) + tax - discounts` for the order linked to the open session, **not** cached as a stored column on the session by default (avoids write-amplification and staleness bugs on every item add/remove). For MVP with local LAN outlet-server (per sync-architecture doc), this is a cheap local Postgres/SQLite query against a handful of concurrently open orders — real-time computation is fine at this scale (a single outlet rarely has >60 simultaneously open tables).
- **If profiling later shows this join is expensive** (e.g. large multi-outlet cloud reporting queries), introduce a maintained `orders.running_total` column updated via trigger/application-level update whenever order_items change — flagged as a future optimization, not MVP-required given the outlet-server's expected order-of-magnitude data volume.

---

## 4. API Endpoints

All endpoints are served by the **local outlet-server** (per sync-architecture doc — table/floor operations must work even when the outlet is offline from cloud). Base path: `/api/v1/outlets/{outlet_id}/...`. Auth: Bearer token (staff session), role-checked per §8.

### 4.1 `GET /api/v1/outlets/{outlet_id}/tables/grid`
Returns the full zone + table + live-state payload for the floor view.

**Response 200:**
```json
{
  "zones": [
    {
      "zone_id": "uuid",
      "name": "AC",
      "display_order": 1,
      "tables": [
        {
          "table_id": "uuid",
          "table_code": "A1",
          "state": "running",
          "session_id": "uuid | null",
          "order_id": "uuid | null",
          "seated_at": "2026-08-21T12:03:00Z | null",
          "elapsed_seconds": 1620,
          "running_amount": 1240.50,
          "pax_count": 4,
          "can_print_bill": true
        }
      ]
    }
  ],
  "server_time": "2026-08-21T12:30:00Z",
  "last_updated_at": "2026-08-21T12:30:00Z"
}
```
`server_time` lets the client correct for clock drift when starting its local elapsed-time ticker.

### 4.2 `POST /api/v1/outlets/{outlet_id}/tables`
Add a table (used by Add Table modal — but per §7, this endpoint is really the admin-facing table CRUD, surfaced conveniently from this screen).

**Request:**
```json
{ "zone_id": "uuid", "table_code": "A16", "capacity": 4, "display_order": 16 }
```
**Response 201:** the created table row. **409** if `table_code` already exists within that zone/outlet.

### 4.3 `PATCH /api/v1/outlets/{outlet_id}/tables/{table_id}`
Edit table metadata (code, capacity, zone, display_order, is_active). Blocked (409) if table has an open `table_session` and the edit affects `zone_id` or attempts `is_active=false` (see §6.4).

### 4.4 `DELETE /api/v1/outlets/{outlet_id}/tables/{table_id}`
Soft-deletes (`deleted_at`). **409 Conflict** if an open `table_session` exists for the table.

### 4.5 `POST /api/v1/outlets/{outlet_id}/table-sessions`
Open a new session (seat a table) — typically called when staff taps a blank table and starts an order, or explicitly via a "Seat Table" action.
```json
{ "table_id": "uuid", "pax_count": 4 }
```
**409** if the table already has an open session (guards concurrent double-seat, see §6.5).

### 4.6 `POST /api/v1/outlets/{outlet_id}/table-sessions/{session_id}/print-bill`
Triggered by the printer quick-icon. Marks `orders.bill_printed_at`, sends print job to configured printer (per outlet_print_settings), transitions state to `printed`.

### 4.7 `POST /api/v1/outlets/{outlet_id}/tables/move`
The "Move KOT/Items" action.
```json
{
  "from_session_id": "uuid",
  "to_table_id": "uuid",
  "mode": "full_move" | "merge",
  "order_item_ids": ["uuid", "..."]   // optional; omitted = move all items
}
```
See §6.2/6.3 for full semantics. **Response 200** returns the resulting session(s) state. **409** if `to_table_id` already has an open session and `mode` is `full_move` (must be `merge` in that case, or destination must be blank).

### 4.8 `POST /api/v1/outlets/{outlet_id}/table-sessions/{session_id}/close`
Clears a table after payment (transitions `paid` → session closed → table becomes `blank`). Requires order to be fully paid (order_payments sum >= order total) unless a manager override flag is passed (audit-logged to `order_audit_log`).

### 4.9 `GET /api/v1/outlets/{outlet_id}/table-zones`
List zones (feeds Add Table modal's zone dropdown, and the admin config screen).

### 4.10 Role requirements summary for this section
See §8 for the full matrix; endpoints 4.2–4.4 and zone CRUD require `table:manage`; 4.5/4.6/4.8 require `table:operate` (waiter-level); 4.7 requires `order:move`.

---

## 5. Real-Time Behavior

### 5.1 Polling recommendation
**Poll interval: 8–10 seconds** for the grid endpoint (`GET .../tables/grid`) while the screen is in the foreground.

Rationale:
- This is a LAN-local call to the outlet-server (per sync-architecture doc), not a cloud round-trip, so cost/latency per call is negligible (~single-digit ms typical LAN response).
- Staff decision-making tolerance for staleness on a floor view is roughly "a few seconds" — a waiter glancing at the grid to decide which table to seat next doesn't need sub-second accuracy, but 30s+ staleness risks two staff seating the same table (mitigated further by the server-side 409 guard in §4.5 regardless).
- 8–10s balances responsiveness against unnecessary battery/CPU churn on tablet POS terminals running all shift.
- **Recommend switching to WebSocket/SSE push in a later iteration** once the outlet-server has a pub/sub layer, since it would eliminate the small residual staleness window and reduce chattiness further — but polling is the pragmatic MVP choice given the sync-architecture doc describes the outlet-server as a fairly simple local service today. Flagged as a future enhancement, not blocking MVP.
- Poll pauses when the browser/app tab is backgrounded (`visibilitychange`) and resumes + immediately re-fetches on foreground, to avoid a stale grid greeting the user when they switch back.

### 5.2 Manual refresh
- Immediately issues one `GET .../tables/grid` call outside the poll cycle, resets the poll timer to start counting from that point (avoid a redundant near-simultaneous poll firing right after).
- UI feedback: spin icon during request; icon disabled for 2s cooldown after completion to discourage spamming.

### 5.3 Offline / outlet-server unreachable behavior
Per sync-architecture doc, the outlet-server is the LAN-local source of truth; cloud is eventually-consistent. This screen only ever talks to the **local** outlet-server, so "offline" here specifically means the local server itself is briefly unreachable (network hiccup, service restart), not a cloud connectivity issue.

- On a failed poll/refresh call: keep showing the last successfully fetched grid (do not blank the screen).
- Show the stale-data banner described in §2.5 ("Showing last known state — reconnecting…") with the timestamp of `last_updated_at` from the last good response.
- Retry with exponential backoff (e.g. 2s, 4s, 8s, capped at 15s) until a successful response, then resume normal 8–10s polling and clear the banner.
- Action buttons (print bill, move KOT, add table) remain visually enabled but show an inline error toast ("Cannot reach outlet server — try again") if attempted while disconnected, rather than being preemptively disabled — since a brief blip may resolve mid-attempt and a hard-disabled button is a worse UX than an occasional failed action with clear feedback.
- This screen never falls back to querying the cloud directly for table state — cloud sync lag would make double-seating risk worse, not better; local outlet-server is the only permitted source for this screen per the sync-architecture doc's design intent.

---

## 6. Business Logic / Edge Cases

### 6.1 Merging tables
Guests ask to combine two occupied tables (or add a blank table to an occupied one) into one bill.
- Triggered via "Move KOT/Items" with `mode: "merge"`.
- All `order_items` from the source session's order are re-parented (via `order_items.order_id` update) onto the destination session's order.
- Source `table_session.status` → `merged_out`, `closed_at` set, but the row is **retained** (not deleted) for audit trail (`order_audit_log` gets a `TABLE_MERGE` entry referencing both session IDs).
- Source table becomes `blank` immediately.
- Destination order's KOT/bill numbering is untouched (see §6.3 — numbering always follows the order, and here the destination order is the surviving one).
- If the source order already had a KOT fired to kitchen, those KOT line items are **not re-sent** to kitchen (kitchen already has them); only newly added items after the merge would generate a fresh KOT under the destination order/table.
- Blocked (409) if either session has an unresolved payment discrepancy (e.g. destination already has a partial payment recorded that doesn't cleanly reconcile) — flagged as needing a manager-override path; see §10.

### 6.2 Splitting a table's order
Not explicitly shown in the screenshots as a distinct button, but implied by "Move KOT/Items" with a partial `order_item_ids` list moving to a **new blank table** rather than an occupied one.
- Selected `order_item_ids` are re-parented to a **newly created order** under a **newly opened session** on the destination table.
- The original order retains its own bill/KOT numbers; the new order on the destination table gets its **own fresh local sequence numbers** (bill number, KOT number) per the sync-architecture doc's local-sequence numbering rule — a split is functionally a new order, not a continuation.
- If any moved items already had a KOT fired under the original order, business-logic-rules doc must clarify whether the kitchen needs a corrective ticket (e.g. "moved to Table B12") — recommend generating an informational KOT reprint flagged `MOVED`, not a duplicate charge-bearing KOT. **Flag for business-logic-rules doc owner.**

### 6.3 Moving KOT from one table to another (simple move, not split/merge)
- Destination table must be `blank` (no open session) for a straightforward full move — this is the common case (guest physically relocates, e.g. from a noisy table to a quieter one).
- The **existing** `order_id` is simply re-pointed: `table_sessions.table_id` conceptually changes — implemented as: close old session (`status = 'closed'`, reason `MOVED`), open new session on destination table, same `order_id` carried over.
- **Bill number and KOT number do NOT change** — they belong to the order, and the order is the same order, just now associated with a different table via the new session. This preserves numbering integrity per the sync-architecture doc (local sequence numbers must never be reused or reassigned).
- `order_items` are untouched (no re-parenting needed since the order itself didn't change).
- `order_audit_log` gets a `TABLE_MOVE` entry: `{from_table_id, to_table_id, session_id_old, session_id_new, moved_by_staff_id, timestamp}`.

### 6.4 What blocks deleting/editing a table with an active session
- `DELETE` and `PATCH` (for `zone_id` change or `is_active=false`) on `restaurant_tables` both check for an open `table_sessions` row (`status = 'open'`) and return **409 Conflict** with message "Table has an active session; move or close it first" if found.
- Editing non-structural fields (e.g. `capacity`, `display_order`, `table_code` rename) while occupied is allowed but should show a confirmation dialog in the admin UI ("This table is currently occupied — renaming won't affect the current order") since `table_code` is just a label, not a foreign key target from `orders`.

### 6.5 Concurrent staff both opening the same table
- Race condition: two waiters both tap the same blank table within the same second.
- Mitigated by a DB-level unique partial index: `UNIQUE (table_id) WHERE status = 'open'` on `table_sessions`. The second `POST .../table-sessions` call gets a **409 Conflict** ("Table already seated") from the DB constraint, not just application logic — this guarantees correctness even under true concurrency, not just the 8–10s poll window.
- Client UX: the losing request's UI shows a toast "This table was just seated by another staff member" and immediately refreshes the grid to reflect reality (rather than waiting for the next poll tick).

---

## 7. Admin/Config Dependency (No-Hardcode Compliance)

Per project rule, zones and table codes must be fully DB-table + admin-UI backed — nothing about a restaurant's actual floor plan may live in source code.

### 7.1 Zone admin screen (new, feeds `table_zones`)
Fields:
- `name` (text, required, e.g. "AC", "Non AC", "Rooftop")
- `display_order` (numeric, or drag-to-reorder list UI)
- `is_active` (toggle — deactivating hides the zone from the floor view without deleting historical data)

### 7.2 Table admin screen (feeds `restaurant_tables`)
Fields:
- `zone_id` (dropdown, required, sourced from 7.1)
- `table_code` (text, required, validated unique within zone+outlet)
- `capacity` (numeric, optional)
- `shape` (dropdown: square/round/rect, optional)
- `display_order` (numeric or drag-reorder within zone)
- `is_active` (toggle)
- Bulk-add helper (recommended, not MVP-blocking): "Add range" — e.g. prefix "B", start 1, end 26 → generates B1..B26 in one action, since PetPooja reference screenshots show large sequential ranges (A1–A15, B1–B26) that would be tedious to add one-by-one.

### 7.3 `table_state_display_config` admin screen (optional MVP scope)
Fields: state enum (read-only, fixed list), `color_hex`, `label_text`. Scoped per outlet with a system default fallback so a fresh outlet isn't required to configure this before using the screen.

### 7.4 Where this plugs into existing docs
- `table_zones` must be added to the DB-schema doc (flagged in §3.2).
- The Add Table button on the floor-view toolbar is a **shortcut into this admin flow**, not a separate lightweight mechanism — it calls the same `POST .../tables` endpoint the full admin screen uses (§4.2), keeping one source of truth for table creation logic.

---

## 8. Permissions

Recommended role/permission matrix (align naming with whatever role table already exists in the schema; permissions below expressed as logical keys):

| Action | Waiter | Cashier | Manager/Outlet Admin |
|---|---|---|---|
| View floor grid (own assigned zones only, if zone-assignment feature exists) | Yes | Yes | Yes (all zones) |
| View floor grid — all zones regardless of assignment | No (assigned zones only) | Yes | Yes |
| Seat a table / open session (`table:operate`) | Yes | Yes | Yes |
| Print bill (quick icon) | Yes | Yes | Yes |
| View order detail (eye icon) | Yes | Yes | Yes |
| Add Table (`table:manage`) | No | No | Yes |
| Edit/Delete Table (`table:manage`) | No | No | Yes |
| Manage Zones | No | No | Yes |
| Move KOT/Items (`order:move`) | Yes (own zone) | Yes | Yes |
| Merge tables | No — escalate to Manager/Cashier | Yes | Yes |
| Close session with unpaid balance (override) | No | No | Yes (audit-logged) |

**Zone assignment** (a waiter seeing only their assigned zone's tables, greying out or hiding others) is implied by real-world restaurant operations but not evidenced directly in the screenshots — flagged as an open question in §10 rather than assumed into the MVP data model. If confirmed needed, requires a `staff_zone_assignments` join table (outlet_id-scoped) not currently in the schema draft.

---

## 9. Test Plan

### 9.1 Unit tests
- Derived-state function: given synthetic `table_sessions` + `orders` rows, assert correct enum output for all 5 states plus the "no session at all" → blank case.
- `running_kot` boundary logic: `last_kot_fired_at` just after `last_kot_ack_at` → `running_kot`; equal timestamps → treat as acked (not running_kot) — define and test the tie-break explicitly.
- Elapsed-seconds calculation correctness across a DST boundary / timezone edge (outlet-server should operate in outlet-local time or UTC consistently — verify no drift bug).
- Running-amount calculation: verify tax and discount are correctly included/excluded per business-logic-rules doc's tax computation rules (cross-reference, don't reimplement tax logic in this screen's tests beyond confirming the number surfaces correctly).

### 9.2 Integration tests (API layer, against outlet-server)
- `GET .../tables/grid` returns zones in `display_order`, tables in `display_order`, correct nested shape, correct `server_time`.
- `POST .../tables` — happy path creation; 409 on duplicate `table_code` within same zone; 201 with correct row otherwise.
- `DELETE .../tables/{id}` — 409 when session open; 200/204 when blank.
- `POST .../table-sessions` — 409 on double-seat race (simulate two near-simultaneous requests, assert exactly one succeeds).
- `POST .../tables/move` — full move: verify same `order_id`, new session, old session closed with reason `MOVED`, bill/KOT numbers unchanged before/after.
- `POST .../tables/move` mode `merge`: verify order_items re-parented, source session `merged_out`, source table becomes blank, audit log entry created.
- Split (partial `order_item_ids` to a blank destination): verify new order created with fresh local sequence bill/KOT numbers, original order's remaining items untouched.
- `POST .../table-sessions/{id}/print-bill`: verify `bill_printed_at` set, state transitions to `printed`, print job dispatched (mock outlet_print_settings integration).
- `POST .../table-sessions/{id}/close`: 409 when unpaid and no override flag; success path clears table to blank; override path writes `order_audit_log` entry.
- Permission checks: each endpoint tested against each role in the §8 matrix, asserting 403 where disallowed.

### 9.3 End-to-end tests (UI)
- Full flow: seat a blank table → add items → fire KOT (card turns yellow) → kitchen ack (card turns blue) → print bill (card turns green) → collect payment (card turns orange) → close/clear (card returns grey). Assert each visual transition.
- Two-browser-session concurrency test: simulate two staff tapping the same blank table near-simultaneously; assert one succeeds and the other sees the "already seated" toast and an auto-refreshed grid.
- Move KOT e2e: seat table A1, add 2 items, fire KOT, move full order to blank table B3 via toolbar button; assert A1 returns to grey, B3 shows the same running amount and elapsed time continuity (elapsed time should carry over from original `seated_at`, not reset — confirm this is the intended behavior, see §10).
- Merge e2e: two occupied tables merged; assert combined running amount on the surviving table equals sum of both prior amounts, and the absorbed table clears to grey.
- Offline resilience e2e: kill the local outlet-server mid-session on the floor view; assert stale banner appears, last-known grid persists on screen, and grid auto-recovers with fresh data once the server restarts within the backoff window.
- Add Table e2e via toolbar shortcut: create a table in an existing zone, assert it appears in the grid on next poll/refresh without a full page reload.
- Legend/color config e2e: change a state's color via the admin `table_state_display_config` screen (if in MVP scope), assert the floor view reflects the new color without a code deploy.
- Manual refresh cooldown: click refresh twice rapidly, assert second click is ignored during the 2s cooldown window.

---

## 10. Open Questions / Flags for Stakeholder

1. **Zone-based staff assignment**: Should waiters see only their assigned zone(s) by default, with a toggle to view all? Not evidenced in the screenshots; assumed out of MVP scope pending confirmation (§8).
2. **"Running" vs "blank" boundary**: Does a table become `running` (blue) the instant it's seated with zero items ordered, or only once the first item is added to the order? The screenshots don't show a seated-but-empty state distinctly. Current plan treats "seated with an open session but no items yet" as still effectively blank/neutral in spirit but technically needs its own micro-state or a UI-only treatment — recommend a decision to either (a) add a 6th sub-state "seated, no order yet" or (b) require an order to exist for a session to even be created (merge the "seat" and "start order" actions into one). Recommend (b) for schema simplicity, but needs confirmation since it changes the seat-a-table UX flow.
3. **`running_kot` (yellow) granularity**: order-level vs per-KOT-batch — flagged in §3.2/6.2. Needs a definitive answer from the business-logic-rules doc owner since it affects the `orders` schema additions (`last_kot_fired_at`/`last_kot_ack_at`).
4. **Elapsed time continuity across a Move**: when a table is moved (§6.3), should the destination table's displayed elapsed time reset to zero (new physical seating instant) or continue from the original `seated_at`? Current plan (§9.3) assumes continuity since the guest hasn't actually re-arrived, but this is a judgment call PetPooja's actual behavior should confirm.
5. **Merge conflict on partial payments**: exact reconciliation behavior when merging two tables where one already has a partial payment recorded is left as a 409-block-with-manager-override in this plan (§6.1) — needs business-logic-rules doc owner sign-off on whether partial payments should instead auto-carry-over as a credit against the merged total.
6. **Table color legend configurability**: is the color scheme truly fixed system-wide (in which case §7.3's admin screen is unnecessary complexity), or does PetPooja allow outlet-level recoloring? Screenshots only show one fixed scheme; recommend confirming before building the config screen — cheap to skip for MVP and hardcode as a **UI theme constant** (not "business data" under the no-hardcode rule, since color-of-a-status is presentation, not tenant content) if stakeholder says it's always fixed.
7. **"Add Table" during active service**: should adding a table via the toolbar require the same admin permission as the dedicated admin screen, or should there be a lighter-weight "quick add" for managers on the floor who don't have full back-office access? Currently unified (§7.4) for consistency; flagging in case ops wants a lighter in-shift path.
8. **Covers/pax capture**: is `pax_count` mandatory at seating (common in table service) or optional? Affects whether the "Seat Table" flow needs a required input step. Not shown definitively in the screenshots' quick-action set.
