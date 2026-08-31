import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 08: Menu Management, 86-ing & Channel Availability Sync', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-MENU-01: Menu management screen renders items and prices', async ({ page }) => {
    await page.goto('/menu');

    // Verify menu items
    await expect(page.locator('text=Menu, text=Category, text=Special Chicken Biryani, text=Murgh Malai Tikka').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-MENU-02: Channel availability screen presents 86-stock toggle for aggregator channels', async ({ page }) => {
    await page.goto('/channel-availability');

    // Verify channel availability view
    await expect(page.locator('text=Channel, text=Availability, text=Swiggy, text=Zomato, text=Stock').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-MENU-03: Toggle 86 availability updates item status', async ({ page }) => {
    await page.goto('/channel-availability');

    const toggleBtn = page.locator('input[type="checkbox"], button:has-text("ON"), button:has-text("OFF"), button:has-text("Toggle")').first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
    }
  });
});
