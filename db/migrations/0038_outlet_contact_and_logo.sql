-- Adds contact/branding fields to outlets: phone, email, logoUrl. Used by the
-- Settings > Company profile screen (GET/PATCH /settings/company).

BEGIN;

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMIT;
