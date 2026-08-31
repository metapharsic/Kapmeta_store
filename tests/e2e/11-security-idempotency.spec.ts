import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 11: Security, Auth Guards & Idempotency', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
  });

  test('TC-SEC-01: Unauthenticated request to protected route redirects to /login', async ({ page }) => {
    // Clear any existing localStorage session
    await page.addInitScript(() => {
      window.localStorage.removeItem('kapmeta_pos_session');
    });

    await page.goto('/');

    // Should redirect to /login
    await page.waitForURL((url) => url.pathname.includes('/login'));
    await expect(page.locator('input[type="email"], input[name="email"], #email')).toBeVisible();
  });

  test('TC-SEC-02: Kitchen user without order.create permission is guarded to /kitchen', async ({ page }) => {
    await injectSession(page, {
      role: 'KITCHEN_USER',
      permissions: ['kot.read', 'kot.update'],
    });

    await page.goto('/');

    // Guard redirects to /kitchen
    await page.waitForURL((url) => url.pathname.includes('/kitchen'));
    await expect(page.locator('text=Kitchen, text=KDS, text=KOT').first()).toBeVisible();
  });
});
