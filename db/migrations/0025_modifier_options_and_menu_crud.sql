-- Fixes a live bug: POST /menu/modifier-options targets prisma.modifier_options,
-- a table that never existed. Adds it now, mirroring item_modifier_groups' shape.
-- Also gives menu items/categories the soft-delete flag they need for
-- PATCH/DELETE (isActive already exists on both, this just documents intent).

BEGIN;

CREATE TABLE IF NOT EXISTS modifier_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         UUID NOT NULL,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id),
  name              TEXT NOT NULL,
  price             BIGINT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_outlet
  ON modifier_options (outlet_id);

CREATE INDEX IF NOT EXISTS idx_modifier_options_group
  ON modifier_options (modifier_group_id);

COMMIT;
