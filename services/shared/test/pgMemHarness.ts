// services/shared/test/pgMemHarness.ts
//
// Shared test helper: spins up a pg-mem in-memory Postgres-compatible
// database, loads the real schema from db-migrations/0001-0016 (the exact
// migration files this whole task is built against, not a hand-rolled test
// schema), and hands back something that satisfies the same `pg.Pool`
// surface (`.query(text, params)`) the Pg*Repository classes are written
// against — so tests exercise the real parameterized SQL, not a mock.
//
// Used because no live Postgres was reachable in this sandbox (`pg_isready`
// reported no response on the default socket) — see
// services/shared/src/db/README.md "How these repositories were verified".
//
// Two adjustments vs. the raw migration files, both required purely because
// pg-mem does not implement everything real Postgres does, NOT because the
// migrations are wrong:
//   1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` is stripped — pg-mem has
//      no extension loader — and `gen_random_uuid()` is registered directly
//      as a custom pg-mem function backed by Node's `crypto.randomUUID()`,
//      which is what pgcrypto's gen_random_uuid() does under the hood.
//   2. The `-- +migrate Down` half of each file is never run.
import { newDb, type IMemoryDb } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../../db/migrations');

export interface PgMemPool {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  connect(): Promise<{
    query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
    release(): void;
  }>;
  end(): Promise<void>;
}

function loadMigrations(db: IMemoryDb): void {
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as any,
    implementation: () => randomUUID(),
    // IMPORTANT: without `impure: true`, pg-mem treats this as a pure
    // function and memoizes its (zero-arg) result, handing out the SAME
    // "random" uuid to every row — causing spurious duplicate-key errors
    // the very first time two rows are inserted in the same pg-mem
    // instance without an explicit id.
    impure: true,
  } as any);
  const migrationFiles = [
    '0001_extensions_and_enums.sql',
    '0002_create_users.sql',
    '0003_create_outlets.sql',
    '0004_create_tables_and_sessions.sql',
    '0005_create_menu_categories_and_items.sql',
    '0006_create_menu_item_channel_and_availability.sql',
    '0007_create_taxes.sql',
    '0008_create_payment_type_master.sql',
    '0009_create_orders_and_order_items.sql',
    '0010_create_order_payments.sql',
    '0011_create_order_audit_log.sql',
    '0012_create_sales_returns.sql',
    '0013_create_outlet_billing_and_print_settings.sql',
    '0014_create_sync_backup_channel_log.sql',
    '0015_create_user_report_preferences.sql',
    '0016_extend_outlet_settings_jsonb.sql',
  ];
  for (const file of migrationFiles) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const upOnly = raw.split('-- +migrate Down')[0]!;
    const withoutExtension = upOnly.replace(/CREATE EXTENSION[^;]*;/g, '');
    db.public.none(withoutExtension);
  }
}

/** Creates a fresh pg-mem-backed pool with the full real schema loaded. */
export function createTestPool(): PgMemPool {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  loadMigrations(db);
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgMemPool;
}

/** Inserts a minimal outlet row (most tables FK to outlets) and returns its id. */
export async function seedOutlet(pool: PgMemPool, name = 'Test Outlet'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO outlets (name) VALUES ($1) RETURNING id`,
    [name],
  );
  return result.rows[0]!.id;
}

/** Inserts a minimal user row (order_audit_log.actor_id FKs to it) and returns its id. */
export async function seedUser(pool: PgMemPool, name = 'Test User'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (name, password_hash) VALUES ($1, 'x') RETURNING id`,
    [name],
  );
  return result.rows[0]!.id;
}

/** Inserts a minimal menu_item row (order_items FKs to it) and returns its id. */
export async function seedMenuItem(
  pool: PgMemPool,
  outletId: string,
  name = 'Test Item',
): Promise<string> {
  const category = await pool.query<{ id: string }>(
    `INSERT INTO menu_categories (outlet_id, name) VALUES ($1, $2) RETURNING id`,
    [outletId, `${name} Category`],
  );
  const item = await pool.query<{ id: string }>(
    `INSERT INTO menu_items (outlet_id, category_id, name, price)
     VALUES ($1, $2, $3, 100) RETURNING id`,
    [outletId, category.rows[0]!.id, name],
  );
  return item.rows[0]!.id;
}
