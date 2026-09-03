-- 0050: repair 0002_catalog.sql's SECOND missing table, availability_schedules
-- (item_availability, the first, was already repaired in 0045). Tracked as
-- TSK-025 in agents/task-board.json ("backs commission.ts/menu-scheduling.ts,
-- out of aggregator-feed scope, needs its own repair migration") -- this is
-- that migration.
--
-- Evidence (P2021, still firing in api-2026-09-02.log): "The table
-- `public.availability_schedules` does not exist in the current database"
-- (10x), thrown from apps/api/src/routes/menu-scheduling.ts's GET/POST/PATCH
-- /menu-scheduling/schedules (`(prisma as any).availability_schedules...`).
--
-- Root cause, same class as item_availability (0045's header): 0002_catalog.sql
-- is a single BEGIN/COMMIT with several CREATE TABLE statements (no IF NOT
-- EXISTS). Most of its tables (categories, menu_items, item_variants,
-- modifier_groups, modifiers, item_modifier_groups, channel_item_mapping)
-- demonstrably exist and work live -- only availability_schedules does not.
-- 0045 had reasoned (from an earlier, narrower diagnostic pass) that
-- availability_schedules DID exist live; re-checking the full log set for
-- this pass finds real, current (api-2026-09-02.log) P2021 errors against
-- it, contradicting that. Rather than assume either source is right,
-- availability_schedules is (re)created here defensively with
-- CREATE TABLE IF NOT EXISTS: a true no-op if it does in fact already
-- exist (matching 0045's finding), and the actual fix if it does not
-- (matching today's log evidence) -- also added to
-- scripts/inspect-db-v2.js's TABLES array so a future diagnostic run
-- settles this definitively.
--
-- Shape: NOT the original 0002_catalog.sql column list (id, outlet_id,
-- item_id, day_of_week, start_time, end_time, created_at, updated_at,
-- created_by, updated_by) -- kapmeta/schema.prisma's availability_schedules
-- model and apps/api/src/routes/menu-scheduling.ts's queries (which filter
-- and write category_id and is_active on every request) both already
-- expect two additional columns, category_id and is_active, that no
-- migration file anywhere ever declared. menu-scheduling.ts's own header
-- comment documents this directly: "Reuses the existing
-- `availability_schedules` table, now (as of this session's schema change)
-- carrying `is_active` and `category_id` columns in addition to its
-- original item_id/day_of_week/start_time/end_time shape." This migration
-- creates the table matching that already-shipped code and schema, not the
-- stale original file, so menu-scheduling.ts's `(prisma as any)` queries
-- succeed once this lands.
--
-- TEXT, not UUID: ground truth from `node scripts/inspect-db-v2.js` (see
-- 0045's header). item_id/outlet_id REFERENCE menu_items(id)/outlets(id),
-- both confirmed TEXT live. category_id has no FK declared anywhere
-- (menu-scheduling.ts treats it as an opaque filter value, same as
-- item_availability's channel_id in 0045) -- TEXT for the same reason.

BEGIN;

CREATE TABLE IF NOT EXISTS availability_schedules (
    id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id    TEXT        NOT NULL REFERENCES outlets (id),
    item_id      TEXT        NOT NULL REFERENCES menu_items (id),
    category_id  TEXT,
    day_of_week  SMALLINT    NOT NULL,
    start_time   TIME        NOT NULL,
    end_time     TIME        NOT NULL,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT,
    updated_by   TEXT,
    CONSTRAINT ck_availability_schedules_dow CHECK (day_of_week BETWEEN 0 AND 6)
);

-- Defensive: if the table already existed (per 0045's finding) but without
-- category_id/is_active, this repairs it the same way 0043/0046 repair
-- edited-after-applied tables.
ALTER TABLE availability_schedules ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE availability_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_availability_schedules_outlet ON availability_schedules (outlet_id);
CREATE INDEX IF NOT EXISTS idx_availability_schedules_item   ON availability_schedules (item_id);

COMMIT;
