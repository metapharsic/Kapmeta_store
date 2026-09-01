-- Seat & merge data model, step 3: per-seat rows under a dining table, so
-- seating, per-seat ordering and per-seat billing have somewhere to attach.
-- Seeded from each table's current capacity via a data-migration INSERT
-- (generate_series over dining_tables.capacity), not hardcoded literals.

BEGIN;

CREATE TABLE IF NOT EXISTS table_seats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id        UUID NOT NULL,
  dining_table_id  UUID NOT NULL REFERENCES dining_tables(id),
  seat_number      INTEGER NOT NULL,
  label            TEXT,
  status           seat_status NOT NULL DEFAULT 'EMPTY',
  guest_name       TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_seats_outlet
  ON table_seats (outlet_id);

CREATE INDEX IF NOT EXISTS idx_table_seats_table
  ON table_seats (dining_table_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_seats_outlet_table_seat
  ON table_seats (outlet_id, dining_table_id, seat_number);

-- Backfill: one EMPTY seat per capacity slot on every currently-active table.
INSERT INTO table_seats (outlet_id, dining_table_id, seat_number, status)
SELECT dt.outlet_id, dt.id, gs.seat_number, 'EMPTY'
FROM dining_tables dt
CROSS JOIN LATERAL generate_series(1, GREATEST(dt.capacity, 1)) AS gs(seat_number)
ON CONFLICT (outlet_id, dining_table_id, seat_number) DO NOTHING;

COMMIT;
