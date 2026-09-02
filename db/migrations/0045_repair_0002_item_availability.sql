-- 0045: repair 0002_catalog.sql, whose item_availability table never landed
-- live, discovered from real API error logs (logs/api/*.log):
--   PrismaClientKnownRequestError P2021 "The table `public.item_availability`
--   does not exist in the current database" (25 occurrences across the log
--   set), thrown from apps/api/src/routes/integration.ts (GET/PATCH
--   /channel-items..., the per-channel item availability toggle behind the
--   channel-availability screen and the aggregator "Online Item Status"
--   view) and from apps/api/src/routes/menu.ts's own availability endpoints.
--
-- Root cause, same class as 0007/0018/0022 (see 0043, 0044):
-- 0002_catalog.sql is a single CREATE TYPE + several CREATE TABLE statements
-- (not IF NOT EXISTS) inside one BEGIN/COMMIT block. schema_migrations
-- already records 0002 as applied, and most of that file's tables
-- (categories, menu_items, item_variants, modifier_groups, modifiers,
-- item_modifier_groups, channel_item_mapping) demonstrably exist and work
-- live -- only item_availability and availability_schedules are missing --
-- consistent with those two CREATE TABLE statements having been appended to
-- the file after 0002 had already run once. Re-running the file today is
-- impossible (plain CREATE TABLE fails 42P07 on the now-already-existing
-- tables, and db-migrate.js's ALREADY_PRESENT handling treats that as a
-- no-op, never re-checking for tables added later in the same file).
--
-- CORRECTION (this file's first version used UUID for id/outlet_id/item_id/
-- channel_id and failed live: 42804, "outlet_id ... uuid and text"). Every
-- migration file in this repo declares id/outlet_id/etc as UUID, but ground
-- truth from `node scripts/inspect-db-v2.js`, run for real against the live
-- DB, shows the ENTIRE live schema uses TEXT for id and every FK column
-- (outlets.id, menu_items.id/outlet_id, orders.id/outlet_id, etc. -- all
-- text) -- almost certainly because the tables were first provisioned via
-- `prisma db push` off schema.prisma's Outlet model, which is `String @id`
-- with no `@db.Uuid`, and the raw-SQL migration files (which all say UUID)
-- were layered on afterward without ever matching that reality. This file
-- now matches ground truth: TEXT throughout, gen_random_uuid()::text as the
-- default (same pattern already used correctly elsewhere in this repo,
-- e.g. scripts/inspect-db.js's own callers).
--
-- Scope note: availability_schedules (also declared in 0002_catalog.sql and
-- also missing per the earlier log-only diagnosis) EXISTS live already per
-- inspect-db-v2.js -- it was not actually broken, left untouched here.
--
-- stock_qty is included: 0017_add_stock_to_item_availability.sql
-- (`ALTER TABLE item_availability ADD COLUMN IF NOT EXISTS stock_qty ...`)
-- ran against a table that did not exist, a hard Postgres error (42P01),
-- not a silent no-op -- so it hit the same pre-fix db-migrate.js bug
-- documented in 0043. stock_qty never landed either; created here.
--
-- CREATE TYPE has no IF NOT EXISTS form in Postgres, so availability_state
-- is created via a DO block that ignores "already exists".

BEGIN;

DO $$ BEGIN
    CREATE TYPE availability_state AS ENUM ('ON', 'OFF', 'PARTIAL', 'UNSCHEDULED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- channel_id has no dedicated table (channel_accounts lands in 0007);
-- TEXT to match channel_accounts.id, which is TEXT live like everything
-- else, even though no formal FK is declared (same as the original 0002
-- comment intended -- "opaque UUID reference" became "opaque text
-- reference" once ground truth was checked).
-- version is the out-of-order sync guard from WF-MNU-menu-sync.md.
CREATE TABLE IF NOT EXISTS item_availability (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id    TEXT                NOT NULL REFERENCES outlets (id),
    item_id      TEXT                NOT NULL REFERENCES menu_items (id),
    channel_id   TEXT                NOT NULL,
    state        availability_state  NOT NULL DEFAULT 'UNSCHEDULED',
    version      INTEGER             NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    created_by   TEXT,
    updated_by   TEXT
);

ALTER TABLE item_availability ADD COLUMN IF NOT EXISTS stock_qty INTEGER DEFAULT 100;

-- DB-UQ-05 (0002_catalog.sql): conflicting availability rows for the same
-- item/channel pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_availability_item_channel
    ON item_availability (item_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_item_availability_outlet ON item_availability (outlet_id);
CREATE INDEX IF NOT EXISTS idx_item_availability_item   ON item_availability (item_id);

-- from 0017_add_stock_to_item_availability.sql
CREATE INDEX IF NOT EXISTS idx_item_availability_item_channel
    ON item_availability (item_id, channel_id);

COMMIT;
