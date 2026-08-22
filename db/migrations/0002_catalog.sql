-- Migration 0002: catalog (REQ-MNU) — categories, items, variants, modifiers, availability, channel mapping

BEGIN;

CREATE TYPE availability_state AS ENUM ('ON', 'OFF', 'PARTIAL', 'UNSCHEDULED');

CREATE TABLE categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    parent_id    UUID        REFERENCES categories (id),
    name         TEXT        NOT NULL,
    sort_order   INTEGER     NOT NULL DEFAULT 0,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE TABLE menu_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    category_id  UUID        NOT NULL REFERENCES categories (id),
    name         TEXT        NOT NULL,
    description  TEXT,
    is_veg       BOOLEAN     NOT NULL DEFAULT TRUE,
    hsn_code     TEXT,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE TABLE item_variants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    item_id      UUID        NOT NULL REFERENCES menu_items (id),
    name         TEXT        NOT NULL,
    is_default   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

-- min_select/max_select drive the DB-CK-02 sanity check; pricing of modifiers
-- (item_prices) is 0003, blocked on DEC-004 — not needed to define the group shape.
CREATE TABLE modifier_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    name         TEXT        NOT NULL,
    min_select   INTEGER     NOT NULL DEFAULT 0,
    max_select   INTEGER     NOT NULL DEFAULT 1,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    CONSTRAINT ck_modifier_groups_min_le_max CHECK (min_select <= max_select)
);

CREATE TABLE modifiers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id         UUID        NOT NULL REFERENCES outlets (id),
    group_id          UUID        NOT NULL REFERENCES modifier_groups (id),
    name              TEXT        NOT NULL,
    price_delta_minor BIGINT      NOT NULL DEFAULT 0,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID
);

-- Junction table: both singulars, alphabetical (item_modifier_groups).
CREATE TABLE item_modifier_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    item_id      UUID        NOT NULL REFERENCES menu_items (id),
    group_id     UUID        NOT NULL REFERENCES modifier_groups (id),
    sort_order   INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    UNIQUE (item_id, group_id)
);

-- channel_id has no dedicated table yet (channel_accounts lands in 0007);
-- treat as an opaque UUID reference until DEC-007 settles channel identity.
-- version is the out-of-order sync guard from WF-MNU-menu-sync.md: a lower
-- version must never overwrite a higher one when async channel responses land out of order.
CREATE TABLE item_availability (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID                NOT NULL REFERENCES outlets (id),
    item_id      UUID                NOT NULL REFERENCES menu_items (id),
    channel_id   UUID                NOT NULL,
    state        availability_state  NOT NULL DEFAULT 'UNSCHEDULED',
    version      INTEGER             NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

-- DB-UQ-05: conflicting availability rows for the same item/channel pair.
CREATE UNIQUE INDEX uq_item_availability_item_channel
    ON item_availability (item_id, channel_id);

CREATE TABLE availability_schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    item_id      UUID        NOT NULL REFERENCES menu_items (id),
    day_of_week  SMALLINT    NOT NULL,
    start_time   TIME        NOT NULL,
    end_time     TIME        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    CONSTRAINT ck_availability_schedules_dow CHECK (day_of_week BETWEEN 0 AND 6)
);

-- channel_account_id references channel_accounts, created in 0007 — FK deferred
-- to avoid a forward reference across migrations; enforced once 0007 lands.
CREATE TABLE channel_item_mapping (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    channel_account_id  UUID        NOT NULL,
    item_id             UUID        NOT NULL REFERENCES menu_items (id),
    external_item_id    TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (channel_account_id, external_item_id)
);

CREATE INDEX idx_categories_outlet             ON categories (outlet_id);
CREATE INDEX idx_categories_parent             ON categories (parent_id);
CREATE INDEX idx_menu_items_outlet             ON menu_items (outlet_id);
CREATE INDEX idx_menu_items_category           ON menu_items (category_id);
CREATE INDEX idx_item_variants_outlet          ON item_variants (outlet_id);
CREATE INDEX idx_item_variants_item            ON item_variants (item_id);
CREATE INDEX idx_modifier_groups_outlet        ON modifier_groups (outlet_id);
CREATE INDEX idx_modifiers_outlet              ON modifiers (outlet_id);
CREATE INDEX idx_modifiers_group               ON modifiers (group_id);
CREATE INDEX idx_item_modifier_groups_outlet   ON item_modifier_groups (outlet_id);
CREATE INDEX idx_item_modifier_groups_item     ON item_modifier_groups (item_id);
CREATE INDEX idx_item_modifier_groups_group    ON item_modifier_groups (group_id);
CREATE INDEX idx_item_availability_outlet      ON item_availability (outlet_id);
CREATE INDEX idx_item_availability_item        ON item_availability (item_id);
CREATE INDEX idx_availability_schedules_outlet ON availability_schedules (outlet_id);
CREATE INDEX idx_availability_schedules_item   ON availability_schedules (item_id);
CREATE INDEX idx_channel_item_mapping_outlet   ON channel_item_mapping (outlet_id);
CREATE INDEX idx_channel_item_mapping_item     ON channel_item_mapping (item_id);
CREATE INDEX idx_channel_item_mapping_account  ON channel_item_mapping (channel_account_id);

COMMIT;
