-- 0015_create_user_report_preferences.sql
-- user_report_preferences: per-user saved report configuration (which
-- columns are shown/hidden/ordered for a given report). Now valid since
-- the users table exists (added in 0002).

-- +migrate Up

CREATE TABLE user_report_preferences (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    report_key      text NOT NULL,      -- identifies the report, e.g. 'sales_summary', 'item_wise_sales'
    column_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN user_report_preferences.column_config IS
    'UI-only preference data (column order/visibility/widths). jsonb is acceptable here since it is not business/financial data and is never queried by its internal fields.';
COMMENT ON TABLE user_report_preferences IS
    'ON DELETE CASCADE on user_id: a purely per-user UI preference, safe to discard when the user is deleted.';

CREATE UNIQUE INDEX ux_user_report_preferences_user_report
    ON user_report_preferences (user_id, report_key);
CREATE INDEX ix_user_report_preferences_user_id ON user_report_preferences (user_id);

-- +migrate Down

DROP TABLE IF EXISTS user_report_preferences;
