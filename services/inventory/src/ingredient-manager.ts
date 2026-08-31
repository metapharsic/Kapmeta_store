import { PrismaClient } from "@prisma/client";

export class IngredientManager {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async listIngredients(outletId: string) {
    return await (this.prisma as any).ingredients.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: { name: "asc" },
    });
  }

  async createIngredient(
    outletId: string,
    name: string,
    unitOfMeasure: string,
    reorderLevel: number,
    unitCost: number
  ) {
    return await (this.prisma as any).ingredients.create({
      data: {
        outlet_id: outletId,
        name,
        unit_of_measure: unitOfMeasure,
        reorder_level: reorderLevel,
        unit_cost_minor: Math.round(unitCost * 100),
        current_stock_qty: 0,
      },
    });
  }

  async listRecipes(outletId: string) {
    return await (this.prisma as any).recipes.findMany({
      where: { outlet_id: outletId, is_active: true },
      include: {
        recipe_ingredients: true,
      },
    });
  }

  async getRecipeByMenuItem(outletId: string, menuItemId: string) {
    return await (this.prisma as any).recipes.findFirst({
      where: { outlet_id: outletId, menu_item_id: menuItemId, is_active: true },
      include: {
        recipe_ingredients: true,
      },
    });
  }

  async createRecipe(
    outletId: string,
    menuItemId: string,
    ingredients: { ingredientId: string; quantity: number; yieldPercent: number }[]
  ) {
    return await this.prisma.$transaction(async (tx) => {
      await (tx as any).recipes.updateMany({
        where: { outlet_id: outletId, menu_item_id: menuItemId, is_active: true },
        data: { is_active: false },
      });

      const recipe = await (tx as any).recipes.create({
        data: {
          outlet_id: outletId,
          menu_item_id: menuItemId,
          name: "Recipe",
          is_active: true,
        },
      });

      for (const ing of ingredients) {
        await (tx as any).recipe_ingredients.create({
          data: {
            recipe_id: recipe.id,
            ingredient_id: ing.ingredientId,
            quantity: ing.quantity,
          },
        });
      }
      return recipe;
    });
  }

  async getIngredientStock(outletId: string, ingredientId: string) {
    const ing = await (this.prisma as any).ingredients.findUnique({
      where: { id: ingredientId },
    });
    if (!ing || ing.outlet_id !== outletId) {
      throw new Error("Ingredient not found");
    }
    return ing.current_stock_qty;
  }
}
