-- Migration 0005: kitchen (REQ-KOT) — stations, KOT tickets/items, status history
--
-- Rewritten to match the live schema (kapmeta/schema.prisma, "6. KITCHEN
-- ORCHESTRATION (KOT) GROUP"). The original version of this file described
-- kitchen_stations/station_routes/kitchen_orders/kot_status enum — a design
-- that was replaced during development but never re-synced here. The actual
-- DB was pushed straight from Prisma (`prisma db push`), so this file had
-- drifted into pure fiction. Table/column names below match @@map/@map
-- exactly so a fresh environment provisioned from these migrations ends up
-- schema-identical to one provisioned via `prisma db push`.

BEGIN;

CREATE TABLE stations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID        NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
    name         TEXT        NOT NULL, -- e.g. "GRILL", "FRYER", "PANTRY", "BAR", "BAKERY"
    printer_ip   TEXT,                  -- Network IP for ESC/POS LAN printing (DEC-006)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

-- One ticket per order/station split — kitchen's working copy of an order.
CREATE TABLE kot_tickets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id      UUID        NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
    order_id       UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    station_id     UUID        REFERENCES stations (id),
    ticket_number  TEXT        NOT NULL, -- Local sequence (e.g. KOT-012)
    status         TEXT        NOT NULL, -- QUEUED, PREPARING, READY, SERVED
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    served_at      TIMESTAMPTZ
);

CREATE TABLE kot_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kot_ticket_id UUID        NOT NULL REFERENCES kot_tickets (id) ON DELETE CASCADE,
    menu_item_id  UUID        NOT NULL REFERENCES menu_items (id),
    quantity      INTEGER     NOT NULL,
    notes         TEXT,
    course        TEXT,       -- STARTER, MAIN, DESSERT, BEVERAGE — carried from order_items.course
    served_at     TIMESTAMPTZ
);

-- Append-only audit trail for ticket status changes, including leakage-
-- tracked reasons (CANCELLED, MODIFIED, SHIFTED).
CREATE TABLE kot_status_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kot_ticket_id UUID        NOT NULL REFERENCES kot_tickets (id) ON DELETE CASCADE,
    status        TEXT        NOT NULL,
    reason_code   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stations_outlet          ON stations (outlet_id);
CREATE INDEX idx_kot_tickets_outlet       ON kot_tickets (outlet_id);
CREATE INDEX idx_kot_tickets_order        ON kot_tickets (order_id);
CREATE INDEX idx_kot_tickets_station      ON kot_tickets (station_id);
-- KOT board query pattern from DB-OBJECT-CATALOGUE Index Strategy: open tickets only.
CREATE INDEX idx_kot_tickets_station_open ON kot_tickets (station_id, status) WHERE status != 'SERVED';
CREATE INDEX idx_kot_items_ticket         ON kot_items (kot_ticket_id);
CREATE INDEX idx_kot_items_menu_item      ON kot_items (menu_item_id);
CREATE INDEX idx_kot_status_history_ticket ON kot_status_history (kot_ticket_id);

COMMIT;
