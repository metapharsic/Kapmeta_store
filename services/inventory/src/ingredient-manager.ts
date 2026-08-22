import { PrismaClient } from "@prisma/client";

export class IngredientManager {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async listIngredients(outletId: string) {
    return await this.prisma.ingredient.findMany({
      where: { outletId },
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
    return await this.prisma.ingredient.create({
      data: {
        outletId,
        name,
        unitOfMeasure,
        reorderLevel,
        unitCost,
        currentStock: 0,
      },
    });
  }

  async listRecipes(outletId: string) {
    return await this.prisma.recipe.findMany({
      where: { outletId, isActive: true },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
        menuItem: {
          select: {
            id: true,
            name: true,
            price: true,
            isVeg: true,
          },
        },
      },
    });
  }

  async getRecipeByMenuItem(outletId: string, menuItemId: string) {
    return await this.prisma.recipe.findFirst({
      where: { outletId, menuItemId, isActive: true },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });
  }

  async createRecipe(
    outletId: string,
    menuItemId: string,
    ingredients: { ingredientId: string; quantity: number; yieldPercent: number }[]
  ) {
    // Transaction to ensure Recipe and its RecipeIngredients are created atomically
    return await this.prisma.$transaction(async (tx) => {
      // Deactivate previous active recipes for this menu item
      await tx.recipe.updateMany({
        where: { outletId, menuItemId, isActive: true },
        data: { isActive: false },
      });

      const recipe = await tx.recipe.create({
        data: {
          outletId,
          menuItemId,
          version: 1,
          isActive: true,
        },
      });

      for (const ing of ingredients) {
        await tx.recipeIngredient.create({
          data: {
            recipeId: recipe.id,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            yieldPercent: ing.yieldPercent,
          },
        });
      }
      return recipe;
    });
  }

  async getIngredientStock(outletId: string, ingredientId: string) {
    const ing = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
    });
    if (!ing || ing.outletId !== outletId) {
      throw new Error("Ingredient not found");
    }
    return ing.currentStock;
  }
}
