import type { RawMaterial, Recipe, PurchaseOrder, StockMovement } from './types';

/**
 * Generic repository interface, mirroring the Orders service's
 * Repository<T> pattern. NOT backed by a live database — see
 * InMemory* implementations below.
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory implementation, backed by a Map. NOT for production use — has
 * no persistence, no transactions, no concurrency control. Purely so
 * InventoryService can be fully unit-tested today without a live database.
 */
export class InMemoryInventoryRepository implements Repository<RawMaterial> {
  private readonly store = new Map<string, RawMaterial>();

  async findById(id: string): Promise<RawMaterial | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<RawMaterial[]> {
    return Array.from(this.store.values()).map((m) => structuredClone(m));
  }

  async findByOutlet(outletId: string): Promise<RawMaterial[]> {
    return Array.from(this.store.values())
      .filter((m) => m.outletId === outletId)
      .map((m) => structuredClone(m));
  }

  async save(entity: RawMaterial): Promise<RawMaterial> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryRecipeRepository implements Repository<Recipe> {
  private readonly store = new Map<string, Recipe>();

  async findById(menuItemId: string): Promise<Recipe | null> {
    const found = this.store.get(menuItemId);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<Recipe[]> {
    return Array.from(this.store.values()).map((r) => structuredClone(r));
  }

  async save(entity: Recipe): Promise<Recipe> {
    this.store.set(entity.menuItemId, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(menuItemId: string): Promise<void> {
    this.store.delete(menuItemId);
  }
}

export class InMemoryPurchaseOrderRepository implements Repository<PurchaseOrder> {
  private readonly store = new Map<string, PurchaseOrder>();

  async findById(id: string): Promise<PurchaseOrder | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<PurchaseOrder[]> {
    return Array.from(this.store.values()).map((p) => structuredClone(p));
  }

  async save(entity: PurchaseOrder): Promise<PurchaseOrder> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryStockMovementRepository implements Repository<StockMovement> {
  private readonly store = new Map<string, StockMovement>();

  async findById(id: string): Promise<StockMovement | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<StockMovement[]> {
    return Array.from(this.store.values()).map((m) => structuredClone(m));
  }

  async findByRawMaterial(rawMaterialId: string): Promise<StockMovement[]> {
    return Array.from(this.store.values())
      .filter((m) => m.rawMaterialId === rawMaterialId)
      .map((m) => structuredClone(m));
  }

  async save(entity: StockMovement): Promise<StockMovement> {
    this.store.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
