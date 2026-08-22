import type { Order } from '../../orders/src/types';
import type { CrmRepository } from './CrmRepository';
import type { Customer, CustomerOrderSummary } from './types';

/**
 * Orders carrying customer info relevant to CRM. `customer_address` is not
 * yet a field on the core Order type (see services/orders/src/types.ts) —
 * it's typed here as optional so CrmService can pick it up the moment it
 * lands there without a signature change.
 */
export type OrderWithCustomerInfo = Order & { customer_address?: string | null };

function randomId(): string {
  return `cust_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * CrmService derives/maintains Customer records from Order activity.
 *
 * PII NOTE: `phone` and `address` on Customer are PII. Callers of this
 * service (and any route/query built on top of it) must enforce role-gated
 * access — do not expose customer records to unauthenticated or generic
 * staff-level callers. There is no bulk export capability in v1; do not add
 * one without a separate privacy/compliance review.
 */
export class CrmService {
  constructor(
    private readonly repo: CrmRepository,
    private readonly ordersByCustomer: Map<string, OrderWithCustomerInfo[]> = new Map(),
  ) {}

  /**
   * Dedupes a customer by (outlet_id, phone). Creates a new Customer on
   * first sight of a phone number for an outlet; on repeat orders, updates
   * name/address/locality from the latest order (last-write-wins).
   * Orders without a customer_phone are ignored — phone is the dedupe key.
   */
  async upsertFromOrder(order: OrderWithCustomerInfo): Promise<Customer | null> {
    if (!order.customer_phone) {
      return null;
    }

    const phone = order.customer_phone;
    const outletId = order.outlet_id;
    const address = order.customer_address ?? null;
    const name = order.customer_name ?? null;

    const existing = await this.repo.findByPhoneAndOutlet(outletId, phone);

    let customer: Customer;
    if (existing) {
      customer = {
        ...existing,
        name: name ?? existing.name,
        address: address ?? existing.address,
        locality: deriveLocality(address) ?? existing.locality,
      };
      await this.repo.update(customer);
    } else {
      customer = {
        id: randomId(),
        outletId,
        phone,
        name,
        address,
        locality: deriveLocality(address),
        createdAt: order.created_at,
      };
      await this.repo.insert(customer);
    }

    const existingOrders = this.ordersByCustomer.get(customer.id) ?? [];
    if (!existingOrders.some((o) => o.id === order.id)) {
      existingOrders.push(order);
    }
    this.ordersByCustomer.set(customer.id, existingOrders);

    return customer;
  }

  /**
   * Returns the customer's order history and an aggregated summary.
   * Access to this method must be role-gated — it surfaces PII (phone,
   * address) via the associated Customer as well as spend history.
   */
  async getCustomerHistory(
    customerId: string,
  ): Promise<{ customer: Customer | null; orders: OrderWithCustomerInfo[]; summary: CustomerOrderSummary }> {
    const customer = await this.repo.findById(customerId);
    const orders = [...(this.ordersByCustomer.get(customerId) ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );

    const summary: CustomerOrderSummary = {
      customerId,
      orderCount: orders.length,
      totalSpend: roundMoney(orders.reduce((sum, o) => sum + o.grand_total_amount, 0)),
      lastOrderAt: orders.length > 0 ? orders[orders.length - 1].created_at : '',
    };

    return { customer, orders, summary };
  }
}

function deriveLocality(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
