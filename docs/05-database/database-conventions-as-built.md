# Database (Current State)

Cross-reference: `docs/adr/0009-text-ids-not-uuid.md` for the
discovery narrative; this file is the reference summary of the resulting
conventions and migration history.

## Convention 1: IDs and FKs are TEXT

Confirmed live via `scripts/inspect-db-v2.js` against every table it
checks except `integrations`/`channel_accounts.integration_id` (script
comment, lines 38-41). New/repaired tables this session use
`String @id @default(dbgenerated("gen_random_uuid()"))` (Prisma) — a
UUID-shaped value generated for uniqueness/readability but stored and
typed as Postgres `text`, not `uuid`. The newer `management_*` tables
spell this even more explicitly: `gen_random_uuid()::text`
(`kapmeta/schema.prisma:1738, 1754, 1765`). `kapmeta/schema.prisma` still
has unaudited `@db.Uuid` declarations on `MenuItem`, `Station`,
`InboundEvent`, `OutboundEvent`, `SyncJob`, `IntegrationError`, and the
`modifier_*` family — tracked as open debt (TSK-028/TSK-044, see
`docs/brain/KNOWN_GAPS.md`).

## Convention 2: outlet-scoping

Every operational table carries `outlet_id`/`outletId` as a required
column (see `docs/brain/BUSINESS_RULES.md` rule 1 for the full citation
list). This was decided in ADR-0007
(`docs/adr/0007-tenancy-and-outlet-scoping.md`) before this session and
has been consistently honored in every table added/repaired this session
— e.g. `management_lists`/`management_settings`/
`management_activity_logs` (`kapmeta/schema.prisma:1737-1775`) and the
seat/merge tables (`table_seats`, `table_merge_groups`,
`order_seat_bills`, `order_item_seat_shares`).

## Convention 3: currency as BigInt minor units

Every money column across the schema is `BigInt` — `Order.subtotal/
grandTotal/...`, `OrderItem.unitPrice/subtotal`, `Payment.amount`,
`order_seat_bills.*_total`, `OrderItemModifier.price_delta_minor` — never
`Float` and never even `Decimal` for the transactional amounts
themselves (`Decimal` is reserved for `MenuItem.taxRate`, a percentage,
not a currency amount). See `docs/brain/BUSINESS_RULES.md` rule 2.

## Migration history summary

`db/migrations/` contains 55 numbered SQL migrations (`0001` through
`0055`) plus `BLOCKED-MIGRATIONS.md` and a `README.md`. The tail of the
sequence is dominated by **repair migrations** rather than new-feature
migrations — a direct consequence of the TEXT/UUID drift discovered this
session:

- `0043_repair_0018_0022_missing_objects.sql`
- `0044_repair_0007_channel_accounts_integration_id.sql`
- `0045_repair_0002_item_availability.sql` (the migration whose `42804`
  failure triggered writing `scripts/inspect-db-v2.js`)
- `0046_repair_0001_0002_0006_0018_further_edits.sql`
- `0047_repair_seat_and_merge_uuid_text_mismatch.sql`
- `0048_repair_0023_waiter_shift_handovers.sql`
- `0049_repair_0004_order_refunds.sql`
- `0050_repair_0002_availability_schedules.sql`
- `0051_repair_user_quick_links_notifications_updated_at.sql`

Nine of the last thirteen migrations (0043-0051) are explicitly named
`repair_*`, i.e. correcting an earlier migration's drift from the live
database rather than adding new schema. This is a real, measurable
pattern: the repair-migration count (9) is close to a quarter of the
entire 55-migration history. After the repair run, feature migrations
resume: `0052_create_report_notifications.sql`,
`0053_create_management_tables.sql`, `0054_add_user_code.sql`,
`0055_create_accounting_tables.sql`.

`0043`'s `DO`-block existence guard for `order_payments` is a real, still-
open workaround (see `docs/brain/KNOWN_GAPS.md`, TSK-027) — the migration
was written to skip creating a table that two earlier, conflicting
migration lineages both failed to land, rather than to actually resolve
the conflict.

## Prisma schema structure notes

`kapmeta/schema.prisma` is a single file with ~85 `model` declarations
(see the grep of `^model ` used to build `docs/brain/DOMAIN_MODEL.md`).
Two naming conventions coexist in the same file: PascalCase models with
`@map("snake_case")` table names (the "original" R1 models — `User`,
`Order`, `MenuItem`, `KOTTicket`, etc.) and lowercase-snake_case models
with no `@map` at all, whose Prisma model name already equals the table
name (`areas`, `table_merge_groups`, `categories`, `ingredients`,
`management_lists`, etc. — mostly tables added later in the session's
migration history). This is a real, visible split in the file, not
inconsistent formatting — later additions simply stopped following the
PascalCase-plus-`@map` pattern.
