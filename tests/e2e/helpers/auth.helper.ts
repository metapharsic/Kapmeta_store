import { Page, expect } from "@playwright/test";

export const DEFAULT_OUTLET_ID = "a0deb015-8ef8-4ef5-aac7-6e91c9da6b5b";
export const API_BASE = "http://localhost:4001";
export const POS_WEB_BASE = "http://localhost:4444";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
  email: string;
  outletId: string;
}

let cachedAdminSession: AuthSession | null = null;

/**
 * Fetch JWT tokens directly from backend API
 */
export async function getAdminTokens(
  email = "admin@restaurant.com",
  password = "admin123",
  outletId = DEFAULT_OUTLET_ID
): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, outletId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to login via API: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    userId: data.user?.userId || data.user?.id || "",
    email: data.user?.email || email,
    outletId: data.user?.outletId || outletId,
  };
}

/**
 * Inject authentication session into localStorage and navigate directly to target page
 */
export async function injectAdminSession(page: Page, targetPath = "/admin") {
  const session = await getAdminTokens();

  await page.goto("/login");
  await page.evaluate((s) => {
    window.localStorage.setItem("kapmeta_pos_session", JSON.stringify(s));
  }, session);

  await page.goto(targetPath);
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Perform manual UI login through the login form
 */
export async function performUiLogin(
  page: Page,
  email = "admin@restaurant.com",
  password = "admin123",
  outletId = DEFAULT_OUTLET_ID
) {
  await page.goto("/login");
  
  // Fill inputs
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]');
  const outletInput = page.locator('input[name="outletId"], input[placeholder*="outlet" i]');
  
  if (await emailInput.count() > 0) {
    await emailInput.fill(email);
  }
  if (await passwordInput.count() > 0) {
    await passwordInput.fill(password);
  }
  if (await outletInput.count() > 0) {
    await outletInput.fill(outletId);
  }

  // Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
  await submitBtn.first().click();

  // Wait for navigation or token
  await page.waitForTimeout(1000);
}
