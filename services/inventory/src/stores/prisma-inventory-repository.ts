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
    const row = await (this.prisma as any).recipes.findFirst({
      where: { outlet_id: outletId, menu_item_id: menuItemId, is_active: true },
      include: { recipe_ingredients: true },
    });

    if (!row) {
      return null;
    }

    return {
      ingredients: (row.recipe_ingredients || []).map((ri: any) => ({
        ingredientId: ri.ingredient_id,
        quantity: Number(ri.quantity),
        yieldPercent: 100,
      })),
    };
  }

  async postMovements(outletId: string, orderId: string, movements: StockMovementResult[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const m of movements) {
        const current = await (tx as any).ingredients.findUnique({ where: { id: m.ingredientId } });
        if (current) {
          const newQty = Math.max(0, Number(current.current_stock_qty) + Number(m.quantity));
          await (tx as any).ingredients.update({
            where: { id: m.ingredientId },
            data: { current_stock_qty: newQty },
          });
        }
      }
    });
  }

  async postManualAdjustment(input: ManualAdjustmentInput, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ingredient = await (tx as any).ingredients.findUnique({ where: { id: input.ingredientId } });
      const beforeStock = ingredient ? Number(ingredient.current_stock_qty) : 0;
      const newStock = Math.max(0, beforeStock + Number(input.quantity));

      const updated = await (tx as any).ingredients.update({
        where: { id: input.ingredientId },
        data: { current_stock_qty: newStock },
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
