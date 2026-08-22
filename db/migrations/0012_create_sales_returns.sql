-- 0012_create_sales_returns.sql
--
-- ****************************************************************
-- * SCHEMA PROVISIONAL -- pending DEC-014 screenshot re-capture. *
-- * Fields below (id, order_id, order_item_id, qty, amount,      *
-- * reason, refund_method, approved_by, returned_at) are         *
-- * INFERRED from the earlier draft sketch, NOT confirmed against*
-- * real captured evidence. Treat this table as a best guess to  *
-- * be revisited once the sales-return screen/flow is            *
-- * re-captured and confirmed. Do not build hard dependencies on *
-- * its exact column set without re-checking after DEC-014.      *
-- ****************************************************************

-- +migrate Up

CREATE TABLE sales_returns (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    order_id            uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    order_item_id        uuid NULL REFERENCES order_items (id) ON DELETE RESTRICT,
    qty                 numeric(10,2) NOT NULL,
    amount              numeric(12,2) NOT NULL,
    reason              text NULL,
    refund_method       text NULL,   -- provisional: may later FK to payment_type_master
    approved_by         uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    returned_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_sales_returns_qty_amount_nonneg CHECK (qty > 0 AND amount >= 0)
);

COMMENT ON TABLE sales_returns IS
    'PROVISIONAL SCHEMA -- pending DEC-014 screenshot re-capture. Columns inferred, not confirmed. Do not treat as final.';

CREATE INDEX ix_sales_returns_outlet_id ON sales_returns (outlet_id);
CREATE INDEX ix_sales_returns_order_id ON sales_returns (order_id);
CREATE INDEX ix_sales_returns_order_item_id ON sales_returns (order_item_id);
CREATE INDEX ix_sales_returns_returned_at ON sales_returns (returned_at);

-- +migrate Down

DROP TABLE IF EXISTS sales_returns;
