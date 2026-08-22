-- 0001_extensions_and_enums.sql
-- Extensions and shared enum types used throughout the Kapmeta schema.

-- +migrate Up

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Canonical order/table-session lifecycle status.
-- Locked Phase 0 decision: kot_sent is a SEPARATE boolean column on the
-- relevant tables, NOT a value of this enum.
CREATE TYPE order_status AS ENUM (
    'open',
    'running',
    'printed',
    'paid',
    'cancelled'
);

-- Sales channel an order/table-session/tax-rule applies to.
CREATE TYPE order_channel AS ENUM (
    'dine_in',
    'online',
    'takeaway',
    'delivery'
);

-- Outlet-level default tax computation mode.
-- 'backward' = tax is included in the printed menu price (extracted out).
-- 'forward'  = tax is added on top of the menu price.
CREATE TYPE tax_mode AS ENUM (
    'backward',
    'forward'
);

-- Veg/non-veg/egg classification used on menu_items.
CREATE TYPE veg_flag AS ENUM (
    'veg',
    'non_veg',
    'egg'
);

-- +migrate Down

DROP TYPE IF EXISTS veg_flag;
DROP TYPE IF EXISTS tax_mode;
DROP TYPE IF EXISTS order_channel;
DROP TYPE IF EXISTS order_status;
-- Not dropping pgcrypto extension on down, since other objects in the
-- database may depend on it outside this migration set.
