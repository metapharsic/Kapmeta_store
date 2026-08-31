import { APIRequestContext } from "@playwright/test";
import { currentEnv } from "../config/environment";
import { logger } from "../utils/logger";

export interface CreateOrderPayload {
  diningTableId?: string;
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
    courseTag?: string;
  }>;
  customerPhone?: string;
}

export interface SettlePaymentPayload {
  orderId: string;
  payments: Array<{
    method: "CASH" | "CARD" | "UPI" | "DUE";
    amount: number;
  }>;
}

export class InvoiceApiClient {
  constructor(private readonly request: APIRequestContext, private readonly authToken?: string) {}

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      "x-outlet-id": currentEnv.defaultOutletId,
    };
  }

  async createOrder(payload: CreateOrderPayload) {
    logger.debug(`[API] Creating order for table: ${payload.diningTableId || "N/A"}`);
    return await this.request.post(`${currentEnv.apiUrl}/orders`, {
      headers: this.getHeaders(),
      data: payload,
    });
  }

  async settlePayment(payload: SettlePaymentPayload) {
    logger.debug(`[API] Settling payment for order: ${payload.orderId}`);
    return await this.request.post(`${currentEnv.apiUrl}/finance/settle`, {
      headers: this.getHeaders(),
      data: payload,
    });
  }

  async getInvoiceByOrderId(orderId: string) {
    return await this.request.get(`${currentEnv.apiUrl}/finance/invoices/${orderId}`, {
      headers: this.getHeaders(),
    });
  }
}
