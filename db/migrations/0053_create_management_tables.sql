-- 0053: create management_lists / management_settings / management_activity_logs
-- -- generic backing tables for the new "Management" nav section (Configuration /
-- Accounting / User Management / User Logs screens from the reference
-- screenshots). Grepped apps/api/src/routes, kapmeta/schema.prisma and
-- db/migrations first -- no tables or Prisma models with these names, or
-- close to them, exist anywhere. These are new tables, not repairs.
--
-- TEXT id/outlet_id, gen_random_uuid()::text default, CREATE TABLE IF NOT
-- EXISTS: same convention established in 0045-0047 and reused in 0052 --
-- ground truth from `node scripts/inspect-db-v2.js` showed the ENTIRE live
-- schema uses TEXT for id and every FK column, never uuid (integrations.id /
-- channel_accounts.integration_id are the sole real exceptions, and neither
-- table is touched here).
--
-- Rather than one bespoke table per screen (12+ nearly-identical "a list of
-- named records" screens, 5+ nearly-identical "one settings blob per
-- outlet" screens, 10+ nearly-identical "append-only event log" screens),
-- this migration adds three generic, keyed tables and each screen picks a
-- key. This mirrors how orders.status/order_type are free-text keys rather
-- than a table per status elsewhere in this schema. Frontend/route code
-- decides the key strings per screen; nothing here hardcodes a screen list.
--
-- IMPORTANT -- like report_notifications (0052), these tables are storage
-- only. management_activity_logs is wired to exactly one real write point
-- (the online channel item availability toggle in integration.ts -- see
-- that route file's comment for which of the two candidate toggle routes
-- was chosen and why); every other log_type/list_key/settings_key is
-- inert until a caller starts writing rows through the routes below. That
-- is expected -- this migration provides the shared storage layer, not a
-- claim that every listed screen is already producing real log entries.

BEGIN;

CREATE TABLE IF NOT EXISTS management_lists (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id   TEXT NOT NULL REFERENCES outlets (id),
    -- screen/category key, e.g. 'SUB_ORDER_TYPE', 'DELIVERY_DISTANCE',
    -- 'AREA_DELIVERY_CHARGE', 'FLOOR_PLAN', 'EMAIL_TEMPLATE',
    -- 'UTILITY_BILL_OPERATOR', 'LOAN_INFORMATION', 'DENOMINATION'. Free
    -- text, not FK-constrained -- the key catalog is code (route callers),
    -- not a table, same as report_notifications.report_key.
    list_key    TEXT NOT NULL,
    label       TEXT NOT NULL,
    value       TEXT,
    -- screen-specific structured fields (e.g. delivery distance's min/max
    -- km, floor plan's table/zone geometry, email template's subject+body)
    -- live here rather than as bespoke columns, since each list_key shapes
    -- this differently.
    extra       JSONB NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_management_lists_outlet_key ON management_lists (outlet_id, list_key);

CREATE TABLE IF NOT EXISTS management_settings (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id    TEXT NOT NULL REFERENCES outlets (id),
    -- e.g. 'OUTLET_CONFIGURATION', 'GST_INFORMATION', 'VIRTUAL_WALLET',
    -- 'ONLINE_ORDER_RECONCILIATION', 'EXPENSE_WITHDRAWAL'. Free text, same
    -- reasoning as management_lists.list_key.
    settings_key TEXT NOT NULL,
    data         JSONB NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT,
    UNIQUE (outlet_id, settings_key)
);

CREATE TABLE IF NOT EXISTS management_activity_logs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id   TEXT NOT NULL REFERENCES outlets (id),
    -- e.g. 'ONLINE_STORE', 'ONLINE_ITEM_ON_OFF', 'AUTO_ACCEPT_CHANGE',
    -- 'SUPPORT_MANAGEMENT', 'NOTIFICATION', 'MENU_TRIGGER',
    -- 'CLOSING_HOUR', 'EXPENSE', 'WITHDRAWAL', 'CASH_TOP_UP',
    -- 'SERVICE_PAYMENT_HISTORY', 'AUDIT_TRAIL'. Free text, same reasoning
    -- as management_lists.list_key.
    log_type    TEXT NOT NULL,
    actor_id    TEXT,
    message     TEXT NOT NULL,
    meta        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_management_activity_logs_outlet_type_created
    ON management_activity_logs (outlet_id, log_type, created_at DESC);

COMMIT;
