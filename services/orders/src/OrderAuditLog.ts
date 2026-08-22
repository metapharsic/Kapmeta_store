/**
 * Append-only audit log for order-level actions that must be traceable
 * (manual total overrides, cancellations, etc). In-memory placeholder for
 * the real DB-backed `order_audit_log` table.
 */
export type OrderAuditAction = 'total_override' | 'cancel_order' | 'status_transition';

export interface OrderAuditEntry {
  id: string;
  order_id: string;
  outlet_id: string;
  action: OrderAuditAction;
  actor_id: string;
  reason: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
}

export interface OrderAuditEntryInput {
  order_id: string;
  outlet_id: string;
  action: OrderAuditAction;
  actor_id: string;
  reason?: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export class OrderAuditLog {
  private readonly entries: OrderAuditEntry[] = [];
  private seq = 0;

  append(input: OrderAuditEntryInput): OrderAuditEntry {
    this.seq += 1;
    const entry: OrderAuditEntry = {
      id: `audit_${this.seq}`,
      order_id: input.order_id,
      outlet_id: input.outlet_id,
      action: input.action,
      actor_id: input.actor_id,
      reason: input.reason ?? null,
      before: input.before,
      after: input.after,
      created_at: new Date().toISOString(),
    };
    // Append-only: entries are never mutated or removed once written.
    // Freeze so callers holding a reference (from append()'s return value
    // or from findByOrderId()/all()) cannot tamper with a "written" entry.
    Object.freeze(entry);
    this.entries.push(entry);
    return entry;
  }

  findByOrderId(orderId: string): OrderAuditEntry[] {
    return this.entries.filter((e) => e.order_id === orderId);
  }

  all(): OrderAuditEntry[] {
    return [...this.entries];
  }
}
