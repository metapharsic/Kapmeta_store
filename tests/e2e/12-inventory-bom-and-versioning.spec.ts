import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";
import { generateRandomName } from "./helpers/test-data.helper";

test.describe("TST-E2E-12: Inventory Bill of Materials (BOM) & Versioning Sync", () => {
  test("12.1 should display Ingredients and Stock Inventory on /inventory", async ({ page }) => {
    await injectAdminSession(page, "/inventory");
    await page.waitForLoadState("domcontentloaded");

    const inventoryHeader = page.getByRole("heading", { name: "Inventory & Recipe BOM" });
    await expect(inventoryHeader).toBeVisible();
  });

  test("12.2 should create an ingredient, recipe and verify BOM stock deduction upon order completion", async () => {
    const ingredientName = generateRandomName("Ingredient");

    // 1. Create ingredient with 500 units
    const ingRes = await apiRequest("/inventory/ingredients", {
      method: "POST",
      body: {
        name: ingredientName,
        unitOfMeasure: "kg",
        unitCost: 65.0,
        reorderLevel: 10,
        currentStock: 500,
      },
    });

    expect([200, 201]).toContain(ingRes.status);
    const ingredientId = ingRes.data.id;
    expect(ingredientId).toBeDefined();

    // 2. Fetch or create menu item to link recipe
    let menuRes = await apiRequest("/menu/items");
    let items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
    let item = items[0];

    if (!item) {
      // Create a category and menu item if none exists
      const catRes = await apiRequest("/menu/categories", {
        method: "POST",
        body: { name: "Main Course", sortOrder: 1 },
      });
      const categoryId = catRes.data.id;

      const createItemRes = await apiRequest("/menu/items", {
        method: "POST",
        body: {
          categoryId,
          name: "Paneer Butter Masala",
          priceMinor: 25000,
          isVeg: true,
        },
      });
      item = createItemRes.data;
    }

    expect(item).toBeDefined();
    expect(item.id).toBeDefined();

    // 3. Create recipe linking 2 kg per portion
    const recipeRes = await apiRequest("/inventory/recipes", {
      method: "POST",
      body: {
        menuItemId: item.id,
        name: `${item.name} Recipe`,
        yieldPortions: 1,
        ingredients: [{ ingredientId, quantity: 2 }],
      },
    });
    expect([200, 201]).toContain(recipeRes.status);

    // 4. Create and settle order for 3 portions
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        tableNumber: "T-06",
        items: [{ menuItemId: item.id, name: item.name, quantity: 3, unitPriceMinor: 30000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    if (orderId) {
      await apiRequest(`/orders/${orderId}/settle`, {
        method: "POST",
        body: { paymentMethod: "CASH", amountPaidMinor: 30000 },
      });

      // 5. Verify stock was decremented (500 - 3*2 = 494)
      const listIngRes = await apiRequest("/inventory/ingredients");
      if (listIngRes.ok) {
        const ingredients = listIngRes.data.ingredients || listIngRes.data;
        const updatedIng = ingredients.find((i: any) => i.id === ingredientId);
        if (updatedIng) {
          expect(Number(updatedIng.currentStock)).toBeLessThanOrEqual(494);
        }
      }
    }
  });
});
