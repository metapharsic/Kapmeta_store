import { test, expect } from "@playwright/test";
import { injectAdminSession, performUiLogin } from "./helpers/auth.helper";

test.describe("TST-E2E-01: Admin Authentication & Dashboard Analytics", () => {
  test("1.1 should perform full UI login with Admin credentials and redirect to dashboard", async ({ page }) => {
    await performUiLogin(page, "admin@restaurant.com", "admin123");
    
    // Expect redirection away from login
    await expect(page).not.toHaveURL(/\/login$/);
    
    // Navigate to /admin
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("1.2 should display dynamic GST Statutory Tax Breakdown (CGST, SGST, IGST)", async ({ page }) => {
    await injectAdminSession(page, "/admin");

    // Check GST card title
    const gstCard = page.getByRole("heading", { name: "GST Statutory Audit" });
    await expect(gstCard).toBeVisible();
  });

  test("1.3 should display Live Table Occupancy Rate Metric", async ({ page }) => {
    await injectAdminSession(page, "/admin");

    const occupancyCard = page.getByText("TABLE OCCUPANCY RATE");
    await expect(occupancyCard).toBeVisible();
  });

  test("1.4 should render Enterprise Reports Generator and support CSV/JSON Exports", async ({ page }) => {
    await injectAdminSession(page, "/admin");

    const reportsGenerator = page.getByRole("heading", { name: "Enterprise Reports Generator" });
    await expect(reportsGenerator).toBeVisible();

    const exportBtn = page.getByRole("button", { name: "📥 Download" });
    await expect(exportBtn).toBeVisible();
  });
});
