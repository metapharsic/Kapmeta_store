-- Seat & merge data model, step 6 (phase 3): order_item_seat_shares
-- represents a shared item ("one naan split three ways") as fractional
-- shares of one order_item rather than fractional quantities.

BEGIN;

CREATE TABLE IF NOT EXISTS order_item_seat_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id           UUID NOT NULL,
  order_item_id       UUID NOT NULL REFERENCES order_items(id),
  seat_number         INTEGER NOT NULL,
  share_numerator     INTEGER NOT NULL,
  share_denominator   INTEGER NOT NULL,
  allocated_subtotal  BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_item_seat_shares_outlet
  ON order_item_seat_shares (outlet_id);

CREATE INDEX IF NOT EXISTS idx_order_item_seat_shares_order_item
  ON order_item_seat_shares (order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_item_seat_shares_item_seat
  ON order_item_seat_shares (order_item_id, seat_number);

COMMIT;
