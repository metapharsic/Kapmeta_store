-- 0055: create wallet_transactions / expense_transactions -- backing tables for
-- the "Accounting" sub-group of the Management nav (Virtual Wallet and
-- Expense Management screens from the reference screenshots).
--
-- Investigated first (grep kapmeta/schema.prisma, apps/api/src/routes):
--   * No customer-mobile-keyed wallet ledger exists. loyalty_accounts
--     (schema.prisma ~L1092) is a points balance keyed by customer_id, a
--     different concept (loyalty tier points, not a spendable wallet
--     balance searched by mobile number in the reference screenshot).
--     wallet_transactions below is a new, real ledger table.
--   * Payment Information / PG Transactions do NOT get a new table --
--     they query the existing `payments`/`orders` tables directly (see
--     apps/api/src/routes/management.ts's new /management/payment-information
--     and /management/payment-history?tab=pg routes).
--   * Utility Bill Operator and all six Expense Management "*_master" lists
--     reuse the existing generic management_lists table (migration 0053,
--     list_key='UTILITY_BILL_OPERATOR' / 'EXPENSE_MASTER' /
--     'WITHDRAWAL_MASTER' / 'CASH_TOPUP_MASTER') via the already-working
--     GET/POST/PUT/DELETE /management/lists routes -- no new table or route
--     needed for those, only expense_transactions (the "listing" side: the
--     individual expense/withdrawal/cash top-up entries themselves) is new.
--
-- Same convention as 0053/0052/0045-0047: TEXT id/outlet_id,
-- gen_random_uuid()::text default, CREATE TABLE IF NOT EXISTS, outlet_id
-- NOT NULL REFERENCES outlets(id).

BEGIN;

-- Per-customer wallet ledger. "Remaining Amount" (the reference screenshot's
-- balance column) is computed at query time as
-- SUM(CASE type='CREDIT' THEN amount_minor ELSE -amount_minor END)
-- grouped by customer_mobile -- see GET /management/virtual-wallet.
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id       TEXT NOT NULL REFERENCES outlets (id),
    customer_mobile TEXT NOT NULL,
    amount_minor    BIGINT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_outlet_mobile ON wallet_transactions (outlet_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_outlet_created ON wallet_transactions (outlet_id, created_at);

-- Individual expense / withdrawal / cash top-up entries. list_id points at
-- the corresponding management_lists row (the "master" record picked in
-- the UI -- category/title for an expense, etc.); kind separates the three
-- Expense Management "Listing" tabs.
CREATE TABLE IF NOT EXISTS expense_transactions (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    outlet_id    TEXT NOT NULL REFERENCES outlets (id),
    list_id      TEXT REFERENCES management_lists (id),
    kind         TEXT NOT NULL CHECK (kind IN ('EXPENSE', 'WITHDRAWAL', 'CASH_TOPUP')),
    amount_minor BIGINT NOT NULL,
    note         TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_transactions_outlet_kind ON expense_transactions (outlet_id, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_list ON expense_transactions (list_id);

COMMIT;
