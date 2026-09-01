-- Seat & merge data model, step 8: payments can now be tied to a specific
-- seat and to the order_seat_bills row it settles.

BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS seat_id UUID REFERENCES table_seats(id),
  ADD COLUMN IF NOT EXISTS order_seat_bill_id UUID REFERENCES order_seat_bills(id);

CREATE INDEX IF NOT EXISTS idx_payments_seat
  ON payments (seat_id)
  WHERE seat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order_seat_bill
  ON payments (order_seat_bill_id)
  WHERE order_seat_bill_id IS NOT NULL;

COMMIT;
