-- 0011_create_order_audit_log.sql
-- order_audit_log: append-only history of state-changing actions on orders
-- (status transitions, edits, cancellations, approvals).
--
-- INTENT: this table is append-only. A future migration should add a
-- trigger (e.g. BEFORE UPDATE OR DELETE ... RAISE EXCEPTION) to enforce
-- that at the database level. NOT implemented yet in this migration --
-- only declared as intent here, since trigger/permission strategy is a
-- separate decision.

-- +migrate Up

CREATE TABLE order_audit_log (
    id              bigserial PRIMARY KEY,
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    order_id        uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    actor_id        uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    approved_by     uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
    action          text NOT NULL,      -- e.g. 'status_change', 'item_void', 'discount_applied'
    before_val      jsonb NULL,
    after_val       jsonb NULL,
    at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_audit_log IS
    'Append-only intent: TODO (future migration) add a trigger to block UPDATE/DELETE on this table at the DB level. Not implemented yet -- comment only.';

CREATE INDEX ix_order_audit_log_outlet_id ON order_audit_log (outlet_id);
CREATE INDEX ix_order_audit_log_order_id ON order_audit_log (order_id);
CREATE INDEX ix_order_audit_log_actor_id ON order_audit_log (actor_id);
CREATE INDEX ix_order_audit_log_at ON order_audit_log (at);

-- +migrate Down

DROP TABLE IF EXISTS order_audit_log;
