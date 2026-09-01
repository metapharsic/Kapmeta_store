-- Seat & merge data model (artifact-02), step 1: enum types used by the
-- merge-group, table-seat and per-seat-bill tables added in the migrations
-- that follow. dining_tables.status stays TEXT for now: the running app
-- writes an "AVAILABLE" status value (apps/api/src/routes/orders.ts) that is
-- not one of this enum's labels, so converting the column here would risk
-- breaking that write path. The enum is created so it is ready to adopt once
-- that inconsistency is cleaned up; dining_tables.status is not altered.

BEGIN;

DO $$ BEGIN
  CREATE TYPE dining_table_status AS ENUM (
    'VACANT', 'SEATED', 'OCCUPIED', 'RESERVED', 'MERGED_MEMBER', 'DIRTY', 'BLOCKED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE table_merge_status AS ENUM ('ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE seat_status AS ENUM ('EMPTY', 'SEATED', 'ORDERED', 'BILLED', 'SETTLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
