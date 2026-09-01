-- Seat & merge data model, step 7: kot_items is missing outlet_id today
-- (a real tenant-isolation gap — every other order-adjacent table carries
-- it). Backfilled from its parent kot_tickets row, then made NOT NULL.
-- Also adds seat_number/seat_id so kitchen tickets can show which seat an
-- item belongs to.

BEGIN;

ALTER TABLE kot_items
  ADD COLUMN IF NOT EXISTS outlet_id UUID,
  ADD COLUMN IF NOT EXISTS seat_number INTEGER,
  ADD COLUMN IF NOT EXISTS seat_id UUID REFERENCES table_seats(id);

UPDATE kot_items ki
SET outlet_id = kt.outlet_id
FROM kot_tickets kt
WHERE ki.kot_ticket_id = kt.id
  AND ki.outlet_id IS NULL;

ALTER TABLE kot_items
  ALTER COLUMN outlet_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kot_items_outlet
  ON kot_items (outlet_id);

CREATE INDEX IF NOT EXISTS idx_kot_items_seat
  ON kot_items (seat_id)
  WHERE seat_id IS NOT NULL;

COMMIT;
