import { Page } from "@playwright/test";
import { InventoryPage } from "../pages/InventoryPage";
import { logger } from "../utils/logger";

export class InventoryWorkflow {
  private inventoryPage: InventoryPage;

  constructor(private page: Page) {
    this.inventoryPage = new InventoryPage(page);
  }

  async replenishStock(ingredientName: string, quantity: number, unit: string = "kg"): Promise<void> {
    logger.step("[Workflow] Starting Inventory Stock Replenishment Workflow", `${ingredientName} (${quantity} ${unit})`);
    await this.inventoryPage.goto();
    await this.inventoryPage.addRawMaterial(ingredientName, quantity, unit);
    await this.inventoryPage.assertMaterialInStock(ingredientName);
    logger.info(`[Workflow Success] Inventory stock replenished for: ${ingredientName}`);
  }
}
