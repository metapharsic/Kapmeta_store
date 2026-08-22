-- Migration 0008: audit (REQ-AUD) — audit_logs, configuration_changes, access_logs, all monthly-partitioned

BEGIN;

CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'OVERRIDE', 'EXPORT');

-- All three tables here are RANGE PARTITIONED monthly on created_at (DEC-010).
-- A partitioned table's primary key must include the partition key, hence
-- PRIMARY KEY (id, created_at) rather than a bare id PK.
--
-- Only the 2026-08 partition is created as a worked example. Creating future
-- partitions (2026-09 onward) is an OPS TODO: either a manual migration per
-- month, or a scheduled job that pre-creates N months ahead. That automation
-- is out of scope here — building it now would bake in assumptions about
-- retention windows that belong to DEC-010, which is still open.
CREATE TABLE audit_logs (
    id            UUID         NOT NULL DEFAULT gen_random_uuid(),
    outlet_id     UUID         NOT NULL REFERENCES outlets (id),
    entity_type   TEXT         NOT NULL,
    entity_id     UUID         NOT NULL,
    action        audit_action NOT NULL,
    actor_id      UUID,
    before_state  JSONB,
    after_state   JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_y2026m08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE configuration_changes (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    outlet_id     UUID        NOT NULL REFERENCES outlets (id),
    config_key    TEXT        NOT NULL,
    old_value     JSONB,
    new_value     JSONB,
    actor_id      UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE configuration_changes_y2026m08 PARTITION OF configuration_changes
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE access_logs (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    outlet_id     UUID        NOT NULL REFERENCES outlets (id),
    user_id       UUID,
    endpoint      TEXT        NOT NULL,
    ip_address    INET,
    status_code   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE access_logs_y2026m08 PARTITION OF access_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- DB-TRG-04 (fn_audit_row/audit-immutability) and the "no application role gets
-- UPDATE or DELETE on these tables" rule (DB-OBJECT-CATALOGUE) are grant/security
-- concerns, deliberately NOT implemented here. Fabricating GRANT/REVOKE statements
-- or a raises-always trigger in a schema migration would hide a security control
-- inside DDL that no one reviews as security. That belongs in a dedicated
-- ops/security migration where it can be reviewed and tested as such.

CREATE INDEX idx_audit_logs_outlet_entity
    ON audit_logs (outlet_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_configuration_changes_outlet
    ON configuration_changes (outlet_id, created_at DESC);
CREATE INDEX idx_access_logs_outlet
    ON access_logs (outlet_id, created_at DESC);

COMMIT;
