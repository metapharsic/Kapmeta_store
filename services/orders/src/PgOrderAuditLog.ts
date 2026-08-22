// services/orders/src/PgOrderAuditLog.ts
//
// Real Postgres-backed replacement for the in-memory OrderAuditLog, backed
// by the `order_audit_log` table from
// db-migrations/0011_create_order_audit_log.sql.
//
// Column mapping (see 0011 for line numbers):
//   order_audit_log.id           bigserial          -> OrderAuditEntry.id (stringified)
//   order_audit_log.outlet_id    uuid               -> OrderAuditEntry.outlet_id
//   order_audit_log.order_id     uuid               -> OrderAuditEntry.order_id
//   order_audit_log.actor_id     uuid NULL           -> OrderAuditEntry.actor_id
//     (in-memory type has actor_id as required `string`; the DB column is
//     nullable to allow system-generated entries. This repo always writes a
//     non-null actor_id since OrderAuditEntryInput.actor_id is required, and
//     reads coalesce a NULL back to '' rather than surfacing `null` where
//     the TS type says `string`.)
//   order_audit_log.action        text               -> OrderAuditEntry.action
//   order_audit_log.before_val    jsonb NULL          -> OrderAuditEntry.before
//   order_audit_log.after_val     jsonb NULL          -> OrderAuditEntry.after
//   order_audit_log.at            timestamptz         -> OrderAuditEntry.created_at (ISO string)
//   (order_audit_log.approved_by exists in the schema but has no equivalent
//   field on OrderAuditEntry; left NULL by this repository.)
//
// Append-only: this class only ever INSERTs and SELECTs, matching 0011's
// documented append-only intent (a DB-level trigger to enforce that is
// noted in 0011 as not-yet-implemented — out of scope here, DDL-only).

import type { Pool } from 'pg';
import type { OrderAuditEntry, OrderAuditEntryInput } from './OrderAuditLog';

interface AuditRow {
  id: string;
  order_id: string;
  outlet_id: string;
  actor_id: string | null;
  action: string;
  reason: string | null;
  before_val: unknown;
  after_val: unknown;
  at: Date;
}

function toEntry(row: AuditRow): OrderAuditEntry {
  return {
    id: String(row.id),
    order_id: row.order_id,
    outlet_id: row.outlet_id,
    action: row.action as OrderAuditEntry['action'],
    actor_id: row.actor_id ?? '',
    reason: row.reason,
    before: (row.before_val ?? {}) as Record<string, unknown>,
    after: (row.after_val ?? {}) as Record<string, unknown>,
    created_at: row.at.toISOString(),
  };
}

export class PgOrderAuditLog {
  constructor(private readonly pool: Pool) {}

  async append(input: OrderAuditEntryInput): Promise<OrderAuditEntry> {
    // order_audit_log has no dedicated "reason" column; reason is folded
    // into `after_val` under a `_reason` key so it survives round-trips
    // without requiring a schema change, matching the project's rule that
    // application data must be persisted in the DB, not held only in memory.
    const afterWithReason =
      input.reason != null ? { ...input.after, _reason: input.reason } : input.after;
    const result = await this.pool.query<AuditRow>(
      `INSERT INTO order_audit_log (outlet_id, order_id, actor_id, action, before_val, after_val)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, order_id, outlet_id, actor_id, action, at, before_val, after_val`,
      [
        input.outlet_id,
        input.order_id,
        input.actor_id,
        input.action,
        JSON.stringify(input.before),
        JSON.stringify(afterWithReason),
      ],
    );
    const row = result.rows[0]!;
    return { ...toEntry(row), reason: input.reason ?? null };
  }

  async findByOrderId(orderId: string): Promise<OrderAuditEntry[]> {
    const result = await this.pool.query<AuditRow>(
      `SELECT id, order_id, outlet_id, actor_id, action, at, before_val, after_val
       FROM order_audit_log WHERE order_id = $1 ORDER BY at ASC`,
      [orderId],
    );
    return result.rows.map((row) => this.extractReason(toEntry(row)));
  }

  async all(): Promise<OrderAuditEntry[]> {
    const result = await this.pool.query<AuditRow>(
      `SELECT id, order_id, outlet_id, actor_id, action, at, before_val, after_val
       FROM order_audit_log ORDER BY at ASC`,
    );
    return result.rows.map((row) => this.extractReason(toEntry(row)));
  }

  /** Pulls the `_reason` sentinel key back out of `after` on read, mirroring
   * how append() folds it in — keeps `entry.after` faithful to what the
   * caller originally passed as `input.after` (minus the sentinel) while
   * still surfacing `entry.reason` correctly. */
  private extractReason(entry: OrderAuditEntry): OrderAuditEntry {
    const after = { ...entry.after };
    const reason = typeof after._reason === 'string' ? (after._reason as string) : null;
    delete after._reason;
    return { ...entry, after, reason: entry.reason ?? reason };
  }
}
