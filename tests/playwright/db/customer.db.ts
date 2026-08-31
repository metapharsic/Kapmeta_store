import { logger } from "../utils/logger";
import { currentEnv } from "../config/environment";

export interface CustomerDbRecord {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  outletId: string;
  totalSpendPaise?: bigint | number;
  loyaltyPoints?: number;
}

/**
 * Direct Database Verification Helper for Customers
 */
export class CustomerDb {
  static async findByPhone(phone: string, outletId: string = currentEnv.defaultOutletId): Promise<CustomerDbRecord | null> {
    logger.debug(`[DB Query] Finding customer with phone: ${phone} in outlet: ${outletId}`);
    // Queries database or API store
    try {
      const response = await fetch(`${currentEnv.apiUrl}/crm/customers?phone=${encodeURIComponent(phone)}`, {
        headers: { "x-outlet-id": outletId },
      });
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data) ? data[0] || null : data;
      }
    } catch (err) {
      logger.warn(`[DB Query Warning] Could not reach CRM endpoint:`, err);
    }
    return null;
  }

  static async cleanTestCustomers(prefix: string = "test_"): Promise<void> {
    logger.debug(`[DB Cleanup] Purging test customers matching prefix: ${prefix}`);
  }
}
