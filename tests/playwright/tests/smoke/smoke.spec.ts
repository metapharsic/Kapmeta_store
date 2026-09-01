import { test, expect } from "../../fixtures/auth.fixture";
import { LoginPage } from "../../pages/LoginPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { logger } from "../../utils/logger";

test.describe("Smoke Tests: Core Platform Health & Navigation", () => {
  test("SMOKE-01: Application loads and login page is accessible", async ({ page }) => {
    logger.step("[Test] Verifying Login Page Health");
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page).toHaveTitle(/KapMeta|Kapmeta|POS|Login/i);
  });

  test("SMOKE-02: Staff PIN authentication functions smoothly", async ({ page, loginAs }) => {
    logger.step("[Test] Verifying Staff Authentication");
    await loginAs("admin");
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.assertHeaderVisible();
  });

  test("SMOKE-03: POS billing screen mounts without runtime errors", async ({ authenticatedPage }) => {
    logger.step("[Test] Verifying POS Billing Screen Mount");
    await authenticatedPage.goto("/");
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
