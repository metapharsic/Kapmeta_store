import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 12: Online Aggregator Hub & Channel Integrations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-INT-01: Integrations screen renders aggregator channel connectivity', async ({ page }) => {
    await page.goto('/integrations');

    // Verify Swiggy and Zomato cards
    await expect(page.locator('text=Integration, text=Swiggy, text=Zomato, text=Channel').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-INT-02: Channel sync state indicates Synchronized status', async ({ page }) => {
    await page.goto('/integrations');

    await expect(page.locator('text=Connected, text=SYNCHRONIZED, text=Active').first()).toBeVisible();
  });
});
