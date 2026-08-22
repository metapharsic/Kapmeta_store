import { describe, expect, it } from 'vitest';
import { InMemoryDuesRepository } from '../src/DuesRepository';
import { DuesService, type DuesOrderInput } from '../src/DuesService';

function makeOrder(overrides: Partial<DuesOrderInput> = {}): DuesOrderInput {
  return {
    id: 'order_1',
    outlet_id: 'outlet_1',
    payment_type: 'Due',
    ...overrides,
  };
}

describe('DuesService', () => {
  it('records a due against an order with payment_type Due', async () => {
    const service = new DuesService(new InMemoryDuesRepository());

    const due = await service.recordDue(makeOrder(), '9876543210', 500);

    expect(due.status).toBe('outstanding');
    expect(due.amount).toBe(500);
    expect(due.settledAmount).toBe(0);
    expect(due.orderId).toBe('order_1');
    expect(due.customerPhone).toBe('9876543210');
  });

  it('rejects recording a due for a non-Due payment type', async () => {
    const service = new DuesService(new InMemoryDuesRepository());

    await expect(
      service.recordDue(makeOrder({ payment_type: 'cash' }), '9876543210', 500),
    ).rejects.toThrow(/payment_type/);
  });

  it('keeps status outstanding after a partial settlement', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due = await service.recordDue(makeOrder(), '9876543210', 500);

    const updated = await service.settleDue(due.id, 200, 'staff_1');

    expect(updated.status).toBe('outstanding');
    expect(updated.settledAmount).toBe(200);
    expect(updated.settledAt).toBeUndefined();
  });

  it('flips status to settled once fully paid', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due = await service.recordDue(makeOrder(), '9876543210', 500);

    await service.settleDue(due.id, 200, 'staff_1');
    const final = await service.settleDue(due.id, 300, 'staff_1');

    expect(final.status).toBe('settled');
    expect(final.settledAmount).toBe(500);
    expect(final.settledAt).toBeDefined();
  });

  it('records an audit entry for every settlement', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due = await service.recordDue(makeOrder(), '9876543210', 500);

    await service.settleDue(due.id, 200, 'staff_1');
    await service.settleDue(due.id, 300, 'staff_2');

    const audit = service.getAuditLog(due.id);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      dueId: due.id,
      actorId: 'staff_1',
      amount: 200,
      balanceBefore: 500,
      balanceAfter: 300,
    });
    expect(audit[1]).toMatchObject({
      dueId: due.id,
      actorId: 'staff_2',
      amount: 300,
      balanceBefore: 300,
      balanceAfter: 0,
    });
  });

  it('rejects a settlement amount exceeding the outstanding balance', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due = await service.recordDue(makeOrder(), '9876543210', 500);

    await expect(service.settleDue(due.id, 600, 'staff_1')).rejects.toThrow(
      /exceeds outstanding balance/,
    );
  });

  it('rejects settling an already-settled due', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due = await service.recordDue(makeOrder(), '9876543210', 500);
    await service.settleDue(due.id, 500, 'staff_1');

    await expect(service.settleDue(due.id, 1, 'staff_1')).rejects.toThrow(/already fully settled/);
  });

  it('lists only outstanding dues for a given customer', async () => {
    const service = new DuesService(new InMemoryDuesRepository());
    const due1 = await service.recordDue(makeOrder({ id: 'order_1' }), '9876543210', 500);
    await service.recordDue(makeOrder({ id: 'order_2' }), '9876543210', 300);
    await service.recordDue(makeOrder({ id: 'order_3' }), '1112223333', 100);

    await service.settleDue(due1.id, 500, 'staff_1');

    const outstanding = await service.listOutstandingByCustomer('9876543210');
    expect(outstanding).toHaveLength(1);
    expect(outstanding[0].orderId).toBe('order_2');
  });
});
