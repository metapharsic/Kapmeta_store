-- Migration 0006: customers (REQ-CRM) — customers, addresses, tags, loyalty accounts

BEGIN;

-- Customers are organization-level, not outlet-scoped (a customer can order from
-- any outlet of the same org) — same exemption class as organizations/users in
-- DB-MAP-COL. phone is the primary identifier per docs/GLOSSARY.md; normalized to
-- E.164-ish digits-only TEXT rather than citext, since phone comparison is exact,
-- not case-insensitive.
--
-- consent_* columns are added now (nullable/defaulted, per NAMING-STANDARD expand
-- step) so downstream tables can reference them, but erasure semantics — how a
-- deletion/anonymization request is actually honored against statutory invoice
-- retention — are BLOCKED pending DEC-020. Do not implement erasure logic against
-- these columns until that decision lands.
CREATE TABLE customers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID        NOT NULL REFERENCES organizations (id),
    phone                 TEXT        NOT NULL,
    name                  TEXT,
    email                 CITEXT,
    consent_marketing     BOOLEAN     NOT NULL DEFAULT FALSE,
    consent_data_sharing  BOOLEAN     NOT NULL DEFAULT FALSE,
    consent_recorded_at   TIMESTAMPTZ,
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    UNIQUE (organization_id, phone)
);

CREATE TABLE customer_addresses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID        NOT NULL REFERENCES customers (id),
    label        TEXT,
    line1        TEXT        NOT NULL,
    line2        TEXT,
    city         TEXT,
    postal_code  TEXT,
    latitude     NUMERIC,
    longitude    NUMERIC,
    is_default   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE TABLE customer_tags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID        NOT NULL REFERENCES customers (id),
    tag          TEXT        NOT NULL,
    source       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    UNIQUE (customer_id, tag)
);

-- Balance/tier columns only. Earn/redeem transaction logic (accrual rules,
-- expiry, redemption ledger) is BLOCKED on DEC-014 and intentionally not built
-- here — this table just holds current state, not the mechanism that mutates it.
CREATE TABLE loyalty_accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID        NOT NULL REFERENCES customers (id),
    balance      NUMERIC     NOT NULL DEFAULT 0,
    tier         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    UNIQUE (customer_id)
);

CREATE INDEX idx_customers_organization      ON customers (organization_id);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses (customer_id);
CREATE INDEX idx_customer_tags_customer      ON customer_tags (customer_id);
CREATE INDEX idx_loyalty_accounts_customer   ON loyalty_accounts (customer_id);

COMMIT;
