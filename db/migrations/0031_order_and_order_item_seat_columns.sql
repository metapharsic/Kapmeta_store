-- Seat & merge data model, step 4: orders gain merge/split-mode fields and a
-- MERGED terminal status for donor orders (status stays free-text, so this
-- is just a new allowed value, not a type change); order_items gain the
-- per-seat / split / fold-origin columns needed for per-seat billing.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merge_group_id UUID,
  ADD COLUMN IF NOT EXISTS covers INTEGER,
  ADD COLUMN IF NOT EXISTS split_mode TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_order_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_merge_group
  ON orders (merge_group_id)
  WHERE merge_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_merged_into
  ON orders (merged_into_order_id)
  WHERE merged_into_order_id IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS seat_id UUID REFERENCES table_seats(id),
  ADD COLUMN IF NOT EXISTS split_group_id UUID,
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_table_id TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_seat
  ON order_items (seat_id)
  WHERE seat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_split_group
  ON order_items (split_group_id)
  WHERE split_group_id IS NOT NULL;

COMMIT;
