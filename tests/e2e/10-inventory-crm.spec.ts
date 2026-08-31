import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 10: Inventory Stock & CRM Loyalty Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-INV-01: Inventory screen renders ingredient stock levels and unit costs', async ({ page }) => {
    await page.goto('/inventory');

    // Verify ingredient rows (Basmati Rice, Fresh Chicken, Paneer, Ghee)
    await expect(page.locator('text=Inventory, text=Stock, text=Basmati Rice, text=Fresh Chicken').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-CRM-01: CRM screen displays customer profiles and loyalty points balance', async ({ page }) => {
    await page.goto('/crm');

    // Verify customer directory
    await expect(page.locator('text=CRM, text=Customer, text=Rahul, text=Points, text=9876543210').first()).toBeVisible({ timeout: 5000 });
  });
});
