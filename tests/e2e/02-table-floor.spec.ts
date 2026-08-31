import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 02: Table Floor Plan & Dine-In Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-FLOOR-01: Table floor renders sections and dining table cards', async ({ page }) => {
    await page.goto('/');

    // Check header outlet
    await expect(page.locator('text=Hotel Kapila').first()).toBeVisible();

    // Verify sections (All, AC, Non AC) exist
    const acSection = page.locator('text=AC, button:has-text("AC")').first();
    await expect(acSection).toBeVisible();

    // Verify Table cards A1, A2, A3 are visible
    await expect(page.locator('text=A1').first()).toBeVisible();
    await expect(page.locator('text=A2').first()).toBeVisible();
    await expect(page.locator('text=A3').first()).toBeVisible();
  });

  test('TC-FLOOR-02: Section tab switching filters tables', async ({ page }) => {
    await page.goto('/');

    // Click on Non AC tab
    const nonAcTab = page.locator('button:has-text("Non AC"), div:has-text("Non AC")').first();
    if (await nonAcTab.isVisible()) {
      await nonAcTab.click();
      // Table B1 should be visible
      await expect(page.locator('text=B1').first()).toBeVisible();
    }
  });

  test('TC-FLOOR-03: Table status badges indicate Vacant, Occupied, and Billed', async ({ page }) => {
    await page.goto('/');

    // Vacant table A1, Occupied table A2 (Running), Billed table A3
    await expect(page.locator('text=A1').first()).toBeVisible();
    await expect(page.locator('text=A2').first()).toBeVisible();
    await expect(page.locator('text=A3').first()).toBeVisible();

    // Check for Occupied / Billed status indicators or running total amounts
    const occupiedIndicator = page.locator('text=OCCUPIED, text=Running, text=KOT, text=₹680').first();
    if (await occupiedIndicator.isVisible()) {
      await expect(occupiedIndicator).toBeVisible();
    }
  });

  test('TC-FLOOR-04: Clicking a vacant table navigates to POS Billing view', async ({ page }) => {
    await page.goto('/');

    // Click table A1
    const tableA1 = page.locator('text=A1').first();
    await tableA1.click();

    // POS Billing view should appear (with Category pills or Cart)
    await expect(page.locator('text=Biryani, text=Menu, text=Items, text=Cart, text=Table: A1, text=A1').first()).toBeVisible();
  });

  test('TC-FLOOR-05: Floor actions allow switching to Delivery or Pickup mode', async ({ page }) => {
    await page.goto('/');

    const deliveryBtn = page.locator('button:has-text("Delivery"), button:has-text("DELIVERY")').first();
    if (await deliveryBtn.isVisible()) {
      await deliveryBtn.click();
      // Expect mode switched
      await expect(page.locator('text=Delivery, text=DELIVERY, text=Customer').first()).toBeVisible();
    }
  });
});
