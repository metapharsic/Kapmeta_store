import { test as base, Page } from "@playwright/test";
import { TEST_USERS, TestUser } from "../config/users";
import { LoginPage } from "../pages/LoginPage";
import { logger } from "../utils/logger";

export interface AuthFixtures {
  loginAs: (role: keyof typeof TEST_USERS) => Promise<Page>;
  authenticatedPage: Page;
  currentUser: TestUser;
}

export const test = base.extend<AuthFixtures>({
  currentUser: async ({}, use) => {
    await use(TEST_USERS.admin);
  },

  loginAs: async ({ page }, use) => {
    const loginHelper = async (role: keyof typeof TEST_USERS) => {
      const user = TEST_USERS[role];
      logger.step(`[Auth Fixture] Logging in as ${user.name} (${user.role})`);
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.loginWithPin(user.pin);
      return page;
    };
    await use(loginHelper);
  },

  authenticatedPage: async ({ page, currentUser }, use) => {
    logger.step(`[Auth Fixture] Initializing authenticated session for: ${currentUser.name}`);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginWithPin(currentUser.pin);
    await use(page);
  },
});

export { expect } from "@playwright/test";
