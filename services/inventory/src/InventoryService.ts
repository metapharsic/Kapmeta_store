import { randomUUID } from 'node:crypto';
import type {
  RawMaterial,
  PurchaseOrder,
  StockMovement,
  StockMovementReason,
  OrderItemForDeduction,
} from './types';
import { roundMoney } from './types';
import type {
  InMemoryInventoryRepository,
  InMemoryRecipeRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryStockMovementRepository,
} from './InventoryRepository';

export class InsufficientStockError extends Error {
  constructor(
    public readonly rawMaterialId: string,
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Insufficient stock for raw material ${rawMaterialId}: available ${available}, requested ${requested}`,
    );
    this.name = 'InsufficientStockError';
  }
}

export class RawMaterialNotFoundError extends Error {
  constructor(public readonly rawMaterialId: string) {
    super(`Raw material not found: ${rawMaterialId}`);
    this.name = 'RawMaterialNotFoundError';
  }
}

export class PurchaseOrderNotFoundError extends Error {
  constructor(public readonly purchaseOrderId: string) {
    super(`Purchase order not found: ${purchaseOrderId}`);
    this.name = 'PurchaseOrderNotFoundError';
  }
}

export class PurchaseOrderAlreadyReceivedError extends Error {
  constructor(public readonly purchaseOrderId: string) {
    super(`Purchase order already received: ${purchaseOrderId}`);
    this.name = 'PurchaseOrderAlreadyReceivedError';
  }
}

export interface InventoryServiceConfig {
  /** When false (default), deductStockForOrder throws InsufficientStockError
   * rather than letting a raw material's stock go negative. When true,
   * deductions are always applied and stock is allowed to go negative. */
  allowNegativeStock?: boolean;
}

export interface InventoryServiceDeps {
  repository: InMemoryInventoryRepository;
  recipeRepository: InMemoryRecipeRepository;
  purchaseOrderRepository: InMemoryPurchaseOrderRepository;
  stockMovementRepository: InMemoryStockMovementRepository;
  config?: InventoryServiceConfig;
}

/**
 * Core inventory business logic: stock deduction on order sales, receiving
 * purchase orders, and audited manual adjustments.
 *
 * PROPOSAL — see README.md. No confirmed spec/screenshot evidence exists
 * for inventory behavior; this implements a reasonable default policy.
 */
export class InventoryService {
  private readonly repository: InMemoryInventoryRepository;
  private readonly recipeRepository: InMemoryRecipeRepository;
  private readonly purchaseOrderRepository: InMemoryPurchaseOrderRepository;
  private readonly stockMovementRepository: InMemoryStockMovementRepository;
  private readonly allowNegativeStock: boolean;

  constructor(deps: InventoryServiceDeps) {
    this.repository = deps.repository;
    this.recipeRepository = deps.recipeRepository;
    this.purchaseOrderRepository = deps.purchaseOrderRepository;
    this.stockMovementRepository = deps.stockMovementRepository;
    this.allowNegativeStock = deps.config?.allowNegativeStock ?? false;
  }

  /**
   * Deducts raw material stock for a sold order by walking each item's
   * recipe. Writes one StockMovement (reason='sale') per raw material
   * consumed. If allowNegativeStock is false (default) and any raw
   * material's resulting stock would go negative, the whole call throws
   * InsufficientStockError and NO movements are written or stock changed
   * (all-or-nothing).
   */
  async deductStockForOrder(
    orderId: string,
    items: OrderItemForDeduction[],
  ): Promise<StockMovement[]> {
    // Aggregate total raw-material consumption across all items/recipes
    // first, so a single raw material referenced by multiple menu items is
    // checked/deducted once, atomically.
    const totalConsumption = new Map<string, number>();

    for (const item of items) {
      const recipe = await this.recipeRepository.findById(item.menuItemId);
      if (!recipe) {
        // No recipe defined for this menu item — nothing to deduct for it.
        continue;
      }
      for (const line of recipe.lines) {
        const consumed = line.qty * item.quantity;
        totalConsumption.set(
          line.rawMaterialId,
          (totalConsumption.get(line.rawMaterialId) ?? 0) + consumed,
        );
      }
    }

    // Validate availability before writing anything, unless negative stock
    // is explicitly allowed.
    const materials = new Map<string, RawMaterial>();
    for (const [rawMaterialId, qty] of totalConsumption) {
      const material = await this.repository.findById(rawMaterialId);
      if (!material) {
        throw new RawMaterialNotFoundError(rawMaterialId);
      }
      materials.set(rawMaterialId, material);

      if (!this.allowNegativeStock && material.currentStock - qty < 0) {
        throw new InsufficientStockError(rawMaterialId, material.currentStock, qty);
      }
    }

    const movements: StockMovement[] = [];
    const now = new Date().toISOString();

    for (const [rawMaterialId, qty] of totalConsumption) {
      const material = materials.get(rawMaterialId)!;
      const delta = roundMoney(-qty);
      material.currentStock = roundMoney(material.currentStock + delta);
      await this.repository.save(material);

      const movement: StockMovement = {
        id: randomUUID(),
        rawMaterialId,
        delta,
        reason: 'sale',
        refOrderId: orderId,
        at: now,
      };
      await this.stockMovementRepository.save(movement);
      movements.push(movement);
    }

    return movements;
  }

  /**
   * Marks a draft purchase order as received and writes one StockMovement
   * (reason='purchase') per line, increasing each raw material's stock.
   */
  async receivePurchaseOrder(poId: string): Promise<StockMovement[]> {
    const po = await this.purchaseOrderRepository.findById(poId);
    if (!po) {
      throw new PurchaseOrderNotFoundError(poId);
    }
    if (po.status === 'received') {
      throw new PurchaseOrderAlreadyReceivedError(poId);
    }

    const movements: StockMovement[] = [];
    const now = new Date().toISOString();

    for (const line of po.lines) {
      const material = await this.repository.findById(line.rawMaterialId);
      if (!material) {
        throw new RawMaterialNotFoundError(line.rawMaterialId);
      }

      const delta = roundMoney(line.qty);
      material.currentStock = roundMoney(material.currentStock + delta);
      await this.repository.save(material);

      const movement: StockMovement = {
        id: randomUUID(),
        rawMaterialId: line.rawMaterialId,
        delta,
        reason: 'purchase',
        refOrderId: po.id,
        at: now,
      };
      await this.stockMovementRepository.save(movement);
      movements.push(movement);
    }

    po.status = 'received';
    po.receivedAt = now;
    await this.purchaseOrderRepository.save(po);

    return movements;
  }

  /**
   * Manually adjusts a raw material's stock (e.g. wastage, stock-take
   * correction), writing an audited StockMovement carrying the actor.
   */
  async adjustStock(
    rawMaterialId: string,
    delta: number,
    reason: StockMovementReason,
    actorId: string,
  ): Promise<StockMovement> {
    const material = await this.repository.findById(rawMaterialId);
    if (!material) {
      throw new RawMaterialNotFoundError(rawMaterialId);
    }

    const roundedDelta = roundMoney(delta);
    const resultingStock = roundMoney(material.currentStock + roundedDelta);
    if (!this.allowNegativeStock && resultingStock < 0) {
      throw new InsufficientStockError(rawMaterialId, material.currentStock, -roundedDelta);
    }

    material.currentStock = resultingStock;
    await this.repository.save(material);

    const movement: StockMovement = {
      id: randomUUID(),
      rawMaterialId,
      delta: roundedDelta,
      reason,
      actorId,
      at: new Date().toISOString(),
    };
    await this.stockMovementRepository.save(movement);

    return movement;
  }
}
