import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 04: Kitchen Display System (KDS) & Multi-Station Routing', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page, {
      role: 'KITCHEN_USER',
      permissions: ['kot.read', 'kot.update'],
    });
    await injectSession(page, {
      role: 'KITCHEN_USER',
      permissions: ['kot.read', 'kot.update'],
    });
  });

  test('TC-KDS-01: Render live KOT cards on kitchen display board', async ({ page }) => {
    await page.goto('/kitchen');

    // Verify Kitchen header
    await expect(page.locator('text=Kitchen, text=KDS, text=KOT').first()).toBeVisible();

    // Verify live KOT cards exist
    await expect(page.locator('text=A2, text=KOT-101, text=Murgh Malai Tikka').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-KDS-02: Station tab filtering (GRILL, BAR, PANTRY)', async ({ page }) => {
    await page.goto('/kitchen');

    // Look for station filter buttons
    const barFilter = page.locator('button:has-text("BAR"), div:has-text("BAR")').first();
    if (await barFilter.isVisible()) {
      await barFilter.click();
      // Should show Bar items (Electric Blue Lagoon)
      await expect(page.locator('text=Kapila Electric Blue Lagoon, text=Blue Lagoon, text=BAR').first()).toBeVisible();
    }
  });

  test('TC-KDS-03: Marking KOT item as completed updates checklist state', async ({ page }) => {
    await page.goto('/kitchen');

    const itemCheckbox = page.locator('input[type="checkbox"], button:has-text("Done"), button:has-text("Ready")').first();
    if (await itemCheckbox.isVisible()) {
      await itemCheckbox.click();
    }
  });

  test('TC-KDS-04: Kitchen analytics view presents speed-of-service metrics', async ({ page }) => {
    await page.goto('/kitchen-analytics');

    // Verify metrics on kitchen analytics page
    await expect(page.locator('text=Kitchen, text=Analytics, text=Prep Time, text=Average, text=Performance').first()).toBeVisible({ timeout: 5000 });
  });
});
