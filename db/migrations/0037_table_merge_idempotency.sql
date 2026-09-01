-- Idempotency-key dedupe store for the table merge/unmerge API v2 (artifact-02 S4).
-- A single small table shared by both /tables/merge and /tables/unmerge: the caller
-- retries with the same idempotencyKey on network doubt, we replay the stored
-- response instead of re-running the operation.

BEGIN;

CREATE TABLE IF NOT EXISTS table_operation_idempotency (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  response_json   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_operation_idempotency_key
  ON table_operation_idempotency (outlet_id, endpoint, idempotency_key);

COMMIT;
