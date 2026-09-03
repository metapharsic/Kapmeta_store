-- 0048: repair 0023_order_charges_and_waiter_handovers.sql, whose
-- waiter_shift_handovers table never landed live, discovered from real API
-- error logs (logs/api/*.log): PrismaClientKnownRequestError P2021 "The
-- table `public.waiter_shift_handovers` does not exist in the current
-- database" (50x in api-2026-09-02.log alone), thrown from
-- apps/api/src/routes/waiters.ts's POST /waiters/me/shift-handover and GET
-- /waiters/shift-handovers.
--
-- Root cause, same FK-type-mismatch class as 0047 (see that file's header
-- for the full mechanism): 0023 is one BEGIN/COMMIT that first does two
-- safe `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_total_minor ...,
-- ADD COLUMN IF NOT EXISTS service_charge_total_minor ...` plus two
-- ADD CONSTRAINT CHECKs, then `CREATE TABLE IF NOT EXISTS
-- waiter_shift_handovers (... outlet_id UUID NOT NULL REFERENCES outlets
-- (id) ...)`. outlets.id is TEXT live (confirmed ground truth, see 0045),
-- so that CREATE TABLE fails 42804 -- EXCEPT this time the earlier ALTER
-- TABLE orders statements are NOT reported missing from any log
-- (orders.tip_total_minor / orders.service_charge_total_minor never
-- appear in logs/api/*.log), which at first looks inconsistent with "one
-- failing statement rolls back the whole file".
--
-- Resolution of that apparent inconsistency: orders.tip_total_minor /
-- service_charge_total_minor are not the columns actually read anywhere.
-- kapmeta/schema.prisma's Order model has serviceChargeTotal/tipTotal
-- mapped to service_charge_total/tip_total (no "_minor" suffix) --
-- different columns entirely, pre-existing from an earlier migration. No
-- code path selects orders.tip_total_minor or
-- orders.service_charge_total_minor at all (grepped apps/api/src), so
-- their absence produces no error regardless of whether 0023 landed them --
-- it is silent, not resolved. This migration re-asserts them anyway
-- (harmless if they already landed, and correct if they didn't -- consistent
-- either way with 0039's own "repair by re-asserting IF NOT EXISTS
-- statements" precedent for exactly this kind of ambiguity).
--
-- TEXT, not UUID: ground truth from `node scripts/inspect-db-v2.js` (see
-- 0045's header). id/outlet_id/waiter_id all made TEXT here for the same
-- reason item_availability's repair used TEXT throughout.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tip_total_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_total_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS ck_orders_tip_total_minor_nonneg;
ALTER TABLE orders
  ADD CONSTRAINT ck_orders_tip_total_minor_nonneg CHECK (tip_total_minor >= 0);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS ck_orders_service_charge_total_minor_nonneg;
ALTER TABLE orders
  ADD CONSTRAINT ck_orders_service_charge_total_minor_nonneg CHECK (service_charge_total_minor >= 0);

CREATE TABLE IF NOT EXISTS waiter_shift_handovers (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outlet_id                   TEXT NOT NULL REFERENCES outlets (id),
  waiter_id                   TEXT NOT NULL,
  waiter_name                 TEXT NOT NULL,
  business_date               DATE NOT NULL,
  actual_cash_counted_minor   BIGINT NOT NULL DEFAULT 0,
  opening_float_minor         BIGINT NOT NULL DEFAULT 0,
  net_tip_payout_minor        BIGINT NOT NULL DEFAULT 0,
  digital_tips_minor          BIGINT NOT NULL DEFAULT 0,
  service_charge_minor        BIGINT NOT NULL DEFAULT 0,
  cash_sales_minor            BIGINT NOT NULL DEFAULT 0,
  manager_notes               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_handover_cash_nonneg CHECK (actual_cash_counted_minor >= 0),
  CONSTRAINT ck_handover_float_nonneg CHECK (opening_float_minor >= 0),
  CONSTRAINT ck_handover_tips_nonneg CHECK (net_tip_payout_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_waiter_shift_handovers_outlet_date
  ON waiter_shift_handovers (outlet_id, business_date);
CREATE INDEX IF NOT EXISTS idx_waiter_shift_handovers_waiter
  ON waiter_shift_handovers (waiter_id);

COMMIT;
