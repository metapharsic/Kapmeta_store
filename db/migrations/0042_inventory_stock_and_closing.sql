-- 0042: Inventory daily stock closing, direct stock purchases, and stock movements.
--
-- Backs the reference screens:
--   * "Daily Stock Closing Tracker" (daily status, accuracy %, day calendar tracking, physical closing)
--   * "Stock Purchase" list (invoice number, date, vendor, total amount, payment status)
--   * "Purchase Insights" & "COGS Breakdown"
--   * "Consumption" tracking (Sales, Transfer, Wastage)
--
-- All monetary columns use BIGINT minor units (paise) per .agents/AGENTS.md Rule 1.
-- All tenant boundaries enforce outlet_id NOT NULL REFERENCES outlets(id).

BEGIN;

CREATE TABLE IF NOT EXISTS daily_stock_closings (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id            UUID NOT NULL REFERENCES outlets (id),
    closing_date         DATE NOT NULL,
    status               TEXT NOT NULL DEFAULT 'UPDATED' CHECK (status IN ('UPDATED', 'MISSED', 'PARTIAL')),
    total_items_checked  INTEGER NOT NULL DEFAULT 0,
    total_variance_minor BIGINT NOT NULL DEFAULT 0,
    notes                TEXT,
    verified_by          UUID REFERENCES users (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, closing_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stock_closings_outlet_date
    ON daily_stock_closings (outlet_id, closing_date);

CREATE TABLE IF NOT EXISTS daily_stock_closing_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_id           UUID NOT NULL REFERENCES daily_stock_closings (id) ON DELETE CASCADE,
    ingredient_id        UUID NOT NULL REFERENCES ingredients (id),
    opening_qty          NUMERIC(12, 3) NOT NULL DEFAULT 0,
    received_qty         NUMERIC(12, 3) NOT NULL DEFAULT 0,
    consumed_qty         NUMERIC(12, 3) NOT NULL DEFAULT 0,
    expected_qty         NUMERIC(12, 3) NOT NULL DEFAULT 0,
    actual_closing_qty   NUMERIC(12, 3) NOT NULL DEFAULT 0,
    variance_qty         NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost_minor      BIGINT NOT NULL DEFAULT 0,
    variance_cost_minor  BIGINT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_stock_closing_items_closing
    ON daily_stock_closing_items (closing_id);

CREATE TABLE IF NOT EXISTS stock_purchases (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id            UUID NOT NULL REFERENCES outlets (id),
    vendor_id            UUID NOT NULL REFERENCES vendors (id),
    invoice_number       TEXT NOT NULL,
    invoice_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount_minor   BIGINT NOT NULL DEFAULT 0,
    tax_amount_minor     BIGINT NOT NULL DEFAULT 0,
    discount_amount_minor BIGINT NOT NULL DEFAULT 0,
    net_amount_minor     BIGINT NOT NULL DEFAULT 0,
    payment_status       TEXT NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING')),
    paid_amount_minor    BIGINT NOT NULL DEFAULT 0,
    payment_mode         TEXT DEFAULT 'BANK_TRANSFER',
    purchase_order_id    UUID REFERENCES purchase_orders (id),
    notes                TEXT,
    created_by           UUID REFERENCES users (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, vendor_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_purchases_outlet_date
    ON stock_purchases (outlet_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_stock_purchases_vendor
    ON stock_purchases (vendor_id);

CREATE TABLE IF NOT EXISTS stock_purchase_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id          UUID NOT NULL REFERENCES stock_purchases (id) ON DELETE CASCADE,
    ingredient_id        UUID NOT NULL REFERENCES ingredients (id),
    quantity             NUMERIC(12, 3) NOT NULL,
    unit_cost_minor      BIGINT NOT NULL,
    tax_percent          NUMERIC(5, 2) NOT NULL DEFAULT 0,
    total_minor          BIGINT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_purchase_items_purchase
    ON stock_purchase_items (purchase_id);

CREATE TABLE IF NOT EXISTS stock_consumptions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id            UUID NOT NULL REFERENCES outlets (id),
    type                 TEXT NOT NULL CHECK (type IN ('SALES', 'TRANSFER', 'WASTAGE', 'ADJUSTMENT')),
    reference_id         TEXT,
    total_cost_minor     BIGINT NOT NULL DEFAULT 0,
    notes                TEXT,
    created_by           UUID REFERENCES users (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_consumptions_outlet
    ON stock_consumptions (outlet_id, type);

CREATE TABLE IF NOT EXISTS stock_consumption_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumption_id       UUID NOT NULL REFERENCES stock_consumptions (id) ON DELETE CASCADE,
    ingredient_id        UUID NOT NULL REFERENCES ingredients (id),
    quantity             NUMERIC(12, 3) NOT NULL,
    cost_minor           BIGINT NOT NULL DEFAULT 0,
    reason               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_consumption_items_consumption
    ON stock_consumption_items (consumption_id);

COMMIT;
