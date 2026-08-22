// services/orders/test/OrderAuditLog.immutability.test.ts
//
// Hardening test: proves OrderAuditLog is genuinely append-only -- there is
// no update/delete method exposed on its type or its runtime prototype, and
// mutating the array returned by all()/findByOrderId() does not affect the
// log's internal state.

import { describe, it, expect, expectTypeOf } from 'vitest';
import { OrderAuditLog } from '../src/OrderAuditLog';

function seedEntry(log: OrderAuditLog) {
  return log.append({
    order_id: 'order-1',
    outlet_id: 'outlet-1',
    action: 'total_override',
    actor_id: 'actor-1',
    reason: 'test',
    before: { grand_total_amount: 100 },
    after: { grand_total_amount: 90 },
  });
}

describe('OrderAuditLog immutability', () => {
  it('type-level: only append/findByOrderId/all are exposed as public methods', () => {
    // Compile-time check: the public instance type of OrderAuditLog must be
    // exactly this method set. If an `update`/`delete`/`remove`/`edit`
    // method is ever added to the class, this assertion fails to compile.
    expectTypeOf<OrderAuditLog>().toHaveProperty('append');
    expectTypeOf<OrderAuditLog>().toHaveProperty('findByOrderId');
    expectTypeOf<OrderAuditLog>().toHaveProperty('all');

    type PublicKeys = keyof OrderAuditLog;
    type Expected = 'append' | 'findByOrderId' | 'all';
    // Both directions: no extra public members, and none of the expected
    // ones are missing. A mismatch here is a TS2344 compile error.
    type AssertNoExtra = Exclude<PublicKeys, Expected> extends never ? true : false;
    type AssertNoneMissing = Exclude<Expected, PublicKeys> extends never ? true : false;
    const noExtra: AssertNoExtra = true;
    const noneMissing: AssertNoneMissing = true;
    expect(noExtra).toBe(true);
    expect(noneMissing).toBe(true);
  });

  it('runtime: no update/delete/remove/edit/clear method exists on the prototype', () => {
    const log = new OrderAuditLog();
    const mutatingNames = ['update', 'delete', 'remove', 'edit', 'clear', 'truncate', 'set'];
    for (const name of mutatingNames) {
      expect((log as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it('all() returns a defensive copy: mutating it does not affect the log', () => {
    const log = new OrderAuditLog();
    seedEntry(log);

    const snapshot = log.all();
    expect(snapshot).toHaveLength(1);

    snapshot.push({
      id: 'forged',
      order_id: 'order-1',
      outlet_id: 'outlet-1',
      action: 'cancel_order',
      actor_id: 'attacker',
      reason: null,
      before: {},
      after: {},
      created_at: new Date().toISOString(),
    });
    snapshot.length = 0; // also try to wipe the copy

    expect(log.all()).toHaveLength(1);
    expect(log.all()[0].actor_id).toBe('actor-1');
  });

  it('findByOrderId() returns a defensive copy: mutating it does not affect the log', () => {
    const log = new OrderAuditLog();
    const entry = seedEntry(log);

    const found = log.findByOrderId('order-1');
    expect(found).toHaveLength(1);
    // Entries are frozen: attempting to mutate a field of a "written" entry
    // throws in strict-mode ESM rather than silently tampering the record.
    expect(() => {
      (found[0] as { reason: string | null }).reason = 'tampered';
    }).toThrow();
    found.pop(); // mutating the returned array itself is still fine/isolated

    const refetched = log.findByOrderId('order-1');
    expect(refetched).toHaveLength(1);
    expect(refetched[0].reason).toBe('test');
    expect(entry.reason).toBe('test');
  });

  it('entries are never overwritten: two appends for the same order produce two distinct entries', () => {
    const log = new OrderAuditLog();
    const first = seedEntry(log);
    const second = seedEntry(log);

    expect(first.id).not.toBe(second.id);
    expect(log.findByOrderId('order-1')).toHaveLength(2);
  });
});
