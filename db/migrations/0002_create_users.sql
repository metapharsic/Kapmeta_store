-- 0002_create_users.sql
-- users / staff table. Identified as MISSING from the original draft sketch
-- and added here so that order_audit_log.actor_id / .approved_by and
-- user_report_preferences.user_id (migrations 0011, 0012, 0015) have a real
-- identity to reference.
--
-- outlet_id is nullable: cross-outlet admin/owner users are not tied to a
-- single outlet, whereas outlet-level staff (cashiers, waiters, managers)
-- are scoped to one. FK to outlets is added in a later ALTER (0003 creates
-- outlets after this table) to avoid a forward reference.

-- +migrate Up

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NULL,
    name            text NOT NULL,
    phone           text NULL,
    email           text NULL,
    role            text NOT NULL DEFAULT 'staff',
    password_hash   text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN users.outlet_id IS
    'Nullable: NULL = cross-outlet admin/owner user. FK added in 0003 after outlets exists.';
COMMENT ON COLUMN users.role IS
    'Free-text role label for now (e.g. owner, manager, cashier, waiter). Consider a role table if roles become admin-editable in a later phase.';

CREATE UNIQUE INDEX ux_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX ux_users_email ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX ix_users_outlet_id ON users (outlet_id);
CREATE INDEX ix_users_is_active ON users (is_active);

-- +migrate Down

DROP TABLE IF EXISTS users;
