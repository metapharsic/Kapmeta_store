-- Promotes dining table "sections" to a real Area entity so restaurant areas
-- (AC Dining, Main Hall, Outdoor Garden, First Floor, etc.) can be created,
-- renamed and deleted independent of editing a table's free-text section
-- field, and so GET /tables/sections no longer falls back to a hardcoded
-- literal array of section names.
-- dining_tables.section is kept as-is for this migration (transition period);
-- areas.name is the source of truth for section CRUD going forward.

BEGIN;

CREATE TABLE IF NOT EXISTS areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, name)
);

CREATE INDEX IF NOT EXISTS idx_areas_outlet
  ON areas (outlet_id);

-- Backfill: one row per distinct existing dining_tables.section value, per outlet
INSERT INTO areas (outlet_id, name)
SELECT DISTINCT outlet_id, section FROM dining_tables WHERE section IS NOT NULL
ON CONFLICT (outlet_id, name) DO NOTHING;

COMMIT;
