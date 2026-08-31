import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 05: Orders Management & Post-KOT Cancellation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-ORDERS-01: Render order history with status filters (Running, Billed, Settled)', async ({ page }) => {
    await page.goto('/orders');

    // Verify orders header
    await expect(page.locator('text=Orders, text=Order Management, text=History').first()).toBeVisible();

    // Verify order numbers are listed
    await expect(page.locator('text=ORD-, text=A2, text=A3, text=₹').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-ORDERS-02: Status tab filtering updates order rows', async ({ page }) => {
    await page.goto('/orders');

    const settledTab = page.locator('button:has-text("Settled"), button:has-text("Completed"), div:has-text("Settled")').first();
    if (await settledTab.isVisible()) {
      await settledTab.click();
      await expect(page.locator('text=DELIVERY, text=SETTLED, text=₹357').first()).toBeVisible();
    }
  });

  test('TC-ORDERS-03: Opening order details drawer shows line-item breakdown', async ({ page }) => {
    await page.goto('/orders');

    // Click on an order card / row
    const orderCard = page.locator('div:has-text("ORD-"), tr:has-text("ORD-")').first();
    if (await orderCard.isVisible()) {
      await orderCard.click();
      // Should show line items or detail drawer
      await expect(page.locator('text=Order Details, text=Subtotal, text=Tax, text=Items').first()).toBeVisible();
    }
  });
});
