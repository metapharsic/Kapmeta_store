-- 0052: create report_notifications -- backing table for the Reports >
-- "Report Notification" screen (subscriptions: which report, how often,
-- who gets it). Grepped the full apps/api/src/routes, kapmeta/schema.prisma
-- and db/migrations trees first -- no table, Prisma model, or route named
-- report_notifications (or anything close) exists anywhere. This is a new
-- table, not a repair like 0043-0051.
--
-- TEXT id/outlet_id, gen_random_uuid()::text default, CREATE TABLE IF NOT
-- EXISTS: same convention this session established in 0045/0046/0047 after
-- ground truth from `node scripts/inspect-db-v2.js` showed the ENTIRE live
-- schema (not just the tables those files touched) uses TEXT for id and
-- every FK column, never uuid -- see 0045's header for the full origin
-- story. This table is brand new so there is no live-schema mismatch to
-- repair here, but it still has to match every other table in this
-- database, or outlet_id would be the one uuid-typed FK column in an
-- all-TEXT schema and every join/comparison against orders.outlet_id,
-- outlets.id, etc. would 42804 the same way 0045's first draft did.
--
-- IMPORTANT -- this table stores subscription *intent* only. There is no
-- notification-sending mechanism anywhere in this codebase (no email/SMS
-- worker, no cron job, no queue consumer) that reads this table and
-- actually delivers a report to recipients. is_active on a row means "the
-- user asked to be subscribed", nothing more. Building the delivery side is
-- real infrastructure work, out of scope for this migration/route pair --
-- the CRUD routes never write or imply a "sent" status.

BEGIN;

CREATE TABLE IF NOT EXISTS report_notifications (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    -- opaque FK reference, same shape as outlet_id everywhere else in this
    -- schema (see item_availability, migration 0045).
    outlet_id    TEXT NOT NULL REFERENCES outlets (id),
    -- report catalog key, e.g. 'z-report' / 'sales-summary' -- matches the
    -- route names under apps/api/src/routes/reporting.ts. Not FK-constrained
    -- since the report catalog is code (routes), not a table.
    report_key   TEXT NOT NULL,
    -- e.g. 'DAILY' / 'WEEKLY' -- free text, same convention as
    -- orders.status / orders.order_type elsewhere in this schema (no
    -- Postgres enum backing it).
    frequency    TEXT NOT NULL,
    -- comma-separated email addresses; no separate recipients table since
    -- the reference screenshot treats this as a single free-text field.
    recipients   TEXT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_notifications_outlet ON report_notifications (outlet_id);

COMMIT;
