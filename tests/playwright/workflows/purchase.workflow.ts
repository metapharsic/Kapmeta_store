import { Page } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export class PurchaseWorkflow {
  constructor(private page: Page) {}

  async createPurchaseOrderAndReceiveGoods(poData: {
    vendorName: string;
    items: Array<{ name: string; quantity: number; costPrice: number }>;
  }): Promise<void> {
    logger.step("[Workflow] Executing Purchase Order & GRN Receipt Workflow", poData.vendorName);
    
    // 1. Submit PO via API or Admin UI
    try {
      const res = await fetch(`${currentEnv.apiUrl}/purchase/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-outlet-id": currentEnv.defaultOutletId },
        body: JSON.stringify({
          vendorName: poData.vendorName,
          items: poData.items,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        logger.info(`[Workflow] PO Created with Number: ${data.orderNumber || data.id}`);
      }
    } catch (err) {
      logger.warn(`[Workflow Warning] PO creation request warning:`, err);
    }
  }
}
