-- 0040: menu/addon commission rates, physical menu file uploads, menu-sync
-- badge, and a minimal top-up of the existing (previously unwired)
-- availability_schedules table for menu scheduling.
--
-- Backs four reference-audit screens:
--   * "Set Menu Commission" (Item Commission / Addon Item Commission tabs --
--     Item | Category | Item Price | Commission Type | Commission Value,
--     default state "Not Configured" i.e. no row yet).
--   * "Menu Scheduling" -- reuses availability_schedules (item_id, day_of_week,
--     start_time, end_time already present since 0002_catalog.sql); this file
--     only adds the is_active toggle and an optional category-level scope that
--     table was missing. No new table for this screen.
--   * "Physical Menu" -- empty state with "+ Add File"; no file/attachment
--     storage table exists anywhere in this database, so physical_menu_files
--     is new.
--   * "All In One Menu" -- the "Last Menu Sync 4 min ago" badge; adds
--     outlets.last_menu_sync_at (nullable -- population/read wiring is a
--     follow-up, this migration only adds the column).
--
-- Every statement is IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so this file
-- is safe to re-run against a database that already has some or all of it,
-- and it does not assume anything beyond migration 0039 landed cleanly:
-- item_commissions and addon_commissions each carry their own FKs to the
-- tables they need (outlets, menu_items, modifier_options) rather than
-- relying on state from any single prior migration.

BEGIN;

-- Item Commission tab. One row per (outlet, menu item); "Not Configured" in
-- the UI is simply the absence of a row here, so no default/placeholder
-- state is encoded -- commission_value is nullable until someone sets it.
CREATE TABLE IF NOT EXISTS item_commissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id         UUID        NOT NULL REFERENCES outlets (id),
    menu_item_id      UUID        NOT NULL REFERENCES menu_items (id),
    commission_type   TEXT        NOT NULL CHECK (commission_type IN ('PERCENTAGE', 'FLAT')),
    commission_value  NUMERIC(10, 2),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_commissions_outlet
    ON item_commissions (outlet_id);

CREATE INDEX IF NOT EXISTS idx_item_commissions_menu_item
    ON item_commissions (menu_item_id);

-- Addon Item Commission tab. "Addon item" here is modifier_options -- the
-- table actually behind POST/PATCH /menu/modifier-options (see
-- 0025_modifier_options_and_menu_crud.sql) -- not the older, unused
-- `modifiers` table from 0002_catalog.sql.
CREATE TABLE IF NOT EXISTS addon_commissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id         UUID        NOT NULL REFERENCES outlets (id),
    addon_item_id     UUID        NOT NULL REFERENCES modifier_options (id),
    commission_type   TEXT        NOT NULL CHECK (commission_type IN ('PERCENTAGE', 'FLAT')),
    commission_value  NUMERIC(10, 2),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, addon_item_id)
);

CREATE INDEX IF NOT EXISTS idx_addon_commissions_outlet
    ON addon_commissions (outlet_id);

CREATE INDEX IF NOT EXISTS idx_addon_commissions_addon_item
    ON addon_commissions (addon_item_id);

CREATE TABLE IF NOT EXISTS availability_schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID NOT NULL REFERENCES outlets (id),
    item_id      UUID REFERENCES menu_items (id),
    category_id  UUID REFERENCES menu_categories (id),
    day_of_week  SMALLINT,
    start_time   TIME,
    end_time     TIME,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE availability_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE availability_schedules ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES menu_categories (id);

CREATE INDEX IF NOT EXISTS idx_availability_schedules_category
    ON availability_schedules (category_id)
    WHERE category_id IS NOT NULL;

-- Physical Menu: file uploads. No file/attachment storage table exists
-- anywhere else in this database, so this is new. file_url holds either a
-- local path or an object-storage URL -- storage backend is a follow-up
-- decision, this column just needs to hold whichever string that turns out
-- to be. uploaded_by_user_id is nullable: uploads performed by a system
-- process (e.g. a future sync job) have no human uploader.
CREATE TABLE IF NOT EXISTS physical_menu_files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    file_name           TEXT        NOT NULL,
    file_url            TEXT        NOT NULL,
    uploaded_by_user_id UUID        REFERENCES users (id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_menu_files_outlet
    ON physical_menu_files (outlet_id);

-- All In One Menu: "Last Menu Sync 4 min ago" badge. Nullable -- most outlets
-- have never synced. Population/read wiring is a follow-up; this migration
-- only adds the column.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS last_menu_sync_at TIMESTAMPTZ;

COMMIT;
