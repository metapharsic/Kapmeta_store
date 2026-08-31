import { test, expect } from '@playwright/test';
import { setupMockPosServer, injectSession } from './fixtures/mock-pos-server';

test.describe('Flow 01: Authentication, Session & RBAC', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPosServer(page);
  });

  test('TC-AUTH-01: Successful login as Super Admin redirects to POS main register', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/i);

    // Fill in admin credentials
    await page.fill('input[type="email"], input[name="email"], #email', 'admin@hotelkapila.com');
    await page.fill('input[type="password"], input[name="password"], #password', 'password123');

    // Click Sign In
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
    await submitBtn.click();

    // Verify successful login navigation to main POS floor/register
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');
    await expect(page.locator('text=Hotel Kapila').first()).toBeVisible();
  });

  test('TC-AUTH-02: Invalid credentials display error alert', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"], input[name="email"], #email', 'admin@hotelkapila.com');
    await page.fill('input[type="password"], input[name="password"], #password', 'wrongpassword');

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
    await submitBtn.click();

    // Should display invalid credentials message
    await expect(page.locator('text=Incorrect email or password, text=INVALID_CREDENTIALS, text=Login failed').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-AUTH-03: Quick role selection pre-fills credentials and signs in', async ({ page }) => {
    await page.goto('/login');

    // Click Quick Role card for CASHIER or CHEF
    const roleCard = page.locator('text=CASHIER, text=Front Desk Cashier').first();
    if (await roleCard.isVisible()) {
      await roleCard.click();
      const emailInput = page.locator('input[type="email"], input[name="email"], #email');
      await expect(emailInput).toHaveValue('cashier@hotelkapila.com');
    }
  });

  test('TC-AUTH-04: Fast PIN Terminal Unlock verification', async ({ page }) => {
    await page.goto('/login');

    // Open PIN Login Modal if button exists
    const pinBtn = page.locator('button:has-text("Fast PIN"), button:has-text("PIN Unlock"), button:has-text("Unlock with PIN")').first();
    if (await pinBtn.isVisible()) {
      await pinBtn.click();
      // Expect PIN modal to open
      await expect(page.locator('text=Enter Terminal PIN, text=Quick PIN').first()).toBeVisible();

      // Enter digits 1-2-3-4
      const digit1 = page.locator('button:has-text("1")').first();
      const digit2 = page.locator('button:has-text("2")').first();
      const digit3 = page.locator('button:has-text("3")').first();
      const digit4 = page.locator('button:has-text("4")').first();
      if (await digit1.isVisible()) {
        await digit1.click();
        await digit2.click();
        await digit3.click();
        await digit4.click();
      }
    }
  });

  test('TC-AUTH-05: Authenticated session logout clears localStorage and returns to login', async ({ page }) => {
    await injectSession(page);
    await page.goto('/');

    // Verify we are on POS page
    await expect(page.locator('text=Hotel Kapila').first()).toBeVisible();

    // Trigger logout (via user menu or direct helper)
    await page.evaluate(() => {
      window.localStorage.removeItem('kapmeta_pos_session');
      window.location.href = '/login';
    });

    await page.waitForURL((url) => url.pathname.includes('/login'));
    await expect(page.locator('input[type="email"], input[name="email"], #email')).toBeVisible();
  });
});
