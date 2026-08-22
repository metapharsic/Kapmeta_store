-- Migration 0001: identity, access and organization
-- Every operational table carries outlet_id from day one (see DEC-001).

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE organizations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    legal_name   TEXT,
    tax_id       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE TABLE outlets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES organizations (id),
    code             TEXT        NOT NULL,
    name             TEXT        NOT NULL,
    timezone         TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
    currency         CHAR(3)     NOT NULL DEFAULT 'INR',
    -- business day boundary, not calendar midnight
    day_start_time   TIME        NOT NULL DEFAULT '05:00',
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID,
    updated_by       UUID,
    UNIQUE (organization_id, code)
);

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          CITEXT,
    phone          TEXT,
    full_name      TEXT        NOT NULL,
    password_hash  TEXT        NOT NULL,
    mfa_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID
);

CREATE TABLE roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT        NOT NULL UNIQUE,
    name         TEXT        NOT NULL,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code      TEXT NOT NULL UNIQUE,   -- e.g. 'orders.cancel'
    module    TEXT NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id        UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Role grants are outlet-scoped. NULL outlet_id = organization-wide.
CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    outlet_id   UUID REFERENCES outlets (id) ON DELETE CASCADE,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by  UUID
);

-- Expression uniqueness: one grant per (user, role, outlet), treating NULL
-- outlet (organization-wide) as a distinct single value.
CREATE UNIQUE INDEX uq_user_roles
    ON user_roles (user_id, role_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_token_hash TEXT     NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outlets_org        ON outlets (organization_id);
CREATE INDEX idx_user_roles_outlet  ON user_roles (outlet_id);
CREATE INDEX idx_sessions_user      ON sessions (user_id) WHERE revoked_at IS NULL;

COMMIT;
