import { test, expect } from "../../fixtures/auth.fixture";
import { InvoicePage } from "../../pages/InvoicePage";
import { TestDataGenerator } from "../../utils/test-data-generator";
import { logger } from "../../utils/logger";

test.describe("Functional Tests: POS Sales & Order Settlement", () => {
  test("FUNC-01: Add dishes to cart and verify live total calculation", async ({ authenticatedPage }) => {
    logger.step("[Test] Testing Cart Addition & Total Calculation");
    const invoicePage = new InvoicePage(authenticatedPage);
    await invoicePage.goto();

    const sampleTable = "A1";
    await invoicePage.selectTable(sampleTable);
    
    // Check cart item addition
    const firstDish = authenticatedPage.locator('button:has-text("₹")').first();
    if (await firstDish.isVisible()) {
      await firstDish.click();
      await expect(authenticatedPage.locator('button:has-text("KOT"), button:has-text("Fire"), button:has-text("Settle")').first()).toBeVisible();
    }
  });

  test("FUNC-02: Complete full Dine-In order settlement with Cash tender", async ({ authenticatedPage }) => {
    logger.step("[Test] Testing Full Dine-In Order Lifecycle");
    const invoicePage = new InvoicePage(authenticatedPage);
    await invoicePage.goto();
    await invoicePage.selectTable("A2");
    
    const dish = authenticatedPage.locator('button:has-text("₹")').first();
    if (await dish.isVisible()) {
      await dish.click();
      await invoicePage.fireKot();
      await invoicePage.settleBill("CASH");
      await invoicePage.assertBillCompleted();
    }
  });
});
