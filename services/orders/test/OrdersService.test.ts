import { describe, it, expect, beforeEach } from 'vitest';
import { OrdersService, InvalidStatusTransitionError } from '../src/OrdersService';
import { InMemoryOrdersRepository } from '../src/OrdersRepository';
import { FakeTaxService, FakeSettingsService, FakePrintingService } from './fakes';

function makeService() {
  return new OrdersService({
    repository: new InMemoryOrdersRepository(),
    taxService: new FakeTaxService(),
    settingsService: new FakeSettingsService(),
    printingService: new FakePrintingService(),
  });
}

describe('OrdersService.createOrder', () => {
  it('creates an order in open status with zeroed totals', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });

    expect(order.status).toBe('open');
    expect(order.kot_sent).toBe(false);
    expect(order.outlet_id).toBe('outlet_1');
    expect(order.subtotal_amount).toBe(0);
    expect(order.grand_total_amount).toBe(0);
    expect(order.bill_no).toBeNull();
    expect(order.kot_no).toBeNull();
  });
});

describe('OrdersService.addItem / removeItem', () => {
  it('recalculates totals as items are added and removed', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });

    const afterFirst = await service.addItem(order.id, {
      item_id: 'menu_item_1',
      item_name: 'Paneer Tikka',
      quantity: 2,
      unit_price: 100,
    });
    expect(afterFirst.subtotal_amount).toBe(200);
    expect(afterFirst.tax_amount).toBe(10); // fake tax = 5%
    expect(afterFirst.grand_total_amount).toBe(210);

    const afterSecond = await service.addItem(afterFirst.id, {
      item_id: 'menu_item_2',
      item_name: 'Coke',
      quantity: 1,
      unit_price: 50,
    });
    expect(afterSecond.subtotal_amount).toBe(250);
    expect(afterSecond.tax_amount).toBe(12.5);
    expect(afterSecond.grand_total_amount).toBe(262.5);

    const firstItemId = afterSecond.items[0].id;
    const afterRemoval = await service.removeItem(afterSecond.id, firstItemId);
    expect(afterRemoval.items.length).toBe(1);
    expect(afterRemoval.subtotal_amount).toBe(50);
    expect(afterRemoval.tax_amount).toBe(2.5);
    expect(afterRemoval.grand_total_amount).toBe(52.5);
  });

  it('rejects adding items to a cancelled order', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    await service.cancelOrder(order.id, 'actor_1');

    await expect(
      service.addItem(order.id, {
        item_id: 'menu_item_1',
        item_name: 'Paneer Tikka',
        quantity: 1,
        unit_price: 100,
      }),
    ).rejects.toThrow();
  });
});

describe('OrdersService status state machine', () => {
  it('allows the valid open -> running -> printed -> paid path', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });

    const running = await service.transitionStatus(order.id, 'running');
    expect(running.status).toBe('running');

    const printed = await service.transitionStatus(running.id, 'printed');
    expect(printed.status).toBe('printed');

    const paid = await service.transitionStatus(printed.id, 'paid');
    expect(paid.status).toBe('paid');
  });

  it('rejects going straight from open to paid', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });

    await expect(service.transitionStatus(order.id, 'paid')).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
  });

  it('rejects going from cancelled back to running', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    const cancelled = await service.transitionStatus(order.id, 'cancelled');
    expect(cancelled.status).toBe('cancelled');

    await expect(service.transitionStatus(cancelled.id, 'running')).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
  });

  it('rejects transitions out of a terminal paid status', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    await service.transitionStatus(order.id, 'running');
    await service.transitionStatus(order.id, 'printed');
    const paid = await service.transitionStatus(order.id, 'paid');

    await expect(service.transitionStatus(paid.id, 'running')).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
  });
});

describe('OrdersService.overrideTotal', () => {
  it('overrides the grand total and appends an audit entry with before/after values', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    await service.addItem(order.id, {
      item_id: 'menu_item_1',
      item_name: 'Paneer Tikka',
      quantity: 1,
      unit_price: 100,
    });

    const before = await service.getOrderOrThrow(order.id);
    expect(before.grand_total_amount).toBe(105);

    const updated = await service.overrideTotal(order.id, 90, 'Regular customer discount', 'manager_1');
    expect(updated.grand_total_amount).toBe(90);
    expect(updated.total_override_reason).toBe('Regular customer discount');

    const auditEntries = service.auditLog.findByOrderId(order.id);
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].action).toBe('total_override');
    expect(auditEntries[0].actor_id).toBe('manager_1');
    expect(auditEntries[0].before.grand_total_amount).toBe(105);
    expect(auditEntries[0].after.grand_total_amount).toBe(90);
  });

  it('rejects an override without a reason', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    await expect(service.overrideTotal(order.id, 50, '', 'manager_1')).rejects.toThrow();
  });
});

describe('OrdersService.cancelOrder', () => {
  it('cancels an order and writes an audit log entry', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });

    const cancelled = await service.cancelOrder(order.id, 'waiter_1', 'Customer left');
    expect(cancelled.status).toBe('cancelled');

    const auditEntries = service.auditLog.findByOrderId(order.id);
    expect(auditEntries.some((e) => e.action === 'cancel_order')).toBe(true);
  });
});

describe('OrdersService bill_no / kot_no per-outlet sequencing', () => {
  it('keeps bill_no sequences isolated per outlet', async () => {
    const service = makeService();
    const orderA1 = await service.createOrder({ outlet_id: 'outlet_A', channel: 'dine_in' });
    await service.transitionStatus(orderA1.id, 'running');
    const orderB1 = await service.createOrder({ outlet_id: 'outlet_B', channel: 'dine_in' });
    await service.transitionStatus(orderB1.id, 'running');

    const printedA1 = await service.printBill(orderA1.id);
    const printedB1 = await service.printBill(orderB1.id);

    expect(printedA1.bill_no).toBe(1);
    expect(printedB1.bill_no).toBe(1);

    const orderA2 = await service.createOrder({ outlet_id: 'outlet_A', channel: 'dine_in' });
    await service.transitionStatus(orderA2.id, 'running');
    const printedA2 = await service.printBill(orderA2.id);
    expect(printedA2.bill_no).toBe(2);
    // outlet_B's next bill should still start from where outlet_B left off, not outlet_A's count.
    expect(service.sequence.peekBillNo('outlet_B')).toBe(1);
  });

  it('assigns kot_no per outlet and sets kot_sent', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_A', channel: 'dine_in' });
    const withKot = await service.printKot(order.id);
    expect(withKot.kot_no).toBe(1);
    expect(withKot.kot_sent).toBe(true);
    expect(withKot.status).toBe('running');
  });
});

describe('OrdersService.splitOrder', () => {
  it('moves selected items into a brand-new order and recalculates both totals', async () => {
    const service = makeService();
    const order = await service.createOrder({ outlet_id: 'outlet_1', channel: 'dine_in' });
    await service.addItem(order.id, {
      item_id: 'menu_item_1',
      item_name: 'Paneer Tikka',
      quantity: 1,
      unit_price: 100,
    });
    const withSecond = await service.addItem(order.id, {
      item_id: 'menu_item_2',
      item_name: 'Coke',
      quantity: 1,
      unit_price: 50,
    });

    const movingItemId = withSecond.items[1].id; // Coke
    const { original, split } = await service.splitOrder(order.id, [movingItemId]);

    expect(original.items.length).toBe(1);
    expect(original.subtotal_amount).toBe(100);
    expect(split.items.length).toBe(1);
    expect(split.subtotal_amount).toBe(50);
    expect(split.id).not.toBe(original.id);
  });
});
