-- 0043: repair two prior migrations whose objects never fully landed in the
-- live database, discovered from real API error logs (api-2026-09-02.log):
--   PrismaClientKnownRequestError P2022 "column ... does not exist" on
--   vendors.contact_name, ingredients.unit_cost_minor,
--   purchase_orders.total_amount_minor; and P2021 "table
--   public.outbox_events does not exist".
--
-- Root cause, confirmed by reading the migration files directly:
--   * 0018_create_inventory_tables.sql uses CREATE TABLE IF NOT EXISTS for
--     ingredients/vendors/purchase_orders/recipes/recipe_ingredients/
--     purchase_order_items. schema_migrations already records 0018 as
--     applied, so re-running that file today is a guaranteed no-op even
--     though the live tables are missing columns the file currently
--     declares (contact_name, unit_cost_minor, total_amount_minor, etc.) --
--     the only explanation consistent with "table exists, column doesn't"
--     is that those columns were added to 0018's CREATE TABLE statements
--     sometime after the migration had already run once, which
--     CREATE TABLE IF NOT EXISTS can never retroactively apply.
--   * 0022_admin_pipeline_tables.sql is a single-transaction file that
--     creates outbox_events/inventory_consumption_log and then makes
--     several ALTER TABLE ... ADD COLUMN IF NOT EXISTS changes elsewhere.
--     schema_migrations records 0022 as applied, but outbox_events
--     provably does not exist live (P2021) -- consistent with this file
--     having failed partway through and rolled back as one transaction
--     under the pre-fix version of scripts/db-migrate.js (which used to
--     swallow any failure and record the migration as done anyway; that
--     runner bug was fixed earlier this session, but fixing it does not
--     retroactively repair a migration that was already falsely marked
--     applied before the fix).
--
-- Since schema_migrations already lists both 0018 and 0022 as done,
-- neither file will ever run again -- the only way to land the missing
-- objects is a new migration. Every statement here is IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS, safe to run regardless of which subset of
-- 0018/0022 partially landed.

BEGIN;

-- ---- repair 0018_create_inventory_tables.sql -------------------------
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(50);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_cost_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 500;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS current_stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_portions DECIMAL(8,2) NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(50);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_price_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS total_minor BIGINT NOT NULL DEFAULT 0;

-- ---- repair 0022_admin_pipeline_tables.sql -----------------------------
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

-- order_payments does not exist live at all (confirmed by db:migrate
-- itself: 42P01 relation "order_payments" does not exist) -- two
-- conflicting migration lineages (0004_orders.sql and
-- 0010_create_order_payments.sql) both declare a table of this name with
-- DIFFERENT columns, and neither has actually landed. Guessing a shape here
-- would risk locking in the wrong one, so this is skipped (guarded, not
-- assumed) rather than invented -- flagged as TSK-027 for its own
-- investigation, out of scope for the 0018/0022 repair this file targets.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_payments') THEN
        ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS payment_group_id UUID;
        ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS rounding_adjustment_minor BIGINT DEFAULT 0;
    END IF;
END $$;

ALTER TABLE petty_cash_ledger ADD COLUMN IF NOT EXISTS paid_to VARCHAR(255);

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS loyalty_paise_per_point BIGINT;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(12, 3) NOT NULL DEFAULT 0;

COMMIT;
