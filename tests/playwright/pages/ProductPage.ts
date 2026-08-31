import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { ProductTestData } from "../config/test-data";
import { logger } from "../utils/logger";

export class ProductPage {
  readonly page: Page;
  readonly addItemButton: Locator;
  readonly itemNameInput: Locator;
  readonly itemPriceInput: Locator;
  readonly categorySelect: Locator;
  readonly saveItemButton: Locator;
  readonly searchItemInput: Locator;
  readonly menuItemCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addItemButton = page.locator('button:has-text("Add Item"), button:has-text("New Item")');
    this.itemNameInput = page.locator('input[name="name"], input[placeholder*="Item Name"]');
    this.itemPriceInput = page.locator('input[name="price"], input[placeholder*="Price"]');
    this.categorySelect = page.locator('select[name="category"], select[name="categoryId"]');
    this.saveItemButton = page.locator('button:has-text("Save"), button:has-text("Create Item")');
    this.searchItemInput = page.locator('input[placeholder*="Search item"], input[name="searchMenu"]');
    this.menuItemCards = page.locator('[data-testid="menu-item-card"], .menu-card');
  }

  async goto() {
    logger.step("Navigating to Menu Catalog / Products Page");
    await this.page.goto(`${currentEnv.baseUrl}/menu`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async createProduct(product: ProductTestData) {
    logger.step("Creating Menu Item", product.name);
    if (await this.addItemButton.first().isVisible()) {
      await this.addItemButton.first().click();
    }
    await this.itemNameInput.first().fill(product.name);
    await this.itemPriceInput.first().fill((product.priceMinor / 100).toString());
    if (await this.categorySelect.first().isVisible()) {
      await this.categorySelect.first().selectOption({ label: product.category });
    }
    await this.saveItemButton.first().click();
  }

  async toggle86Status(itemName: string) {
    logger.step("Toggling 86 Status for", itemName);
    const itemRow = this.page.locator(`tr:has-text("${itemName}"), div:has-text("${itemName}")`).first();
    const toggle = itemRow.locator('button:has-text("86"), button:has-text("Disable"), input[type="checkbox"]');
    await toggle.first().click();
  }

  async assertProductVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible();
  }
}
