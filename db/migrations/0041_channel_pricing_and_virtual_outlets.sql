-- 0041: per-channel item pricing, an item-level short code, and minimal
-- virtual-outlet support.
--
-- Backs three reference-audit screens/gaps:
--   * "Menu Management -- <Channel>" screens (Base Menu / Home Delivery /
--     Parcel / Dine In AC / Dine In Non AC / Zomato / Swiggy) -- menu_items
--     currently has exactly one item-wide price and no per-channel concept
--     at all, and item_availability (see 0002_catalog.sql / 0025) only
--     tracks an on/off state per (item, channel) -- no price, no name. This
--     migration adds item_channel_prices as a new, separate table and does
--     NOT touch item_availability: that table already backs the shipped
--     channel-availability.tsx screen and must keep working unchanged.
--     Absence of a row for a given channel means the UI/API should fall back
--     to the item's own base menu_items.price for that channel -- not zero,
--     not blank -- until someone explicitly overrides it; this migration
--     does not backfill any rows.
--   * Same screens' short-code column ("126", "128", ...) -- identical
--     across Base Menu/Home Delivery/Parcel/Dine In in the reference
--     screenshots (only the Zomato/Swiggy screens omit the column), so this
--     is a single item-level field on menu_items, not per-channel.
--   * "Add Virtual Outlet" / "Add Outlet" entry card -- no deeper screen was
--     in the reference material, so this is kept minimal: a virtual outlet
--     is just an outlets row with is_virtual = true and a nullable
--     self-referencing parent_outlet_id. Both new columns are nullable/
--     defaulted, so every existing outlets row is unaffected.
--
-- Every statement is IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so this file
-- is safe to re-run against a database that already has some or all of it,
-- and it does not assume anything beyond migration 0040 landed cleanly:
-- item_channel_prices carries its own FKs to the tables it needs (outlets,
-- menu_items) rather than relying on state from any single prior migration.

BEGIN;

-- Per-channel price (and, for Zomato/Swiggy, an online display name)
-- override on top of the item's own base menu_items.price. One row per
-- (outlet, item, channel); channel set matches the reference screens plus
-- BASE for the "Base Menu" screen itself.
CREATE TABLE IF NOT EXISTS item_channel_prices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    item_id             UUID        NOT NULL REFERENCES menu_items (id),
    channel             TEXT        NOT NULL CHECK (channel IN (
                             'BASE', 'HOME_DELIVERY', 'PARCEL', 'DINE_IN_AC',
                             'DINE_IN_NON_AC', 'ZOMATO', 'SWIGGY'
                         )),
    price_minor         BIGINT      NOT NULL,
    online_display_name TEXT,
    is_available        BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, item_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_item_channel_prices_outlet
    ON item_channel_prices (outlet_id);

CREATE INDEX IF NOT EXISTS idx_item_channel_prices_item
    ON item_channel_prices (item_id);

-- Item-level short code ("126", "128", ...). Item-wide, not per-channel --
-- the reference screenshots show the same code identically across Base
-- Menu/Home Delivery/Parcel/Dine In; Zomato/Swiggy simply omit the column.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Virtual outlets: minimal support for the "Add Virtual Outlet" / "Add
-- Outlet" entry card. A virtual outlet is an ordinary outlets row flagged
-- is_virtual = true, optionally scoped under a physical parent outlet via
-- parent_outlet_id. Both columns are nullable/defaulted so every existing
-- outlets row is unaffected; no ON DELETE behavior is specified for the
-- self-referencing FK, so it defaults to NO ACTION (deleting a parent
-- outlet that still has virtual children is blocked, not cascaded).
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS parent_outlet_id UUID REFERENCES outlets (id);

CREATE INDEX IF NOT EXISTS idx_outlets_parent_outlet
    ON outlets (parent_outlet_id)
    WHERE parent_outlet_id IS NOT NULL;

COMMIT;
