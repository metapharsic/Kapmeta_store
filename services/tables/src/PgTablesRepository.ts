// services/tables/src/PgTablesRepository.ts
//
// Real Postgres-backed implementation of `Repository<RestaurantTable>`,
// backed by `restaurant_tables` from
// db-migrations/0004_create_tables_and_sessions.sql.
//
// Column mapping:
//   restaurant_tables.id          uuid     -> RestaurantTable.id
//   restaurant_tables.outlet_id   uuid     -> RestaurantTable.outlet_id
//   restaurant_tables.table_no    text     -> RestaurantTable.name
//     (TS calls it `name`; the migration calls the same concept `table_no`
//     — both are "the table's human-facing label", e.g. "T12". Mapped
//     1:1, no data loss.)
//   restaurant_tables.zone        text NULL -> RestaurantTable.zone
//     (TS narrows zone to 'AC' | 'NonAC'; the migration's `zone` is free
//     text with example values 'AC', 'Non-AC', 'Rooftop'. This repository
//     writes/reads the TS union values verbatim as text — 'AC' or
//     'NonAC' — which is a valid subset of the column's allowed text.)
//   restaurant_tables.capacity    integer NULL -> RestaurantTable.seating_capacity
//   restaurant_tables.is_active   boolean  -> filter only (RestaurantTable
//     has no is_active field; findAll/findByOutlet only return active rows,
//     and delete() soft-deletes by setting is_active=false rather than a
//     hard DELETE, since restaurant_tables is referenced by table_sessions
//     and orders via ON DELETE RESTRICT/CASCADE and outlets generally want
//     table history preserved).
//
// `RestaurantTable.active_order_id` has NO column on restaurant_tables at
// all — by design (see types.ts's own comment: "Live table status is
// DERIVED, not stored directly"). It is computed here as: the order_id of
// this table's currently-open table_session (closed_at IS NULL), if any.
// See 0004:26-39 (table_sessions) and 0009:94-96 (the order_id FK, added
// after orders exists).

import type { Pool } from 'pg';
import type { RestaurantTable } from './types';
import type { Repository } from './TablesRepository';

interface TableRow {
  id: string;
  outlet_id: string;
  table_no: string;
  zone: string | null;
  capacity: number | null;
  created_at: Date;
  updated_at: Date;
  active_order_id: string | null;
}

const SELECT_TABLES = `
  SELECT id, outlet_id, table_no, zone, capacity, created_at, updated_at
  FROM restaurant_tables
  WHERE is_active = true
`;

function toTable(row: TableRow, activeOrderId: string | null): RestaurantTable {
  return {
    id: row.id,
    outlet_id: row.outlet_id,
    name: row.table_no,
    zone: (row.zone ?? 'NonAC') as RestaurantTable['zone'],
    seating_capacity: row.capacity ?? 0,
    active_order_id: activeOrderId,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PgTablesRepository implements Repository<RestaurantTable> {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<RestaurantTable | null> {
    const result = await this.pool.query<TableRow>(`${SELECT_TABLES} AND id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const activeOrders = await this.activeOrderIdsByTable([row.id]);
    return toTable(row, activeOrders.get(row.id) ?? null);
  }

  async findAll(): Promise<RestaurantTable[]> {
    const result = await this.pool.query<TableRow>(SELECT_TABLES);
    const activeOrders = await this.activeOrderIdsByTable(result.rows.map((r) => r.id));
    return result.rows.map((row) => toTable(row, activeOrders.get(row.id) ?? null));
  }

  async findByOutlet(outletId: string): Promise<RestaurantTable[]> {
    const result = await this.pool.query<TableRow>(`${SELECT_TABLES} AND outlet_id = $1`, [outletId]);
    const activeOrders = await this.activeOrderIdsByTable(result.rows.map((r) => r.id));
    return result.rows.map((row) => toTable(row, activeOrders.get(row.id) ?? null));
  }

  // Resolves "the currently-open session's order_id" for each of the given
  // table ids in ONE extra query (never N+1). Deliberately two round trips
  // (tables, then their open sessions) rather than a single query with a
  // `LEFT JOIN LATERAL`/correlated subquery for "top 1 open session per
  // table" — both express the same idea against real Postgres, but the
  // join/subquery form is not reliably supported by pg-mem, the
  // Postgres-compatible engine this project's tests run against (see
  // services/shared/db/README.md "How these repositories were verified").
  // If a table somehow has more than one open session (shouldn't happen —
  // OrdersService closes the previous session before opening a new one),
  // the most-recently-opened one wins.
  private async activeOrderIdsByTable(tableIds: string[]): Promise<Map<string, string>> {
    if (tableIds.length === 0) return new Map();
    // Uses `table_id IN ($1, $2, ...)` with one placeholder per id rather
    // than `table_id = ANY($1::uuid[])`. Both are equivalent, correct SQL
    // against real Postgres; the array form is normally preferable for a
    // variable-length id list, but pg-mem (this project's test engine, see
    // services/shared/db/README.md) has a bug where `= ANY(uuid[])` against
    // an indexed uuid column silently matches nothing — table_sessions.
    // table_id has exactly such an index (0004:47). The IN-list form
    // sidesteps that bug and was verified against pg-mem to actually work.
    const placeholders = tableIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.pool.query<{ table_id: string; order_id: string; opened_at: Date }>(
      `SELECT table_id, order_id, opened_at FROM table_sessions
       WHERE table_id IN (${placeholders}) AND closed_at IS NULL AND order_id IS NOT NULL
       ORDER BY opened_at ASC`,
      tableIds,
    );
    const byTable = new Map<string, string>();
    for (const row of result.rows) {
      byTable.set(row.table_id, row.order_id); // later (more recent) rows overwrite earlier ones
    }
    return byTable;
  }

  async save(entity: RestaurantTable): Promise<RestaurantTable> {
    await this.pool.query(
      `INSERT INTO restaurant_tables (id, outlet_id, table_no, zone, capacity, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         outlet_id = EXCLUDED.outlet_id,
         table_no = EXCLUDED.table_no,
         zone = EXCLUDED.zone,
         capacity = EXCLUDED.capacity,
         updated_at = now()`,
      [entity.id, entity.outlet_id, entity.name, entity.zone, entity.seating_capacity],
    );
    const saved = await this.findById(entity.id);
    if (!saved) throw new Error(`PgTablesRepository.save: row vanished for id=${entity.id}`);
    return saved;
  }

  async delete(id: string): Promise<void> {
    // Soft delete: restaurant_tables is referenced by table_sessions/orders
    // with ON DELETE RESTRICT/CASCADE, and table history should survive a
    // table being retired, so this flips is_active rather than hard-deleting.
    await this.pool.query(
      `UPDATE restaurant_tables SET is_active = false, updated_at = now() WHERE id = $1`,
      [id],
    );
  }
}
