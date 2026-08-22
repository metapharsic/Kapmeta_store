-- 0014_create_sync_backup_channel_log.sql
-- sync_state: per-outlet/per-device LAN sync cursor/topology tracking.
-- backup_jobs: tracks backup runs (local/cloud) per outlet.
-- channel_sync_log: append-only audit log of aggregator fan-out (e.g. the
--   sync layer pushing an order out to online-ordering aggregators).

-- +migrate Up

CREATE TABLE sync_state (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    device_id           text NOT NULL,       -- POS terminal / node identifier on the LAN
    device_role         text NOT NULL DEFAULT 'client',  -- e.g. 'primary', 'client'
    last_synced_at      timestamptz NULL,
    last_sync_cursor    text NULL,           -- opaque cursor/offset understood by the sync layer
    is_online           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_sync_state_outlet_device ON sync_state (outlet_id, device_id);
CREATE INDEX ix_sync_state_outlet_id ON sync_state (outlet_id);
CREATE INDEX ix_sync_state_is_online ON sync_state (is_online);

CREATE TABLE backup_jobs (
    id                  bigserial PRIMARY KEY,
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    job_type            text NOT NULL DEFAULT 'full',   -- e.g. 'full', 'incremental'
    destination         text NOT NULL DEFAULT 'local',  -- e.g. 'local', 'cloud'
    status              text NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'succeeded' | 'failed'
    started_at          timestamptz NULL,
    finished_at         timestamptz NULL,
    error_message       text NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_backup_jobs_outlet_id ON backup_jobs (outlet_id);
CREATE INDEX ix_backup_jobs_status ON backup_jobs (status);
CREATE INDEX ix_backup_jobs_created_at ON backup_jobs (created_at);

CREATE TABLE channel_sync_log (
    id                  bigserial PRIMARY KEY,
    outlet_id           uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    order_id            uuid NULL REFERENCES orders (id) ON DELETE RESTRICT,
    channel             order_channel NOT NULL,
    target              text NOT NULL,        -- e.g. aggregator name / endpoint identifier
    direction            text NOT NULL DEFAULT 'outbound', -- 'outbound' | 'inbound'
    status              text NOT NULL DEFAULT 'pending',   -- 'pending' | 'sent' | 'failed' | 'acked'
    payload             jsonb NULL,
    response             jsonb NULL,
    attempted_at         timestamptz NOT NULL DEFAULT now(),
    error_message        text NULL
);

COMMENT ON TABLE channel_sync_log IS
    'Append-only audit log of fan-out to/from online-ordering aggregators and other external channels.';

CREATE INDEX ix_channel_sync_log_outlet_id ON channel_sync_log (outlet_id);
CREATE INDEX ix_channel_sync_log_order_id ON channel_sync_log (order_id);
CREATE INDEX ix_channel_sync_log_status ON channel_sync_log (status);
CREATE INDEX ix_channel_sync_log_attempted_at ON channel_sync_log (attempted_at);

-- +migrate Down

DROP TABLE IF EXISTS channel_sync_log;
DROP TABLE IF EXISTS backup_jobs;
DROP TABLE IF EXISTS sync_state;
