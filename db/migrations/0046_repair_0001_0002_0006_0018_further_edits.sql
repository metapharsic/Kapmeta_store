-- 0046: further repair of the "edited-after-applied CREATE TABLE" bug class
-- (see 0043/0044/0045 for the full write-up of this class) -- a second round
-- of the same root cause, on files/columns 0043-0045 did not cover, found by
-- re-auditing the FULL log set (logs/api/*.log) rather than the narrower
-- slice each earlier repair was scoped to.
--
-- Evidence (P2022, still firing as of api-2026-09-02.log, the most recent
-- and largest log file):
--   customers.is_active            (6x today)
--   customers.name                 (202x today)
--   modifier_groups.is_active      (2x today)
--   recipes.name                   (6x today)
--   purchase_order_items.po_id     (32x today)
--
-- Root cause per file, confirmed by reading each migration directly:
--   * 0001_init_identity_and_org.sql: `CREATE TABLE roles (... code TEXT NOT
--     NULL UNIQUE ...)` -- plain CREATE TABLE, no IF NOT EXISTS, one
--     BEGIN/COMMIT. roles.code WAS seen missing (P2022) in the oldest log
--     (api-2026-08-31.log, 56x) but has NOT recurred in api-2026-09-01.log or
--     api-2026-09-02.log (0x in both) -- and the live services/auth/src/
--     rbac.ts code that read it (`r.code`) is still present and still reads
--     it, so the column did not just become unused. The only thing that
--     changed is kapmeta/schema.prisma's Role model, which today has no
--     `code` field at all (checked directly) -- someone already resolved
--     this drift by dropping the phantom field from the model rather than
--     adding the live column. Nothing to repair here; deliberately left out
--     of this file (an idempotent ADD COLUMN would still be harmless, but
--     there is no live model field that would ever select it, so it would
--     be dead weight).
--   * 0002_catalog.sql: `CREATE TABLE modifier_groups (... is_active BOOLEAN
--     NOT NULL DEFAULT TRUE ...)` -- plain CREATE TABLE, no IF NOT EXISTS,
--     inside the same single-transaction file already established (0045) to
--     have landed most of its tables successfully on its original run --
--     is_active was added to this CREATE TABLE sometime after that run.
--   * 0006_customers.sql: `CREATE TABLE customers (... name TEXT,
--     is_active BOOLEAN NOT NULL DEFAULT TRUE, ... organization_id UUID NOT
--     NULL REFERENCES organizations (id) ..., UNIQUE (organization_id,
--     phone))` -- same plain-CREATE-TABLE class. organization_id itself is
--     NOT currently reported missing (0x in api-2026-09-02.log, though it
--     was seen 2x in each of the two older logs) -- included here anyway,
--     defensively and idempotently (IF NOT EXISTS is a no-op if it is in
--     fact already present), rather than leaving a gap on weaker evidence.
--   * 0018_create_inventory_tables.sql: `CREATE TABLE IF NOT EXISTS recipes
--     (... name VARCHAR(255) NOT NULL ...)` and `CREATE TABLE IF NOT EXISTS
--     purchase_order_items (... po_id UUID NOT NULL REFERENCES
--     purchase_orders(id) ON DELETE CASCADE ...)`. This is the exact same
--     file 0043 already repaired (see that file's header) -- these two
--     columns are simply outside the slice of missing columns 0043's
--     author discovered from that day's narrower log read. Same file, same
--     "IF NOT EXISTS on the CREATE TABLE can't retroactively add a column
--     appended to the table body after the table already exists" mechanism.
--
-- TEXT, not UUID, throughout: ground truth from `node scripts/inspect-db-v2.js`
-- (run for real against the live DB) is that every id/FK column in this
-- database is TEXT, with the sole confirmed exception of integrations.id /
-- channel_accounts.integration_id (see 0045's header for the full story of
-- how this was discovered, and why every earlier migration file saying
-- UUID is not to be trusted). purchase_order_items.po_id is a real FK
-- (REFERENCES purchase_orders(id)) so its type matters for CREATE-time
-- correctness; purchase_orders.id is TEXT live per that same convention.
--
-- Every NOT NULL from the original CREATE TABLE statements is relaxed to
-- nullable here (except booleans with a safe default) -- an idempotent
-- repair must not risk failing against rows that already exist with no
-- value for the new column, and Postgres cannot know there are zero such
-- rows without being told (same convention 0043 already established).

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations (id);

ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS po_id TEXT REFERENCES purchase_orders (id);

CREATE INDEX IF NOT EXISTS idx_customers_organization ON customers (organization_id);

COMMIT;
