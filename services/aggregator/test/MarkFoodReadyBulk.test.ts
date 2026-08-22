import { describe, it, expect } from 'vitest';
import { OrdersService } from '../../orders/src/OrdersService';
import { InMemoryOrdersRepository } from '../../orders/src/OrdersRepository';
import { FakeTaxService, FakeSettingsService, FakePrintingService } from '../../orders/test/fakes';
import { MarkFoodReadyBulk } from '../src/MarkFoodReadyBulk';

function makeOrdersService(): OrdersService {
  return new OrdersService({
    repository: new InMemoryOrdersRepository(),
    taxService: new FakeTaxService(),
    settingsService: new FakeSettingsService(),
    printingService: new FakePrintingService(),
  });
}

describe('MarkFoodReadyBulk.markReady', () => {
  it('marks every eligible order printed and reports per-order success', async () => {
    const ordersService = makeOrdersService();
    const order1 = await ordersService.createOrder({ outlet_id: 'outlet_1', channel: 'swiggy' });
    const order2 = await ordersService.createOrder({ outlet_id: 'outlet_1', channel: 'zomato' });
    // move both into 'running' so 'printed' is a valid transition
    await ordersService.transitionStatus(order1.id, 'running');
    await ordersService.transitionStatus(order2.id, 'running');

    const bulk = new MarkFoodReadyBulk(ordersService);
    const results = await bulk.markReady([order1.id, order2.id]);

    expect(results).toEqual([
      { orderId: order1.id, success: true },
      { orderId: order2.id, success: true },
    ]);

    const updated1 = await ordersService.getOrderOrThrow(order1.id);
    expect(updated1.status).toBe('printed');
  });

  it('reports partial failure: one bad order id never blocks the rest of the batch', async () => {
    const ordersService = makeOrdersService();
    const order1 = await ordersService.createOrder({ outlet_id: 'outlet_1', channel: 'swiggy' });
    await ordersService.transitionStatus(order1.id, 'running');
    const order2 = await ordersService.createOrder({ outlet_id: 'outlet_1', channel: 'zomato' });
    await ordersService.transitionStatus(order2.id, 'running');

    const bulk = new MarkFoodReadyBulk(ordersService);
    const results = await bulk.markReady([order1.id, 'nonexistent-order-id', order2.id]);

    expect(results[0]).toEqual({ orderId: order1.id, success: true });
    expect(results[1].success).toBe(false);
    expect(results[1].error).toMatch(/not found/i);
    expect(results[2]).toEqual({ orderId: order2.id, success: true });

    const updated2 = await ordersService.getOrderOrThrow(order2.id);
    expect(updated2.status).toBe('printed');
  });

  it('reports failure for an order whose status transition is invalid without throwing', async () => {
    const ordersService = makeOrdersService();
    // still 'open' — open -> printed is not a valid transition
    const order = await ordersService.createOrder({ outlet_id: 'outlet_1', channel: 'swiggy' });

    const bulk = new MarkFoodReadyBulk(ordersService);
    const results = await bulk.markReady([order.id]);

    expect(results).toEqual([
      { orderId: order.id, success: false, error: expect.stringContaining('Invalid order status transition') },
    ]);
  });
});
