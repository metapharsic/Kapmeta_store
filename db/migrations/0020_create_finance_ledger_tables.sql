-- Migration: Create finance ledger tables
-- Date: 2026-08-27
-- Purpose: Phase 5 - Finance Real Ledger (cash drawer + petty cash)

CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL,
  opened_by UUID NOT NULL,
  closed_by UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  expected_close_balance_minor BIGINT NOT NULL DEFAULT 0,
  actual_close_balance_minor BIGINT,
  discrepancy_minor BIGINT,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS petty_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  recorded_by UUID NOT NULL,
  cash_drawer_session_id UUID REFERENCES cash_drawer_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_outlet ON cash_drawer_sessions(outlet_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_status ON cash_drawer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_petty_cash_ledger_outlet ON petty_cash_ledger(outlet_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_ledger_session ON petty_cash_ledger(cash_drawer_session_id);

INSERT INTO schema_migrations (version) VALUES ('0020_create_finance_ledger_tables') ON CONFLICT DO NOTHING;
