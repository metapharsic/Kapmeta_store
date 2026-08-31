import { Page, Locator, expect } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class InvoicePage {
  readonly page: Page;
  readonly tableCards: Locator;
  readonly menuItemTiles: Locator;
  readonly cartItemsList: Locator;
  readonly fireKotButton: Locator;
  readonly settleButton: Locator;
  readonly cashTenderButton: Locator;
  readonly cardTenderButton: Locator;
  readonly upiTenderButton: Locator;
  readonly completePaymentButton: Locator;
  readonly invoicePrintPreview: Locator;
  readonly totalAmountText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tableCards = page.locator('[data-testid="table-card"], .table-tile, button:has-text("Table")');
    this.menuItemTiles = page.locator('[data-testid="menu-item-tile"], .menu-card, button:has-text("₹")');
    this.cartItemsList = page.locator('.cart-item, [data-testid="cart-line-item"]');
    this.fireKotButton = page.locator('button:has-text("KOT"), button:has-text("Fire"), button:has-text("Save & Print")');
    this.settleButton = page.locator('button:has-text("Settle"), button:has-text("Pay"), button:has-text("Checkout")');
    this.cashTenderButton = page.locator('button:has-text("Cash")');
    this.cardTenderButton = page.locator('button:has-text("Card")');
    this.upiTenderButton = page.locator('button:has-text("UPI")');
    this.completePaymentButton = page.locator('button:has-text("Confirm Payment"), button:has-text("Print Bill"), button:has-text("Done")');
    this.invoicePrintPreview = page.locator('.invoice-receipt, [data-testid="receipt-modal"]');
    this.totalAmountText = page.locator('[data-testid="total-amount"], .grand-total');
  }

  async goto() {
    logger.step("Navigating to POS Billing Screen", currentEnv.baseUrl);
    await this.page.goto(currentEnv.baseUrl);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async selectTable(tableNumber: string) {
    logger.step("Selecting Table", tableNumber);
    const tbl = this.page.locator(`text=${tableNumber}`).first();
    await tbl.click();
  }

  async addItemToCart(dishName: string) {
    logger.step("Adding Dish to Order Cart", dishName);
    const item = this.page.locator(`text=${dishName}`).first();
    await item.click();
  }

  async fireKot() {
    logger.step("Firing KOT to Kitchen Display System");
    await this.fireKotButton.first().click();
  }

  async settleBill(paymentMethod: "CASH" | "CARD" | "UPI" = "CASH") {
    logger.step("Settling Bill with Tender Method", paymentMethod);
    await this.settleButton.first().click();
    if (paymentMethod === "CASH" && (await this.cashTenderButton.first().isVisible())) {
      await this.cashTenderButton.first().click();
    } else if (paymentMethod === "CARD" && (await this.cardTenderButton.first().isVisible())) {
      await this.cardTenderButton.first().click();
    } else if (paymentMethod === "UPI" && (await this.upiTenderButton.first().isVisible())) {
      await this.upiTenderButton.first().click();
    }
    if (await this.completePaymentButton.first().isVisible()) {
      await this.completePaymentButton.first().click();
    }
  }

  async assertBillCompleted() {
    logger.step("Asserting Bill Settlement Success");
    await expect(this.page.locator('text=Paid, text=Success, text=Settled, text=VACANT').first()).toBeVisible();
  }
}
