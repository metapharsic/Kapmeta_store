import { Page } from "@playwright/test";
import { InvoicePage } from "../pages/InvoicePage";
import { logger } from "../utils/logger";

export class SalesWorkflow {
  private invoicePage: InvoicePage;

  constructor(private page: Page) {
    this.invoicePage = new InvoicePage(page);
  }

  async completeDineInSale(params: {
    tableNumber: string;
    items: string[];
    paymentMethod: "CASH" | "CARD" | "UPI";
  }): Promise<void> {
    logger.step("[Workflow] Starting Dine-In Sales & Billing Workflow", `Table ${params.tableNumber}`);
    await this.invoicePage.goto();
    await this.invoicePage.selectTable(params.tableNumber);

    for (const item of params.items) {
      await this.invoicePage.addItemToCart(item);
    }

    await this.invoicePage.fireKot();
    await this.invoicePage.settleBill(params.paymentMethod);
    await this.invoicePage.assertBillCompleted();
    logger.info(`[Workflow Success] Dine-in sale completed for Table ${params.tableNumber}`);
  }
}
