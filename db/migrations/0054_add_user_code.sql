-- 0054: add users.user_code -- backs the "User Code" column on the
-- Management > User Management > Biller App screen (5 tabs: Biller/
-- Captain/Delivery Boy/Waiter/Order Acceptance App reference screenshots).
--
-- Grepped kapmeta/schema.prisma's User model and apps/api/src/routes/
-- user-management.ts's POST /users and PATCH /users/:id first. The only
-- existing per-user "code"-shaped fields are email (login identifier,
-- already shown as "User Name" below) and pinHash (bcrypt hash of a POS
-- login PIN -- write-only, the plaintext is never stored, so it cannot be
-- displayed or copied in a table cell). Neither is the reference
-- screenshot's "User Code" column, which is a short plaintext code shown
-- and copyable in the UI and regenerable via the "Sync Code" action. No
-- existing field fits, so this adds one.
--
-- TEXT, nullable (existing users have none until first generated), no
-- default expression -- the value is a short random code generated in
-- application code at user-create time (see POST /management/biller-app
-- in apps/api/src/routes/management.ts) and on demand by the "sync code"
-- endpoint, not by the database. users.id itself is a legacy @db.Uuid
-- column (pre-dates the TEXT-id convention established in 0045-0047/0052/
-- 0053 and not touched here) but user_code is a new column added under
-- that TEXT convention, same as every other new column/table since 0045.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_code ON users (user_code) WHERE user_code IS NOT NULL;

COMMIT;
