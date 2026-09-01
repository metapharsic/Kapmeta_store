-- Seat & merge data model, step 5: order_seat_bills makes per-seat
-- settlement an auditable row instead of something recomputed on every read.

BEGIN;

CREATE TABLE IF NOT EXISTS order_seat_bills (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id              UUID NOT NULL,
  order_id               UUID NOT NULL REFERENCES orders(id),
  seat_number            INTEGER NOT NULL,
  split_group_id         UUID,
  subtotal               BIGINT NOT NULL DEFAULT 0,
  discount_total         BIGINT NOT NULL DEFAULT 0,
  tax_total              BIGINT NOT NULL DEFAULT 0,
  service_charge_total   BIGINT NOT NULL DEFAULT 0,
  tip_total              BIGINT NOT NULL DEFAULT 0,
  grand_total            BIGINT NOT NULL DEFAULT 0,
  paid_total             BIGINT NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'OPEN',
  settled_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_seat_bills_outlet
  ON order_seat_bills (outlet_id);

CREATE INDEX IF NOT EXISTS idx_order_seat_bills_order
  ON order_seat_bills (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_seat_bills_outlet_order_seat
  ON order_seat_bills (outlet_id, order_id, seat_number);

COMMIT;
