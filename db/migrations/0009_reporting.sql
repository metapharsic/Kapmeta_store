-- Migration 0009: reporting (REQ-RPT) — BLOCKED on DEC-009, structural shape only
--
-- BLOCKED — table shape below is structural only, pending DEC-009 sign-off.
-- Do not add metric columns without that decision. DEC-009 determines the
-- actual KPI formulas (e.g. what "net sales" excludes — discounts? refunds?
-- cancelled-order reversals? tips?), and adding metric columns ahead of that
-- decision means either rebuilding the table or shipping a column whose
-- definition nobody agreed on.

BEGIN;

-- Grain: outlet x business_date
CREATE TABLE daily_sales_summary (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id),
    business_date  DATE        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    UNIQUE (outlet_id, business_date)
    -- Metric columns WOULD include (pending DEC-009):
    --   gross_sales_minor, net_sales_minor, discount_minor, tax_minor,
    --   refund_minor, order_count, aov_minor (average order value)
);

-- Grain: outlet x business_date x hour
CREATE TABLE hourly_sales_summary (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id),
    business_date  DATE        NOT NULL,
    hour           SMALLINT    NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    UNIQUE (outlet_id, business_date, hour),
    CONSTRAINT ck_hourly_sales_summary_hour CHECK (hour BETWEEN 0 AND 23)
    -- Metric columns WOULD include (pending DEC-009):
    --   gross_sales_minor, net_sales_minor, order_count, aov_minor
);

-- Grain: outlet x business_date x item
CREATE TABLE item_sales_summary (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id),
    business_date  DATE        NOT NULL,
    item_id        UUID        NOT NULL REFERENCES menu_items (id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    UNIQUE (outlet_id, business_date, item_id)
    -- Metric columns WOULD include (pending DEC-009):
    --   qty_sold, gross_sales_minor, net_sales_minor, discount_minor
);

-- Grain: outlet x business_date x method
CREATE TABLE payment_summary (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id),
    business_date  DATE        NOT NULL,
    method         TEXT        NOT NULL, -- payment_method enum lands with payments (0012), DEC-005
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    UNIQUE (outlet_id, business_date, method)
    -- Metric columns WOULD include (pending DEC-009):
    --   captured_minor, refunded_minor, transaction_count
);

-- Grain: outlet x business_date x station
CREATE TABLE kot_performance (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id),
    business_date  DATE        NOT NULL,
    station_id     UUID        NOT NULL REFERENCES stations (id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    UNIQUE (outlet_id, business_date, station_id)
    -- Metric columns WOULD include (pending DEC-009):
    --   ticket_count, avg_prep_seconds, sla_breach_count
);

CREATE INDEX idx_daily_sales_summary_outlet   ON daily_sales_summary (outlet_id, business_date);
CREATE INDEX idx_hourly_sales_summary_outlet  ON hourly_sales_summary (outlet_id, business_date);
CREATE INDEX idx_item_sales_summary_outlet    ON item_sales_summary (outlet_id, business_date);
CREATE INDEX idx_item_sales_summary_item      ON item_sales_summary (item_id);
CREATE INDEX idx_payment_summary_outlet       ON payment_summary (outlet_id, business_date);
CREATE INDEX idx_kot_performance_outlet       ON kot_performance (outlet_id, business_date);
CREATE INDEX idx_kot_performance_station      ON kot_performance (station_id);

COMMIT;
