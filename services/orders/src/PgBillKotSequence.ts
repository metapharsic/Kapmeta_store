// services/orders/src/PgBillKotSequence.ts
//
// Real, transactionally-safe replacement for the in-memory BillKotSequence
// (see BillKotSequence.ts's own doc comment for the requirement it must
// satisfy: no two POS terminals at the same outlet may ever be handed the
// same bill_no/kot_no).
//
// WHY NOT A PLAIN `SERIAL`/`bigserial`:
// A Postgres `SERIAL`/sequence object is a single, database-wide counter.
// bill_no/kot_no must be sequential PER OUTLET (1, 2, 3... starting fresh
// for each outlet), per the sync architecture decision recorded in
// 0009_create_orders_and_order_items.sql ("outlets can operate offline on a
// LAN and must not depend on a single global sequence"; bill_no/kot_no are
// modeled as plain `bigint`, explicitly NOT `serial`/`bigserial`, precisely
// to keep this generation strategy out of the schema). A single shared
// SERIAL would hand out globally-increasing numbers shared across every
// outlet (e.g. outlet A gets bill_no 1, 4, 9 while outlet B gets 2, 3, 5...),
// which is not "per-outlet-local sequential", and a fleet of per-outlet
// SERIAL objects (one CREATE SEQUENCE per outlet row) is not practical since
// outlets are created dynamically at runtime via admin CRUD, not at
// migration time — you cannot CREATE SEQUENCE from a migration for a row
// that does not exist yet.
//
// Instead this uses a dedicated small counter table, `outlet_bill_kot_seq`
// (one row per outlet, lazily inserted on first use), and takes the next
// number via `SELECT ... FOR UPDATE` (a row-level lock) followed by an
// `UPDATE`, both inside one transaction. Two POS terminals racing to bill
// the same outlet serialize on that row lock: the second transaction blocks
// until the first commits, then reads the already-incremented value. This
// is exactly the strategy the in-memory class's own doc comment calls out
// as the correct real implementation.
//
// NOTE ON THE COUNTER TABLE: `outlet_bill_kot_seq` is not created by any of
// the 0001-0015 migrations (or 0099's seed). It is created by this file's
// companion migration-equivalent DDL, run lazily via `ensureSchema()` the
// first time a Pool is used, since no migration file for it exists yet in
// db-migrations/. A real deployment should instead add a proper numbered
// migration (e.g. 0017_create_outlet_bill_kot_seq.sql) with this same DDL
// and drop the lazy `ensureSchema()` call — it exists here only so this
// class is runnable/testable without requiring a human to author that
// migration first. See services/shared/src/db/README.md.

import type { Pool } from 'pg';
import { withTransaction } from '../../shared/src/db/Pool';

// Split into CREATE TABLE + a separate ALTER TABLE ADD CONSTRAINT for the FK
// (rather than one inline `uuid PRIMARY KEY REFERENCES outlets (id) ON
// DELETE RESTRICT`) — both forms are valid, equivalent Postgres; this repo
// runs its statements through node-postgres's prepared-statement path,
// which some Postgres-compatible engines (used in this project's test
// harness, see services/shared/test/pgMemHarness.ts) parse more reliably
// as two separate statements than as one combined column-constraint list.
// Columns store the LAST ISSUED number (0 = none issued yet), not "the next
// number to hand out" — nextValue()/peekValue() below both assume this.
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS outlet_bill_kot_seq (
    outlet_id     uuid PRIMARY KEY,
    next_bill_no  bigint NOT NULL DEFAULT 0,
    next_kot_no   bigint NOT NULL DEFAULT 0
)`;

const ADD_FK_SQL = `
ALTER TABLE outlet_bill_kot_seq
  ADD CONSTRAINT fk_outlet_bill_kot_seq_outlet
  FOREIGN KEY (outlet_id) REFERENCES outlets (id) ON DELETE RESTRICT`;

export class PgBillKotSequence {
  private schemaEnsured = false;
  private ensuring: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  /** Idempotently creates the counter table. Safe to call repeatedly and
   * concurrently — concurrent callers share one in-flight DDL promise
   * rather than each firing their own CREATE TABLE/ALTER TABLE, which is
   * both wasteful and (on at least one Postgres-compatible test engine)
   * unsafe to run in parallel against the same not-yet-existing table. */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    if (!this.ensuring) {
      this.ensuring = this.runEnsureSchema();
    }
    await this.ensuring;
  }

  private async runEnsureSchema(): Promise<void> {
    await this.pool.query(CREATE_TABLE_SQL);
    try {
      await this.pool.query(ADD_FK_SQL);
    } catch (err) {
      // ADD CONSTRAINT has no IF NOT EXISTS form; swallow only the
      // "constraint already exists" case (e.g. a second process racing
      // ensureSchema()) and rethrow anything else.
      const message = err instanceof Error ? err.message : String(err);
      if (!/already exists/i.test(message)) throw err;
    }
    this.schemaEnsured = true;
  }

  async nextBillNo(outletId: string): Promise<number> {
    return this.nextValue(outletId, 'next_bill_no');
  }

  async nextKotNo(outletId: string): Promise<number> {
    return this.nextValue(outletId, 'next_kot_no');
  }

  async peekBillNo(outletId: string): Promise<number> {
    return this.peekValue(outletId, 'next_bill_no');
  }

  async peekKotNo(outletId: string): Promise<number> {
    return this.peekValue(outletId, 'next_kot_no');
  }

  private async nextValue(
    outletId: string,
    column: 'next_bill_no' | 'next_kot_no',
  ): Promise<number> {
    await this.ensureSchema();
    return withTransaction(this.pool, async (client) => {
      // Lazily create the outlet's counter row if this is its first ever
      // bill/kot. ON CONFLICT DO NOTHING keeps this race-safe even if two
      // terminals hit a brand-new outlet at the same instant — the row
      // insert itself is atomic, and the SELECT ... FOR UPDATE below is
      // what actually serializes the increment.
      await client.query(
        `INSERT INTO outlet_bill_kot_seq (outlet_id) VALUES ($1)
         ON CONFLICT (outlet_id) DO NOTHING`,
        [outletId],
      );
      const locked = await client.query<{ value: string }>(
        `SELECT ${column} AS value FROM outlet_bill_kot_seq
         WHERE outlet_id = $1 FOR UPDATE`,
        [outletId],
      );
      const current = Number(locked.rows[0]?.value ?? 0);
      const next = current + 1;
      await client.query(
        `UPDATE outlet_bill_kot_seq SET ${column} = $2 WHERE outlet_id = $1`,
        [outletId, next],
      );
      return next;
    });
  }

  private async peekValue(
    outletId: string,
    column: 'next_bill_no' | 'next_kot_no',
  ): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query<{ value: string }>(
      `SELECT ${column} AS value FROM outlet_bill_kot_seq WHERE outlet_id = $1`,
      [outletId],
    );
    // Column stores the last-issued value directly, matching the in-memory
    // class's peek*No() semantics: 0 when the outlet has never been billed.
    return Number(result.rows[0]?.value ?? 0);
  }
}
