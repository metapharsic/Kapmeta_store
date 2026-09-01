-- Special Notes: preset-message master for item instructions (e.g. "Extra
-- spicy", "No onion", "Jain style") that captains pick from when adding
-- items to an order. Mirrors modifier_options' shape (outlet-scoped,
-- soft-delete via is_active, sort_order for display ordering).

BEGIN;

CREATE TABLE IF NOT EXISTS special_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   UUID NOT NULL,
  text        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_special_notes_outlet
  ON special_notes (outlet_id);

COMMIT;
