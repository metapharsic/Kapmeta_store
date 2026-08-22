-- 0006_create_menu_item_channel_and_availability.sql
-- menu_item_channel_status: per-channel on/off visibility for a menu item
--   (e.g. shown for dine_in, hidden on online).
-- menu_item_availability: current out-of-stock (OOS) state, optionally
--   time-bounded (e.g. auto re-enable at a given time).

-- +migrate Up

CREATE TABLE menu_item_channel_status (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    menu_item_id    uuid NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    channel         order_channel NOT NULL,
    is_enabled      boolean NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid NULL REFERENCES users (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_menu_item_channel_status_item_channel
    ON menu_item_channel_status (menu_item_id, channel);
CREATE INDEX ix_menu_item_channel_status_outlet_id ON menu_item_channel_status (outlet_id);
CREATE INDEX ix_menu_item_channel_status_menu_item_id ON menu_item_channel_status (menu_item_id);

CREATE TABLE menu_item_availability (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    menu_item_id    uuid NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    is_out_of_stock boolean NOT NULL DEFAULT false,
    oos_reason      text NULL,
    oos_since       timestamptz NULL,
    auto_resume_at  timestamptz NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid NULL REFERENCES users (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_menu_item_availability_item
    ON menu_item_availability (menu_item_id);
CREATE INDEX ix_menu_item_availability_outlet_id ON menu_item_availability (outlet_id);
CREATE INDEX ix_menu_item_availability_is_oos ON menu_item_availability (is_out_of_stock);

-- +migrate Down

DROP TABLE IF EXISTS menu_item_availability;
DROP TABLE IF EXISTS menu_item_channel_status;
