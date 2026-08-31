import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class InventoryPage {
  readonly page: Page;
  readonly addIngredientButton: Locator;
  readonly ingredientNameInput: Locator;
  readonly stockQuantityInput: Locator;
  readonly unitSelect: Locator;
  readonly reorderLevelInput: Locator;
  readonly saveIngredientButton: Locator;
  readonly searchInput: Locator;
  readonly stockTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addIngredientButton = page.locator('button:has-text("Add Material"), button:has-text("Add Ingredient")');
    this.ingredientNameInput = page.locator('input[name="name"], input[placeholder*="Name"]');
    this.stockQuantityInput = page.locator('input[name="stock"], input[placeholder*="Quantity"]');
    this.unitSelect = page.locator('select[name="unit"]');
    this.reorderLevelInput = page.locator('input[name="reorderLevel"]');
    this.saveIngredientButton = page.locator('button:has-text("Save"), button:has-text("Add")');
    this.searchInput = page.locator('input[placeholder*="Search stock"], input[name="searchStock"]');
    this.stockTable = page.locator('table');
  }

  async goto() {
    logger.step("Navigating to Inventory & Raw Materials Page");
    await this.page.goto(`${currentEnv.baseUrl}/inventory`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async addRawMaterial(name: string, quantity: number, unit: string = "kg") {
    logger.step("Adding Raw Material to Inventory", `${name} (${quantity} ${unit})`);
    if (await this.addIngredientButton.first().isVisible()) {
      await this.addIngredientButton.first().click();
    }
    await this.ingredientNameInput.first().fill(name);
    await this.stockQuantityInput.first().fill(quantity.toString());
    if (await this.unitSelect.first().isVisible()) {
      await this.unitSelect.first().selectOption(unit);
    }
    await this.saveIngredientButton.first().click();
  }

  async assertMaterialInStock(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible();
  }
}
