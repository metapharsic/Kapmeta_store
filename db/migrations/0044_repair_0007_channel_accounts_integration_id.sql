-- 0044: repair 0007_integration.sql, whose channel_accounts.integration_id
-- column never landed live, discovered from real API error logs
-- (api-2026-09-02.log): PrismaClientKnownRequestError P2022 "column
-- channel_accounts.integration_id does not exist in the current database",
-- thrown from apps/api/src/routes/integration.ts:151 (GET /channel-items,
-- aka the "aggregator order feed" screen) at the very first query,
-- prisma.channelAccount.findMany(...).
--
-- Root cause, same class as 0018/0022 (see 0043): 0007_integration.sql is a
-- single CREATE TABLE (not IF NOT EXISTS) inside one BEGIN/COMMIT block.
-- schema_migrations already records 0007 as applied, and the table exists
-- live with every other column from that file intact -- only integration_id
-- is missing -- consistent with integration_id having been added to the
-- CREATE TABLE statement after 0007 had already run once. Re-running the
-- file today is impossible (plain CREATE TABLE fails 42P07 on the now-
-- already-existing tables, and db-migrate.js's ALREADY_PRESENT handling
-- treats that as a no-op, never re-checking columns).
--
-- integrations table is included defensively (IF NOT EXISTS): no Prisma
-- model queries it directly so its live state can't be confirmed from logs,
-- and the FK below requires it to exist either way.
--
-- integration_id is left NULLABLE (not NOT NULL as in the original file) --
-- an idempotent repair must not risk failing on rows that already exist.

BEGIN;

CREATE TABLE IF NOT EXISTS integrations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT         NOT NULL UNIQUE,
    type         TEXT         NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

ALTER TABLE channel_accounts ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations (id);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_integration ON channel_accounts (integration_id);

COMMIT;
