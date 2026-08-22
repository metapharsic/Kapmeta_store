-- Migration 0003: pricing structure only.
-- Traces to REQ-BIL, REQ-FIN. Tax/discount tables intentionally NOT created — see
-- db/migrations/BLOCKED-MIGRATIONS.md and docs/decisions/DEC-004-tax-calculation-rules.md.
--
-- price_lists / item_prices do not depend on DEC-004 (how tax is computed); they only need to
-- exist so 0002's item_availability and 0004's orders have somewhere to source a price from.
-- taxes / tax_rules / discounts are BLOCKED — see the comment block at the bottom of this file.

BEGIN;

CREATE TABLE price_lists (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id),
    channel_id   UUID,                          -- NULL = default/POS price list
    name         TEXT        NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to   TIMESTAMPTZ,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE TABLE item_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id   UUID        NOT NULL REFERENCES price_lists (id) ON DELETE CASCADE,
    item_id         UUID        NOT NULL REFERENCES menu_items (id),
    variant_id      UUID        REFERENCES item_variants (id),   -- NULL = base item price
    -- Money as integer minor units. Never NUMERIC/FLOAT — see protocol rule 1.
    price_minor     BIGINT      NOT NULL CHECK (price_minor >= 0),
    currency        CHAR(3)     NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_price_lists_outlet         ON price_lists (outlet_id) WHERE is_active;
CREATE INDEX idx_item_prices_price_list     ON item_prices (price_list_id);
CREATE INDEX idx_item_prices_item           ON item_prices (item_id);
CREATE UNIQUE INDEX uq_item_prices_list_item_variant
    ON item_prices (price_list_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;

-- ============================================================================
-- BLOCKED — pending DEC-004 (tax calculation rules)
-- ============================================================================
-- Do NOT create these tables until DEC-004 is signed off. The columns below are what the
-- catalogue (docs/database/objects/DB-OBJECT-CATALOGUE.md) SUGGESTS, not what is decided —
-- inclusive-vs-exclusive, per-item-vs-per-order, and composition-vs-regular GST scheme are all
-- open in DEC-004's options table and change these columns, not just their contents.
--
-- CREATE TABLE taxes (
--     id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     code       TEXT NOT NULL,          -- e.g. 'GST_5', 'GST_18'
--     name       TEXT NOT NULL,
--     rate_bps   INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),  -- basis points, never a decimal
--     ...
-- );
--
-- CREATE TABLE tax_rules (
--     id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     tax_id         UUID NOT NULL REFERENCES taxes (id),
--     applies_to     TEXT NOT NULL,      -- item / category / order scope — shape depends on DEC-004
--     inclusive      BOOLEAN NOT NULL,   -- DEC-004 decides the default and whether it is overridable
--     effective_from TIMESTAMPTZ NOT NULL,
--     ...
-- );
-- ============================================================================
-- BLOCKED — pending DEC-008 (discount & promotion rules)
-- ============================================================================
-- CREATE TABLE discounts (
--     id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     outlet_id      UUID NOT NULL REFERENCES outlets (id),
--     type           TEXT NOT NULL,      -- PERCENT / FLAT / ITEM_FREE — DB-ENUM-13
--     value          BIGINT,             -- minor units or basis points depending on type
--     stacking_rule  TEXT,               -- DEC-008 decides whether discounts stack at all
--     ...
-- );
-- ============================================================================
