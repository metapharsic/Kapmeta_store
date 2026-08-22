import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function seedInventory() {
  console.log("Loading inventory data from template...");
  const dataPath = path.resolve(__dirname, "../data/inventory-finance-template.json");
  
  if (!fs.existsSync(dataPath)) {
    console.error("inventory-finance-template.json not found!");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  
  // Hardcode the first outlet for seeding purposes
  const outlet = await prisma.outlet.findFirst();
  if (!outlet) {
    console.error("No outlet found! Please run the main kapmeta/seed.ts first.");
    process.exit(1);
  }
  const outletId = outlet.id;

  console.log(`Seeding for Outlet ID: ${outletId}`);

  // 1. Seed Ingredients
  const ingredientNameMap = new Map<string, string>();
  for (const ing of data.ingredients) {
    const created = await prisma.ingredient.create({
      data: {
        outletId,
        name: ing.name,
        unitOfMeasure: ing.unitOfMeasure,
        reorderLevel: ing.reorderLevel,
        unitCost: ing.unitCost,
        currentStock: 100 // Seed with some initial stock
      }
    });
    ingredientNameMap.set(ing.name, created.id);
    console.log(`Created ingredient: ${ing.name}`);
  }

  // 2. Seed Recipes
  for (const recipe of data.recipes) {
    // Find the menu item by name
    const menuItem = await prisma.menuItem.findFirst({
      where: { name: recipe.menuItemName, outletId }
    });

    if (!menuItem) {
      console.warn(`MenuItem '${recipe.menuItemName}' not found. Skipping recipe.`);
      continue;
    }

    // Create Recipe
    const createdRecipe = await prisma.recipe.create({
      data: {
        outletId,
        menuItemId: menuItem.id,
        version: 1,
        isActive: true
      }
    });

    // Create Recipe Ingredients
    for (const recipeIng of recipe.ingredients) {
      const ingredientId = ingredientNameMap.get(recipeIng.ingredientName);
      if (!ingredientId) {
        console.warn(`Ingredient '${recipeIng.ingredientName}' not found for recipe.`);
        continue;
      }

      await prisma.recipeIngredient.create({
        data: {
          recipeId: createdRecipe.id,
          ingredientId,
          quantity: recipeIng.quantity,
          yieldPercent: recipeIng.yieldPercent
        }
      });
    }
    console.log(`Created recipe for: ${recipe.menuItemName}`);
  }

  // 3. Seed Vendors
  for (const vendor of data.vendors) {
    await prisma.vendor.create({
      data: {
        outletId,
        name: vendor.name,
        phone: vendor.phone,
        email: vendor.email,
        taxNumber: vendor.taxNumber
      }
    });
    console.log(`Created vendor: ${vendor.name}`);
  }

  console.log("Inventory seeding completed successfully!");
}

seedInventory()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
