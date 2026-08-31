import { logger } from "../utils/logger";
import { currentEnv } from "../config/environment";

export interface InvoiceDbRecord {
  id: string;
  orderNumber: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  grandTotalMinor: number;
  paymentStatus: "PAID" | "PENDING" | "VOIDED";
  outletId: string;
}

/**
 * Direct Database Verification Helper for Invoices & Orders
 */
export class InvoiceDb {
  static async findByOrderNumber(orderNumber: string, outletId: string = currentEnv.defaultOutletId): Promise<InvoiceDbRecord | null> {
    logger.debug(`[DB Query] Fetching invoice for order: ${orderNumber}`);
    try {
      const response = await fetch(`${currentEnv.apiUrl}/finance/invoices?orderNumber=${encodeURIComponent(orderNumber)}`, {
        headers: { "x-outlet-id": outletId },
      });
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data) ? data[0] || null : data;
      }
    } catch (err) {
      logger.warn(`[DB Query Warning] Could not fetch invoice:`, err);
    }
    return null;
  }
}
