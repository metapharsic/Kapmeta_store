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
-- Scope note: availability_schedules (also declared in 0002_catalog.sql and
-- also missing per the same logs) backs commission.ts / menu-scheduling.ts,
-- not the aggregator order pipeline this migration is scoped to -- left for
-- whoever repairs that flow, not touched here.
--
-- stock_qty is included: 0017_add_stock_to_item_availability.sql
-- (`ALTER TABLE item_availability ADD COLUMN IF NOT EXISTS stock_qty ...`)
-- ran against a table that did not exist, which is a hard Postgres error
-- (42P01), not a silent no-op -- so it hit the same pre-fix db-migrate.js
-- bug documented in 0043 (failure swallowed, migration still marked
-- applied). stock_qty never landed either; it is created here alongside
-- the rest of the table.
--
-- CREATE TYPE has no IF NOT EXISTS form in Postgres, so availability_state
-- is created via a DO block that ignores "already exists" -- safe whether
-- or not the type survived from 0002's original partial run.

BEGIN;

DO $$ BEGIN
    CREATE TYPE availability_state AS ENUM ('ON', 'OFF', 'PARTIAL', 'UNSCHEDULED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- channel_id has no dedicated table (channel_accounts lands in 0007);
-- treated as an opaque UUID reference, same as the original 0002 comment.
-- version is the out-of-order sync guard from WF-MNU-menu-sync.md.
CREATE TABLE IF NOT EXISTS item_availability (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID                NOT NULL REFERENCES outlets (id),
    item_id      UUID                NOT NULL REFERENCES menu_items (id),
    channel_id   UUID                NOT NULL,
    state        availability_state  NOT NULL DEFAULT 'UNSCHEDULED',
    version      INTEGER             NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
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
