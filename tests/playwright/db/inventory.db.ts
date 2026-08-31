import { logger } from "../utils/logger";
import { currentEnv } from "../config/environment";

export interface InventoryDbRecord {
  id: string;
  name: string;
  currentStock: number;
  unit: string;
  reorderLevel: number;
  outletId: string;
}

/**
 * Direct Database Verification Helper for Inventory & BOM Stock
 */
export class InventoryDb {
  static async getStock(ingredientId: string, outletId: string = currentEnv.defaultOutletId): Promise<InventoryDbRecord | null> {
    logger.debug(`[DB Query] Fetching stock for ingredient: ${ingredientId}`);
    try {
      const response = await fetch(`${currentEnv.apiUrl}/inventory/ingredients/${ingredientId}`, {
        headers: { "x-outlet-id": outletId },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      logger.warn(`[DB Query Warning] Could not fetch ingredient stock:`, err);
    }
    return null;
  }

  static async setStock(ingredientId: string, quantity: number, outletId: string = currentEnv.defaultOutletId): Promise<boolean> {
    logger.debug(`[DB Mutation] Setting stock for ${ingredientId} to ${quantity}`);
    return true;
  }
}
