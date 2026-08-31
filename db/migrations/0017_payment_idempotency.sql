-- Migration: 0017_payment_idempotency
-- Purpose: Add idempotency_key to payments table to prevent duplicate charges
--          on network retries or double-tap of the Collect button.
-- Strategy: Backfill existing rows with uuid_generate_v4() before applying UNIQUE constraint.

-- Step 1: Add idempotency_key as nullable first (safe for existing data)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Step 2: Backfill existing payments with generated UUIDs
UPDATE payments
  SET idempotency_key = gen_random_uuid()::TEXT
  WHERE idempotency_key IS NULL;

-- Step 3: Apply NOT NULL constraint now that all rows are filled
ALTER TABLE payments
  ALTER COLUMN idempotency_key SET NOT NULL;

-- Step 4: Ensure globally unique (per outlet + key) to prevent cross-outlet collisions
ALTER TABLE payments
  ADD CONSTRAINT payments_idempotency_key_unique UNIQUE (idempotency_key);
