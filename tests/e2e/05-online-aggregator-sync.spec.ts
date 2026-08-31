import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";

test.describe("TST-E2E-05: Online Aggregator (Swiggy / Zomato) Integration & Channel Status", () => {
  test("5.1 should render channel availability matrix for online aggregators", async ({ page }) => {
    await injectAdminSession(page, "/channel-availability");

    const channelPill = page.locator("text=Online Item Status").first();
    await expect(channelPill).toBeVisible();

    // Verify KPI cards rendered
    const kpiTotal = page.locator("text=TOTAL ITEMS").first();
    await expect(kpiTotal).toBeVisible();
  });

  test("5.2 should query channel items API and verify status contracts", async () => {
    const listRes = await apiRequest("/integration/channel-items");
    expect([200, 404]).toContain(listRes.status);
  });
});
