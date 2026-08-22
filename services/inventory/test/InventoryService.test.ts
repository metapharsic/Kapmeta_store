import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryService, InsufficientStockError } from '../src/InventoryService';
import {
  InMemoryInventoryRepository,
  InMemoryRecipeRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryStockMovementRepository,
} from '../src/InventoryRepository';
import type { RawMaterial, Recipe, PurchaseOrder } from '../src/types';

function makeService(allowNegativeStock = false) {
  const repository = new InMemoryInventoryRepository();
  const recipeRepository = new InMemoryRecipeRepository();
  const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();
  const stockMovementRepository = new InMemoryStockMovementRepository();

  const service = new InventoryService({
    repository,
    recipeRepository,
    purchaseOrderRepository,
    stockMovementRepository,
    config: { allowNegativeStock },
  });

  return { service, repository, recipeRepository, purchaseOrderRepository, stockMovementRepository };
}

async function seedPaneerTikka(repository: InMemoryInventoryRepository, recipeRepository: InMemoryRecipeRepository) {
  const paneer: RawMaterial = {
    id: 'rm_paneer',
    outletId: 'outlet_1',
    name: 'Paneer',
    unit: 'g',
    currentStock: 1000,
  };
  const oil: RawMaterial = {
    id: 'rm_oil',
    outletId: 'outlet_1',
    name: 'Oil',
    unit: 'ml',
    currentStock: 500,
  };
  await repository.save(paneer);
  await repository.save(oil);

  const recipe: Recipe = {
    menuItemId: 'menu_paneer_tikka',
    lines: [
      { rawMaterialId: 'rm_paneer', qty: 150 },
      { rawMaterialId: 'rm_oil', qty: 20 },
    ],
  };
  await recipeRepository.save(recipe);
}

describe('InventoryService.deductStockForOrder', () => {
  it('deducts stock per raw material and writes sale movements (happy path)', async () => {
    const { service, repository, recipeRepository, stockMovementRepository } = makeService();
    await seedPaneerTikka(repository, recipeRepository);

    const movements = await service.deductStockForOrder('order_1', [
      { menuItemId: 'menu_paneer_tikka', quantity: 2 },
    ]);

    const paneer = await repository.findById('rm_paneer');
    const oil = await repository.findById('rm_oil');
    expect(paneer?.currentStock).toBe(700); // 1000 - 150*2
    expect(oil?.currentStock).toBe(460); // 500 - 20*2

    expect(movements).toHaveLength(2);
    for (const m of movements) {
      expect(m.reason).toBe('sale');
      expect(m.refOrderId).toBe('order_1');
      expect(m.delta).toBeLessThan(0);
    }

    const allMovements = await stockMovementRepository.findAll();
    expect(allMovements).toHaveLength(2);
  });

  it('throws InsufficientStockError and writes no movements when stock would go negative', async () => {
    const { service, repository, recipeRepository, stockMovementRepository } = makeService();
    await seedPaneerTikka(repository, recipeRepository);

    await expect(
      service.deductStockForOrder('order_2', [{ menuItemId: 'menu_paneer_tikka', quantity: 100 }]),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const paneer = await repository.findById('rm_paneer');
    expect(paneer?.currentStock).toBe(1000); // unchanged

    const allMovements = await stockMovementRepository.findAll();
    expect(allMovements).toHaveLength(0);
  });

  it('allows negative stock when allowNegativeStock is true', async () => {
    const { service, repository, recipeRepository } = makeService(true);
    await seedPaneerTikka(repository, recipeRepository);

    const movements = await service.deductStockForOrder('order_3', [
      { menuItemId: 'menu_paneer_tikka', quantity: 100 },
    ]);
    expect(movements).toHaveLength(2);

    const paneer = await repository.findById('rm_paneer');
    expect(paneer?.currentStock).toBeLessThan(0);
  });
});

describe('InventoryService.receivePurchaseOrder', () => {
  it('increases raw material stock and writes purchase movements', async () => {
    const { service, repository, purchaseOrderRepository, stockMovementRepository } = makeService();

    const paneer: RawMaterial = {
      id: 'rm_paneer',
      outletId: 'outlet_1',
      name: 'Paneer',
      unit: 'g',
      currentStock: 200,
    };
    await repository.save(paneer);

    const po: PurchaseOrder = {
      id: 'po_1',
      outletId: 'outlet_1',
      supplierId: 'supplier_1',
      lines: [{ rawMaterialId: 'rm_paneer', qty: 500 }],
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    await purchaseOrderRepository.save(po);

    const movements = await service.receivePurchaseOrder('po_1');

    expect(movements).toHaveLength(1);
    expect(movements[0].reason).toBe('purchase');
    expect(movements[0].delta).toBe(500);

    const updated = await repository.findById('rm_paneer');
    expect(updated?.currentStock).toBe(700);

    const updatedPo = await purchaseOrderRepository.findById('po_1');
    expect(updatedPo?.status).toBe('received');
    expect(updatedPo?.receivedAt).toBeTruthy();

    const allMovements = await stockMovementRepository.findAll();
    expect(allMovements).toHaveLength(1);
  });

  it('rejects receiving an already-received purchase order', async () => {
    const { service, repository, purchaseOrderRepository } = makeService();

    await repository.save({
      id: 'rm_oil',
      outletId: 'outlet_1',
      name: 'Oil',
      unit: 'ml',
      currentStock: 100,
    });

    await purchaseOrderRepository.save({
      id: 'po_2',
      outletId: 'outlet_1',
      supplierId: 'supplier_1',
      lines: [{ rawMaterialId: 'rm_oil', qty: 50 }],
      status: 'received',
      createdAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    });

    await expect(service.receivePurchaseOrder('po_2')).rejects.toThrow();
  });
});

describe('InventoryService.adjustStock', () => {
  it('writes an audited adjustment movement carrying the actor and updates stock', async () => {
    const { service, repository, stockMovementRepository } = makeService();

    await repository.save({
      id: 'rm_tomato',
      outletId: 'outlet_1',
      name: 'Tomato',
      unit: 'kg',
      currentStock: 10,
    });

    const movement = await service.adjustStock('rm_tomato', -2, 'wastage', 'actor_1');

    expect(movement.delta).toBe(-2);
    expect(movement.reason).toBe('wastage');
    expect(movement.actorId).toBe('actor_1');

    const updated = await repository.findById('rm_tomato');
    expect(updated?.currentStock).toBe(8);

    const allMovements = await stockMovementRepository.findAll();
    expect(allMovements).toHaveLength(1);
    expect(allMovements[0].id).toBe(movement.id);
  });

  it('blocks an adjustment that would take stock negative when allowNegativeStock is false', async () => {
    const { service, repository } = makeService();

    await repository.save({
      id: 'rm_tomato',
      outletId: 'outlet_1',
      name: 'Tomato',
      unit: 'kg',
      currentStock: 3,
    });

    await expect(
      service.adjustStock('rm_tomato', -5, 'wastage', 'actor_1'),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const updated = await repository.findById('rm_tomato');
    expect(updated?.currentStock).toBe(3);
  });
});
