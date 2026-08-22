-- 0016_extend_outlet_settings_jsonb.sql
-- Adds extended_settings jsonb column to outlet_billing_settings and outlet_print_settings.

-- +migrate Up

ALTER TABLE outlet_billing_settings
    ADD COLUMN IF NOT EXISTS extended_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE outlet_print_settings
    ADD COLUMN IF NOT EXISTS extended_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- +migrate Down

ALTER TABLE outlet_print_settings
    DROP COLUMN IF EXISTS extended_settings;

ALTER TABLE outlet_billing_settings
    DROP COLUMN IF EXISTS extended_settings;
