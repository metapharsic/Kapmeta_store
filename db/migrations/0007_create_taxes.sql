-- 0007_create_taxes.sql
-- taxes: admin-editable tax definitions (e.g. CGST, SGST, CGST[Online],
--   SGST[Online]), each a named rate. Never hardcoded into service code.
-- tax_channel_rules: scopes which taxes apply to which channel
--   (dine_in / online / takeaway / delivery) for a given outlet, and in
--   what mode (backward/forward). This is what lets one real outlet
--   ("Hotel kapila") run Backward Tax for dine-in AND Forward Tax for
--   online simultaneously, per the locked Phase 0 tax model decision.
--
-- SEED DATA NOTE (not inserted here -- see 0099 for the actual seed):
--   For "Hotel kapila", the real captured evidence implies four tax rows
--   in `taxes` and four scoping rows in `tax_channel_rules`, e.g.:
--     taxes:                 name                  rate
--       CGST                 2.50
--       SGST                 2.50
--       CGST [Online]        2.50
--       SGST [Online]        2.50
--     tax_channel_rules:      tax                  channel   mode
--       CGST / SGST           dine_in               backward
--       CGST [Online] / SGST [Online]  online        forward
--   Backward tax on dine_in => CGST+SGST are extracted out of the
--   menu-listed price. Forward tax on online => CGST[Online]+SGST[Online]
--   are added on top of the menu-listed price. Both pairs are active at
--   the same outlet at the same time, scoped by channel.

-- +migrate Up

CREATE TABLE taxes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    name            text NOT NULL,          -- e.g. 'CGST', 'SGST', 'CGST [Online]'
    rate_percent    numeric(6,3) NOT NULL,  -- e.g. 2.500
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_taxes_rate_nonneg CHECK (rate_percent >= 0)
);

CREATE UNIQUE INDEX ux_taxes_outlet_name ON taxes (outlet_id, name);
CREATE INDEX ix_taxes_outlet_id ON taxes (outlet_id);
CREATE INDEX ix_taxes_is_active ON taxes (is_active);

CREATE TABLE tax_channel_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id       uuid NOT NULL REFERENCES outlets (id) ON DELETE RESTRICT,
    tax_id          uuid NOT NULL REFERENCES taxes (id) ON DELETE RESTRICT,
    channel         order_channel NOT NULL,
    mode            tax_mode NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tax_channel_rules IS
    'Scopes a tax row to a specific sales channel and computation mode. Multiple rules per outlet/channel are allowed (e.g. CGST + SGST both apply to dine_in).';

CREATE UNIQUE INDEX ux_tax_channel_rules_tax_channel
    ON tax_channel_rules (tax_id, channel);
CREATE INDEX ix_tax_channel_rules_outlet_id ON tax_channel_rules (outlet_id);
CREATE INDEX ix_tax_channel_rules_channel ON tax_channel_rules (outlet_id, channel);

-- +migrate Down

DROP TABLE IF EXISTS tax_channel_rules;
DROP TABLE IF EXISTS taxes;
