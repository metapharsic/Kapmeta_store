-- Real table merge: member tables stay occupied as a group sharing one bill
-- on the primary. Occupancy is no longer "move order + vacate source".

BEGIN;

ALTER TABLE dining_tables
  ADD COLUMN IF NOT EXISTS merge_group_id UUID,
  ADD COLUMN IF NOT EXISTS merge_primary_table_id UUID;

CREATE INDEX IF NOT EXISTS idx_dining_tables_merge_group
  ON dining_tables (merge_group_id)
  WHERE merge_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dining_tables_merge_primary
  ON dining_tables (merge_primary_table_id)
  WHERE merge_primary_table_id IS NOT NULL;

COMMIT;
