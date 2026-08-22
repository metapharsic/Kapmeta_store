-- 0008_create_payment_type_master.sql
-- payment_type_master: admin-editable payment type labels (Cash, Card,
-- UPI, custom labels like "Other (Room Service)"). Never hardcoded into
-- service code -- outlets can add/rename their own payment types.

-- +migrate Up

CREATE TABLE payment_type_master (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    label           text NOT NULL,
    is_online       boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_payment_type_master_outlet_label ON payment_type_master (outlet_id, label);
CREATE INDEX ix_payment_type_master_outlet_id ON payment_type_master (outlet_id);
CREATE INDEX ix_payment_type_master_is_active ON payment_type_master (is_active);

-- +migrate Down

DROP TABLE IF EXISTS payment_type_master;
