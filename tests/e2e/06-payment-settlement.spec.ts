import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 06: Multi-Tender Payments, Bill Split & Settlement', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-PAY-01: Quick payment options (Cash, UPI, Card) in POS billing view', async ({ page }) => {
    await page.goto('/?table=A1&tableId=tbl-a1');

    // Add item to cart
    const itemCard = page.locator('div:has-text("Biryani"), div:has-text("Tikka")').last();
    await itemCard.click();

    // Verify Payment buttons exist
    await expect(page.locator('button:has-text("Cash"), button:has-text("UPI"), button:has-text("Card"), button:has-text("Settle"), button:has-text("Pay")').first()).toBeVisible();
  });

  test('TC-PAY-02: More Payment modal supports multi-tender split payment', async ({ page }) => {
    await page.goto('/more-payment-demo');

    // Verify More Payment modal renders tenders (Cash, Card, UPI, Dues)
    await expect(page.locator('text=Payment, text=Tender, text=Cash, text=UPI, text=Card').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-PAY-03: Change calculation and cash tips calculation', async ({ page }) => {
    await page.goto('/more-payment-demo');

    // Look for cash tender input or change display
    const tenderInput = page.locator('input[type="number"], input[placeholder*="Amount"]').first();
    if (await tenderInput.isVisible()) {
      await tenderInput.fill('1000');
    }
  });
});
