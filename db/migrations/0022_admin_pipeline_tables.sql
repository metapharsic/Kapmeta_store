-- Admin pipeline: invoices, consumption ledger, outbox, advance/settle timestamps, KOT line keys.

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL,
  order_id UUID NOT NULL UNIQUE,
  invoice_number VARCHAR(64) NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  tax_amount_minor BIGINT NOT NULL DEFAULT 0,
  waived_off_minor BIGINT NOT NULL DEFAULT 0,
  waived_off_reason TEXT,
  reprint_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_outlet ON invoices(outlet_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(outlet_id, created_at);

CREATE TABLE IF NOT EXISTS inventory_consumption_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL,
  order_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  ingredient_id UUID NOT NULL,
  recipe_id UUID NOT NULL,
  quantity_deducted NUMERIC(12,3) NOT NULL,
  remaining_stock NUMERIC(12,3),
  shortage NUMERIC(12,3) NOT NULL DEFAULT 0,
  reason_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, ingredient_id, recipe_id)
);
CREATE INDEX IF NOT EXISTS idx_consumption_log_order ON inventory_consumption_log(order_id);
CREATE INDEX IF NOT EXISTS idx_consumption_log_outlet ON inventory_consumption_log(outlet_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_fire_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promised_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_minor BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_status VARCHAR(30);

ALTER TABLE kot_items ADD COLUMN IF NOT EXISTS order_item_id UUID;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ;

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS payment_group_id UUID;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS rounding_adjustment_minor BIGINT DEFAULT 0;

ALTER TABLE petty_cash_ledger ADD COLUMN IF NOT EXISTS paid_to VARCHAR(255);

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS loyalty_paise_per_point BIGINT;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(12, 3) NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (version) VALUES ('0022_admin_pipeline_tables') ON CONFLICT DO NOTHING;
