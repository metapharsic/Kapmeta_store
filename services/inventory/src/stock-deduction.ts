import { PrismaClient } from "@prisma/client";

export interface OrderSettledEvent {
  invoiceId: string;
  orderId: string;
  outletId: string;
}

export class StockDeductionWorker {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  // Subscribe to events
  start(subscriber?: (handler: (event: OrderSettledEvent) => void) => void) {
    if (subscriber) {
      subscriber(this.handleOrderSettled.bind(this));
    }
    console.log("[StockDeductionWorker] Started listening for invoice.settled events");
  }

  async handleOrderSettled(event: OrderSettledEvent) {
    try {
      console.log(`[StockDeductionWorker] Processing order ${event.orderId} for outlet ${event.outletId}`);
      
      const orderItems = await this.prisma.orderItem.findMany({
        where: { orderId: event.orderId, outletId: event.outletId }
      });

      for (const item of orderItems) {
        // Find active recipe for this menu item
        const recipe = await this.prisma.recipe.findFirst({
          where: { outletId: event.outletId, menuItemId: item.menuItemId, isActive: true },
          include: { ingredients: true }
        });

        if (!recipe) {
          continue; // No recipe, no stock to deduct
        }

        // Deduct stock for each ingredient in the recipe
        await this.prisma.$transaction(async (tx) => {
          for (const recipeIngredient of recipe.ingredients) {
            // Calculate total quantity to deduct based on order item quantity
            const totalQuantityToDeduct = Number(recipeIngredient.quantity) * item.quantity;

            // Update ingredient current stock
            const ingredient = await tx.ingredient.update({
              where: { id: recipeIngredient.ingredientId },
              data: { currentStock: { decrement: totalQuantityToDeduct } }
            });

            // Create stock movement record
            await tx.stockMovement.create({
              data: {
                outletId: event.outletId,
                ingredientId: ingredient.id,
                movementType: "CONSUMPTION",
                quantity: -totalQuantityToDeduct,
                referenceType: "ORDER",
                referenceId: event.orderId,
                reasonCode: "SALE"
              }
            });

            // Reorder level alert check could be added here
            if (Number(ingredient.currentStock) <= Number(ingredient.reorderLevel)) {
              console.log(`[StockAlert] Ingredient ${ingredient.name} (${ingredient.id}) is below reorder level (${ingredient.reorderLevel}) in outlet ${event.outletId}`);
            }
          }
        });
      }
    } catch (error) {
      console.error(`[StockDeductionWorker] Error processing order ${event.orderId}:`, error);
    }
  }
}
