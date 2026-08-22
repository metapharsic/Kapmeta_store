import type { Order } from './types';

/**
 * Generic repository interface. This is a placeholder abstraction for the
 * real Postgres-backed repository that Phase 2-3's migrations define.
 * Keeping the interface generic lets OrdersService be written once and
 * later wired to a real DB-backed implementation without changing any
 * business logic.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory implementation, backed by a Map. NOT for production use —
 * has no persistence, no transactions, no concurrency control. Purely so
 * OrdersService can be fully unit-tested today without a live database.
 */
export class InMemoryOrdersRepository implements Repository<Order> {
  private readonly store = new Map<string, Order>();

  async findById(id: string): Promise<Order | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<Order[]> {
    return Array.from(this.store.values()).map((o) => structuredClone(o));
  }

  async findByOutlet(outletId: string): Promise<Order[]> {
    return Array.from(this.store.values())
      .filter((o) => o.outlet_id === outletId)
      .map((o) => structuredClone(o));
  }

  async save(entity: Order): Promise<Order> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
