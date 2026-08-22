-- Migration 0007: integration (REQ-INT) — integrations, channel accounts, inbound/outbound events, sync, errors

BEGIN;

CREATE TYPE channel_type AS ENUM ('POS', 'SWIGGY', 'ZOMATO', 'OTHER');
CREATE TYPE sync_status AS ENUM ('PENDING', 'SYNCHRONIZED', 'FAILED');

-- Global/org-level catalogue of integration providers, not outlet-scoped —
-- same exemption class as organizations/users (DB-MAP-COL).
CREATE TABLE integrations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT         NOT NULL UNIQUE,
    type         channel_type NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

-- credentials_ref is a POINTER into the secrets manager. Credentials are NEVER
-- stored in this table, in any form — not encrypted, not hashed. Only a
-- reference the secrets manager can resolve.
CREATE TABLE channel_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    integration_id      UUID        NOT NULL REFERENCES integrations (id),
    external_outlet_id  TEXT,
    credentials_ref      TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID,
    updated_by           UUID
);

-- DB-UQ-03 — THE idempotency guard (WF-INT-01/03). The database enforces this,
-- not application logic: application-level dedupe loses races under concurrent
-- webhook delivery. Raw payload is persisted before any parsing, deliberately
-- (see WF-INT-integration.md step 3) — an unpersisted event that fails to parse
-- means the order silently never existed. processed_at NULL = not yet processed.
CREATE TABLE inbound_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    channel_account_id  UUID        NOT NULL REFERENCES channel_accounts (id),
    external_event_id   TEXT        NOT NULL,
    raw_payload         JSONB       NOT NULL,
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID
);

-- DB-UQ-03: the single most important constraint in this file.
CREATE UNIQUE INDEX uq_inbound_events_channel_external
    ON inbound_events (channel_account_id, external_event_id);

CREATE TABLE outbound_events (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    channel_account_id  UUID        NOT NULL REFERENCES channel_accounts (id),
    payload             JSONB       NOT NULL,
    attempt             INTEGER     NOT NULL DEFAULT 0,
    status              sync_status NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID
);

-- entity is a free-text label of what's being synced (e.g. 'item_availability');
-- version echoes the out-of-order guard from WF-MNU-menu-sync.md.
CREATE TABLE sync_jobs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID        NOT NULL REFERENCES outlets (id),
    channel_account_id  UUID        NOT NULL REFERENCES channel_accounts (id),
    entity              TEXT        NOT NULL,
    entity_id           UUID,
    version              INTEGER     NOT NULL DEFAULT 1,
    status               sync_status NOT NULL DEFAULT 'PENDING',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID,
    updated_by           UUID
);

-- source_event_id points at inbound_events.id when the error originated from an
-- inbound webhook; nullable because outbound sync failures have no inbound source.
CREATE TABLE integration_errors (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id         UUID        NOT NULL REFERENCES outlets (id),
    source_event_id   UUID        REFERENCES inbound_events (id),
    error_code        TEXT        NOT NULL,
    detail            TEXT,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID
);

CREATE INDEX idx_channel_accounts_outlet       ON channel_accounts (outlet_id);
CREATE INDEX idx_channel_accounts_integration  ON channel_accounts (integration_id);
CREATE INDEX idx_inbound_events_outlet         ON inbound_events (outlet_id);
CREATE INDEX idx_inbound_events_channel_account ON inbound_events (channel_account_id);
CREATE INDEX idx_outbound_events_outlet        ON outbound_events (outlet_id);
CREATE INDEX idx_outbound_events_channel_account ON outbound_events (channel_account_id);
CREATE INDEX idx_sync_jobs_outlet              ON sync_jobs (outlet_id);
CREATE INDEX idx_sync_jobs_channel_account     ON sync_jobs (channel_account_id);
CREATE INDEX idx_integration_errors_outlet     ON integration_errors (outlet_id);
CREATE INDEX idx_integration_errors_source_event ON integration_errors (source_event_id);

COMMIT;
