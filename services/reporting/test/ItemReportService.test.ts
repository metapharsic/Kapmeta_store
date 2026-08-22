import { describe, expect, it } from 'vitest';
import { ItemReportService } from '../src/ItemReportService';
import {
  InMemoryReportOrderItemsRepository,
  InMemoryReportOrdersRepository,
} from '../src/ReportingRepository';
import type { ReportOrder, ReportOrderItem } from '../src/types';

const OUTLET = 'outlet_1';
const DAY = '2026-08-21';

function makeOrder(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id: 'order_1',
    outlet_id: OUTLET,
    status: 'paid',
    is_complimentary: false,
    subtotal_amount: 0,
    tax_amount: 0,
    discount_amount: 0,
    grand_total_amount: 0,
    business_date: DAY,
    created_at: `${DAY}T12:00:00.000Z`,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ReportOrderItem> = {}): ReportOrderItem {
  return {
    id: 'item_1',
    order_id: 'order_1',
    outlet_id: OUTLET,
    category: 'Fresh Juice',
    item_name: 'Pineapple Juice',
    code: '107',
    quantity: 1,
    line_total: 0,
    business_date: DAY,
    ...overrides,
  };
}

async function makeService() {
  const orders = new InMemoryReportOrdersRepository();
  const items = new InMemoryReportOrderItemsRepository();
  const service = new ItemReportService({ orders, items });
  return { service, orders, items };
}

describe('ItemReportService', () => {
  it('groups items by category with per-category subtotals and a grand total', async () => {
    const { service, orders, items } = await makeService();

    await orders.save(makeOrder({ id: 'o1' }));
    await items.save(
      makeItem({ id: 'i1', order_id: 'o1', category: 'Fresh Juice', item_name: 'Pineapple Juice', code: '107', quantity: 3, line_total: 145.24 }),
    );
    await items.save(
      makeItem({ id: 'i2', order_id: 'o1', category: 'Fresh Juice', item_name: 'Mango Juice', code: '108', quantity: 2, line_total: 100 }),
    );
    await items.save(
      makeItem({ id: 'i3', order_id: 'o1', category: 'Snacks', item_name: 'Fries', code: '201', quantity: 1, line_total: 50 }),
    );

    const result = await service.computeItemReport(OUTLET, DAY, DAY);

    const juice = result.byCategory.find((c) => c.category === 'Fresh Juice');
    expect(juice?.subTotal).toEqual({ qty: 5, total: 245.24 });
    expect(juice?.items).toEqual(
      expect.arrayContaining([
        { category: 'Fresh Juice', item: 'Pineapple Juice', code: '107', qty: 3, total: 145.24 },
        { category: 'Fresh Juice', item: 'Mango Juice', code: '108', qty: 2, total: 100 },
      ]),
    );

    const snacks = result.byCategory.find((c) => c.category === 'Snacks');
    expect(snacks?.subTotal).toEqual({ qty: 1, total: 50 });

    expect(result.grandTotal).toEqual({ qty: 6, total: 295.24 });
  });

  it('rolls up the same item sold across multiple orders into one row', async () => {
    const { service, orders, items } = await makeService();

    await orders.save(makeOrder({ id: 'o1' }));
    await orders.save(makeOrder({ id: 'o2' }));
    await items.save(makeItem({ id: 'i1', order_id: 'o1', quantity: 3, line_total: 145.24 }));
    await items.save(makeItem({ id: 'i2', order_id: 'o2', quantity: 2, line_total: 96.83 }));

    const result = await service.computeItemReport(OUTLET, DAY, DAY);

    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].items).toEqual([
      { category: 'Fresh Juice', item: 'Pineapple Juice', code: '107', qty: 5, total: 242.07 },
    ]);
  });

  it('excludes items from cancelled orders', async () => {
    const { service, orders, items } = await makeService();

    await orders.save(makeOrder({ id: 'o1', status: 'cancelled' }));
    await items.save(makeItem({ id: 'i1', order_id: 'o1', quantity: 3, line_total: 145.24 }));

    const result = await service.computeItemReport(OUTLET, DAY, DAY);

    expect(result.byCategory).toEqual([]);
    expect(result.grandTotal).toEqual({ qty: 0, total: 0 });
  });

  it('never emits a category row for a category with zero sales in range', async () => {
    const { service, orders, items } = await makeService();

    // Category "Desserts" has no ReportOrderItem rows at all for this
    // outlet/date-range — it must simply not appear, not appear as a
    // zero-value row.
    await orders.save(makeOrder({ id: 'o1' }));
    await items.save(makeItem({ id: 'i1', order_id: 'o1', category: 'Fresh Juice', quantity: 1, line_total: 48.41 }));

    const result = await service.computeItemReport(OUTLET, DAY, DAY);

    expect(result.byCategory.map((c) => c.category)).toEqual(['Fresh Juice']);
    expect(result.byCategory.find((c) => c.category === 'Desserts')).toBeUndefined();
  });

  it('returns an empty report for a date range with no order items', async () => {
    const { service } = await makeService();

    const result = await service.computeItemReport('outlet_none', DAY, DAY);

    expect(result.byCategory).toEqual([]);
    expect(result.grandTotal).toEqual({ qty: 0, total: 0 });
  });

  it('includes historical sales of a since-retired (soft-deleted) menu item, unaffected by is_active', async () => {
    const { service, orders, items } = await makeService();

    // ReportOrderItem is a point-in-time snapshot of what was sold; it
    // carries no is_active flag at all (see ItemReportService header
    // comment) — a menu item retired *after* this sale must still show up
    // for the historical date range it was actually sold in.
    await orders.save(makeOrder({ id: 'o1' }));
    await items.save(
      makeItem({ id: 'i1', order_id: 'o1', item_name: 'Discontinued Special', code: '999', quantity: 2, line_total: 80 }),
    );

    const result = await service.computeItemReport(OUTLET, DAY, DAY);

    expect(result.byCategory[0].items).toEqual([
      { category: 'Fresh Juice', item: 'Discontinued Special', code: '999', qty: 2, total: 80 },
    ]);
  });
});
