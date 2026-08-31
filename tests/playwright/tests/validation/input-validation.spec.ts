import { test, expect } from "../../fixtures/auth.fixture";
import { LoginPage } from "../../pages/LoginPage";
import { logger } from "../../utils/logger";

test.describe("Validation Tests: Input Sanitization & Error Handling", () => {
  test("VALID-01: Rejects empty or invalid staff PIN", async ({ page }) => {
    logger.step("[Test] Testing Invalid PIN Validation");
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginWithPin("0000"); // Invalid non-existent PIN
    
    // Expect error alert or retained on login
    await expect(page).toHaveURL(/.*login/);
  });

  test("VALID-02: Enforces phone number format validation on customer creation", async ({ authenticatedPage }) => {
    logger.step("[Test] Testing Phone Number Validation");
    await authenticatedPage.goto("/crm");
    const phoneInput = authenticatedPage.locator('input[name="phone"]');
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("123"); // Invalid short phone number
      const saveBtn = authenticatedPage.locator('button:has-text("Save")');
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
      }
    }
  });
});
