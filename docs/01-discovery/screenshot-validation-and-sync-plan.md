# UGH. CAVEMAN LOOK AT SCREEN-PICTURE. CAVEMAN MAKE BIG PLAN.

Caveman open folder `Screen_shot`. Caveman count. 86 picture inside. All picture come from window title "Hotel kapila (R327038) - The Finest Restaurant Management Platform" — this PetPooja POS desktop app, brand name "PETPOOJA POSS". Timestamp on picture go 11:23 to 12:14, same day 21-Aug-2026. This one long screen-record session, click click click through whole app, not random picture. Good. Easy for caveman to line up in order like cave painting story.

Caveman also dig around big cave (root folder `PetPooja`) and find caveman ALREADY BUILDING OWN CLONE called **Kapmeta**. Real repo. Real rule file `CLAUDE.md`. Rule say: **NO HARDCODE BUSINESS DATA. EVER.** Every menu item, price, tax, role, outlet — must come from DB table or admin screen, never baked into code. Caveman keep this rule sacred whole plan below. Project also says: Phase 0 Discovery only, no code until decision doc DEC-001..DEC-012 signed off. Caveman respect — this why caveman give PLAN not CODE.

Below: caveman validate every picture, caveman group picture into "artifact" bundles, caveman map each bundle to DB table + API + UI + workflow + business rule, caveman say which little worker-caveman (agent) build which piece, caveman say how it all wire together and sync.

---

## PART 1 — CAVEMAN VALIDATE THE PICTURE

Validation check caveman do on all 86 file:

- File type: all `.png`. Good, no weird format, no corrupt caveman-scribble.
- Size: 77KB to 240KB. Normal screenshot weight, nothing look broken/empty/black image.
- Resolution: consistent app window, same chrome (title bar, top nav bar with New Order / Bill No / KOT No / Item On-Off / Store / Live View / Orders / Recent / Hold / Alerts / Zomato Help / Logout). This one continuous app, not mixed screenshots from different tool.
- Watermark: "Activate Windows" + "This is a non-commercial session" banner bottom-right on EVERY picture. Confirm this test/demo machine, unlicensed Windows, not production restaurant. Fine for reference capture, caveman just note it — don't ship watermark logic anywhere, it noise not feature.
- Outlet identity: single outlet "Hotel kapila", ID 327038, phone 07969 223344. All picture same tenant — good, consistent dataset, caveman not mixing two different restaurant by accident.
- Version stamp: app version "126.0.1" visible in one screenshot (Restaurant Configuration page). Caveman note version so future-caveman know which PetPooja build this reverse-engineered from.
- Client/Server detail: one screenshot show "Machines" panel — Main Server `192.168.29.33`, Client Machine `192.168.29.236 (You)`. CONFIRM: this a LAN client-server desktop app, not pure cloud SaaS. Big deal for sync plan below.

Caveman bucket all 86 picture into **13 feature zones** by what screen show (caveman eyeball each one, not guess):

1. **Table View / Floor Plan** — grid of tables (A1-A15 "AC" zone, B1-B26 "Non AC" zone), color code: grey=blank, blue=running, green=printed, orange=paid, yellow=running-KOT. Shows elapsed minutes + running amount per table. Buttons: Add Table, Delivery, Pick Up, Move KOT/Items.
2. **New Order / Billing Screen** — left = category rail (Breakfast, Meal Box, Cold/Hot Beverage, Soup Veg/Non-Veg, Meals, Chinese/Tandoori Starters, Curries, Roti...) + item grid. Right = order ticket panel (customer mobile/name/address/locality, item list, qty, price, Split, Advance Order, Print & E-Bill, Total). Top tab: Dine In / Delivery / Pick Up.
3. **Online Orders — Live Feed** — Orders screen, tabs All/Dine In/Delivery/Pick Up/Online/Swiggy/Zomato, each order card shows KOT no, Bill no, OTP, rider status ("Looking for rider", "ARRIVED"), Prepare-In countdown timer, buttons Call Customer / Contact Swiggy / OOS / Info / Food Is Ready.
4. **Mark Out-Of-Stock modal** — per aggregator order, pick item(s) not available, toggle "allow customer choose alternate", toggle propagate OOS to all other online platform.
5. **Item On/Off & Addon On/Off (menu availability sync)** — big screen, toggle Online/Offline master switch, per-channel tab (Swiggy tab, Zomato tab), category list left, item list right with per-item On/Off, search by name/online-display-name/category, "Logistics Details" modal explain Zomato Logistics / Swiggy Self Delivery polygon+PSLA config.
6. **Current Order / Order History List** — table list of orders: Order No, Order Type (Dine In table no / Delivery / Pick Up), Customer Phone/Name, Payment Type, My Amount, Tax, Discount, Grand Total, Created timestamp, status color (green=printed/paid, orange=online-unsettled), eye/print/edit icon per row. Filter tabs All/Dine In/Delivery/Pick Up, sort by Latest Date, status legend Saved/Printed/Cancelled/Paid.
7. **Billing Screen Configuration (Settings)** — Default Order Type, Default Payment Type, Default Table No., Delivery Charge toggle+value, Container Charge toggle (auto-calc by Delivery/PickUp/DineIn, mode Item-wise/Order-wise/Fix-per-item) + label, Service Charge toggle, tax-before/after-discount toggles, backward-tax-after-discount toggle, Special Discount Calculation basis (Total/Core).
8. **Bill / KOT Preferred Configuration** — long checklist: print KOT on print bill, consider non-prepared KOT in bill, print only modified KOT/items, print deleted items (inline vs separate KOT), print cancelled KOT, print KOT no as token no, CWT (category-wise tax) bifurcation choice, show/hide backward tax on bill, show duplicate print marker on bill/KOT, highlight order id (last-4-char mode), Bill Print Settings block (Restaurant Name, Header Text, Footer Text, New-Customer Message, Show Restaurant Name / Retail Invoice / Sr No column / Assign-to label toggles).
9. **Tax Listing / Tax Master** — table: Tax Title, Tax Type (Backward Tax vs Forward Tax), calc Type (Percentage), Amount, Action(edit). Rows: CGST 2.5%, SGST 2.5% (dine-in backward tax), CGST[Online] 2.5%, SGST[Online] 2.5% (forward tax for aggregator orders) — CONFIRM tax rule differs dine-in vs online channel, caveman must model that split, not one flat tax.
10. **Day-End / Sales Summary (Payment Type Report)** — Payment Type breakdown table: Not Paid, Cash, Card, Due Payment, Other(Room Service), Swiggy-Online, Zomato-Online, UPI — each with Total(₹). Below: Complimentary Orders (count+amount), Sales Return Orders section.
11. **Item Report** — sales-by-item table grouped by Category (Fresh Juice, Dessert, ...), columns Item / Code / Qty / Total(₹), collapsible category groups, Sub Total per category, Grand Total top, filters Search/Configure Column/Time-Wise, actions Print / Export Excel, "Print Configuration" link.
12. **Restaurant / System Configuration (admin/back-office)** — tile menu: Restaurant Configuration, Reset Bill No., Reset Sync Code, Database Migration, Remove All Orders/KOT, Remove Backup Files, Logs, Check Machine. "Check Machine" opens Machines modal (Main Server IP vs Client Machine IP) — this the LAN sync topology screen.
13. **Misc navigation chrome** — repeats of top bar / header across nearly every screenshot (New Order, Bill No search, KOT No search, Item On/Off, Store, Live View, Orders, Recent, Hold, Alerts, Zomato Help, Logout, phone helpline). Caveman treat this as **global app shell**, not separate feature.

Validation verdict: **86/86 picture usable, zero corrupt, zero duplicate-exact-same-second, zero off-topic**. Full click-path of a real single-outlet, single-server LAN POS covering floor plan → order taking → online aggregator ops → settings → tax → reporting → back-office admin. Good raw material for spec. Caveman confident.

---

## PART 2 — ARTIFACT CAPTURE PLAN (per feature zone, what caveman must record before build)

For EACH of the 13 zones, caveman say exact capture checklist future-caveman (or agent) must fill from screenshot before writing code. This the "detailed plan of each artifact capture" user ask for.

### Artifact 1 — Table/Floor View
- Enumerate every table code, its zone (AC/Non AC/others?), capacity if shown, physical grouping order.
- Enumerate every state color + meaning (grey/blue/green/orange/yellow) + which fields show per state (elapsed min, running ₹).
- Capture action buttons: Add Table, Move KOT/Items, Delivery, Pick Up — note which open modal vs navigate.
- Capture "eye" and "printer" quick-icons per occupied table card — what each triggers.
- Note refresh icon (manual refresh vs auto-poll?) — screenshot can't prove polling interval, FLAG for stakeholder decision (DEC item).

### Artifact 2 — Order Entry / Billing
- Capture full category rail list + order (left nav) exactly as merchant configured it — this is TENANT DATA not code constant (rule from CLAUDE.md applies hard here).
- Capture item card shape: name only, no image, no price shown on grid tile itself (price shown after add) — note this UX choice.
- Capture right panel fields: order-type tabs (Dine In/Delivery/Pick Up), customer identity block (Mobile, Name, Add[ress], Locality) — only relevant for Delivery/PickUp not Dine-In presumably, FLAG to confirm conditional visibility.
- Capture ticket columns: Items / Check Items / Qty / Price.
- Capture footer actions: Split, Advance Order, Total, Print & EBill.
- Capture icon rail top-right of order panel (duplicate/copy order?, save?, delete, assign-waiter?) — icons ambiguous in screenshot, FLAG for clarify with real click-through or vendor docs.

### Artifact 3 — Online Order Live Feed
- Capture order card anatomy: platform badge (Swiggy orange / Zomato red), KOT no, Bill no, OTP, paid-flag, elapsed clock, customer name+phone, rider status text ("Looking for rider" / "ARRIVED"), item lines, cutlery note, price, action row (Call Customer, Contact Swiggy/Zomato Help, OOS, Info, Food Is Ready).
- Capture the "Prepare In 00:00 / too-late" warning state — this a real business alert (SLA breach), must be first-class workflow event not decoration.
- Capture filter/tab rail: All / Dine In / Delivery / Pick Up / Online / Swiggy / Zomato, "MFR" button (likely Mark-Food-Ready bulk?) — FLAG unclear acronym, confirm with client before hardcoding label.
- Capture toggle "New View / Old View" and "View Details" switch — tells caveman two rendering modes must both be planned OR pick one and drop legacy (stakeholder decision).

### Artifact 4 — Out of Stock Modal
- Capture per-item OOS flow: checkbox item, toggle "allow alternate item chosen by customer", toggle "propagate to all other online platform", submit button "Mark Out Of Stock".
- This directly implies **cross-platform inventory-availability sync job** must exist (writes to Swiggy AND Zomato API when toggled). Big workflow item, see Part 4.

### Artifact 5 — Menu Online-Availability Manager
- Capture toggle hierarchy: Online/Offline master tab → Item On/Off vs Addon On/Off sub-tab → per-channel tab (All/Recent/Swiggy/Zomato) → category tree left → item rows right, each row has clock-icon (schedule?), Off pill, On pill.
- Capture search/filter row: Name, Online Display Name (separate from POS name — important, two-name field per item!), Category dropdown, extra dropdown (maybe sub-category or veg/non-veg).
- Capture "Logistics Details" info modal content (Zomato Logistics text, Swiggy Self-Delivery text) — this marketing copy, not business logic, but shows app also configures delivery-fleet mode per channel.

### Artifact 6 — Order History / Current Order List
- Capture full column set: Order No, Order Type(+table/channel sub-label), Customer Phone, Customer Name, Payment Type, My Amount, Tax, Discount, Grand Total, Created datetime.
- Capture color legend: Saved(grey)/Printed(green)/Cancelled(red)/Paid(orange?) — cross-check against Table View legend, they OVERLAP but not identical, FLAG to unify into one canonical order-status enum.
- Capture inline-edit pencil icon next to Grand Total — means grand total editable post-hoc (manual discount override) — must be audited action (who/when/why), not silent.
- Capture row actions: eye(view/reprint), printer(reprint), and one row show extra pop-out icon — investigate meaning.

### Artifact 7 — Billing Configuration
- Capture every setting field verbatim as key + current value + control type (dropdown/checkbox/radio/text):
  Default Order Type(dropdown: Dine In...), Default Payment Type(dropdown: Cash...), Default Table No.(text), Delivery Charge display+calc(checkbox)+amount(number), Container Charge display+calc(checkbox)+auto-apply-by-channel(3 checkboxes: Delivery/PickUp/DineIn)+mode(radio: Item-wise/Order-wise/Fix-per-item)+label(text), Service Charge display+calc(checkbox), Calculate-Tax-Before-Discount(checkbox), Calculate-Backward-Tax-After-Discount(checkbox)+helper note, Special-Discount-Calculation-On(radio: Total/Core).
- This ENTIRE screen = one settings object per outlet. Every field = one column (or one JSON key) in `outlet_billing_settings` table. Zero hardcode, matches CLAUDE.md rule exactly.

### Artifact 8 — Bill/KOT Print Configuration
- Capture full checklist (13 toggles) + 2 radio-groups + Bill Print Settings sub-block (Restaurant Name text, Header Text textarea, Footer Text textarea, New-Customer-Message textarea, 4+ display toggles) + "Highlight order id on bill/KOT" dropdown (value seen: "Last 4 characters").
- Every one of these toggles is a print-template conditional. Caveman plan: store as `outlet_print_settings` JSON/table, template engine reads flags at render time — never bake "Thanks" or "Hotel kapila" string into PDF generator code.

### Artifact 9 — Tax Master
- Capture columns Tax Title/Tax Type/Type/Amount/Action, and the KEY business rule: **Backward Tax for dine-in (CGST/SGST 2.5+2.5=5%) vs Forward Tax for online (CGST[Online]/SGST[Online] 2.5+2.5=5%)** — same rate, different calculation method (inclusive vs exclusive), applied by channel. This is core billing-engine logic, must branch on order.channel.

### Artifact 10 — Payment-Type Day Summary
- Capture row set: Not Paid, Cash, Card, Due Payment, Other(Room Service) — note "Room Service" is a CUSTOM payment-type label merchant added, proves payment types must be tenant-configurable table not enum.
- Capture aggregator rows Swiggy-Online / Zomato-Online settle separately from Cash/Card/UPI — settlement reconciliation must key by channel.
- Capture Complimentary Orders block (count+amount) and Sales Return Orders block (count+amount, cut off in screenshot — need full scroll capture later, FLAG incomplete).

### Artifact 11 — Item Report
- Capture group-by-category rollup structure, per-item Code/Qty/Total, Sub Total row per category, page Grand Total. "Code" column implies every menu item has SKU/short-code, not just name.
- Capture toolbar: Search, Configure Column(pick visible columns = user-customizable report!), Time-Wise toggle, Print, Export Excel, Print Configuration link.

### Artifact 12 — Restaurant/System Configuration
- Capture tile set: Restaurant Configuration, Reset Bill No., Reset Sync Code, Database Migration, Remove All Orders/Kot, Remove Backup Files, Logs, Check Machine.
- Capture version banner "Version: 126.0.1" and outlet id "ID - 327038" — confirm outlet id is the SAME R-number shown in title bar (R327038), i.e. restaurant_id is global primary key threaded everywhere.
- Capture Machines modal: Main Server IP + Client Machine(You) IP — CONFIRMS local-network client-server sync model, not just cloud REST. Huge for Part 4 sync plan.
- "Reset Sync Code" + "Database Migration" + "Remove Backup Files" tiles = strong evidence of local SQLite/embedded DB per outlet that periodically syncs/backs-up to cloud. Caveman plan around this pattern below.

### Artifact 13 — Global App Shell
- Capture persistent top bar inventory once: New Order(primary CTA), Bill No search, KOT No search, Item On/Off, Store, Live View, Orders, Recent, Hold, Alerts, Zomato Help(icon), Logout, support phone number pinned top-right.
- This is the shared shell component — build ONCE, mount on every screen, don't re-derive per page.

**Cross-artifact consistency check caveman already spot (must resolve in design phase):**
- Order status colors differ slightly between Table View legend and Order History legend — unify to single `order_status` enum before schema freeze.
- "OTP" appears on every online order (delivery handoff OTP) but never on Dine-In/PickUp — OTP field must be nullable, channel-conditional.
- "My Amount" vs "Grand Total" vs "Total(₹)" — three different money-column labels across screens for what might be 2 or 3 distinct concepts (merchant payout vs customer-charged vs item subtotal) — FLAG, need one glossary before DB design, don't assume they're same number.

---

## PART 3 — SYNC WITH REAL PROJECT (Kapmeta repo)

Caveman already found repo skeleton:
```
apps/        -> pos-web, admin-web, api   (deployable)
services/    -> domain modules, modular monolith
packages/    -> shared types/UI-kit/config
db/          -> Postgres migrations + seeds + ERD
contracts/   -> OpenAPI + async event schema + Postman
infra/       -> Terraform/K8s/Docker/monitoring
tests/       -> unit/contract/integration/e2e/smoke/perf/security
docs/        -> full SDLC phase docs, START-HERE.md is entry point
```
Status right now: **Phase 0 Discovery**, blocked on decision register DEC-001..DEC-012. So caveman plan below feeds STRAIGHT into `docs/01-discovery/` and `docs/02-requirements/`, not into code yet.

Mapping — which screenshot-artifact becomes which repo piece:

| Artifact | services/ module | apps/pos-web screen | db table(s) | contracts/ |
|---|---|---|---|---|
| 1 Table View | `services/tables` | `TableFloorView` | `restaurant_tables`, `table_sessions` | `tables.yaml` |
| 2 Order Entry | `services/orders`, `services/menu` | `NewOrderScreen` | `orders`, `order_items`, `menu_categories`, `menu_items` | `orders.yaml` |
| 3 Online Feed | `services/aggregator-orders` | `LiveOrdersScreen` | `orders`(channel=swiggy/zomato), `aggregator_order_events` | `aggregator-webhooks.yaml` |
| 4 OOS Modal | `services/inventory-availability` | modal in LiveOrdersScreen | `menu_item_availability`, `channel_sync_log` | `availability.yaml` |
| 5 Menu Online Manager | `services/menu-sync` | `MenuAvailabilityScreen` | `menu_items`(online_display_name), `menu_item_channel_status` | `menu-sync.yaml` |
| 6 Order History | `services/orders` | `OrdersListScreen` | `orders`, `order_payments`, `order_audit_log` | `orders.yaml` |
| 7 Billing Config | `services/settings` | `BillingConfigScreen` | `outlet_billing_settings` | `settings.yaml` |
| 8 Print Config | `services/settings`, `services/printing` | `PrintConfigScreen` | `outlet_print_settings` | `settings.yaml` |
| 9 Tax Master | `services/tax` | `TaxListingScreen` | `taxes`, `tax_channel_rules` | `tax.yaml` |
| 10 Day Summary | `services/reporting` | `DaySummaryScreen` | reads from `orders`,`order_payments` (materialized view) | `reports.yaml` |
| 11 Item Report | `services/reporting` | `ItemReportScreen` | reads from `order_items` (materialized view) | `reports.yaml` |
| 12 System Config | `services/admin`, `services/sync` | `RestaurantConfigScreen` | `outlets`, `sync_state`, `backup_jobs` | `admin.yaml` |
| 13 App Shell | `packages/ui-kit` | `AppShellLayout` | n/a | n/a |

CLAUDE.md no-hardcode rule applied everywhere above: menu items/categories/tax rows/payment-type labels/print text all come from tables (7,8,9,5) + admin screens (7,8,9,12), never literals in `services/*` code. Caveman double-check every service listed only READS config tables, never ships default arrays.

---

## PART 4 — DB TABLES (proposed, Postgres, Phase-0 draft only — not migration yet)

```
outlets(id PK, name, code[R-number], phone, address, tz, is_active, created_at)
restaurant_tables(id PK, outlet_id FK, zone[AC/NonAC], code[A1/B7...], seats, sort_order)
table_sessions(id PK, table_id FK, order_id FK nullable, status[blank/running/printed/paid/running_kot], opened_at, closed_at)

menu_categories(id PK, outlet_id FK, name, sort_order, parent_id nullable)
menu_items(id PK, outlet_id FK, category_id FK, name, online_display_name, code[SKU], price, veg_flag, is_active)
menu_item_channel_status(id PK, menu_item_id FK, channel[pos/swiggy/zomato], is_on, updated_by, updated_at)
menu_item_availability(id PK, menu_item_id FK, channel, status[in_stock/oos], oos_reason, alt_item_allowed bool, set_at, cleared_at)

taxes(id PK, outlet_id FK, title[CGST/SGST], calc_type[percentage/flat], rate, tax_mode[backward/forward], channel_scope[dine_in/online/all])

orders(id PK, outlet_id FK, order_no, kot_no, bill_no, order_type[dine_in/delivery/pickup], channel[pos/swiggy/zomato], table_id FK nullable, customer_name, customer_phone, customer_address, locality, status[saved/printed/cancelled/paid], otp, placed_at, ready_by, food_ready_at)
order_items(id PK, order_id FK, menu_item_id FK, qty, unit_price, line_discount, line_tax, is_deleted, deleted_reason)
order_payments(id PK, order_id FK, payment_type[cash/card/upi/due/swiggy_online/zomato_online/custom], amount, is_complimentary, paid_at)
order_audit_log(id PK, order_id FK, action[grand_total_edit/oos_mark/cancel/refund], actor_id, before_val, after_val, at)
sales_returns(id PK, order_id FK, item_id FK, qty, amount, reason, at)

outlet_billing_settings(outlet_id PK/FK, default_order_type, default_payment_type, default_table_no, delivery_charge_enabled, delivery_charge_amount, container_charge_enabled, container_charge_auto_channels[], container_charge_mode[item/order/fix], container_charge_label, service_charge_enabled, tax_before_discount bool, backward_tax_after_discount bool, discount_calc_basis[total/core])
outlet_print_settings(outlet_id PK/FK, print_kot_on_bill bool, consider_nonprepared_kot bool, print_only_modified_kot bool, print_only_modified_items bool, print_deleted_items_inline bool, print_deleted_items_separate bool, print_cancelled_kot bool, kot_no_as_token bool, cwt_bifurcation bool, item_price_backward_tax_mode, show_backward_tax_on_bill bool, show_duplicate_marker_bill bool, show_duplicate_marker_kot bool, highlight_orderid_mode, restaurant_name, header_text, footer_text, new_customer_message, show_restaurant_name bool, show_retail_invoice bool, show_srno_column bool, show_assign_label bool)

payment_type_master(id PK, outlet_id FK, label, is_online bool, is_active) -- so "Other(Room Service)" is DATA not enum

sync_state(id PK, outlet_id FK, machine_role[server/client], machine_ip, last_sync_at, sync_code, status)
backup_jobs(id PK, outlet_id FK, file_path, taken_at, restored_at nullable)
```

All FK to `outlet_id` — multi-outlet ready even though captured screenshots only show one outlet ("Hotel kapila"). Money columns `numeric(12,2)`, timestamps `timestamptz`.

---

## PART 5 — WORKFLOW + SYNC (the LAN server/client thing caveman found)

Screenshot proof: "Machines" modal show Main Server + Client Machine on LAN IPs, plus "Reset Sync Code" / "Database Migration" / "Remove Backup Files" tiles. Caveman read this as: **each outlet runs local server process (probably embedded Postgres/SQLite) that client POS terminals connect to over LAN, and that local server periodically syncs up to cloud** (for multi-outlet reporting, backup, remote admin).

Workflow plan:

1. **Local-first write path**: order created on client terminal → write hits local outlet-server DB first (low latency, works if internet down) → local server queues change → background sync worker pushes to cloud every N seconds (interval = DEC item, ask stakeholder).
2. **Cloud is source of truth for config**: billing settings / print settings / tax master / menu are edited centrally (or locally, TBD) and must propagate down to all outlet-servers — reverse sync direction from #1.
3. **Aggregator webhook path (Swiggy/Zomato)**: cloud API receives webhook → normalizes into `orders`(channel=swiggy/zomato) → pushed down to correct outlet-server → shows on Live Orders screen. Outbound path (accept/reject/OOS/food-ready) reverses: local action → cloud → aggregator API call.
4. **OOS propagation job**: when staff mark item OOS "for all other online platform", one write must fan-out to BOTH Swiggy availability API and Zomato availability API — idempotent, retry-on-fail, log to `channel_sync_log`.
5. **KOT/Bill print**: purely local — printer driver call on client machine, reads `outlet_print_settings`, never round-trips cloud (kitchen can't wait on internet).
6. **Day-end/reports**: computed off local DB in real time (Day Summary, Item Report screens), reconciled nightly against cloud copy for multi-outlet rollups.
7. **Conflict handling**: bill-no/kot-no counters must be per-outlet-server sequence (not global) to avoid clash when offline — "Reset Bill No." tile confirms counters are locally resettable, so sequence authority lives on outlet-server not cloud.

State machine for one order (derived from screenshots):
`draft -> saved -> (kot_printed) -> ready_for_pickup/food_ready -> billed/printed -> paid -> [cancelled at any point before paid] -> [sales_return after paid]`
Online orders add: `placed(webhook) -> accepted -> preparing -> food_ready -> rider_assigned -> picked_up -> delivered`, running parallel to local kot/bill sub-state.

---

## PART 6 — BUSINESS LOGIC RULES (extracted straight from screenshots, not invented)

- Tax must branch by channel: dine-in uses backward-tax CGST+SGST 2.5+2.5, online orders use forward-tax CGST[Online]+SGST[Online] 2.5+2.5 — engine needs `tax_channel_rules` lookup, not single flat rate.
- Container charge only applies to Delivery/PickUp by default (merchant can also enable for Dine-In) — 3 independent toggles, not one bool.
- Discount calculation basis toggle (Total vs Core) changes whether discount computed pre-tax or post add-on — must be config-driven multiplier in billing engine.
- Grand Total is manually editable post-calc (pencil icon) — every manual override MUST write `order_audit_log` row, never silent overwrite.
- OOS mark can cascade to sibling channels — one action, multi-system side effect, must be transactional/queued not fire-and-forget.
- "Prepare In 00:00" + red "too late" warning = SLA breach event — should fire alert/notification (ties to top-bar "Alerts" icon seen in shell), not just a UI color change.
- Payment types are outlet-configurable (room-service custom label proves this) — billing/report code must join `payment_type_master`, never switch-case string literal.
- Reports (Item Report, Day Summary) need "Configure Column" and "Time-Wise" — build as query-builder over materialized view, not fixed SELECT.
- Bill numbering and Sync Code are resettable per outlet from System Config — must be admin-guarded destructive actions, need confirm-dialog + audit entry (screenshot doesn't show confirm step but caveman FLAG this as required regardless, industry norm for destructive ops).

---

## PART 7 — MULTI-AGENT BUILD MODEL (who write what, later, after Phase 0 sign-off)

Caveman NOT writing code now (user say plan only + repo itself say Phase 0 blocked). But here how caveman would split work across agent-caveman clan once unblocked:

1. **DB/Schema Agent** — owns `db/migrations`, `db/seeds`, ERD in `db/`. Turns Part 4 tables into real migrations + seed scripts (seed = sample outlet "Hotel kapila" style data, satisfies CLAUDE.md rule 1: DB path for business data).
2. **Contracts Agent** — owns `contracts/` OpenAPI specs per domain (orders, tables, menu-sync, tax, settings, reports, admin) + async event schemas for webhook/sync events + Postman collection. Must be written BEFORE service/UI agents start (contract-first).
3. **Domain Services Agent(s)** — one per `services/*` module (orders, tables, menu-sync, tax, settings, reporting, sync, admin) — implements business logic from Part 6 against contracts, all config reads go through settings/tax/menu tables (rule 2/3 of CLAUDE.md: real insert path, no inline fake arrays).
4. **POS-Web UI Agent** — owns `apps/pos-web`, builds the 13 screens 1:1 against captured artifacts (Part 2 checklists are its literal spec/acceptance-criteria).
5. **Admin-Web UI Agent** — owns `apps/admin-web`, builds Billing Config / Print Config / Tax Master / Menu Online Manager / System Config screens — these are the "admin UI that writes to DB table" arm of the no-hardcode rule.
6. **Aggregator Integration Agent** — owns Swiggy/Zomato webhook ingestion + outbound OOS/accept/reject calls, lives partly in `services/aggregator-orders` + `infra/` webhook endpoints.
7. **Sync/Offline Agent** — owns local-server↔cloud sync worker, `sync_state`/`backup_jobs` tables, bill-no/kot-no sequence isolation, conflict resolution (Part 5).
8. **QA/Test Agent** — owns `tests/` — contract tests against `contracts/`, e2e walking the SAME click-path as the 86 screenshots (literally can replay this screenshot sequence as an e2e script), perf test on sync worker, security test on webhook auth.
9. **Docs/Discovery Agent** — feeds this whole plan doc into `docs/01-discovery/decision-register.md` as evidence for DEC-001..012 sign-off (especially the FLAGged ambiguous items: MFR button meaning, order-status legend unification, My-Amount vs Grand-Total glossary, sales-return full capture, confirm-dialog on destructive admin actions).

Wire order (so agents don't collide): **Discovery/Decision sign-off → Contracts Agent → DB/Schema Agent (parallel with Contracts) → Domain Services Agents (parallel per module) → POS-Web + Admin-Web UI Agents (parallel, consume same contracts) → Aggregator + Sync Agents (parallel, hook into Orders/Menu services) → QA Agent (continuous, gates every merge) → Docs Agent (continuous, keeps decision register + ADRs current).**

---

## PART 8 — OPEN FLAGS CAVEMAN CANNOT ANSWER FROM PICTURE ALONE (need real stakeholder / more capture)

- "MFR" button label on Live Orders screen — meaning unconfirmed.
- Sales Return Orders block cut off at screenshot edge — need full-scroll capture.
- Exact meaning of unlabeled icon-only buttons (order-panel top-right rail, order-history pop-out icon).
- Sync interval / conflict-resolution policy when local-server offline for extended period.
- Whether config edits (tax/settings) happen centrally-then-push or locally-then-sync-up, or both with last-write-wins.
- Multi-outlet behavior not visible at all (only one outlet "Hotel kapila" captured) — need second-outlet screenshot set before trusting the `outlet_id` fan-out assumption in Part 4/5 hasn't got hidden surprises.

Caveman done. Big plan. Fire good. Rock solid. Go show shaman (stakeholder) before caveman touch code-stick.
