-- Seat & merge data model, step 9: invoices move from one-per-order to
-- one-per-(order, seat) so per-seat GST invoices can be issued. Existing
-- rows get seat_number = 0 (whole-order invoice, not tied to a seat).

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS seat_number INTEGER NOT NULL DEFAULT 0;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_order_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_order_seat
  ON invoices (order_id, seat_number);

COMMIT;
