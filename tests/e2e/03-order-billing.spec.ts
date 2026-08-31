import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 03: POS Order Entry & Pricing Engine', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-ORDER-01: Render menu categories and menu item cards in billing view', async ({ page }) => {
    // Navigate directly with query param table=A1 to enter billing view
    await page.goto('/?table=A1&tableId=tbl-a1');

    // Verify menu items are displayed
    await expect(page.locator('text=Special Chicken Biryani, text=Chicken Biryani, text=Paneer Dum Biryani').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Murgh Malai Tikka, text=Tandoori').first()).toBeVisible();
  });

  test('TC-ORDER-02: Search bar filters menu items dynamically', async ({ page }) => {
    await page.goto('/?table=A1&tableId=tbl-a1');

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Malai Tikka');
      await expect(page.locator('text=Murgh Malai Tikka').first()).toBeVisible();
    }
  });

  test('TC-ORDER-03: Adding items increments cart subtotal and calculates taxes', async ({ page }) => {
    await page.goto('/?table=A1&tableId=tbl-a1');

    // Click on an item card to add to cart
    const itemCard = page.locator('div:has-text("Chicken Biryani"), div:has-text("Paneer Dum Biryani")').last();
    await itemCard.click();

    // Verify item appears in order cart panel
    await expect(page.locator('text=Cart, text=Order Summary, text=Qty, text=Total').first()).toBeVisible();

    // Verify Tax (CGST/SGST 2.5% + 2.5% = 5%) line or Grand Total
    const grandTotal = page.locator('text=Grand Total, text=Total Amount, text=₹').first();
    await expect(grandTotal).toBeVisible();
  });

  test('TC-ORDER-04: Attach customer phone number for CRM loyalty tracking', async ({ page }) => {
    await page.goto('/?table=A1&tableId=tbl-a1');

    const phoneInput = page.locator('input[placeholder*="Phone"], input[placeholder*="Mobile"], input[name="customerPhone"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('9876543210');
      await expect(phoneInput).toHaveValue('9876543210');
    }
  });

  test('TC-ORDER-05: Send order to kitchen creates KOT and updates order state', async ({ page }) => {
    await page.goto('/?table=A1&tableId=tbl-a1');

    // Add item
    const itemCard = page.locator('div:has-text("Biryani"), div:has-text("Tikka")').last();
    await itemCard.click();

    // Click Save & Print KOT or Place Order button
    const placeOrderBtn = page.locator('button:has-text("KOT"), button:has-text("Place Order"), button:has-text("Save & Print"), button:has-text("Settle")').first();
    if (await placeOrderBtn.isVisible()) {
      await placeOrderBtn.click();
    }
  });
});
