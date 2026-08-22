import type { OrdersService } from '../../orders/src/OrdersService';
import type { BulkMarkReadyResult } from './types';

/**
 * Bulk "mark food ready" action for aggregator order queues (e.g. a KDS
 * screen marking several Swiggy/Zomato orders printed/ready at once).
 * Delegates one order at a time to OrdersService.transitionStatus(); one
 * order's failure (invalid transition, not found, etc.) never aborts the
 * rest of the batch — every order gets its own result entry.
 */
export class MarkFoodReadyBulk {
  constructor(private readonly ordersService: OrdersService) {}

  async markReady(orderIds: string[]): Promise<BulkMarkReadyResult[]> {
    const results: BulkMarkReadyResult[] = [];

    for (const orderId of orderIds) {
      try {
        await this.ordersService.transitionStatus(orderId, 'printed');
        results.push({ orderId, success: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ orderId, success: false, error });
      }
    }

    return results;
  }
}
