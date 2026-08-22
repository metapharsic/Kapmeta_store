-- 0004_create_tables_and_sessions.sql
-- restaurant_tables: the physical tables in an outlet (zone, capacity).
-- table_sessions: one occupancy session of a table, from seating to
-- closing. Reuses order_status for session lifecycle per task spec (the
-- session moves open -> running -> printed -> paid/cancelled alongside its
-- current order), with kot_sent tracked as its own boolean column.

-- +migrate Up

CREATE TABLE restaurant_tables (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    zone            text NULL,              -- e.g. 'AC', 'Non-AC', 'Rooftop'
    table_no        text NOT NULL,
    capacity        integer NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_restaurant_tables_outlet_tableno
    ON restaurant_tables (outlet_id, table_no);
CREATE INDEX ix_restaurant_tables_outlet_id ON restaurant_tables (outlet_id);
CREATE INDEX ix_restaurant_tables_zone ON restaurant_tables (zone);

CREATE TABLE table_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    table_id        uuid NOT NULL REFERENCES restaurant_tables (id) ON DELETE CASCADE,
    order_id        uuid NULL,  -- FK to orders added in 0009 (orders is created after this table)
    status          order_status NOT NULL DEFAULT 'open',
    kot_sent        boolean NOT NULL DEFAULT false,
    covers          integer NULL,
    opened_at       timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz NULL,
    opened_by       uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN table_sessions.order_id IS
    'Nullable FK to orders.id, added via ALTER in 0009 once orders exists (avoids forward reference).';
COMMENT ON TABLE table_sessions IS
    'table_id -> restaurant_tables uses ON DELETE CASCADE: deleting a physical table is considered safe to cascade to its historical sessions in this schema; reconsider if session history must survive table deletion.';

CREATE INDEX ix_table_sessions_outlet_id ON table_sessions (outlet_id);
CREATE INDEX ix_table_sessions_table_id ON table_sessions (table_id);
CREATE INDEX ix_table_sessions_status ON table_sessions (status);
CREATE INDEX ix_table_sessions_opened_at ON table_sessions (opened_at);

-- +migrate Down

DROP TABLE IF EXISTS table_sessions;
DROP TABLE IF EXISTS restaurant_tables;
