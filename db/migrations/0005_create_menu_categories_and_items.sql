-- 0005_create_menu_categories_and_items.sql
-- menu_categories + menu_items. NO seeded/default menu items are inserted
-- here as literal data -- per project rule, all business/tenant data
-- (including demo menu content) belongs in a separate seed script
-- (see 0099_seed_hotel_kapila_demo.sql), never baked into schema migrations
-- or service code.

-- +migrate Up

CREATE TABLE menu_categories (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    name                text NOT NULL,
    online_display_name text NULL,
    sort_order          integer NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_menu_categories_outlet_name ON menu_categories (outlet_id, name);
CREATE INDEX ix_menu_categories_outlet_id ON menu_categories (outlet_id);
CREATE INDEX ix_menu_categories_sort_order ON menu_categories (outlet_id, sort_order);

CREATE TABLE menu_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    category_id         uuid NOT NULL REFERENCES menu_categories (id) ON DELETE RESTRICT,
    code                text NULL,          -- SKU / POS short code
    name                text NOT NULL,
    online_display_name text NULL,
    description         text NULL,
    price               numeric(12,2) NOT NULL,
    veg_flag            veg_flag NOT NULL DEFAULT 'veg',
    sort_order          integer NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_menu_items_price_nonneg CHECK (price >= 0)
);

CREATE UNIQUE INDEX ux_menu_items_outlet_code
    ON menu_items (outlet_id, code) WHERE code IS NOT NULL;
CREATE INDEX ix_menu_items_outlet_id ON menu_items (outlet_id);
CREATE INDEX ix_menu_items_category_id ON menu_items (category_id);
CREATE INDEX ix_menu_items_is_active ON menu_items (is_active);

-- +migrate Down

DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS menu_categories;
