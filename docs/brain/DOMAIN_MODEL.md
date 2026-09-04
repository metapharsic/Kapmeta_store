# Domain Model

Grounded in `kapmeta/schema.prisma`. Field names below are the Prisma field
names; where the DB column differs it is noted via `@map(...)`. This is not a
generic restaurant-domain essay — every entity/relationship listed is a real
model in the schema as of this session (55 migrations deep, `db/migrations/`).

## Tenancy root: Organization -> Outlet

- `Organization` (`kapmeta/schema.prisma:121`) is the top-level tenant.
- `Outlet` (`:133`) belongs to an organization (`organizationId`) and is the
  unit everything operational is scoped to. Outlets can be **virtual**:
  `isVirtual Boolean`, `parentOutletId` self-relation
  (`OutletVirtualChildren`) — this backs cloud-kitchen "virtual outlet"
  brands that share a physical kitchen with a real outlet (see
  `docs/brain/BUSINESS_RULES.md` for the outlet-scoping rule this enables).
- `Station` (`:162`) is a kitchen prep station scoped to one outlet
  (`outletId`), carries SLA thresholds (`slaWarningSeconds`,
  `slaBreachSeconds`) and a `printerIp`. KOT tickets route to a station.

## Menu: MenuCategory -> MenuItem -> Modifiers

- `MenuCategory` (`:179`) and `MenuItem` (`:368`) are outlet-scoped catalog
  entities. `MenuItem.price` is `BigInt` (minor units — see
  BUSINESS_RULES.md), `taxRate` is a `Decimal(5,2)` percentage, and
  `station_id` links an item to the `Station` that prepares it (drives KOT
  routing).
- `ModifierGroup` (`:394`) / `modifiers` / `modifier_options` /
  `item_modifier_groups` model add-on choices (min/max select) attached to
  items; `OrderItemModifier` (`:482`) is the frozen line-level record of
  which modifiers were actually chosen on an order, with
  `price_delta_minor` captured at order time (not re-derived from the
  current modifier price later).
- Parallel/legacy catalog tables also exist: `categories` (`:854`),
  `item_prices` (`:1046`), `item_variants` (`:1061`), `special_notes`
  (`:1011`), `availability_schedules` (`:831`), `item_availability`
  (`:959`) — the last two are the "86'd" / time-windowed availability
  system, distinct from `MenuItem.isActive`.

## Dining surface: DiningTable, table merge, seats

- `DiningTable` (`:195`) is outlet-scoped (`outletId`, unique on
  `[outletId, tableNumber]`), carries `status` (free-text, default
  `"VACANT"`), a `version` column for optimistic locking, and merge
  pointers (`mergeGroupId`, `mergePrimaryTableId`).
- Table merging is normalized into its own tables rather than living only
  as columns on `DiningTable`: `table_merge_groups` (`:231`, one row per
  active/closed merge, `status` enum `table_merge_status`,
  `primary_table_id`) and `table_merge_members` (`:253`, one row per table
  in the group, `is_primary` flag, `joined_at`/`left_at`).
- Per-seat billing is likewise normalized: `table_seats` (`:273`, one row
  per physical seat at a table, `seat_number`, `status` enum
  `seat_status`), `order_seat_bills` (`:293`, one row per seat's running
  bill on an order — `subtotal`/`tax_total`/`grand_total`/`paid_total` all
  `BigInt`), and `order_item_seat_shares` (`:322`, splits one `OrderItem`
  across seats by `share_numerator`/`share_denominator` — supports "split
  this dish 3 ways" rather than only "assign whole items to a seat").
- All five of these seat/merge tables carry a comment block (added
  migration 0047, 2026-09-03) documenting that they were rebuilt with TEXT
  ids after being found live as TEXT despite the Prisma schema historically
  declaring `@db.Uuid` — see `docs/decision/0001-text-ids-not-uuid.md`.

## Order lifecycle: Order -> OrderItem -> KOTTicket -> KOTItem

- `Order` (`:410`) is the transactional header: `outletId`, `orderNumber`
  (gapless per-outlet-per-day, see BUSINESS_RULES.md), `orderType`
  (default `"DINE_IN"`), `status` (free-text), `diningTableId`, money
  fields as `BigInt` (`subtotal`, `discountTotal`, `taxTotal`,
  `grandTotal`, `serviceChargeTotal`, `tipTotal`, `roundOffMinor`,
  `depositMinor`), `mergeGroupId`/`mergedIntoOrderId` for order-level
  merges, `splitMode`, and aggregator fields (`channel`,
  `externalOrderId`, `riderName`, `riderPhone`, `receivedAt`,
  `acceptedAt`) for Swiggy/Zomato-style online orders on the same table.
- `OrderItem` (`:456`) is one line of an order: `menuItemId`, `quantity`,
  `unitPrice`/`subtotal` as `BigInt`, void tracking (`isVoided`,
  `voidReason`, `voidedBy`), course (`course`), and the seat-split fields
  (`seatNumber`, `seatId`, `splitGroupId`, `isShared`, `originTableId` —
  the last for tracking an item moved from one table to another).
- `OrderStatusHistory` (`:500`) is an append-only audit trail of order
  status changes (`status`, `notes`, `createdBy`).
- `KOTTicket` (`:548`) is the kitchen-facing document: one ticket per
  order/station combination, `ticketNumber`, `status` (free-text — see the
  full canonical-value doc comment at schema.prisma:502-547 and
  BUSINESS_RULES.md), `servedAt`, `billPrintedAt` (the "Used In Bill" UI
  label is `SERVED` + `billPrintedAt` non-null, not a separate status —
  documented in-schema specifically to explain why `bill_printed_at` is its
  own column, migration 0039).
- `KOTItem` (`:570`) is one line on a ticket: `menuItemId`, `quantity`,
  `notes`, `course`, seat fields, and optionally `orderItemId` linking it
  back to the `OrderItem` that generated it (nullable — some KOT items may
  not map 1:1, e.g. combined/modified tickets).
- `KOTStatusHistory` (`:596`) is the KOT analogue of
  `OrderStatusHistory`: append-only, `status`, `reasonCode`.

## Payment and Customer

- `Payment` (`:669`) is outlet+order scoped, `amount` as `BigInt`,
  `method` (default `"CASH"`), `status` (default `"CAPTURED"`),
  `idempotencyKey`, and optional seat linkage (`seatNumber`, `seatId`,
  `orderSeatBillId`) so a split-bill seat can be paid independently of the
  rest of the order.
- `Customer` (`:608`) is keyed by `phone` (unique with `organization_id`),
  carries consent flags (`consent_marketing`, `consent_data_sharing`,
  `consent_recorded_at` — DPDP/GDPR-style consent tracking) and
  `loyaltyPoints`. Note `Customer.organization_id` is nullable and was
  itself a TEXT-vs-UUID repair casualty (migration 0046, see the in-schema
  comment at schema.prisma:610-613).
- `MarketingCampaign` / `CampaignRecipient` (`:637`, `:655`) run
  outbound messaging against customer segments (`segmentFilter` JSON).

## Multi-tenant integration layer

- `ChannelAccount` (`:707`) / `ChannelItemMapping` (`:728`) map an outlet's
  menu items to Swiggy/Zomato channel-side item ids.
- `InboundEvent` / `OutboundEvent` / `SyncJob` / `IntegrationError`
  (`:743`-`:813`) form an event-sourcing-flavored integration log for
  aggregator sync.

## Inventory / purchasing (adjacent but real)

- `ingredients`, `vendors`, `recipes`, `recipe_ingredients`,
  `purchase_orders`, `purchase_order_items`, `StockPurchase`/
  `StockPurchaseItem`, `StockConsumption`/`StockConsumptionItem`,
  `DailyStockClosing`/`DailyStockClosingItem` (roughly `:1270`-`:1712`)
  form the inventory/purchasing subgraph; `recipes` link `MenuItem`-style
  production to `ingredients` consumption. Not exhaustively modeled here —
  see `docs/brain/KNOWN_GAPS.md` for the two-parallel-purchase-order-backend
  gap.

## Generic management tables (cross-cutting, not entity-specific)

- `management_lists`, `management_settings`, `management_activity_logs`
  (`:1737`-`:1774`) are outlet-scoped generic key/value and activity-log
  stores used by several admin screens instead of bespoke tables — see
  `docs/decision/0002-generic-management-catalog-pattern.md` for why.
