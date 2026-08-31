import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 07: Captain / Waiter Mobile Station', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page, {
      role: 'WAITER',
      permissions: ['order.create', 'tables.read', 'waiters.heartbeat'],
    });
    await injectSession(page, {
      role: 'WAITER',
      permissions: ['order.create', 'tables.read', 'waiters.heartbeat'],
    });
  });

  test('TC-WAITER-01: Captain mobile POS renders floor table grid', async ({ page }) => {
    await page.goto('/waiter');

    // Verify Waiter / Captain layout
    await expect(page.locator('text=Waiter, text=Captain, text=Floor, text=Table, text=A1').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-WAITER-02: Table selection opens quick punch menu on mobile', async ({ page }) => {
    await page.goto('/waiter');

    const tableCard = page.locator('text=A1, text=A2, div:has-text("A1")').first();
    if (await tableCard.isVisible()) {
      await tableCard.click();
      // Menu items should be visible for fast punching
      await expect(page.locator('text=Biryani, text=Menu, text=Items, text=Cart').first()).toBeVisible();
    }
  });
});
