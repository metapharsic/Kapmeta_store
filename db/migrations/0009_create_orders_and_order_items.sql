-- 0009_create_orders_and_order_items.sql
-- orders + order_items.
--
-- bill_no / kot_no: per-outlet-local sequential numbers (matches the sync
-- architecture decision that outlets can operate offline on a LAN and must
-- not depend on a single global sequence). Modeled as plain `bigint`
-- columns (NOT `serial`/`bigserial`, which are backed by a single global
-- sequence object) populated by the application/sync layer, enforced
-- unique-per-outlet via a partial unique index rather than a database-wide
-- uniqueness guarantee. Generation strategy (e.g. a per-outlet counter row,
-- or max()+1 under an advisory lock) is an application/sync-layer concern,
-- not modeled in this migration.
--
-- Also backfills table_sessions.order_id -> orders.id, deferred from 0004
-- to avoid a forward reference.

-- +migrate Up

CREATE TABLE orders (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id               uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    table_id                uuid NULL REFERENCES restaurant_tables (id) ON DELETE RESTRICT,
    channel                 order_channel NOT NULL DEFAULT 'dine_in',
    status                  order_status NOT NULL DEFAULT 'open',
    kot_sent                boolean NOT NULL DEFAULT false,

    bill_no                 bigint NULL,
    kot_no                  bigint NULL,

    customer_name           text NULL,
    customer_phone          text NULL,
    customer_otp            text NULL,

    subtotal_amount         numeric(12,2) NOT NULL DEFAULT 0,
    tax_amount              numeric(12,2) NOT NULL DEFAULT 0,
    discount_amount         numeric(12,2) NOT NULL DEFAULT 0,
    grand_total_amount      numeric(12,2) NOT NULL DEFAULT 0,

    placed_at               timestamptz NOT NULL DEFAULT now(),
    closed_at               timestamptz NULL,

    created_by              uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_orders_amounts_nonneg CHECK (
        subtotal_amount >= 0 AND tax_amount >= 0 AND
        discount_amount >= 0 AND grand_total_amount >= 0
    )
);

COMMENT ON COLUMN orders.customer_otp IS
    'Nullable OTP used for customer-facing order verification (e.g. online/takeaway pickup confirmation). Not applicable to all channels.';

-- Per-outlet-local sequence uniqueness (partial: NULL allowed pre-assignment).
CREATE UNIQUE INDEX ux_orders_outlet_bill_no
    ON orders (outlet_id, bill_no) WHERE bill_no IS NOT NULL;
CREATE UNIQUE INDEX ux_orders_outlet_kot_no
    ON orders (outlet_id, kot_no) WHERE kot_no IS NOT NULL;

CREATE INDEX ix_orders_outlet_id ON orders (outlet_id);
CREATE INDEX ix_orders_table_id ON orders (table_id);
CREATE INDEX ix_orders_status ON orders (status);
CREATE INDEX ix_orders_placed_at ON orders (placed_at);
CREATE INDEX ix_orders_outlet_placed_at ON orders (outlet_id, placed_at);
CREATE INDEX ix_orders_channel ON orders (channel);

CREATE TABLE order_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    order_id            uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    menu_item_id        uuid NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
    item_name_snapshot  text NOT NULL,     -- captured at order time, immune to later menu edits
    unit_price          numeric(12,2) NOT NULL,
    quantity            numeric(10,2) NOT NULL DEFAULT 1,
    line_subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
    line_tax_amount     numeric(12,2) NOT NULL DEFAULT 0,
    line_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
    line_total_amount   numeric(12,2) NOT NULL DEFAULT 0,
    notes               text NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_order_items_amounts_nonneg CHECK (
        unit_price >= 0 AND quantity > 0 AND line_subtotal_amount >= 0 AND
        line_tax_amount >= 0 AND line_discount_amount >= 0 AND line_total_amount >= 0
    )
);

CREATE INDEX ix_order_items_outlet_id ON order_items (outlet_id);
CREATE INDEX ix_order_items_order_id ON order_items (order_id);
CREATE INDEX ix_order_items_menu_item_id ON order_items (menu_item_id);

ALTER TABLE table_sessions
    ADD CONSTRAINT fk_table_sessions_order
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT;

-- +migrate Down

ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS fk_table_sessions_order;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
