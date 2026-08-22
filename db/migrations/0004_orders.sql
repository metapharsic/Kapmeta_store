-- Migration 0004: orders (REQ-ORD) — orders, items, modifiers, status history, payment/refund linkage

BEGIN;

CREATE TYPE order_status AS ENUM (
    'DRAFT', 'PLACED', 'CONFIRMED', 'KOT_CREATED', 'IN_PREPARATION',
    'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'SERVED', 'HANDED_OVER',
    'COMPLETED', 'CANCELLED', 'FAILED'
);

CREATE TYPE order_type AS ENUM ('DINE_IN', 'PICKUP', 'DELIVERY');

-- DB-FN-02: maps a timestamp to a business date using the outlet's day_start_time
-- (business day boundary, not calendar midnight — see outlets.day_start_time, 0001).
CREATE FUNCTION fn_business_date(p_at TIMESTAMPTZ, p_outlet_id UUID)
RETURNS DATE AS $$
    SELECT (p_at AT TIME ZONE o.timezone - o.day_start_time)::DATE
    FROM outlets o
    WHERE o.id = p_outlet_id;
$$ LANGUAGE sql STABLE;

-- outlet_id, order_number: DB-UQ-01 below.
-- business_date is stored (via fn_business_date), never derived from created_at::date at query time.
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id           UUID         NOT NULL REFERENCES outlets (id),
    order_number        TEXT         NOT NULL,
    type                order_type   NOT NULL,
    status              order_status NOT NULL DEFAULT 'DRAFT',
    business_date       DATE         NOT NULL,
    subtotal_minor      BIGINT       NOT NULL DEFAULT 0,
    total_minor         BIGINT       NOT NULL DEFAULT 0,
    currency            CHAR(3)      NOT NULL DEFAULT 'INR',
    customer_id         UUID,
    table_number        TEXT,
    delivery_address_id UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT ck_orders_subtotal_minor_nonneg CHECK (subtotal_minor >= 0),
    CONSTRAINT ck_orders_total_minor_nonneg CHECK (total_minor >= 0)
);

-- DB-UQ-01: no two orders in the same outlet share an order_number.
CREATE UNIQUE INDEX uq_orders_outlet_number ON orders (outlet_id, order_number);

-- unit_price_minor is a SNAPSHOT of menu_items/item_variants pricing at order time,
-- not a live lookup. A later price change must never alter a placed order's amount
-- (see DB-MAP-COL Snapshot vs Reference). item_name is likewise snapshotted for the
-- same reason a joined display would silently drift on rename.
CREATE TABLE order_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id        UUID        NOT NULL REFERENCES outlets (id),
    order_id         UUID        NOT NULL REFERENCES orders (id),
    item_id          UUID        NOT NULL REFERENCES menu_items (id),
    variant_id       UUID        REFERENCES item_variants (id),
    item_name        TEXT        NOT NULL,
    qty               NUMERIC    NOT NULL DEFAULT 1,
    unit_price_minor BIGINT      NOT NULL,
    total_price_minor BIGINT     NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID,
    updated_by       UUID,
    CONSTRAINT ck_order_items_qty_positive CHECK (qty > 0),
    CONSTRAINT ck_order_items_unit_price_minor_nonneg CHECK (unit_price_minor >= 0)
);

-- price_delta_minor is likewise a snapshot of the modifier's price at order time.
CREATE TABLE order_item_modifiers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id         UUID        NOT NULL REFERENCES outlets (id),
    order_item_id     UUID        NOT NULL REFERENCES order_items (id),
    modifier_id       UUID        NOT NULL REFERENCES modifiers (id),
    modifier_name     TEXT        NOT NULL,
    price_delta_minor BIGINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID
);

-- Append-only: every transition, never overwritten. reason_code is mandatory on
-- CANCELLED transitions per docs/02-requirements/orders.md; not enforced here as a
-- CHECK because the guard trigger below (DB-FN-05) is the transition authority.
CREATE TABLE order_status_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id    UUID         NOT NULL REFERENCES outlets (id),
    order_id     UUID         NOT NULL REFERENCES orders (id),
    from_status  order_status,
    to_status    order_status NOT NULL,
    reason_code  TEXT,
    actor_id     UUID,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- DB-FN-05 / DB-TRG-03: reject illegal order status transitions at the DB level,
-- per the state machine table in docs/02-requirements/orders.md. Any pre-COMPLETED
-- state may move to CANCELLED; CANCELLED may move to FAILED; forward transitions
-- follow the documented graph. This is a floor, not the full business rule set —
-- permission checks and mandatory reason codes remain application-level.
CREATE FUNCTION fn_assert_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'illegal order status transition: % -> % (order % is COMPLETED, terminal)',
            OLD.status, NEW.status, OLD.id;
    END IF;

    IF NEW.status = 'CANCELLED' THEN
        RETURN NEW; -- any pre-COMPLETED state may cancel
    END IF;

    IF OLD.status = 'CANCELLED' AND NEW.status = 'FAILED' THEN
        RETURN NEW;
    END IF;

    IF (OLD.status, NEW.status) IN (
        ('DRAFT', 'PLACED'),
        ('PLACED', 'CONFIRMED'),
        ('CONFIRMED', 'KOT_CREATED'),
        ('KOT_CREATED', 'IN_PREPARATION'),
        ('IN_PREPARATION', 'READY'),
        ('READY', 'ASSIGNED'),
        ('READY', 'SERVED'),
        ('READY', 'HANDED_OVER'),
        ('ASSIGNED', 'OUT_FOR_DELIVERY'),
        ('OUT_FOR_DELIVERY', 'SERVED'),
        ('OUT_FOR_DELIVERY', 'HANDED_OVER'),
        ('SERVED', 'COMPLETED'),
        ('HANDED_OVER', 'COMPLETED')
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'illegal order status transition: % -> % (order %)', OLD.status, NEW.status, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_guard
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_assert_status_transition();

-- LINKAGE tables only. The `payments`/`refunds` tables themselves are 0012,
-- blocked on DEC-005 (payment gateway). payment_id/refund_id are therefore left
-- as bare UUID columns with NO foreign key constraint — the referenced table does
-- not exist yet. The FK will be added once 0012 lands.
CREATE TABLE order_payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id     UUID        NOT NULL REFERENCES outlets (id),
    order_id      UUID        NOT NULL REFERENCES orders (id),
    payment_id    UUID        NOT NULL, -- FK to payments(id) deferred to 0012, blocked on DEC-005
    amount_minor  BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    CONSTRAINT ck_order_payments_amount_minor_nonneg CHECK (amount_minor >= 0)
);

CREATE TABLE order_refunds (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id     UUID        NOT NULL REFERENCES outlets (id),
    order_id      UUID        NOT NULL REFERENCES orders (id),
    refund_id     UUID        NOT NULL, -- FK to refunds(id) deferred to 0012, blocked on DEC-005
    amount_minor  BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    CONSTRAINT ck_order_refunds_amount_minor_nonneg CHECK (amount_minor >= 0)
);

CREATE INDEX idx_orders_outlet                    ON orders (outlet_id);
CREATE INDEX idx_orders_outlet_status_date         ON orders (outlet_id, status, business_date);
CREATE INDEX idx_orders_customer                  ON orders (customer_id);
CREATE INDEX idx_order_items_outlet               ON order_items (outlet_id);
CREATE INDEX idx_order_items_order                ON order_items (order_id);
CREATE INDEX idx_order_items_item                 ON order_items (item_id);
CREATE INDEX idx_order_items_variant              ON order_items (variant_id);
CREATE INDEX idx_order_item_modifiers_outlet      ON order_item_modifiers (outlet_id);
CREATE INDEX idx_order_item_modifiers_order_item  ON order_item_modifiers (order_item_id);
CREATE INDEX idx_order_item_modifiers_modifier    ON order_item_modifiers (modifier_id);
CREATE INDEX idx_order_status_history_outlet      ON order_status_history (outlet_id);
CREATE INDEX idx_order_status_history_order       ON order_status_history (order_id);
CREATE INDEX idx_order_payments_outlet            ON order_payments (outlet_id);
CREATE INDEX idx_order_payments_order             ON order_payments (order_id);
CREATE INDEX idx_order_refunds_outlet             ON order_refunds (outlet_id);
CREATE INDEX idx_order_refunds_order              ON order_refunds (order_id);

COMMIT;
