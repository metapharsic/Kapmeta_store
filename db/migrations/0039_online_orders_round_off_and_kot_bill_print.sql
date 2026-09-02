-- 0039: online/aggregator order fields, bill round-off, table AC flag,
-- KOT bill-print timestamp.
--
-- Backs the reference UI's Online Orders screen (Order From, Rider Details,
-- OTP, and the Created / Received / Accepted / Updated timestamp block), the
-- "Grand Total [Round Off]" bill line, the "(AC)" / "(Non AC)" marker under
-- Order Type, and the KOT list's "Bill Print Date" column.
--
-- This file ALSO re-asserts the five `orders` columns migration 0022 intended
-- to add. 0022 is recorded in schema_migrations but did not take effect: the
-- runner sends each file as one multi-statement query (a single implicit
-- transaction), and 0022's `ALTER TABLE order_payments ...` step references a
-- table that does not exist in this database, so the entire file rolled back.
-- scripts/db-migrate.js catches that failure and records the version anyway,
-- which is why the loss was invisible. Independent evidence: outbox_events and
-- inventory_consumption_log, both CREATEd by 0022, are still reported missing
-- at runtime (logs/api/api-2026-09-02.log).
--
-- Every statement below is IF NOT EXISTS, so re-asserting is a no-op against a
-- database where 0022 did land. Nullability and defaults are copied verbatim
-- from 0022 so the two cannot disagree.
--
-- Scope is deliberately limited to orders, dining_tables and kot_tickets -- all
-- three confirmed present -- so this migration cannot half-apply the way 0022 did.

BEGIN;

-- Repair: the orders columns 0022 intended to add.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_fire_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promised_at       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_minor     BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_status    VARCHAR(30);

-- Bill round-off, e.g. the reference's [0.01] / [-0.04]. Signed: may be
-- negative. Minor units, per the house money convention.
--
-- Deliberately NOT order_payments.rounding_adjustment_minor (0022): that column
-- is a different grain (per tender line, not per bill), it sits on a table this
-- database does not have, and schema.prisma models no order_payments at all
-- (the live tender table is `payments`, which has no rounding column). It
-- cannot carry a bill-level round-off, so this is not a duplicate.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS round_off_minor BIGINT NOT NULL DEFAULT 0;

-- Online / aggregator provenance and fulfilment timestamps.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel           TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_name        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_phone       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_at       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at       TIMESTAMPTZ;

-- Pickup/delivery verification OTP shown on the Online Orders screen.
-- 0009_create_orders_and_order_items.sql declares customer_otp, but on its own
-- `orders` table -- numeric(12,2) amounts, a restaurant_tables FK, lowercase
-- order_status -- which is not the table this database has. That CREATE TABLE
-- never ran here, so the column is genuinely absent and is created rather than
-- reused. IF NOT EXISTS keeps this correct either way.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_otp TEXT;

-- "(AC)" / "(Non AC)" under Order Type. Nullable on purpose: unknown is not
-- the same as "not air conditioned", and existing rows have no known value.
ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS is_air_conditioned BOOLEAN;

-- KOT list "Bill Print Date". Nothing in the schema recorded when a KOT's bill
-- printed: kot_tickets has created_at / updated_at / served_at only, and no
-- printed_at exists anywhere in db/migrations or schema.prisma.
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS bill_printed_at TIMESTAMPTZ;

-- Partial indexes: these columns are null on every non-online order, so the
-- index only needs to cover rows that actually carry a value.
CREATE INDEX IF NOT EXISTS idx_orders_channel
    ON orders (channel)
    WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_external_order_id
    ON orders (external_order_id)
    WHERE external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_fire_at
    ON orders (scheduled_fire_at)
    WHERE scheduled_fire_at IS NOT NULL;

COMMIT;
