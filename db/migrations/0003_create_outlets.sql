-- 0003_create_outlets.sql
-- outlets: the tenant/location root. Every tenant-scoped table carries
-- outlet_id (locked Phase 0 decision: schema is multi-outlet-ready even
-- though v1 UI ships single-outlet).
--
-- Also backfills the outlet_id FK on users, deferred from 0002 to avoid a
-- forward reference.

-- +migrate Up

CREATE TABLE outlets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    legal_name          text NULL,
    address_line1       text NULL,
    address_line2       text NULL,
    city                text NULL,
    state               text NULL,
    postal_code         text NULL,
    country             text NOT NULL DEFAULT 'IN',
    phone               text NULL,
    gstin               text NULL,
    fssai_number        text NULL,
    default_tax_mode    tax_mode NOT NULL DEFAULT 'backward',
    timezone            text NOT NULL DEFAULT 'Asia/Kolkata',
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN outlets.default_tax_mode IS
    'Outlet-level default tax computation mode (backward/forward). Can be overridden per-channel via tax_channel_rules (see 0007).';

CREATE INDEX ix_outlets_is_active ON outlets (is_active);

ALTER TABLE users
    ADD CONSTRAINT fk_users_outlet
    FOREIGN KEY (outlet_id) REFERENCES outlets (id) ON DELETE RESTRICT;

-- +migrate Down

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_outlet;
DROP TABLE IF EXISTS outlets;
