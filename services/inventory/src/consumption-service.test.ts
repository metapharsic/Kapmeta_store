import { describe, it, expect } from "vitest";
import { explodeRecipe, recordManualAdjustment } from "./consumption-service";
import type { ActiveRecipe, InventoryRepository } from "./consumption-service";
import type { ManualAdjustmentInput, StockMovementResult } from "@kapmeta/shared-types/inventory";

describe("explodeRecipe", () => {
  it("applies consumed = (ingredient.quantity * orderLineQuantity) / (yieldPercent / 100) per ingredient", () => {
    const recipe: ActiveRecipe = {
      ingredients: [
        { ingredientId: "flour", quantity: 100, yieldPercent: 100 },
        { ingredientId: "cheese", quantity: 50, yieldPercent: 80 },
      ],
    };

    const movements = explodeRecipe(recipe, 1);

    const flour = movements.find((m) => m.ingredientId === "flour");
    const cheese = movements.find((m) => m.ingredientId === "cheese");

    expect(flour?.quantity).toBe(-100);
    expect(cheese?.quantity).toBe(-62.5);
  });

  it("returns CONSUMPTION movementType with negative quantity for every ingredient", () => {
    const recipe: ActiveRecipe = {
      ingredients: [
        { ingredientId: "flour", quantity: 100, yieldPercent: 100 },
        { ingredientId: "cheese", quantity: 50, yieldPercent: 80 },
        { ingredientId: "tomato", quantity: 20, yieldPercent: 90 },
      ],
    };

    const movements = explodeRecipe(recipe, 1);

    for (const movement of movements) {
      expect(movement.movementType).toBe("CONSUMPTION");
      expect(movement.quantity).toBeLessThan(0);
    }
  });

  it("scales consumed quantity with orderLineQuantity before yield adjustment", () => {
    const recipe: ActiveRecipe = {
      ingredients: [{ ingredientId: "flour", quantity: 100, yieldPercent: 100 }],
    };

    const single: StockMovementResult[] = explodeRecipe(recipe, 1);
    const doubled: StockMovementResult[] = explodeRecipe(recipe, 2);

    expect(single[0].quantity).toBe(-100);
    expect(doubled[0].quantity).toBe(-200);
  });
});

describe("recordManualAdjustment", () => {
  function makeFakeRepo(): InventoryRepository & { calls: ManualAdjustmentInput[] } {
    return {
      calls: [],
      async findActiveRecipe() {
        return null;
      },
      async postMovements() {
        return;
      },
      async postManualAdjustment(input: ManualAdjustmentInput) {
        this.calls.push(input);
      },
    };
  }

  it("throws when reasonCode is empty", async () => {
    const repo = makeFakeRepo();
    const input: ManualAdjustmentInput = {
      outletId: "outlet-1",
      ingredientId: "flour",
      movementType: "WASTAGE",
      quantity: -5,
      reasonCode: "",
    };

    await expect(recordManualAdjustment(input, repo, "user-test")).rejects.toThrow("reasonCode is mandatory");
  });

  it("throws when reasonCode is whitespace only", async () => {
    const repo = makeFakeRepo();
    const input: ManualAdjustmentInput = {
      outletId: "outlet-1",
      ingredientId: "flour",
      movementType: "ADJUSTMENT",
      quantity: 5,
      reasonCode: "   ",
    };

    await expect(recordManualAdjustment(input, repo, "user-test")).rejects.toThrow("reasonCode is mandatory");
  });

  it("calls through to repo.postManualAdjustment without throwing when reasonCode is valid", async () => {
    const repo = makeFakeRepo();
    const input: ManualAdjustmentInput = {
      outletId: "outlet-1",
      ingredientId: "flour",
      movementType: "WASTAGE",
      quantity: -5,
      reasonCode: "SPOILAGE",
    };

    await expect(recordManualAdjustment(input, repo, "user-test")).resolves.not.toThrow();
    expect(repo.calls).toEqual([input]);
  });
});
