-- 0010_create_order_payments.sql
-- order_payments: one or more payments settling an order (split payments
-- supported by allowing multiple rows per order).

-- +migrate Up

CREATE TABLE order_payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    order_id            uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    payment_type_id     uuid NOT NULL REFERENCES payment_type_master (id) ON DELETE RESTRICT,
    amount              numeric(12,2) NOT NULL,
    is_complimentary    boolean NOT NULL DEFAULT false,
    reference_no        text NULL,       -- e.g. UPI txn id, card auth code
    paid_at             timestamptz NOT NULL DEFAULT now(),
    received_by         uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_order_payments_amount_nonneg CHECK (amount >= 0)
);

COMMENT ON TABLE order_payments IS
    'ON DELETE RESTRICT on order_id: payments are financial records and must never be silently cascaded away by an order deletion.';

CREATE INDEX ix_order_payments_outlet_id ON order_payments (outlet_id);
CREATE INDEX ix_order_payments_order_id ON order_payments (order_id);
CREATE INDEX ix_order_payments_payment_type_id ON order_payments (payment_type_id);
CREATE INDEX ix_order_payments_paid_at ON order_payments (paid_at);

-- +migrate Down

DROP TABLE IF EXISTS order_payments;
