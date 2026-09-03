-- 0047: repair the seat & merge data model (migrations 0024, 0029-0035),
-- whose objects never fully landed live -- a THIRD bug sub-class, distinct
-- from the "edited-after-applied CREATE TABLE" class documented in
-- 0043/0044/0045/0046: every one of these files is internally consistent
-- (no columns added after the fact) but declares a real FK constraint of
-- type UUID against a table whose live id column is TEXT. Postgres rejects
-- that at DDL time with 42804 ("foreign key constraint ... cannot be
-- implemented", incompatible types uuid and text), and because
-- scripts/db-migrate.js sends each file as one multi-statement query (a
-- single implicit transaction -- see 0039's header for where this was
-- first established), the ONE bad FK statement rolls back every other
-- statement in the same file, including ones that look perfectly safe
-- (plain ADD COLUMN IF NOT EXISTS with no FK at all).
--
-- Evidence (P2022/P2021, still firing in api-2026-09-02.log, the most
-- recent and largest log file):
--   dining_tables.version           (150x today)   -- from 0029
--   orders.merge_group_id           (180x today)    \
--   orders.covers                   (58x today)      > from 0031, one file
--   kot_items.outlet_id             (4x today)       -- from 0034
--   payments.seat_id                (2x today)       -- from 0035
--
-- Root cause, file by file (all confirmed by reading the file directly):
--   * 0029_table_merge_groups_and_members.sql: one BEGIN/COMMIT that first
--     does `ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS version ...,
--     ADD COLUMN IF NOT EXISTS covers ...` (both look completely safe) and
--     THEN `CREATE TABLE IF NOT EXISTS table_merge_groups (...
--     primary_table_id UUID NOT NULL REFERENCES dining_tables(id) ...)`.
--     dining_tables.id is TEXT live (universal convention, see below) --
--     that CREATE TABLE fails 42804, and the earlier "safe" ALTER on
--     dining_tables rolls back with it. dining_tables.version being
--     reported missing today, with no corresponding "table_merge_groups
--     does not exist" error ever logged (no route currently queries that
--     table, so its existence can't be confirmed from logs either way), is
--     exactly the signature this produces. table_merge_members has the
--     same problem one statement later (dining_table_id UUID REFERENCES
--     dining_tables(id)), moot either way since the file fails before
--     reaching it.
--   * 0030_table_seats.sql: `CREATE TABLE IF NOT EXISTS table_seats (...
--     dining_table_id UUID NOT NULL REFERENCES dining_tables(id) ...)` --
--     same mechanism, on the table's own first creation. Not in
--     scripts/inspect-db-v2.js's TABLES list (added below for a future
--     confirmation run); no route currently queries it directly either, so
--     its existence can't be confirmed from logs. Recreated here
--     defensively (IF NOT EXISTS) since 0031/0034/0035 all add FK columns
--     that require it to exist.
--   * 0031_order_and_order_item_seat_columns.sql: one BEGIN/COMMIT --
--     `ALTER TABLE orders ADD COLUMN IF NOT EXISTS merge_group_id UUID,
--     ADD COLUMN IF NOT EXISTS covers INTEGER, ADD COLUMN IF NOT EXISTS
--     split_mode TEXT, ADD COLUMN IF NOT EXISTS merged_into_order_id
--     UUID;` (safe on its own) followed by `ALTER TABLE order_items ADD
--     COLUMN IF NOT EXISTS seat_id UUID REFERENCES table_seats(id), ...`.
--     table_seats.id is TEXT live (per 0030's repair above), so the
--     order_items.seat_id FK fails 42804 and takes the whole file down --
--     including the orders columns added earlier in the same transaction.
--     This is the exact failure the task that produced this file started
--     from (GET /orders/advance throwing P2022 on orders.merge_group_id).
--   * 0032_order_seat_bills.sql / 0033_order_item_seat_shares.sql: both
--     `CREATE TABLE IF NOT EXISTS` with a NOT NULL UUID FK to orders(id) /
--     order_items(id) respectively -- same mechanism as table_seats.
--     Neither is confirmed missing from logs (nothing currently queries
--     them), but apps/api/src/routes/orders.ts's split-by-seat billing
--     endpoint does write to order_seat_bills via
--     `(tx as any).order_seat_bills.create(...)`, so if it is in fact
--     missing that endpoint is silently broken. Recreated defensively.
--   * 0034_kot_items_outlet_and_seat.sql: one BEGIN/COMMIT --
--     `ALTER TABLE kot_items ADD COLUMN IF NOT EXISTS outlet_id UUID, ADD
--     COLUMN IF NOT EXISTS seat_number INTEGER, ADD COLUMN IF NOT EXISTS
--     seat_id UUID REFERENCES table_seats(id);` -- same mechanism as 0031:
--     the seat_id FK against table_seats(id) fails, and outlet_id (a real
--     tenant-isolation column, per the file's own comment) never lands
--     alongside it. Matches kot_items.outlet_id being reported missing.
--   * 0035_payments_seat_columns.sql: `ALTER TABLE payments ADD COLUMN IF
--     NOT EXISTS seat_id UUID REFERENCES table_seats(id), ADD COLUMN IF NOT
--     EXISTS order_seat_bill_id UUID REFERENCES order_seat_bills(id);` --
--     same mechanism twice over (table_seats.id AND order_seat_bills.id
--     both TEXT live). Matches payments.seat_id being reported missing.
--
-- TEXT, not UUID: ground truth from `node scripts/inspect-db-v2.js` (run
-- for real against the live DB) is that every id/FK column in this
-- database is TEXT except integrations.id / channel_accounts.integration_id
-- (see 0045's header). table_seats/dining_tables specifically were not yet
-- in that script's TABLES list at the time it was run, so their TEXT-ness
-- here is the documented convention default, not a directly confirmed
-- read -- both are added to scripts/inspect-db-v2.js's TABLES array in this
-- same change for a future confirmation run. Given every other table
-- checked so far (outlets, menu_items, orders, order_items, channel_accounts,
-- ...) came back TEXT with zero exceptions besides integrations, defaulting
-- to TEXT here rather than blocking on another round-trip is the documented
-- fallback (see this migration's own task brief).
--
-- Backfill INSERTs are copied from 0029/0030 verbatim (cast to ::text where
-- the source column is a real uuid/text-looking value), guarded by the same
-- ON CONFLICT DO NOTHING they originally used, so re-running them against a
-- database where the tables already exist and are already populated is a
-- true no-op.

BEGIN;

-- ---- repair 0029_table_merge_groups_and_members.sql -------------------
ALTER TABLE dining_tables
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS covers INTEGER;

CREATE TABLE IF NOT EXISTS table_merge_groups (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id         TEXT NOT NULL,
  primary_table_id  TEXT NOT NULL REFERENCES dining_tables(id),
  status            table_merge_status NOT NULL DEFAULT 'ACTIVE',
  total_capacity    INTEGER,
  covers            INTEGER,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  created_by        TEXT,
  reason            TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_merge_groups_outlet
  ON table_merge_groups (outlet_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_groups_primary_table
  ON table_merge_groups (primary_table_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_merge_groups_active_primary
  ON table_merge_groups (outlet_id, primary_table_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS table_merge_members (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id        TEXT NOT NULL,
  merge_group_id   TEXT NOT NULL REFERENCES table_merge_groups(id) ON DELETE CASCADE,
  dining_table_id  TEXT NOT NULL REFERENCES dining_tables(id),
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_table_merge_members_outlet
  ON table_merge_members (outlet_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_members_group
  ON table_merge_members (merge_group_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_members_table
  ON table_merge_members (dining_table_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_merge_members_active_table
  ON table_merge_members (dining_table_id)
  WHERE left_at IS NULL;

-- Backfill: every dining_table currently carrying a merge_group_id becomes
-- one open table_merge_groups row plus a member row per table. Copied from
-- 0029, cast to text since dining_tables.merge_group_id/merge_primary_table_id
-- are themselves still UUID-typed live (that ALTER, 0024, had no FK so it
-- was never at risk of this bug and landed fine).
INSERT INTO table_merge_groups (id, outlet_id, primary_table_id, status, opened_at)
SELECT DISTINCT
  dt.merge_group_id::text,
  dt.outlet_id,
  COALESCE(
    (SELECT dt2.id FROM dining_tables dt2
       WHERE dt2.merge_group_id = dt.merge_group_id
         AND dt2.id = dt2.merge_primary_table_id::text
       LIMIT 1),
    dt.merge_primary_table_id::text,
    dt.id
  ),
  'ACTIVE'::table_merge_status,
  now()
FROM dining_tables dt
WHERE dt.merge_group_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO table_merge_members (outlet_id, merge_group_id, dining_table_id, is_primary, joined_at)
SELECT
  dt.outlet_id,
  dt.merge_group_id::text,
  dt.id,
  (dt.id = dt.merge_primary_table_id::text),
  now()
FROM dining_tables dt
WHERE dt.merge_group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---- repair 0030_table_seats.sql ---------------------------------------
CREATE TABLE IF NOT EXISTS table_seats (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id        TEXT NOT NULL,
  dining_table_id  TEXT NOT NULL REFERENCES dining_tables(id),
  seat_number      INTEGER NOT NULL,
  label            TEXT,
  status           seat_status NOT NULL DEFAULT 'EMPTY',
  guest_name       TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_seats_outlet
  ON table_seats (outlet_id);
CREATE INDEX IF NOT EXISTS idx_table_seats_table
  ON table_seats (dining_table_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_seats_outlet_table_seat
  ON table_seats (outlet_id, dining_table_id, seat_number);

-- Backfill: one EMPTY seat per capacity slot on every currently-active
-- table. Copied verbatim from 0030 (already idempotent via ON CONFLICT).
INSERT INTO table_seats (outlet_id, dining_table_id, seat_number, status)
SELECT dt.outlet_id, dt.id, gs.seat_number, 'EMPTY'::seat_status
FROM dining_tables dt
CROSS JOIN LATERAL generate_series(1, GREATEST(dt.capacity, 1)) AS gs(seat_number)
ON CONFLICT (outlet_id, dining_table_id, seat_number) DO NOTHING;

-- ---- repair 0031_order_and_order_item_seat_columns.sql -----------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merge_group_id TEXT,
  ADD COLUMN IF NOT EXISTS covers INTEGER,
  ADD COLUMN IF NOT EXISTS split_mode TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_merge_group
  ON orders (merge_group_id)
  WHERE merge_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_merged_into
  ON orders (merged_into_order_id)
  WHERE merged_into_order_id IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS seat_id TEXT REFERENCES table_seats(id),
  ADD COLUMN IF NOT EXISTS split_group_id TEXT,
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_table_id TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_seat
  ON order_items (seat_id)
  WHERE seat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_split_group
  ON order_items (split_group_id)
  WHERE split_group_id IS NOT NULL;

-- ---- repair 0032_order_seat_bills.sql ----------------------------------
CREATE TABLE IF NOT EXISTS order_seat_bills (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id              TEXT NOT NULL,
  order_id               TEXT NOT NULL REFERENCES orders(id),
  seat_number            INTEGER NOT NULL,
  split_group_id         TEXT,
  subtotal               BIGINT NOT NULL DEFAULT 0,
  discount_total         BIGINT NOT NULL DEFAULT 0,
  tax_total              BIGINT NOT NULL DEFAULT 0,
  service_charge_total   BIGINT NOT NULL DEFAULT 0,
  tip_total              BIGINT NOT NULL DEFAULT 0,
  grand_total            BIGINT NOT NULL DEFAULT 0,
  paid_total             BIGINT NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'OPEN',
  settled_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_seat_bills_outlet
  ON order_seat_bills (outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_seat_bills_order
  ON order_seat_bills (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_seat_bills_outlet_order_seat
  ON order_seat_bills (outlet_id, order_id, seat_number);

-- ---- repair 0033_order_item_seat_shares.sql ----------------------------
CREATE TABLE IF NOT EXISTS order_item_seat_shares (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id           TEXT NOT NULL,
  order_item_id       TEXT NOT NULL REFERENCES order_items(id),
  seat_number         INTEGER NOT NULL,
  share_numerator     INTEGER NOT NULL,
  share_denominator   INTEGER NOT NULL,
  allocated_subtotal  BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_item_seat_shares_outlet
  ON order_item_seat_shares (outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_item_seat_shares_order_item
  ON order_item_seat_shares (order_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_item_seat_shares_item_seat
  ON order_item_seat_shares (order_item_id, seat_number);

-- ---- repair 0034_kot_items_outlet_and_seat.sql -------------------------
ALTER TABLE kot_items
  ADD COLUMN IF NOT EXISTS outlet_id TEXT,
  ADD COLUMN IF NOT EXISTS seat_number INTEGER,
  ADD COLUMN IF NOT EXISTS seat_id TEXT REFERENCES table_seats(id);

UPDATE kot_items ki
SET outlet_id = kt.outlet_id
FROM kot_tickets kt
WHERE ki.kot_ticket_id = kt.id
  AND ki.outlet_id IS NULL;

-- Deliberately NOT setting outlet_id NOT NULL here (0034 does, via ALTER
-- COLUMN ... SET NOT NULL, once the backfill above has run) -- an
-- idempotent repair must tolerate a kot_ticket_id that no longer resolves
-- (orphaned row), which would leave outlet_id NULL and turn this migration
-- itself into a hard failure. The tenant-isolation intent still lands for
-- every row the backfill can actually resolve.

CREATE INDEX IF NOT EXISTS idx_kot_items_outlet
  ON kot_items (outlet_id);
CREATE INDEX IF NOT EXISTS idx_kot_items_seat
  ON kot_items (seat_id)
  WHERE seat_id IS NOT NULL;

-- ---- repair 0035_payments_seat_columns.sql -----------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS seat_id TEXT REFERENCES table_seats(id),
  ADD COLUMN IF NOT EXISTS order_seat_bill_id TEXT REFERENCES order_seat_bills(id);

CREATE INDEX IF NOT EXISTS idx_payments_seat
  ON payments (seat_id)
  WHERE seat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order_seat_bill
  ON payments (order_seat_bill_id)
  WHERE order_seat_bill_id IS NOT NULL;

COMMIT;
