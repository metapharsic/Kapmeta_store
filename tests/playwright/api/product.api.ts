import { APIRequestContext } from "@playwright/test";
import { ProductTestData } from "../config/test-data";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class ProductApiClient {
  constructor(private readonly request: APIRequestContext, private readonly authToken?: string) {}

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      "x-outlet-id": currentEnv.defaultOutletId,
    };
  }

  async createProduct(data: ProductTestData) {
    logger.debug(`[API] Creating menu item: ${data.name}`);
    return await this.request.post(`${currentEnv.apiUrl}/menu/items`, {
      headers: this.getHeaders(),
      data,
    });
  }

  async getMenuCatalog() {
    return await this.request.get(`${currentEnv.apiUrl}/menu/catalog`, {
      headers: this.getHeaders(),
    });
  }

  async toggle86Status(itemId: string, isAvailable: boolean) {
    logger.debug(`[API] Toggling 86 item status for ${itemId} to ${isAvailable}`);
    return await this.request.post(`${currentEnv.apiUrl}/menu/items/${itemId}/86-toggle`, {
      headers: this.getHeaders(),
      data: { isAvailable },
    });
  }
}
