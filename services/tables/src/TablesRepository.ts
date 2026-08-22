import type { RestaurantTable, TableSession } from './types';

/**
 * Placeholder in-memory repository, mirroring OrdersRepository's pattern.
 * Will be replaced by a Postgres-backed implementation in Phase 2-3.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export class InMemoryTablesRepository implements Repository<RestaurantTable> {
  private readonly store = new Map<string, RestaurantTable>();

  async findById(id: string): Promise<RestaurantTable | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<RestaurantTable[]> {
    return Array.from(this.store.values()).map((t) => structuredClone(t));
  }

  async findByOutlet(outletId: string): Promise<RestaurantTable[]> {
    return Array.from(this.store.values())
      .filter((t) => t.outlet_id === outletId)
      .map((t) => structuredClone(t));
  }

  async save(entity: RestaurantTable): Promise<RestaurantTable> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryTableSessionsRepository implements Repository<TableSession> {
  private readonly store = new Map<string, TableSession>();

  async findById(id: string): Promise<TableSession | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<TableSession[]> {
    return Array.from(this.store.values()).map((s) => structuredClone(s));
  }

  async findOpenByTableId(tableId: string): Promise<TableSession | null> {
    const found = Array.from(this.store.values()).find(
      (s) => s.table_id === tableId && s.closed_at === null,
    );
    return found ? structuredClone(found) : null;
  }

  async save(entity: TableSession): Promise<TableSession> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
