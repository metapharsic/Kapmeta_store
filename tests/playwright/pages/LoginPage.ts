import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class LoginPage {
  readonly page: Page;
  readonly pinInput: Locator;
  readonly submitButton: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pinInput = page.locator('input[type="password"], input[name="pin"], [data-testid="pin-input"]');
    this.submitButton = page.locator('button:has-text("Login"), button:has-text("Submit"), [data-testid="btn-login"]');
    this.emailInput = page.locator('input[type="email"], input[name="email"]');
    this.passwordInput = page.locator('input[type="password"][name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.error, [role="alert"], .text-red-500');
  }

  async goto() {
    logger.step("Navigating to Login Page", `${currentEnv.baseUrl}/login`);
    await this.page.goto(`${currentEnv.baseUrl}/login`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async loginWithPin(pin: string) {
    logger.step("Performing Staff PIN Login", `PIN: ****`);
    // Enter PIN digits via touch keypad or input
    if (await this.pinInput.first().isVisible()) {
      await this.pinInput.first().fill(pin);
    } else {
      for (const char of pin) {
        const key = this.page.locator(`button:has-text("${char}")`).first();
        if (await key.isVisible()) {
          await key.click();
        }
      }
    }

    if (await this.submitButton.first().isVisible()) {
      await this.submitButton.first().click();
    }
  }

  async assertLoginSuccess() {
    await expect(this.page).not.toHaveURL(/.*login/);
  }

  async assertErrorMessage(messageText?: string) {
    await expect(this.errorMessage.first()).toBeVisible();
    if (messageText) {
      await expect(this.errorMessage.first()).toContainText(messageText);
    }
  }
}
