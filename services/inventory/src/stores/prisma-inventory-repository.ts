import { PrismaClient } from "@prisma/client";
import type { InventoryRepository, ActiveRecipe } from "../consumption-service";
import type { StockMovementResult, ManualAdjustmentInput } from "@kapmeta/shared-types/inventory";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";
import { writeNotification } from "@kapmeta/notifications";

// Manual adjustments at or beyond this magnitude are unusual enough to warrant
// surfacing in the Action Center (as opposed to routine small corrections).
// Kept as a structural threshold, not business/content data — see CLAUDE.md.
const UNUSUAL_ADJUSTMENT_QUANTITY = 50;

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveRecipe(outletId: string, menuItemId: string): Promise<ActiveRecipe | null> {
    const row = await this.prisma.recipe.findFirst({
      where: { outletId, menuItemId, isActive: true },
      include: { ingredients: true },
    });

    if (!row) {
      return null;
    }

    return {
      ingredients: row.ingredients.map((ri) => ({
        ingredientId: ri.ingredientId,
        quantity: ri.quantity.toNumber(),
        yieldPercent: ri.yieldPercent.toNumber(),
      })),
    };
  }

  async postMovements(outletId: string, orderId: string, movements: StockMovementResult[]): Promise<void> {
    // Ingredient.currentStock is a cached balance alongside the StockMovement
    // ledger. Every movement must update both in the same transaction — a
    // ledger entry with no cache update leaves the cache silently stale.
    await this.prisma.$transaction(async (tx) => {
      for (const m of movements) {
        await tx.stockMovement.create({
          data: {
            outletId,
            ingredientId: m.ingredientId,
            movementType: m.movementType,
            quantity: m.quantity,
            referenceType: "ORDER",
            referenceId: orderId,
          },
        });
        await tx.ingredient.update({
          where: { id: m.ingredientId },
          data: { currentStock: { increment: m.quantity } },
        });
      }
    });
  }

  async postManualAdjustment(input: ManualAdjustmentInput, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findUnique({ where: { id: input.ingredientId } });
      const beforeStock = ingredient?.currentStock.toNumber();

      await tx.stockMovement.create({
        data: {
          outletId: input.outletId,
          ingredientId: input.ingredientId,
          movementType: input.movementType,
          quantity: input.quantity,
          referenceType: "MANUAL",
          reasonCode: input.reasonCode,
        },
      });
      const updated = await tx.ingredient.update({
        where: { id: input.ingredientId },
        data: { currentStock: { increment: input.quantity } },
      });

      await writeAuditLog(tx, {
        outletId: input.outletId,
        userId,
        action: "STOCK_ADJUSTED",
        entityType: "STOCK",
        entityId: input.ingredientId,
        beforeState: { currentStock: beforeStock },
        afterState: { currentStock: updated.currentStock.toNumber() },
        reasonCode: input.reasonCode,
      });

      if (Math.abs(input.quantity) >= UNUSUAL_ADJUSTMENT_QUANTITY) {
        await writeNotification(tx, {
          outletId: input.outletId,
          type: "STOCK_ADJUSTMENT_UNUSUAL",
          title: "Unusual stock adjustment",
          message: `A ${input.movementType.toLowerCase()} of ${input.quantity} units was recorded for ingredient ${input.ingredientId} (reason: ${input.reasonCode}).`,
          entityType: "STOCK",
          entityId: input.ingredientId,
        });
      }
    });
  }
}
