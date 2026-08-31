-- Persist bill tip / service charge on orders, and captain shift handovers
-- as first-class rows (not only audit_logs JSON).

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tip_total_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_total_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS ck_orders_tip_total_minor_nonneg;
ALTER TABLE orders
  ADD CONSTRAINT ck_orders_tip_total_minor_nonneg CHECK (tip_total_minor >= 0);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS ck_orders_service_charge_total_minor_nonneg;
ALTER TABLE orders
  ADD CONSTRAINT ck_orders_service_charge_total_minor_nonneg CHECK (service_charge_total_minor >= 0);

CREATE TABLE IF NOT EXISTS waiter_shift_handovers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id                   UUID NOT NULL REFERENCES outlets (id),
  waiter_id                   UUID NOT NULL,
  waiter_name                 TEXT NOT NULL,
  business_date               DATE NOT NULL,
  actual_cash_counted_minor   BIGINT NOT NULL DEFAULT 0,
  opening_float_minor         BIGINT NOT NULL DEFAULT 0,
  net_tip_payout_minor        BIGINT NOT NULL DEFAULT 0,
  digital_tips_minor          BIGINT NOT NULL DEFAULT 0,
  service_charge_minor        BIGINT NOT NULL DEFAULT 0,
  cash_sales_minor            BIGINT NOT NULL DEFAULT 0,
  manager_notes               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_handover_cash_nonneg CHECK (actual_cash_counted_minor >= 0),
  CONSTRAINT ck_handover_float_nonneg CHECK (opening_float_minor >= 0),
  CONSTRAINT ck_handover_tips_nonneg CHECK (net_tip_payout_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_waiter_shift_handovers_outlet_date
  ON waiter_shift_handovers (outlet_id, business_date);
CREATE INDEX IF NOT EXISTS idx_waiter_shift_handovers_waiter
  ON waiter_shift_handovers (waiter_id);

COMMIT;
