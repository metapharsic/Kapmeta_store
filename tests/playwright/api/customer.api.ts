import { APIRequestContext } from "@playwright/test";
import { CustomerTestData } from "../config/test-data";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class CustomerApiClient {
  constructor(private readonly request: APIRequestContext, private readonly authToken?: string) {}

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      "x-outlet-id": currentEnv.defaultOutletId,
    };
  }

  async createCustomer(data: CustomerTestData) {
    logger.debug(`[API] Creating customer: ${data.name}`);
    return await this.request.post(`${currentEnv.apiUrl}/crm/customers`, {
      headers: this.getHeaders(),
      data,
    });
  }

  async getCustomerById(id: string) {
    return await this.request.get(`${currentEnv.apiUrl}/crm/customers/${id}`, {
      headers: this.getHeaders(),
    });
  }

  async searchCustomers(query: string) {
    return await this.request.get(`${currentEnv.apiUrl}/crm/customers?q=${encodeURIComponent(query)}`, {
      headers: this.getHeaders(),
    });
  }
}
