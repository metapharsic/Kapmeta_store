// Contract for services/inventory. DEC-003 (approved, Option B): automatic
// ingredient deduction from stock based on active recipes on order
// completion; manual adjustments for waste. Maps to kapmeta/schema.prisma
// Ingredient, Recipe, RecipeIngredient, StockMovement.

export type MovementType = "CONSUMPTION" | "RECEIPT" | "WASTAGE" | "ADJUSTMENT" | "TRANSFER";

export interface RecipeConsumptionLine {
  menuItemId: string;
  quantity: number; // order line quantity, not ingredient quantity
}

export interface StockMovementResult {
  ingredientId: string;
  movementType: MovementType;
  quantity: number; // signed
}

export type ConsumeStockResult =
  | { ok: true; movements: StockMovementResult[] }
  | { ok: false; reason: "NO_RECIPE"; menuItemId: string }; // per WF-INV-01: log exception, alert, never blocks order

export interface ManualAdjustmentInput {
  outletId: string;
  ingredientId: string;
  movementType: "WASTAGE" | "ADJUSTMENT";
  quantity: number; // signed
  reasonCode: string; // mandatory per source doc — never optional for these two types
}
