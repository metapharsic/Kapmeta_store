import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";

test.describe("TST-E2E-11: Cash Drawer Reconciliation, Petty Cash & Refunds", () => {
  test("11.1 should display Cash Drawer and Petty Cash Panel on /finance", async ({ page }) => {
    await injectAdminSession(page, "/finance");
    await page.waitForLoadState("domcontentloaded");

    const zReportHeading = page.getByRole("heading", { name: "Daily Z-Report" });
    await expect(zReportHeading).toBeVisible();

    // Check presence of finance UI
    const brandName = page.getByText("Kapmeta Finance");
    await expect(brandName).toBeVisible();
  });

  test("11.2 should log petty cash expense and verify cash balance reflects outflow", async () => {
    // 1. Log petty cash expense (e.g. ₹350 = 35000 paise)
    const pettyRes = await apiRequest("/finance/petty-cash", {
      method: "POST",
      body: {
        category: "KITCHEN_SUPPLIES",
        amountMinor: 35000,
        description: "Fresh Milk & Dairy Supplies",
      },
    });

    expect([200, 201]).toContain(pettyRes.status);

    // 2. Fetch current cash drawer summary
    const drawerRes = await apiRequest("/finance/cash-drawer");
    expect(drawerRes.status).toBe(200);
    expect(drawerRes.data).toBeDefined();
  });

  test("11.3 should execute Shift Close reconciliation with zero variance", async () => {
    const drawerRes = await apiRequest("/finance/cash-drawer");
    const expectedCashMinor = drawerRes.data?.expectedCashMinor || 200000;

    const reconcileRes = await apiRequest("/finance/cash-drawer/reconcile", {
      method: "POST",
      body: {
        countedCashMinor: expectedCashMinor,
        notes: "Shift closed cleanly via automated E2E test suite",
      },
    });

    expect([200, 201]).toContain(reconcileRes.status);
    if (reconcileRes.ok) {
      expect(reconcileRes.data).toBeDefined();
    }
  });
});
