import type {
  MovementType,
  RecipeConsumptionLine,
  StockMovementResult,
  ConsumeStockResult,
  ManualAdjustmentInput,
} from "@kapmeta/shared-types/inventory";

export interface ActiveRecipe {
  ingredients: Array<{ ingredientId: string; quantity: number; yieldPercent: number }>;
}

export interface InventoryRepository {
  findActiveRecipe(outletId: string, menuItemId: string): Promise<ActiveRecipe | null>;
  postMovements(outletId: string, orderId: string, movements: StockMovementResult[]): Promise<void>;
  postManualAdjustment(input: ManualAdjustmentInput, userId: string): Promise<void>;
}

export function explodeRecipe(recipe: ActiveRecipe, orderLineQuantity: number): StockMovementResult[] {
  return recipe.ingredients.map((ingredient) => {
    const requiredQty = ingredient.quantity * orderLineQuantity;
    const consumedQty = requiredQty / (ingredient.yieldPercent / 100);
    return {
      ingredientId: ingredient.ingredientId,
      movementType: "CONSUMPTION" as MovementType,
      quantity: -consumedQty,
    };
  });
}

export async function consumeForOrderLine(
  outletId: string,
  orderId: string,
  line: RecipeConsumptionLine,
  repo: InventoryRepository,
): Promise<ConsumeStockResult> {
  const recipe = await repo.findActiveRecipe(outletId, line.menuItemId);
  if (recipe === null) {
    return { ok: false, reason: "NO_RECIPE", menuItemId: line.menuItemId };
  }
  const movements = explodeRecipe(recipe, line.quantity);
  await repo.postMovements(outletId, orderId, movements);
  return { ok: true, movements };
}

export async function recordManualAdjustment(
  input: ManualAdjustmentInput,
  repo: InventoryRepository,
  userId: string,
): Promise<void> {
  if (!input.reasonCode || input.reasonCode.trim().length === 0) {
    throw new Error("reasonCode is mandatory for WASTAGE/ADJUSTMENT movements");
  }
  await repo.postManualAdjustment(input, userId);
}
