import { roundMoney } from '../../shared/src/interfaces';
import type { Repository } from './ReportingRepository';
import type { DaySummary, PaymentTypeRow, ReportOrder, ReportOrderPayment } from './types';

export interface DaySummaryRepositories {
  orders: Repository<ReportOrder> & {
    findByOutletAndDateRange(outletId: string, dateFrom: string, dateTo: string): Promise<ReportOrder[]>;
  };
  payments: Repository<ReportOrderPayment> & {
    findByOrderId(orderId: string): Promise<ReportOrderPayment[]>;
  };
}

/**
 * Part A — Day-End Payment Summary. See docs artifact-08-day-summary-and-item-report.md
 * section A.4 for the computation spec this mirrors.
 */
export class DaySummaryService {
  constructor(private readonly repos: DaySummaryRepositories) {}

  async computeDaySummary(outletId: string, dateFrom: string, dateTo: string): Promise<DaySummary> {
    const orders = await this.repos.orders.findByOutletAndDateRange(outletId, dateFrom, dateTo);

    // A.6.3: voided/cancelled orders are excluded entirely from both the
    // payment-type table and the complimentary block.
    const activeOrders = orders.filter((o) => o.status !== 'cancelled');

    // A.4.2: complimentary orders are excluded from the payment-type table
    // (they generate no real tender collection) and reported separately.
    const complimentaryOrders = activeOrders.filter((o) => o.is_complimentary);
    const payableOrders = activeOrders.filter((o) => !o.is_complimentary);

    const totalsByLabel = new Map<string, number>();
    for (const order of payableOrders) {
      // A.4.1/A.6.4: sum order_payments.amount (not orders.grand_total_amount)
      // so split-tender orders are attributed correctly per tender type.
      const payments = await this.repos.payments.findByOrderId(order.id);
      for (const payment of payments) {
        const running = totalsByLabel.get(payment.payment_type) ?? 0;
        totalsByLabel.set(payment.payment_type, roundMoney(running + payment.amount));
      }
    }

    const byPaymentType: PaymentTypeRow[] = Array.from(totalsByLabel.entries())
      // A.10.2: hide payment types with zero activity in range.
      .filter(([, total]) => total !== 0)
      .map(([label, total]) => ({ label, total }));

    const grandTotal = roundMoney(byPaymentType.reduce((sum, row) => sum + row.total, 0));

    const complimentary = {
      count: complimentaryOrders.length,
      amount: roundMoney(
        complimentaryOrders.reduce((sum, o) => sum + o.grand_total_amount, 0),
      ),
    };

    return {
      byPaymentType,
      grandTotal,
      complimentary,
      // No sales_returns input data model exists yet — see types.ts header
      // note and docs artifact-08 A.3.2/A.10.1.
      salesReturns: [],
    };
  }
}
