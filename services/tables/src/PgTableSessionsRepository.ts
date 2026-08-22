// services/tables/src/PgTableSessionsRepository.ts
//
// Real Postgres-backed implementation of `Repository<TableSession>`, backed
// by `table_sessions` from db-migrations/0004_create_tables_and_sessions.sql
// (order_id FK added later, in 0009:94-96).
//
// Column mapping:
//   table_sessions.id          uuid          -> TableSession.id
//   table_sessions.outlet_id   uuid          -> TableSession.outlet_id
//   table_sessions.table_id    uuid          -> TableSession.table_id
//   table_sessions.order_id    uuid NULL      -> TableSession.order_id
//     (the migration allows NULL — a session can in principle exist before
//     an order is attached — but TableSession.order_id is typed as a
//     required `string`. In practice callers always create a session with
//     its order already known (OrdersService opens the session and the
//     order together), so this repository treats a NULL order_id as a data
//     error and throws on read rather than silently coercing it, to fail
//     loudly instead of returning a lying TableSession.)
//   table_sessions.opened_at   timestamptz   -> TableSession.opened_at (ISO)
//   table_sessions.closed_at   timestamptz NULL -> TableSession.closed_at (ISO | null)
//   (status/kot_sent/covers/opened_by columns exist on table_sessions but
//   have no TableSession field counterpart; left at their column defaults.)

import type { Pool } from 'pg';
import type { TableSession } from './types';
import type { Repository } from './TablesRepository';

interface SessionRow {
  id: string;
  outlet_id: string;
  table_id: string;
  order_id: string | null;
  opened_at: Date;
  closed_at: Date | null;
}

function toSession(row: SessionRow): TableSession {
  if (row.order_id == null) {
    throw new Error(
      `PgTableSessionsRepository: table_sessions row ${row.id} has no order_id; ` +
        `TableSession.order_id is required. This session was likely created before ` +
        `its order — callers must attach an order before this row is read as a TableSession.`,
    );
  }
  return {
    id: row.id,
    outlet_id: row.outlet_id,
    table_id: row.table_id,
    order_id: row.order_id,
    opened_at: row.opened_at.toISOString(),
    closed_at: row.closed_at ? row.closed_at.toISOString() : null,
  };
}

export class PgTableSessionsRepository implements Repository<TableSession> {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<TableSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, outlet_id, table_id, order_id, opened_at, closed_at
       FROM table_sessions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toSession(row) : null;
  }

  async findAll(): Promise<TableSession[]> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, outlet_id, table_id, order_id, opened_at, closed_at
       FROM table_sessions WHERE order_id IS NOT NULL`,
    );
    return result.rows.map(toSession);
  }

  async findOpenByTableId(tableId: string): Promise<TableSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, outlet_id, table_id, order_id, opened_at, closed_at
       FROM table_sessions
       WHERE table_id = $1 AND closed_at IS NULL AND order_id IS NOT NULL
       ORDER BY opened_at DESC LIMIT 1`,
      [tableId],
    );
    const row = result.rows[0];
    return row ? toSession(row) : null;
  }

  async save(entity: TableSession): Promise<TableSession> {
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO table_sessions (id, outlet_id, table_id, order_id, opened_at, closed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         outlet_id = EXCLUDED.outlet_id,
         table_id = EXCLUDED.table_id,
         order_id = EXCLUDED.order_id,
         opened_at = EXCLUDED.opened_at,
         closed_at = EXCLUDED.closed_at,
         updated_at = now()
       RETURNING id, outlet_id, table_id, order_id, opened_at, closed_at`,
      [
        entity.id,
        entity.outlet_id,
        entity.table_id,
        entity.order_id,
        entity.opened_at,
        entity.closed_at,
      ],
    );
    return toSession(result.rows[0]!);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM table_sessions WHERE id = $1`, [id]);
  }
}
