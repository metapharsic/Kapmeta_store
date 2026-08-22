# Feature Build Plan — Artifact 09: Restaurant/System Configuration & Global App Shell

Status: Draft for engineering review
Owner: Kapmeta platform team
Related docs: DB schema draft (outlets, sync_state, backup_jobs), API-contracts draft, sync-architecture doc (LAN outlet-server model), business-logic-rules draft, decision-register addendum (DEC-013..024)
Source reference: single-frame screenshots of PetPooja POS "Restaurant/System Configuration" tile screen and the persistent top navigation bar, captured for Hotel Kapila (outlet ID 327038), app version 126.0.1. No interaction sequences (e.g. confirm dialogs) were captured; all confirmation/audit behavior in this document is a Kapmeta requirement, not an observation of the reference app.

---

## How to read this document

This is a combined plan for two very different pieces of surface area that happen to sit next to each other in the product:

- **Part A — Restaurant/System Configuration**: a low-traffic, high-severity administrative screen. Every tile on it is either sensitive tenant data or an irreversible/near-irreversible destructive action.
- **Part B — Global App Shell**: a high-traffic, low-severity piece of chrome that every other screen in the system mounts inside of.

They are documented together because they were captured together in the source material and because Part A's "Restaurant Configuration" sub-screen supplies the outlet identity (name, R-number) that Part B's shell displays in the window title. Otherwise they should be built, reviewed, and permissioned as independent components.

---

# Part A: Restaurant / System Configuration

## A.1 Purpose & user story

**Purpose.** This screen is the outlet-level technical administration console. It is where the numbering sequences, sync identity, local database, order/KOT history, and backup files of a single outlet are managed. Nothing on this screen is part of a cashier's or manager's daily workflow; it exists for outlet setup, troubleshooting, and — rarely — disaster recovery.

**User story.**

> As an outlet owner (or as Kapmeta support staff working alongside the owner), I need a single place to view and change outlet identity details, inspect the health of the LAN sync topology, and — when something has gone wrong (duplicate bill numbers, a corrupted local database, a full disk from old backups) — perform a small number of destructive recovery actions, each of which I understand I cannot casually undo.

**Blast radius.** This is the single highest-risk screen in the entire Kapmeta POS product. Several tiles can:
- desynchronize financial numbering (Reset Bill No.),
- sever a terminal's ability to talk to the outlet server (Reset Sync Code),
- permanently delete transactional history (Remove All Orders/KOT),
- permanently delete recovery material (Remove Backup Files),
- alter schema/data at the storage-engine level (Database Migration).

Because of this, Part A is designed around the assumption that every destructive tile will eventually be fat-fingered by someone, and the UI's job is to make that costly to do by accident and cheap to diagnose after the fact.

## A.2 UI spec

### A.2.1 Screen layout

- Header bar: outlet identifier "ID - 327038" (left), app version banner "Version: 126.0.1" (right or center). Both values are read from `outlets` / build metadata — never hardcoded (see A.7).
- Body: a grid of tappable tiles, one per function, each with an icon and a label. No tile performs its action directly on tap — every tile navigates to a sub-screen or opens a modal; destructive tiles always land on a confirmation step first (A.4), never on the action itself.

### A.2.2 Tiles

| Tile | Opens | Type |
|---|---|---|
| Restaurant Configuration | Sub-screen (form) | Data edit |
| Reset Bill No. | Confirmation sub-screen | Destructive |
| Reset Sync Code | Confirmation sub-screen | Destructive |
| Database Migration | Confirmation sub-screen, support-gated | Destructive |
| Remove All Orders / KOT | Confirmation sub-screen | Destructive |
| Remove Backup Files | Confirmation sub-screen | Destructive |
| Logs | Sub-screen (list/table) | Read-only |
| Check Machine | Modal ("Machines") | Read-only |

### A.2.3 Restaurant Configuration sub-screen

Fields (all tenant data — see A.7 no-hardcode rule):

- Outlet name (text, required)
- Outlet code / R-number (text, likely immutable post-setup — display-only or support-only edit)
- Address (multi-line text)
- Phone number (text, validated as phone)
- GSTIN (text, validated against GSTIN format, optional per jurisdiction rules elsewhere in the business-logic doc)
- Logo (image upload, stored as `logo_url`, with a preview and remove/replace control)
- Save / Cancel actions; Save is a normal (non-destructive) update, but should still write an audit_log entry (A.4) since outlet identity changes affect every printed bill and every report header from that point forward.

### A.2.4 Machines modal ("Check Machine")

Read-only, opened from the "Check Machine" tile. Reflects the LAN client-server topology described in the sync-architecture doc:

- **Main Server row**: IP address (e.g. `192.168.29.33`), role label "Main Server", connection health indicator (green/amber/red dot or equivalent, driven by `sync_state.last_heartbeat_at` freshness against the offline-tolerance window from DEC-019).
- **Client Machine row(s)**: IP address with a "(You)" suffix on the terminal actually rendering the modal (e.g. `192.168.29.236 (You)`), role label "Client", same health indicator per machine.
- Optional: last-sync timestamp per machine, sync code (masked, last 4 characters visible) for troubleshooting reference.
- No actions are available in this modal in v1 — it is diagnostic only. (A "Refresh" button to re-poll `sync_state` is reasonable to add.)

## A.3 Data model

### A.3.1 `outlets` (extends draft)

| Column | Type | Notes |
|---|---|---|
| id | bigint / uuid, PK | |
| code | text, unique | "R-number" shown in header/title bar |
| name | text | tenant data, no-hardcode |
| address | text | tenant data |
| phone | text | tenant data |
| gstin | text, nullable | tenant data, format-validated |
| logo_url | text, nullable | points to object storage |
| app_version | text, nullable | last-seen client version, informational; not authoritative for the version banner (see A.6) |
| is_active | boolean, default true | soft-disable an outlet without deleting it |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Per DEC-023, `outlets` is already the natural root of the outlet-scoping model; no change needed here beyond confirming every other table in this document carries `outlet_id`.

### A.3.2 `sync_state` (confirm/extend existing draft)

| Column | Type | Notes |
|---|---|---|
| id | bigint / uuid, PK | |
| outlet_id | FK -> outlets.id | |
| machine_id | text/uuid | stable local identifier for the physical machine |
| machine_role | enum('server','client') | matches DEC-020 local-terminal-vs-local-server dependency model |
| machine_ip | text | last-observed LAN IP; can change on DHCP renewal, treat as informational not identity |
| machine_label | text, nullable | e.g. "(You)" is a client-side concept, not stored; but a human label like "Front Counter" is reasonable |
| sync_code | text | shared secret/pairing code between server and clients |
| last_heartbeat_at | timestamptz | drives the health indicator in the Machines modal |
| last_sync_at | timestamptz | last successful data sync |
| status | enum('online','degraded','offline') | derived or explicitly set; degraded = heartbeat late but within DEC-019 tolerance window, offline = beyond it |
| created_at / updated_at | timestamptz | |

### A.3.3 `backup_jobs` (confirm existing draft)

| Column | Type | Notes |
|---|---|---|
| id | bigint / uuid, PK | |
| outlet_id | FK -> outlets.id | |
| file_path | text | local path or object-storage key |
| size_bytes | bigint | |
| taken_at | timestamptz | |
| taken_by | FK -> users.id, nullable | nullable to allow system-triggered backups |
| trigger_reason | enum('manual','pre_destructive_action','scheduled') | new field — needed to distinguish backups forced before a destructive action (A.4) from routine ones, so "Remove Backup Files" logic can optionally protect the most recent pre-destructive backup |
| restored_at | timestamptz, nullable | |
| restored_by | FK -> users.id, nullable | |

### A.3.4 New: `audit_log` (required by A.4, not previously drafted)

| Column | Type | Notes |
|---|---|---|
| id | bigint / uuid, PK | |
| outlet_id | FK -> outlets.id | |
| action_type | enum('reset_bill_no','reset_sync_code','remove_orders_kot','remove_backups','database_migration','outlet_config_update', ...) | |
| performed_by | FK -> users.id | |
| performed_via | enum('owner_session','support_mode') | see A.8 |
| confirmation_method | enum('type_to_confirm','manager_pin','support_pin') | |
| pre_action_backup_id | FK -> backup_jobs.id, nullable | populated when a backup was force-triggered first |
| params | jsonb | action-specific parameters, e.g. new bill-no series start, machine target for migration |
| result | enum('success','failure') | |
| error_detail | text, nullable | |
| created_at | timestamptz | |

## A.4 Destructive-action safety spec

This is the section with the most rigor in the document, per the task brief. General principle stated up front: **no destructive tile executes on a single tap.** Every one of the five actions below requires (1) an explicit confirmation step that costs the user real effort to complete (not a simple "OK" tap), (2) a written audit_log row, and (3) an explicit statement in the UI of whether the action is reversible. This is a hard Kapmeta requirement regardless of what the captured screenshots show or don't show, and regardless of whether the reference vendor implements it this way.

### A.4.1 Reset Bill No.

- **Confirmation UX**: type-to-confirm — user must type the outlet name (or a fixed phrase such as "RESET") exactly into a text field before the "Confirm" button becomes enabled. Additionally require the acting user's manager PIN (or owner password re-entry) as a second factor, since this affects financial numbering.
- **Audit log**: `action_type='reset_bill_no'`, `params` includes old last-used bill number, new series start number, and effective-from timestamp.
- **Forced backup**: yes — a backup_job with `trigger_reason='pre_destructive_action'` must be created and confirmed successful before the reset is allowed to proceed.
- **Rollback/undo**: not a true rollback. See A.6 for the recommended semantics (start a new numbering series rather than overwrite); the "undo" is administrative — support can restore the pre-action backup, but any bills issued after the reset are historically real and cannot be unwound by an undo button.
- **UI copy requirement**: must state plainly that this action changes how future bills are numbered and does not delete existing bills, and that it cannot be automatically undone.

### A.4.2 Reset Sync Code

- **Confirmation UX**: manager PIN required. Type-to-confirm not necessary here since the blast radius is connectivity, not data loss, but the UI must warn that all currently paired client machines will lose connection to the server until re-paired with the new code.
- **Audit log**: `action_type='reset_sync_code'`, `params` includes old sync_code (hashed/masked), new sync_code (masked), and count of machines that will need re-pairing (from `sync_state`).
- **Forced backup**: not required (no data is touched), but the action should be blocked (or require extra confirmation) if any `sync_state` row shows `status='offline'` for a client at reset time, since that client's owner won't see the warning and will silently lose sync until someone notices.
- **Rollback/undo**: fully reversible in effect — an admin can reset again to a working state — but there is no "undo to previous code" button; treat as reversible-by-repeating-the-action, not reversible-by-undo.
- **UI copy requirement**: must state that all clients will require re-pairing.

### A.4.3 Remove All Orders / KOT

- **Confirmation UX**: type-to-confirm the outlet name AND manager PIN (both factors — this is the most data-destructive tile on the screen). Show a live count of orders/KOTs that will be deleted before the user can confirm.
- **Audit log**: `action_type='remove_orders_kot'`, `params` includes row counts deleted, date range covered, and whether any unsettled orders were present (see A.6 — this should normally block the action entirely).
- **Forced backup**: yes, mandatory, `trigger_reason='pre_destructive_action'`, and the backup must be verified (checksum or row-count sanity check) before deletion proceeds — this is the one place a corrupt/failed backup must hard-block the action rather than just warn.
- **Rollback/undo**: irreversible from within the product. UI must say explicitly: "This will permanently delete all order and KOT history for this outlet. This cannot be undone from the app. A backup will be taken first and can only be restored by Kapmeta support." No in-app restore-from-backup self-service for this action in v1 (support-mediated only), to avoid a false sense of a one-click undo.
- **Hard precondition (recommended)**: block entirely if any unsettled/unpaid orders exist (A.6) — do not just warn.

### A.4.4 Remove Backup Files

- **Confirmation UX**: manager PIN, plus a list of the specific backup files about to be deleted (with dates/sizes) shown for review, plus a checkbox "I understand these backups cannot be recovered after deletion."
- **Audit log**: `action_type='remove_backups'`, `params` includes list of `backup_jobs.id` deleted, total bytes freed.
- **Forced backup**: not applicable (this action deletes backups, doesn't need one of itself) — but the system must refuse to delete the single most recent backup if it is the only backup on file, unless the user explicitly overrides with an additional confirmation ("this outlet will have zero backups after this action").
- **Rollback/undo**: irreversible — once a backup file is deleted it is gone. UI must say so plainly.

### A.4.5 Database Migration

- **Confirmation UX**: support PIN only (see A.8 — this tile is not intended for normal owner use at all; recommend gating it entirely behind `support_mode`). If it must remain owner-visible in some builds, require type-to-confirm plus manager PIN plus an explicit "I have contacted Kapmeta support about this migration" acknowledgment checkbox.
- **Audit log**: `action_type='database_migration'`, `params` includes migration script/version identifier, target schema version, machine_id it ran on.
- **Forced backup**: yes, mandatory, verified before proceeding, same as A.4.3.
- **Rollback/undo**: depends entirely on the migration's own reversibility; the UI cannot promise a generic undo. Show a static warning that migrations may not be reversible and that support should be engaged before running one in production.
- **Recommendation**: flag for stakeholder — this tile likely should not exist in the tenant-facing production build at all (A.10).

## A.5 API endpoints

All endpoints scoped to the authenticated outlet (`outlet_id` from session), and all mutating endpoints require the confirmation payload described in A.4 plus write an `audit_log` row server-side (never trust the client to log its own audit entry).

- `GET /outlets/{outlet_id}/config` — fetch Restaurant Configuration fields
- `PUT /outlets/{outlet_id}/config` — update Restaurant Configuration fields (name, address, phone, gstin, logo)
- `POST /outlets/{outlet_id}/reset-bill-no` — body: confirmation token/PIN, new series start (or "next integer" flag); triggers forced backup first
- `POST /outlets/{outlet_id}/reset-sync-code` — body: confirmation PIN; returns new sync_code
- `POST /outlets/{outlet_id}/remove-orders-kot` — body: confirmation token/PIN, date-range scope if partial removal is ever supported (v1: full only); server enforces the unsettled-order block from A.6
- `POST /outlets/{outlet_id}/remove-backups` — body: confirmation PIN, list of backup_job ids to delete
- `POST /outlets/{outlet_id}/database-migration` — support-mode only; body: migration identifier, confirmation
- `GET /outlets/{outlet_id}/logs` — paginated, filterable by `severity`, `date_from`, `date_to`, `action_type`
- `GET /outlets/{outlet_id}/machines` — returns `sync_state` rows (role, ip, health, last_heartbeat_at, last_sync_at) for the Machines modal

## A.6 Business logic / edge cases

- **Reset Bill No. semantics**: recommend this never truly "resets" the underlying counter to 1 in a way that could produce a duplicate bill number relative to history. Instead, model it as starting a **new numbering series** with an `effective_from` timestamp/marker (e.g. a `bill_number_series` table: `id, outlet_id, prefix, start_number, effective_from, created_by`). Reports and audits must be able to reconstruct which series a historical bill number belonged to. This avoids the compliance risk of two bills sharing a number across different points in time.
- **Database Migration risk**: this tile exposes storage-engine-level operations that a restaurant owner has no reason to run unsupervised, and a wrong tap here can corrupt the local outlet database. Recommend flagging to stakeholders that this tile be hidden entirely from tenant-facing production builds and only exposed through separate Kapmeta support tooling (A.10).
- **Remove All Orders/KOT vs. financial reports**: must be blocked (hard precondition, not just a warning) if any unsettled/unpaid orders exist for the outlet, since deleting them would silently corrupt revenue/tax reports for periods that haven't closed. Recommend also blocking if there are orders within the current, still-open financial/reporting period, with an override reserved for support_mode.
- **Reset Sync Code and in-flight orders**: if any client machine has unsynced local orders at the moment the sync code is reset, those orders may become orphaned until the client is re-paired manually. Recommend the confirmation step surface a count of unsynced orders per client (drawn from sync-architecture doc's offline queue) before allowing the reset.
- **Logs screen**: read-only, but should default to showing the outlet's own `audit_log` entries (destructive actions) merged with lower-severity operational logs; filter by severity/date/action_type per A.5.

## A.7 Admin/config dependency

The Restaurant Configuration sub-screen (A.2.3) is the required admin UI that satisfies the project's no-hardcode rule for outlet identity: outlet name, address, phone, GSTIN, and logo must never appear as literals in source code or in seed/config files bundled with a build. They must be readable/writable only through this screen (or an equivalent onboarding flow) and stored exclusively in the `outlets` table. Any other screen that displays outlet name/address/phone/GSTIN/logo (bill printouts, reports headers, the Part B window title) must read from this same table, not from a local constant.

## A.8 Permissions

- **Restaurant Configuration (edit)**: owner role, or manager role if explicitly granted; changes are audited (A.3.4) even though not "destructive" in the data-loss sense.
- **Reset Bill No., Reset Sync Code, Remove All Orders/KOT, Remove Backup Files**: owner role required at minimum, with the manager-PIN/type-to-confirm gates from A.4. These should NOT be accessible to cashier or floor-manager roles.
- **Database Migration**: recommend gating entirely behind a distinct **`support_mode`**, a separate elevated session activated by a support PIN issued by Kapmeta (not the owner's normal login credential), mirroring the fact that this tile and "Check Machine" read as vendor-support tooling rather than everyday owner tooling. `support_mode` should be time-boxed (auto-expires after e.g. 30–60 minutes) and every action taken while in it is tagged `performed_via='support_mode'` in `audit_log`.
- **Check Machine / Logs**: read-only, available to owner and manager roles; no destructive capability, so no elevated permission needed.

## A.9 Test plan

- **Golden test — Reset Bill No. confirm-and-audit flow**: attempt reset without typing the confirm phrase (blocked); with phrase but wrong PIN (blocked); with both correct (succeeds), verify a backup_job with `trigger_reason='pre_destructive_action'` is created before the audit_log row, verify a new `bill_number_series` row with correct `effective_from`.
- **Bill-no non-collision across series boundary**: create bills up to number N in series 1, reset to start a new series at 1, issue new bills; assert no two bills across the outlet's full history share the same (series, number) pair is guaranteed, and reporting correctly attributes each bill to its series.
- **Golden test — Remove All Orders/KOT confirm-and-audit flow**: with unsettled orders present, action is blocked server-side even if attempted directly against the API (not just hidden client-side); with none present, full flow (type-to-confirm + PIN + forced verified backup + deletion + audit_log) succeeds; verify row counts in audit_log match actual deleted rows.
- **Golden test — Remove Backup Files protects last backup**: attempt to delete the only existing backup without override checkbox (blocked); with override (succeeds, audit logged).
- **Golden test — Database Migration is support-mode gated**: owner session (non-support) cannot invoke the endpoint even via direct API call; support_mode session can, and audit_log records `performed_via='support_mode'`.
- **Reset Sync Code surfaces unsynced-order warning**: with a client holding unsynced orders, confirmation screen must display the count before allowing confirm.
- **No-hardcode regression test**: static scan / build check confirming outlet name, address, phone, GSTIN, logo strings from a sample outlet do not appear anywhere in source or bundled config.
- **Machines modal health indicator**: heartbeat within tolerance window (DEC-019) shows online; beyond it but within grace shows degraded; beyond grace shows offline — test each boundary.

## A.10 Open questions / flags for stakeholder

1. Should **Database Migration** be removed from the tenant-facing owner build entirely and only exist in a separate Kapmeta-support-operated tool? Recommendation: yes.
2. Should **Reset Sync Code** also be support-only, given it can strand paired terminals? Recommendation: keep owner-accessible but require manager PIN and the unsynced-order warning (A.6); revisit if support tickets show owners misusing it.
3. Exact semantics for **Reset Bill No.**: does the business ever need to reset to a specific configured start number (e.g. for fiscal-year rollover) rather than always "next integer"? Needs input from finance/compliance stakeholders before locking the `bill_number_series` design.
4. **Multi-outlet implications**: the captured screenshots show no outlet switcher anywhere in this screen or the app shell — everything assumes a single active outlet per session/login. Per DEC-023 (outlet_id-scoped schema recommended now for future multi-outlet support), this document assumes the same login/session is always scoped to exactly one outlet_id in v1, and flags that an outlet switcher UI (and its own permission model — can one login manage multiple outlets' System Configuration screens?) is undesigned and should be scoped explicitly before multi-outlet rollout.
5. Should the pre-destructive-action backup for Remove All Orders/KOT be restorable by the owner in-app, or strictly support-mediated as currently recommended? Needs a product decision balancing self-service speed against the risk of a botched self-restore.

---

# Part B: Global App Shell

## B.1 Purpose & user story

**Purpose.** The app shell is the persistent top navigation bar rendered on every screen in the product. It provides the single most common action (New Order), fast lookup by bill/KOT number from anywhere, and an icon rail of secondary functions plus outlet-identity display and a pinned support contact.

**User story.**

> As any authenticated staff member, regardless of which screen I'm currently working in, I need constant access to starting a new order, looking up an existing bill or KOT by number, and a small set of always-available tools (stock on/off, store status, live view, order lists, holds, alerts, support), without navigating away from or interrupting my current screen.

Unlike Part A, this is low-severity, high-frequency chrome. Its main engineering risks are consistency (it must render identically as a shared layout, not be re-implemented per screen), performance (badge polling must not be expensive), and correct role-based filtering.

## B.2 UI spec

### B.2.1 Layout, left to right (typical)

- **Window/app title**: outlet name + outlet R-number (e.g. "Hotel Kapila — R327038" or similar), sourced from `outlets` (A.3.1) — never hardcoded.
- **New Order**: primary CTA button, visually distinct (filled/accent color), navigates to the New Order screen.
- **Bill No search box**: text input, placeholder like "Search Bill No.", triggers lookup on enter/submit.
- **KOT No search box**: text input, placeholder like "Search KOT No.", triggers lookup on enter/submit.
- **Icon rail** (order approximate, per captured screenshot): Item On/Off, Store, Live View, Orders, Recent, Hold, Alerts, Zomato Help, Logout.
- **Pinned support phone number**: top-right corner, static/pinned regardless of scroll, tap-to-call on touch devices, tap-to-copy on desktop.

### B.2.2 Icon rail detail

| Icon | Destination | Notes |
|---|---|---|
| Item On/Off | Item availability toggle screen/modal | Lets staff mark menu items out of stock quickly |
| Store | Store status screen (open/closed, store-level settings) | |
| Live View | Online Live Feed / order-tracking screen | Referenced elsewhere as the SLA-breach monitoring screen |
| Orders | Orders list screen | |
| Recent | Recently viewed/created orders | |
| Hold | Held orders list | |
| Alerts | Alerts/notifications panel | Carries a badge (B.2.3) |
| Zomato Help | External/aggregator help or integration screen | |
| Logout | Ends session, returns to login | Should itself be a confirm-on-tap ("Log out?") to avoid accidental taps, though not destructive in the data sense |

### B.2.3 Alerts badge

- A numeric badge overlaid on the Alerts icon showing unread/unacknowledged notification count for the outlet.
- Badge hides (shows no number, or shows the icon plain) when count is 0.
- Cap displayed count at a reasonable ceiling (e.g. "9+") to avoid layout breakage.
- Tapping Alerts opens the alerts panel; opening the panel does not automatically mark all as read — each item should be dismiss/acknowledge-able individually (ties to `notifications.read_at` / `acknowledged_by`, B.3).

## B.3 Data model

No new core tables beyond one: the shell itself is stateless and reads from existing session/outlet context, plus a new `notifications` table to back the Alerts badge.

### B.3.1 New: `notifications`

| Column | Type | Notes |
|---|---|---|
| id | bigint / uuid, PK | |
| outlet_id | FK -> outlets.id | |
| type | enum('sla_breach','sync_issue','order_issue','system','other') | extensible; `sla_breach` ties directly to the Online Live Feed screen's SLA-breach alert concept |
| severity | enum('info','warning','critical') | drives badge styling/urgency if ever surfaced beyond a count |
| message | text | |
| order_id | FK -> orders.id, nullable | populated for order/KOT-linked alerts (e.g. SLA breach on a specific order) |
| created_at | timestamptz | |
| read_at | timestamptz, nullable | set when a staff member opens/views the item |
| acknowledged_by | FK -> users.id, nullable | set when a staff member explicitly dismisses/acknowledges, distinct from merely viewing |

The Alerts badge count = `count(*) where outlet_id = :outlet_id and acknowledged_by is null` (unread vs. unacknowledged distinction: read_at can be set just by opening the panel, but the badge should probably only clear on acknowledgment, not on view, so a critical alert isn't lost by an accidental panel open — flagged as a product decision to confirm, default recommendation stated here).

## B.4 API endpoints

- `GET /outlets/{outlet_id}/notifications/unread-count` — lightweight endpoint polled by the shell for the Alerts badge
- `GET /outlets/{outlet_id}/notifications` — paginated list for the alerts panel
- `POST /outlets/{outlet_id}/notifications/{id}/acknowledge` — marks acknowledged
- `GET /outlets/{outlet_id}/orders/search?bill_no=` — Bill No search box backing endpoint
- `GET /outlets/{outlet_id}/orders/search?kot_no=` — KOT No search box backing endpoint
- `POST /auth/logout` — global logout, invalidates session/token

## B.5 Business logic / edge cases

- **Alerts badge update mechanism**: recommend short-interval polling (e.g. every 15–30 seconds) of `unread-count` as the v1 mechanism, consistent with the LAN outlet-server sync model rather than assuming a push/websocket infrastructure exists outlet-wide. If the sync-architecture doc's transport layer already supports server-push events (e.g. via the local outlet server relaying to clients), that should be preferred and polling used only as fallback; flag this as an implementation choice for the engineer to confirm against the sync-architecture doc's actual transport capabilities.
- **Bill No / KOT No search matching**: recommend exact-match-first behavior (numbers are typically typed in full and matched precisely against a numbering series), but support partial/prefix matching as a fallback that returns a short list when no exact match is found, rather than a hard "not found." Must be scoped to the numbering series model from A.6 (a bare number like "104" could exist in multiple series historically) — search results should disambiguate by series/date when a number matches more than one historical bill.
- **New Order availability**: should be disabled or show a clear blocking state if the local outlet server is unreachable (per sync-architecture's local-server-dependency model, DEC-020), since bill/KOT numbers are issued authoritatively by the local server.
- **Logout**: must clear any locally cached sensitive data (open orders in progress should prompt "you have an unsaved/open order" before allowing logout, if applicable per business-logic-rules doc).

## B.6 Admin/config dependency

None directly — the shell is a consumer of `outlets` (for the title) and `notifications` (for the badge), not an owner of configuration. It depends on Part A's Restaurant Configuration screen being the single source of truth for outlet name/R-number so the title bar is never hardcoded.

## B.7 Permissions

- All authenticated roles see the shell itself (title, New Order, search boxes, Alerts, Logout).
- Icon rail items are **role-filtered**:
  - Item On/Off, Store status: manager/owner roles (inventory-affecting)
  - Live View, Orders, Recent, Hold, Alerts: broadly available to all operational roles (cashier, waiter, manager, owner) as needed for daily work
  - Zomato Help: likely all roles, informational/support
  - Logout: all roles
- Example given in the brief: a cashier role should not see Item On/Off. Recommend building this as a role→allowed-icon-set mapping (config-driven, not hardcoded per role in UI code) so new roles or permission tweaks don't require a shell code change.

## B.8 Test plan

- **Role-filtered nav test**: log in as cashier, manager, owner; assert Item On/Off (and any other manager/owner-only icons) are absent for cashier and present for manager/owner; assert New Order and search boxes present for all roles that can take orders.
- **Alerts badge real-time test**: seed a `notifications` row for the outlet, assert badge count increments within one polling interval (or one push cycle, if implemented); acknowledge it, assert badge decrements/clears within the same interval.
- **Bill No / KOT No search — exact match test**: search an existing bill number, assert single correct result returned.
- **Bill No / KOT No search — series disambiguation test**: seed two bills with the same number in two different bill_number_series (per A.6), search that number, assert both are returned with disambiguating series/date info rather than one silently winning.
- **New Order blocked when local server unreachable**: simulate local outlet server down, assert New Order button shows blocked/disabled state rather than allowing an order that can't get an authoritative bill number.
- **Title bar reflects outlet identity, never hardcoded**: change outlet name via Restaurant Configuration (Part A), assert shell title updates without app redeploy.

## B.9 Open questions / flags for stakeholder

1. Does the underlying sync-architecture transport support server-push for the Alerts badge, or should Kapmeta commit to polling as the v1 mechanism? Needs confirmation against the sync-architecture doc's actual capabilities before implementation.
2. Should badge-clearing happen on "viewed" (`read_at`) or only on explicit "acknowledged" (`acknowledged_by`)? This document recommends acknowledged-only for critical alerts; needs product sign-off.
3. **No outlet switcher observed anywhere in the shell.** Per DEC-023, the schema is being scoped for future multi-outlet support, but the captured UI shows no mechanism for a single login to move between outlets. Flag for stakeholder: if multi-outlet management is a near-term goal, the app shell will need an outlet switcher and this should be scoped as a follow-up design task rather than assumed to be a trivial addition later.
4. Should Zomato Help be conditionally shown only for outlets with an active Zomato integration, rather than unconditionally for every outlet? Needs confirmation of how aggregator integrations are tracked per outlet.
