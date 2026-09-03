-- 0049: repair 0004_orders.sql, whose order_refunds table never landed
-- live, discovered from real API error logs (logs/api/*.log):
-- PrismaClientKnownRequestError P2021 "The table `public.order_refunds`
-- does not exist in the current database" (4x api-2026-08-31.log, 20x
-- api-2026-09-01.log, 6x api-2026-09-02.log -- steady, ongoing), thrown from
-- apps/api/src/routes/finance.ts's GET /finance/refunds and GET
-- /finance/cash-drawer (both call `prisma.order_refunds.findMany(...)`).
--
-- Root cause: 0004_orders.sql is one large BEGIN/COMMIT creating orders,
-- order_items, order_item_modifiers, order_status_history, order_payments
-- and order_refunds together, in that order. order_refunds is a plain
-- CREATE TABLE (no IF NOT EXISTS) with `outlet_id UUID NOT NULL REFERENCES
-- outlets (id)` and `order_id UUID NOT NULL REFERENCES orders (id)` --
-- outlets.id and orders.id are both TEXT live (ground truth, see 0045's
-- header), so this statement fails 42804. Unlike 0029/0030/0031 (repaired
-- in 0047), the tables that precede it in the same file -- orders,
-- order_items, order_item_modifiers, order_status_history -- demonstrably
-- exist and work live today. The most consistent explanation: those four
-- tables were already present (created earlier via `prisma db push` off
-- schema.prisma, per this session's root-cause finding -- see 0045's
-- header), so 0004's own CREATE TABLE statements for them failed
-- immediately with 42P07 (already exists), which the pre-fix db-migrate.js
-- swallowed and treated as ALREADY_PRESENT/no-op (same handling documented
-- in 0044's header) -- meaning 0004 never actually reached its
-- order_payments / order_refunds statements at all. This is also why
-- order_payments (a sibling table in the same file, same shape of
-- statement) is confirmed absent live too -- flagged separately as TSK-027,
-- deliberately left alone here: two conflicting lineages (0004 and
-- 0010_create_order_payments.sql) declare it with different columns, and
-- neither is safe to guess at without its own investigation (see 0043's
-- header, which first raised this).
--
-- order_refunds has no such lineage conflict -- kapmeta/schema.prisma
-- already models it (as the literal snake_case model `order_refunds`,
-- matching 0004's column list exactly) and apps/api/src/routes/finance.ts
-- already queries/maps every one of its columns correctly (outlet_id,
-- order_id, refund_id, amount_minor, created_at) -- so, unlike
-- order_payments, there is exactly one shape to create here, not a choice
-- between two.
--
-- TEXT, not UUID: ground truth from `node scripts/inspect-db-v2.js` (see
-- 0045's header). refund_id keeps 0004's own comment ("FK to refunds(id)
-- deferred to 0012, blocked on DEC-005") -- no REFERENCES clause, so its
-- type doesn't gate this CREATE TABLE, but it is made TEXT anyway for
-- consistency with the id it will eventually reference.
--
-- amount_minor is left NOT NULL as in the original (a refund with no
-- amount is meaningless and this is a fresh CREATE TABLE, not an ALTER
-- against rows that may already exist without a value).

BEGIN;

CREATE TABLE IF NOT EXISTS order_refunds (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id     TEXT        NOT NULL REFERENCES outlets (id),
    order_id      TEXT        NOT NULL REFERENCES orders (id),
    refund_id     TEXT        NOT NULL,
    amount_minor  BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    TEXT,
    updated_by    TEXT,
    CONSTRAINT ck_order_refunds_amount_minor_nonneg CHECK (amount_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_outlet ON order_refunds (outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order  ON order_refunds (order_id);

COMMIT;
