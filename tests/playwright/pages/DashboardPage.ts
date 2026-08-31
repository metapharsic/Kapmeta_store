import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class DashboardPage {
  readonly page: Page;
  readonly navBilling: Locator;
  readonly navTables: Locator;
  readonly navKitchen: Locator;
  readonly navOrders: Locator;
  readonly navReports: Locator;
  readonly navInventory: Locator;
  readonly navCrm: Locator;
  readonly logoutButton: Locator;
  readonly outletTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navBilling = page.locator('a[href="/"], button:has-text("Billing"), button:has-text("POS")');
    this.navTables = page.locator('a[href="/table-view"], a[href="/table-management"], button:has-text("Tables")');
    this.navKitchen = page.locator('a[href="/kitchen"], button:has-text("Kitchen"), button:has-text("KDS")');
    this.navOrders = page.locator('a[href="/orders"], button:has-text("Orders")');
    this.navReports = page.locator('a[href="/admin"], a[href="/finance"], button:has-text("Reports")');
    this.navInventory = page.locator('a[href="/inventory"], button:has-text("Inventory")');
    this.navCrm = page.locator('a[href="/crm"], button:has-text("CRM")');
    this.logoutButton = page.locator('button:has-text("Logout"), button:has-text("Exit")');
    this.outletTitle = page.locator('header, nav, [data-testid="header-title"]');
  }

  async goto() {
    logger.step("Navigating to Executive Admin Dashboard");
    await this.page.goto(`${currentEnv.baseUrl}/admin`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async navigateTo(menu: "billing" | "tables" | "kitchen" | "orders" | "inventory" | "crm" | "reports") {
    logger.step(`Navigating to ${menu}`);
    const map = {
      billing: this.navBilling,
      tables: this.navTables,
      kitchen: this.navKitchen,
      orders: this.navOrders,
      inventory: this.navInventory,
      crm: this.navCrm,
      reports: this.navReports,
    };
    await map[menu].first().click();
    await this.page.waitForLoadState("domcontentloaded");
  }

  async logout() {
    logger.step("Executing Logout");
    if (await this.logoutButton.first().isVisible()) {
      await this.logoutButton.first().click();
    }
  }

  async assertHeaderVisible() {
    await expect(this.outletTitle.first()).toBeVisible();
  }
}
