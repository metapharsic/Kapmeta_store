// services/shared/src/db/Pool.ts
//
// Thin singleton wrapper around a node-postgres `pg.Pool`. Every
// Pg*Repository class takes a `Pool` (or the narrower `Queryable`
// interface below) via constructor injection rather than calling
// `getPool()` itself, so tests can hand it a pg-mem pool instead. `getPool()`
// exists only for the composition root (apps/api/src/container.ts, owned by
// a sibling agent) to obtain the one real pool the process uses.
//
// Connection config: either a single `DATABASE_URL` env var, or the
// discrete `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` vars that
// node-postgres already reads by default. `DATABASE_URL` wins if set.

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Narrow interface capturing the subset of `pg.Pool` / `pg.PoolClient` that
 * repositories actually use. Both a real `pg.Pool` and a `pg.PoolClient`
 * (checked out inside a transaction) satisfy this, so repository methods
 * can accept either without caring which.
 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

let singleton: Pool | null = null;

function buildConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return { connectionString };
  }
  // Falls through to node-postgres's own PGHOST/PGPORT/PGUSER/PGPASSWORD/
  // PGDATABASE env var handling when no explicit config is passed.
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

/** Returns the single process-wide `pg.Pool`, creating it on first call. */
export function getPool(): Pool {
  if (!singleton) {
    singleton = new Pool(buildConfig());
  }
  return singleton;
}

/** Test/shutdown helper: closes and clears the singleton so a fresh one is
 * created on the next `getPool()` call. Not used in normal request flow. */
export async function closePool(): Promise<void> {
  if (singleton) {
    await singleton.end();
    singleton = null;
  }
}

/**
 * Runs `fn` inside a single client checked out from `pool`, wrapped in a
 * BEGIN/COMMIT (ROLLBACK on throw). Used by any repository method that
 * writes to more than one table atomically (e.g. create-order-with-items,
 * the audit-logged overrideTotal, or the per-outlet bill/kot sequence
 * counter's SELECT ... FOR UPDATE).
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
