// services/tables/test/PgTablesRepository.test.ts
//
// Exercises PgTablesRepository and PgTableSessionsRepository against a
// pg-mem database loaded with the real schema (see
// ../../shared/test/pgMemHarness.ts and PgOrdersRepository.test.ts's file
// header for why pg-mem and how to point this at a real Postgres instead).

import { describe, expect, it } from 'vitest';
import { createTestPool, seedOutlet, type PgMemPool } from '../../shared/test/pgMemHarness';
import { PgTablesRepository } from '../src/PgTablesRepository';
import { PgTableSessionsRepository } from '../src/PgTableSessionsRepository';
import type { RestaurantTable, TableSession } from '../src/types';

async function seedOrder(pool: PgMemPool, outletId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO orders (outlet_id, channel, status) VALUES ($1, 'dine_in', 'open') RETURNING id`,
    [outletId],
  );
  return result.rows[0]!.id;
}

describe('PgTablesRepository', () => {
  it('round-trips a table through save/findById, mapping name<->table_no and seating_capacity<->capacity', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTablesRepository(pool as any);

    const table: RestaurantTable = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      name: 'T12',
      zone: 'AC',
      seating_capacity: 4,
      active_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await repo.save(table);

    const found = await repo.findById(table.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('T12');
    expect(found!.seating_capacity).toBe(4);
    expect(found!.active_order_id).toBeNull();
  });

  it('derives active_order_id from the currently-open table_session, not a stored column', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const tablesRepo = new PgTablesRepository(pool as any);
    const sessionsRepo = new PgTableSessionsRepository(pool as any);

    const table: RestaurantTable = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      name: 'T1',
      zone: 'NonAC',
      seating_capacity: 2,
      active_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await tablesRepo.save(table);
    expect((await tablesRepo.findById(table.id))!.active_order_id).toBeNull();

    const orderId = await seedOrder(pool, outletId);
    const session: TableSession = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      table_id: table.id,
      order_id: orderId,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };
    await sessionsRepo.save(session);

    const withOrder = await tablesRepo.findById(table.id);
    expect(withOrder!.active_order_id).toBe(orderId);

    await sessionsRepo.save({ ...session, closed_at: new Date().toISOString() });
    const afterClose = await tablesRepo.findById(table.id);
    expect(afterClose!.active_order_id).toBeNull();
  });

  it('delete() soft-deletes (is_active=false) rather than hard-deleting', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTablesRepository(pool as any);
    const table: RestaurantTable = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      name: 'T9',
      zone: 'AC',
      seating_capacity: 6,
      active_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await repo.save(table);
    await repo.delete(table.id);

    expect(await repo.findById(table.id)).toBeNull();
    const rawRow = await pool.query(`SELECT is_active FROM restaurant_tables WHERE id = $1`, [table.id]);
    expect(rawRow.rows[0]!.is_active).toBe(false);
  });
});

describe('PgTableSessionsRepository', () => {
  it('findOpenByTableId returns only the session with closed_at IS NULL', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const tablesRepo = new PgTablesRepository(pool as any);
    const sessionsRepo = new PgTableSessionsRepository(pool as any);
    const table: RestaurantTable = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      name: 'T2',
      zone: 'AC',
      seating_capacity: 2,
      active_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await tablesRepo.save(table);

    const closedOrderId = await seedOrder(pool, outletId);
    await sessionsRepo.save({
      id: crypto.randomUUID(),
      outlet_id: outletId,
      table_id: table.id,
      order_id: closedOrderId,
      opened_at: new Date(Date.now() - 60_000).toISOString(),
      closed_at: new Date().toISOString(),
    });

    expect(await sessionsRepo.findOpenByTableId(table.id)).toBeNull();

    const openOrderId = await seedOrder(pool, outletId);
    const openSession: TableSession = {
      id: crypto.randomUUID(),
      outlet_id: outletId,
      table_id: table.id,
      order_id: openOrderId,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };
    await sessionsRepo.save(openSession);

    const found = await sessionsRepo.findOpenByTableId(table.id);
    expect(found).not.toBeNull();
    expect(found!.order_id).toBe(openOrderId);
  });
});
