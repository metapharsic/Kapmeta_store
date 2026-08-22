// services/admin/src/Repository.ts
//
// In-memory Repository<T> pattern, mirrored from sibling services
// (e.g. Orders service). Placeholder for Phase 2-3's Postgres schema.

export interface Repository<T extends { id: string }> {
  findById(id: string): T | undefined;
  findAll(): T[];
  findWhere(predicate: (item: T) => boolean): T[];
  insert(item: T): T;
  update(id: string, patch: Partial<T>): T | undefined;
  delete(id: string): boolean;
}

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private store = new Map<string, T>();

  findById(id: string): T | undefined {
    return this.store.get(id);
  }

  findAll(): T[] {
    return Array.from(this.store.values());
  }

  findWhere(predicate: (item: T) => boolean): T[] {
    return this.findAll().filter(predicate);
  }

  insert(item: T): T {
    this.store.set(item.id, item);
    return item;
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }
}
