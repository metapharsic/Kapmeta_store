-- 0013_create_outlet_billing_and_print_settings.sql
-- outlet_billing_settings + outlet_print_settings: one row per outlet.
-- Columns are explicit bool/text/numeric fields (NOT a jsonb blob) so they
-- stay queryable/indexable and map cleanly to an admin settings form.

-- +migrate Up

CREATE TABLE outlet_billing_settings (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id                   uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    bill_prefix                 text NULL,
    kot_prefix                  text NULL,
    round_off_enabled           boolean NOT NULL DEFAULT true,
    round_off_nearest           numeric(4,2) NOT NULL DEFAULT 1.00,
    service_charge_enabled      boolean NOT NULL DEFAULT false,
    service_charge_percent      numeric(6,3) NOT NULL DEFAULT 0,
    allow_discount_without_approval boolean NOT NULL DEFAULT false,
    max_discount_percent        numeric(6,3) NOT NULL DEFAULT 100,
    require_customer_phone      boolean NOT NULL DEFAULT false,
    require_otp_for_online      boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_outlet_billing_settings_outlet ON outlet_billing_settings (outlet_id);

CREATE TABLE outlet_print_settings (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id                   uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    printer_name                text NULL,
    paper_width_mm              integer NOT NULL DEFAULT 80,
    print_logo                  boolean NOT NULL DEFAULT true,
    print_gstin                 boolean NOT NULL DEFAULT true,
    print_fssai_number          boolean NOT NULL DEFAULT true,
    print_customer_details      boolean NOT NULL DEFAULT true,
    auto_print_kot_on_place     boolean NOT NULL DEFAULT true,
    auto_print_bill_on_settle   boolean NOT NULL DEFAULT true,
    kot_copies                  integer NOT NULL DEFAULT 1,
    bill_copies                 integer NOT NULL DEFAULT 1,
    footer_message              text NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_outlet_print_settings_copies_positive CHECK (kot_copies > 0 AND bill_copies > 0)
);

CREATE UNIQUE INDEX ux_outlet_print_settings_outlet ON outlet_print_settings (outlet_id);

-- +migrate Down

DROP TABLE IF EXISTS outlet_print_settings;
DROP TABLE IF EXISTS outlet_billing_settings;
