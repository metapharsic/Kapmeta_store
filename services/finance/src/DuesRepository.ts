import type { DueLedgerEntry } from './types';

/**
 * Generic repository interface, matching the pattern established in
 * services/orders/src/OrdersRepository.ts — a placeholder abstraction for
 * the real Postgres-backed repository.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory implementation, backed by a Map. NOT for production use — no
 * persistence, no transactions, no concurrency control. Purely so
 * DuesService can be fully unit-tested today without a live database.
 */
export class InMemoryDuesRepository implements Repository<DueLedgerEntry> {
  private readonly store = new Map<string, DueLedgerEntry>();

  async findById(id: string): Promise<DueLedgerEntry | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<DueLedgerEntry[]> {
    return Array.from(this.store.values()).map((d) => structuredClone(d));
  }

  async findByOutlet(outletId: string): Promise<DueLedgerEntry[]> {
    return Array.from(this.store.values())
      .filter((d) => d.outletId === outletId)
      .map((d) => structuredClone(d));
  }

  async findByCustomerPhone(customerPhone: string): Promise<DueLedgerEntry[]> {
    return Array.from(this.store.values())
      .filter((d) => d.customerPhone === customerPhone)
      .map((d) => structuredClone(d));
  }

  async save(entity: DueLedgerEntry): Promise<DueLedgerEntry> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
