import { describe, expect, it } from 'vitest';
import { roundMoney } from '../../shared/src/interfaces';
import { DaySummaryService } from '../src/DaySummaryService';
import {
  InMemoryReportOrderPaymentsRepository,
  InMemoryReportOrdersRepository,
} from '../src/ReportingRepository';
import type { ReportOrder, ReportOrderPayment } from '../src/types';

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

function makePayment(overrides: Partial<ReportOrderPayment> = {}): ReportOrderPayment {
  return {
    id: 'pay_1',
    order_id: 'order_1',
    outlet_id: OUTLET,
    payment_type: 'Cash',
    amount: 0,
    ...overrides,
  };
}

async function makeService() {
  const orders = new InMemoryReportOrdersRepository();
  const payments = new InMemoryReportOrderPaymentsRepository();
  const service = new DaySummaryService({ orders, payments });
  return { service, orders, payments };
}

describe('DaySummaryService', () => {
  it('golden reconciliation: My Amount + Tax - Discount = Grand Total, and the order settles under its payment type for that exact amount', async () => {
    const { service, orders, payments } = await makeService();

    // Real screenshot-derived figures: My Amount 189.52 + Tax 8.48 - Discount 0 = Grand Total 198.00
    const mySubtotal = 189.52;
    const tax = 8.48;
    const discount = 0;
    const grandTotal = 198.0;

    // The reconciliation identity itself, independent of the service.
    expect(roundMoney(mySubtotal + tax - discount)).toBe(grandTotal);

    await orders.save(
      makeOrder({
        id: 'order_golden',
        subtotal_amount: mySubtotal,
        tax_amount: tax,
        discount_amount: discount,
        grand_total_amount: grandTotal,
      }),
    );
    await payments.save(
      makePayment({ id: 'pay_golden', order_id: 'order_golden', payment_type: 'Card', amount: grandTotal }),
    );

    const summary = await service.computeDaySummary(OUTLET, DAY, DAY);

    expect(summary.byPaymentType).toEqual([{ label: 'Card', total: 198.0 }]);
    expect(summary.grandTotal).toBe(198.0);
  });

  it('sums order_payments by payment type label across multiple orders', async () => {
    const { service, orders, payments } = await makeService();

    await orders.save(makeOrder({ id: 'o1', grand_total_amount: 100 }));
    await orders.save(makeOrder({ id: 'o2', grand_total_amount: 50 }));
    await payments.save(makePayment({ id: 'p1', order_id: 'o1', payment_type: 'Cash', amount: 100 }));
    await payments.save(makePayment({ id: 'p2', order_id: 'o2', payment_type: 'Cash', amount: 30 }));
    await payments.save(makePayment({ id: 'p3', order_id: 'o2', payment_type: 'UPI', amount: 20 }));

    const summary = await service.computeDaySummary(OUTLET, DAY, DAY);

    expect(summary.byPaymentType).toEqual(
      expect.arrayContaining([
        { label: 'Cash', total: 130 },
        { label: 'UPI', total: 20 },
      ]),
    );
    expect(summary.grandTotal).toBe(150);
  });

  it('handles split-tender orders: one order paid partly Cash, partly UPI', async () => {
    const { service, orders, payments } = await makeService();

    await orders.save(makeOrder({ id: 'o1', grand_total_amount: 500 }));
    await payments.save(makePayment({ id: 'p1', order_id: 'o1', payment_type: 'Cash', amount: 300 }));
    await payments.save(makePayment({ id: 'p2', order_id: 'o1', payment_type: 'UPI', amount: 200 }));

    const summary = await service.computeDaySummary(OUTLET, DAY, DAY);

    expect(summary.byPaymentType).toEqual(
      expect.arrayContaining([
        { label: 'Cash', total: 300 },
        { label: 'UPI', total: 200 },
      ]),
    );
    expect(summary.grandTotal).toBe(500);
  });

  it('excludes cancelled orders entirely', async () => {
    const { service, orders, payments } = await makeService();

    await orders.save(makeOrder({ id: 'o1', status: 'cancelled', grand_total_amount: 999 }));
    await payments.save(makePayment({ id: 'p1', order_id: 'o1', payment_type: 'Cash', amount: 999 }));

    const summary = await service.computeDaySummary(OUTLET, DAY, DAY);

    expect(summary.byPaymentType).toEqual([]);
    expect(summary.grandTotal).toBe(0);
  });

  it('separates complimentary orders into their own block, excluded from payment-type totals', async () => {
    const { service, orders, payments } = await makeService();

    await orders.save(makeOrder({ id: 'o1', is_complimentary: true, grand_total_amount: 500 }));
    // Even if a placeholder payment row exists, complimentary orders are
    // filtered out before payments are summed (A.4.2).
    await payments.save(makePayment({ id: 'p1', order_id: 'o1', payment_type: 'Cash', amount: 500 }));

    await orders.save(makeOrder({ id: 'o2', grand_total_amount: 100 }));
    await payments.save(makePayment({ id: 'p2', order_id: 'o2', payment_type: 'Cash', amount: 100 }));

    const summary = await service.computeDaySummary(OUTLET, DAY, DAY);

    expect(summary.byPaymentType).toEqual([{ label: 'Cash', total: 100 }]);
    expect(summary.grandTotal).toBe(100);
    expect(summary.complimentary).toEqual({ count: 1, amount: 500 });
  });

  it('returns an empty/zero report for an outlet with no orders in range', async () => {
    const { service } = await makeService();

    const summary = await service.computeDaySummary('outlet_none', DAY, DAY);

    expect(summary.byPaymentType).toEqual([]);
    expect(summary.grandTotal).toBe(0);
    expect(summary.complimentary).toEqual({ count: 0, amount: 0 });
    expect(summary.salesReturns).toEqual([]);
  });

  it('sums totals across a multi-day date range', async () => {
    const { service, orders, payments } = await makeService();

    await orders.save(makeOrder({ id: 'o1', business_date: '2026-08-20', grand_total_amount: 100 }));
    await payments.save(
      makePayment({ id: 'p1', order_id: 'o1', payment_type: 'Cash', amount: 100 }),
    );
    await orders.save(makeOrder({ id: 'o2', business_date: '2026-08-21', grand_total_amount: 50 }));
    await payments.save(makePayment({ id: 'p2', order_id: 'o2', payment_type: 'Cash', amount: 50 }));

    const summary = await service.computeDaySummary(OUTLET, '2026-08-20', '2026-08-21');

    expect(summary.byPaymentType).toEqual([{ label: 'Cash', total: 150 }]);
    expect(summary.grandTotal).toBe(150);
  });
});
