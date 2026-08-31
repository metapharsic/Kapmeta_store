import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { CustomerTestData } from "../config/test-data";
import { logger } from "../utils/logger";

export class CustomerPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly addCustomerButton: Locator;
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;
  readonly saveButton: Locator;
  readonly customerRow: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.locator('input[placeholder*="Search"], input[name="searchCustomer"]');
    this.addCustomerButton = page.locator('button:has-text("Add Customer"), button:has-text("New Customer")');
    this.nameInput = page.locator('input[name="name"], input[placeholder*="Name"]');
    this.phoneInput = page.locator('input[name="phone"], input[placeholder*="Phone"]');
    this.emailInput = page.locator('input[name="email"], input[placeholder*="Email"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create")');
    this.customerRow = page.locator('table tbody tr, [data-testid="customer-card"]');
  }

  async goto() {
    logger.step("Navigating to Customer CRM Page");
    await this.page.goto(`${currentEnv.baseUrl}/crm`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async addCustomer(customer: CustomerTestData) {
    logger.step("Adding New Customer", customer.name);
    if (await this.addCustomerButton.first().isVisible()) {
      await this.addCustomerButton.first().click();
    }
    await this.nameInput.first().fill(customer.name);
    await this.phoneInput.first().fill(customer.phone);
    if (customer.email) {
      await this.emailInput.first().fill(customer.email);
    }
    await this.saveButton.first().click();
  }

  async searchCustomer(query: string) {
    logger.step("Searching Customer", query);
    await this.searchInput.first().fill(query);
  }

  async assertCustomerListed(phone: string) {
    await expect(this.page.locator(`text=${phone}`).first()).toBeVisible();
  }
}
