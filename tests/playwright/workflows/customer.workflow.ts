import { Page } from "@playwright/test";
import { CustomerPage } from "../pages/CustomerPage";
import { CustomerTestData } from "../config/test-data";
import { CustomerDb } from "../db/customer.db";
import { logger } from "../utils/logger";

export class CustomerWorkflow {
  private customerPage: CustomerPage;

  constructor(private page: Page) {
    this.customerPage = new CustomerPage(page);
  }

  async onboardNewCustomer(customerData: CustomerTestData): Promise<void> {
    logger.step("[Workflow] Starting Customer Onboarding Workflow", customerData.name);
    await this.customerPage.goto();
    await this.customerPage.addCustomer(customerData);
    await this.customerPage.searchCustomer(customerData.phone);
    await this.customerPage.assertCustomerListed(customerData.phone);
    
    // Verify in database/API
    const dbRecord = await CustomerDb.findByPhone(customerData.phone);
    if (dbRecord) {
      logger.info(`[Workflow DB Verified] Customer persisted with ID: ${dbRecord.id}`);
    }
  }
}
