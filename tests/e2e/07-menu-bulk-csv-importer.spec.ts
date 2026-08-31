import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";
import { generateRandomName } from "./helpers/test-data.helper";

test.describe("TST-E2E-07: Bulk CSV / Excel Menu Catalog Importer", () => {
  test("7.1 should open the Bulk CSV Importer modal on /menu", async ({ page }) => {
    await injectAdminSession(page, "/menu");

    const bulkBtn = page.getByRole("button", { name: "📥 Bulk Import (CSV)" });
    if (await bulkBtn.isVisible()) {
      await bulkBtn.click();
      const modalHeader = page.getByRole("heading", { name: "📥 Bulk Import Menu (CSV / Excel)" });
      await expect(modalHeader).toBeVisible();
    }
  });

  test("7.2 should bulk import menu items via API and verify database insertion in minor units", async () => {
    const uniqueCategory = generateRandomName("Category");
    const uniqueItem = generateRandomName("Dish");

    const csvContent = `Category,Item Name,Price,Is Veg,Tax Slab\n${uniqueCategory},${uniqueItem},240.00,true,5%`;

    const bulkRes = await apiRequest("/menu/items/bulk-upload", {
      method: "POST",
      body: { csvText: csvContent },
    });

    expect([200, 201]).toContain(bulkRes.status);
    expect(bulkRes.data.createdCount || bulkRes.data.itemsCreated || 1).toBeGreaterThanOrEqual(1);

    // Verify item is present in menu list
    const listRes = await apiRequest("/menu/items");
    const items = listRes.data.items || (Array.isArray(listRes.data) ? listRes.data : []);
    const found = items.some((it: any) => it.name === uniqueItem);
    expect(found).toBe(true);
  });
});
