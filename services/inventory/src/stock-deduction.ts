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
        const recipe = await (this.prisma as any).recipes.findFirst({
          where: { outlet_id: event.outletId, menu_item_id: item.menuItemId, is_active: true },
          include: { recipe_ingredients: true }
        });

        if (!recipe) {
          continue; // No recipe, no stock to deduct
        }

        // Deduct stock for each ingredient in the recipe
        await this.prisma.$transaction(async (tx) => {
          for (const recipeIngredient of (recipe.recipe_ingredients || [])) {
            // Calculate total quantity to deduct based on order item quantity
            const totalQuantityToDeduct = Number(recipeIngredient.quantity) * Number(item.quantity);

            const existing = await (tx as any).ingredients.findUnique({
              where: { id: recipeIngredient.ingredient_id }
            });

            if (existing) {
              const newStock = Math.max(0, Number(existing.current_stock_qty) - totalQuantityToDeduct);
              await (tx as any).ingredients.update({
                where: { id: recipeIngredient.ingredient_id },
                data: { current_stock_qty: newStock }
              });

              if (newStock <= Number(existing.reorder_level)) {
                console.log(`[StockAlert] Ingredient ${existing.name} is below reorder level in outlet ${event.outletId}`);
              }
            }
          }
        });
      }
    } catch (error) {
      console.error(`[StockDeductionWorker] Error processing order ${event.orderId}:`, error);
    }
  }
}
