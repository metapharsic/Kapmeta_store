-- 0051: repair user_quick_links.updated_at and notifications.updated_at,
-- both missing live. user_quick_links.updated_at is tracked as TSK-026 in
-- agents/task-board.json ("missing live column (P2022 in logs, GET
-- /quick-links) - unrelated to aggregator feed, spotted not fixed") -- this
-- is that migration; notifications.updated_at is the same bug, found
-- alongside it while re-auditing the full log set for this pass.
--
-- Evidence (P2022, still firing in api-2026-09-02.log): "The column
-- `user_quick_links.updated_at` does not exist in the current database"
-- (258x today -- the single most frequent error in the whole log set),
-- thrown from apps/api/src/routes/user-management.ts's GET /quick-links
-- (`prisma.userQuickLink.findMany(...)`). "The column `updated_at` does not
-- exist in the current database" with `meta: { modelName: 'Notification' }`
-- (38x api-2026-08-31.log, 6x api-2026-09-01.log), thrown from
-- apps/api/src/routes/notifications.ts's notification-creation path
-- (`prisma.notification.create(...)`).
--
-- Root cause, a FOURTH bug sub-class distinct from 0043/0044/0045/0046
-- (edited-after-applied CREATE TABLE) and 0047/0048/0049 (UUID-vs-TEXT FK
-- rollback): no migration file in db/migrations/ declares either
-- user_quick_links or notifications at all (grepped the full directory).
-- Both tables plainly exist live (this is P2022 -- column missing, not
-- P2021 -- table missing), so both must have been created directly via
-- `prisma db push` against an earlier version of kapmeta/schema.prisma (the
-- same origin story established for the rest of this database -- see
-- 0045's header) that had no updatedAt field on either model. Both models'
-- CURRENT schema.prisma definitions do declare `updatedAt DateTime
-- @default(now()) @updatedAt @map("updated_at")` -- schema.prisma was
-- edited after that push and `prisma db push` (or an equivalent migration)
-- was never re-run, so the live tables never picked up the change. This is
-- the exact same "code/schema moved on, the raw table did not" shape as
-- every other bug in this repair series, just without a raw-SQL migration
-- file to pin the blame on.
--
-- No FK/UUID concerns here: updated_at is a plain TIMESTAMPTZ column with
-- no relation to any other table's id, so there is nothing to convert to
-- TEXT.

BEGIN;

ALTER TABLE user_quick_links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE notifications    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMIT;
