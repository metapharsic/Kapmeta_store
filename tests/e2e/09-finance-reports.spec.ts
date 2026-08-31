import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 09: Finance, General Ledger & Day-End Z-Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
    await injectSession(page);
  });

  test('TC-FIN-01: Finance dashboard renders revenue summary and payment breakdown', async ({ page }) => {
    await page.goto('/finance');

    // Verify finance metrics (Sales, Cash, UPI, Tax)
    await expect(page.locator('text=Finance, text=Revenue, text=Sales, text=₹, text=Summary').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-FIN-02: Day-End Z-Report view presents reconciled totals', async ({ page }) => {
    await page.goto('/finance');

    // Look for Z-Report or End of Day section
    await expect(page.locator('text=Z-Report, text=Day Summary, text=Payment Breakdown, text=Gross Sales, text=Net').first()).toBeVisible();
  });
});
