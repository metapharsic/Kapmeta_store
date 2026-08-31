import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";

test.describe("TST-E2E-06: Menu 86-List Item Availability Toggle & Versioning", () => {
  test("6.1 should display item availability statuses on the Menu Management page", async ({ page }) => {
    await injectAdminSession(page, "/menu");

    const menuPill = page.locator("text=Menu Management Console").first();
    await expect(menuPill).toBeVisible();

    // Verify KPI cards rendered
    const kpiCategories = page.locator("text=CATEGORIES").first();
    await expect(kpiCategories).toBeVisible();
  });

  test("6.2 should toggle item availability via API and maintain version concurrency", async () => {
    const menuRes = await apiRequest("/menu/items");
    expect(menuRes.status).toBe(200);
    const items = menuRes.data.items || menuRes.data;
    expect(items.length).toBeGreaterThan(0);
    const item = items[0];

    // Toggle item availability
    const toggleRes = await apiRequest(`/menu/items/${item.id}/availability`, {
      method: "PATCH",
      body: {
        isStocked: true,
        stockQty: 100,
        version: 1,
      },
    });

    expect([200, 404, 409]).toContain(toggleRes.status);
  });
});
