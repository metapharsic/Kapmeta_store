-- Seat & merge data model, step 2: promote the loose dining_tables.merge_group_id /
-- merge_primary_table_id pair (added in 0024) into real merge-group and
-- merge-member rows, so merges get proper lifecycle state and unmerge
-- history instead of two nullable columns on dining_tables. Also adds the
-- optimistic-lock version and covers columns to dining_tables.

BEGIN;

ALTER TABLE dining_tables
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS covers INTEGER;

CREATE TABLE IF NOT EXISTS table_merge_groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         UUID NOT NULL,
  primary_table_id  UUID NOT NULL REFERENCES dining_tables(id),
  status            table_merge_status NOT NULL DEFAULT 'ACTIVE',
  total_capacity    INTEGER,
  covers            INTEGER,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  created_by        UUID,
  reason            TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_merge_groups_outlet
  ON table_merge_groups (outlet_id);

CREATE INDEX IF NOT EXISTS idx_table_merge_groups_primary_table
  ON table_merge_groups (primary_table_id);

-- A table can be the primary of at most one currently-open merge.
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_merge_groups_active_primary
  ON table_merge_groups (outlet_id, primary_table_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS table_merge_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id        UUID NOT NULL,
  merge_group_id   UUID NOT NULL REFERENCES table_merge_groups(id) ON DELETE CASCADE,
  dining_table_id  UUID NOT NULL REFERENCES dining_tables(id),
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_table_merge_members_outlet
  ON table_merge_members (outlet_id);

CREATE INDEX IF NOT EXISTS idx_table_merge_members_group
  ON table_merge_members (merge_group_id);

CREATE INDEX IF NOT EXISTS idx_table_merge_members_table
  ON table_merge_members (dining_table_id);

-- A table is in at most one active (not-yet-left) merge at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_merge_members_active_table
  ON table_merge_members (dining_table_id)
  WHERE left_at IS NULL;

-- Backfill: every dining_table currently carrying a merge_group_id becomes
-- one open table_merge_groups row (keyed by merge_group_id itself, reused as
-- the new primary key so this backfill is re-runnable) plus a member row per
-- table pointing at it. merge_primary_table_id marks the primary member.
INSERT INTO table_merge_groups (id, outlet_id, primary_table_id, status, opened_at)
SELECT DISTINCT
  dt.merge_group_id,
  dt.outlet_id,
  COALESCE(
    (SELECT dt2.id FROM dining_tables dt2
       WHERE dt2.merge_group_id = dt.merge_group_id
         AND dt2.id = dt2.merge_primary_table_id
       LIMIT 1),
    dt.merge_primary_table_id,
    dt.id
  ),
  'ACTIVE',
  now()
FROM dining_tables dt
WHERE dt.merge_group_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO table_merge_members (outlet_id, merge_group_id, dining_table_id, is_primary, joined_at)
SELECT
  dt.outlet_id,
  dt.merge_group_id,
  dt.id,
  (dt.id = dt.merge_primary_table_id),
  now()
FROM dining_tables dt
WHERE dt.merge_group_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
