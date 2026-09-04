# DECISION-0001: Primary/Foreign Key IDs Are TEXT, Not UUID — Follow the Live Database, Not the Prisma Schema

**Status:** Accepted
**Date:** 2026-09-03/04
**Deciders:** Database Agent (this session), via `scripts/inspect-db-v2.js`
**Related:** ADR-0002 (tenancy/outlet scoping), `docs/brain/BUSINESS_RULES.md`
rule 5, `docs/brain/KNOWN_GAPS.md` (TSK-028/TSK-044)

## Context

Every migration file in `db/migrations/` originally declared id and FK
columns as Postgres `uuid`, and `kapmeta/schema.prisma` mirrors that with
`@db.Uuid` on most models. During this session's repair work on migration
0045 (`db/migrations/0045_repair_0002_item_availability.sql`), a foreign
key migration failed with Postgres error `42804` (datatype mismatch) —
the target column it referenced was not actually `uuid` in the live
database, it was `text`. This was not an isolated case: `outlets.id` itself
was found to be `text` live despite being declared `uuid` in every
migration file that touches it (documented in the header comment of
`scripts/inspect-db-v2.js`, lines 1-6).

The likely mechanism (not fully reconstructed, but consistent with the
evidence): at some point outside of the migration files' own history, the
live schema was altered or reseeded with `text` ids — possibly by an
earlier repair pass, a manual `psql` intervention, or a Prisma `db push`
that diverged from the migrations directory — and the migration files were
never updated to match. The Prisma schema and the migration files agree
with each other (`uuid`) but disagree with the live database (`text`).

## Investigation

`scripts/inspect-db-v2.js` was written this session specifically to stop
guessing: it connects to the real `DATABASE_URL` and, for a fixed list of
tables (`outlets`, `menu_items`, `orders`, `dining_tables`,
`table_merge_groups`, `kot_items`, `customers`, `modifier_groups`, and
~20 more — see the `TABLES` array, `scripts/inspect-db-v2.js:30-45`),
dumps the actual live column type of every id/FK column. The script's own
comment records the finding in plain terms: "every table checked so far is
TEXT except integrations/channel_accounts.integration_id" (lines 38-41).

## Decision

Treat **TEXT as the real, load-bearing id/FK type for this database**, and
change the Prisma schema and any new migration to match the live database
— not the other way around. Where a table needed to be rebuilt this
session, it was rebuilt with `String` (Prisma) / `text` (Postgres) ids,
with `@default(dbgenerated("gen_random_uuid()"))` (or, for the newer
`management_*` tables, `gen_random_uuid()::text`, see
`kapmeta/schema.prisma:1738`) still generating UUID-*shaped* values for
uniqueness and readability, but stored and typed as text throughout.

The single confirmed exception is `integrations`/
`channel_accounts.integration_id`, which is genuinely `uuid` live and was
left alone.

This session's concrete repair: migration
`0047_repair_seat_and_merge_uuid_text_mismatch.sql` recreated
`table_merge_groups`, `table_merge_members`, `table_seats`,
`order_seat_bills`, and `order_item_seat_shares` with TEXT ids/FKs
end-to-end, and each of those five models in `kapmeta/schema.prisma` now
carries a comment recording exactly this ("id/outlet_id/etc were @db.Uuid;
removed 2026-09-03 (migration 0047) ... matching the confirmed universal
live convention"). `KOTItem.outletId`/`seatId` and
`Customer.organization_id` were fixed the same way in migrations 0046/0047
territory, each with the same style of comment plus an explicit note of
which sibling columns were deliberately left `@db.Uuid` and deferred
(TSK-028).

## Consequences

- **What becomes easier:** every new table or repaired table this session
  followed one unambiguous convention (TEXT), eliminating guesswork and
  the `42804`-class migration failure for anything touched.
- **What becomes harder / what remains debt:** the audit is not complete.
  `MenuItem`, `Station`, `InboundEvent`, `OutboundEvent`, `SyncJob`,
  `IntegrationError`, and the `modifier_*` family are still `@db.Uuid` in
  `kapmeta/schema.prisma` and have not been directly re-confirmed against
  the live DB this session — tracked as TSK-028 (systemic) and TSK-044
  (modifier-specific follow-up). Any query that touches one of those
  unconfirmed columns still risks a Prisma-side uuid-cast error if the
  live column turns out to be `text`, which the pattern-so-far makes more
  likely than not.
- **Commitment:** new tables should default to TEXT ids going forward,
  matching the confirmed universal convention, rather than defaulting to
  Postgres `uuid` per the original (evidently stale) migration-file
  convention.
