import { describe, expect, it } from 'vitest';
import { InMemoryCrmRepository } from '../src/CrmRepository';
import { CrmService, type OrderWithCustomerInfo } from '../src/CrmService';

function makeOrder(overrides: Partial<OrderWithCustomerInfo> = {}): OrderWithCustomerInfo {
  return {
    id: overrides.id ?? `order_${Math.random().toString(36).slice(2, 8)}`,
    outlet_id: 'outlet_1',
    status: 'paid',
    kot_sent: true,
    channel: 'delivery',
    table_id: null,
    bill_no: 1,
    kot_no: 1,
    items: [],
    subtotal_amount: 100,
    tax_amount: 5,
    discount_amount: 0,
    grand_total_amount: 105,
    total_override_reason: null,
    customer_name: 'Asha Rao',
    customer_phone: '9876543210',
    customer_address: '12 MG Road, Indiranagar',
    otp: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('CrmService', () => {
  it('creates a new customer from the first order', async () => {
    const service = new CrmService(new InMemoryCrmRepository());
    const order = makeOrder();

    const customer = await service.upsertFromOrder(order);

    expect(customer).not.toBeNull();
    expect(customer!.outletId).toBe('outlet_1');
    expect(customer!.phone).toBe('9876543210');
    expect(customer!.name).toBe('Asha Rao');
    expect(customer!.address).toBe('12 MG Road, Indiranagar');
    expect(customer!.locality).toBe('Indiranagar');
  });

  it('reuses the same customer for the same phone and updates address', async () => {
    const service = new CrmService(new InMemoryCrmRepository());
    const first = makeOrder({
      id: 'order_1',
      customer_address: '12 MG Road, Indiranagar',
      created_at: '2026-08-01T10:00:00.000Z',
    });
    const second = makeOrder({
      id: 'order_2',
      customer_address: '45 Church Street, Koramangala',
      created_at: '2026-08-05T10:00:00.000Z',
    });

    const c1 = await service.upsertFromOrder(first);
    const c2 = await service.upsertFromOrder(second);

    expect(c2!.id).toBe(c1!.id);
    expect(c2!.address).toBe('45 Church Street, Koramangala');
    expect(c2!.locality).toBe('Koramangala');
  });

  it('aggregates order count and total spend correctly', async () => {
    const service = new CrmService(new InMemoryCrmRepository());
    const first = makeOrder({ id: 'order_1', grand_total_amount: 105, created_at: '2026-08-01T10:00:00.000Z' });
    const second = makeOrder({ id: 'order_2', grand_total_amount: 250, created_at: '2026-08-10T10:00:00.000Z' });

    const customer = await service.upsertFromOrder(first);
    await service.upsertFromOrder(second);

    const { orders, summary } = await service.getCustomerHistory(customer!.id);

    expect(orders).toHaveLength(2);
    expect(summary.orderCount).toBe(2);
    expect(summary.totalSpend).toBe(355);
    expect(summary.lastOrderAt).toBe('2026-08-10T10:00:00.000Z');
  });

  it('ignores orders with no customer phone', async () => {
    const service = new CrmService(new InMemoryCrmRepository());
    const order = makeOrder({ customer_phone: null });

    const customer = await service.upsertFromOrder(order);

    expect(customer).toBeNull();
  });
});
