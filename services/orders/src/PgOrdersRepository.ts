// services/orders/src/PgOrdersRepository.ts
//
// Real Postgres-backed implementation of the `Repository<Order>` interface
// declared in OrdersRepository.ts, backed by `orders` + `order_items` from
// db-migrations/0009_create_orders_and_order_items.sql.
//
// Column mapping (cited against 0009's line numbers so a reviewer can
// spot-check without re-reading the whole file):
//   orders.id                    (0009:20) uuid            -> Order.id
//   orders.outlet_id             (0009:21) uuid            -> Order.outlet_id
//   orders.table_id              (0009:22) uuid NULL        -> Order.table_id
//   orders.channel               (0009:23) order_channel    -> Order.channel
//   orders.status                (0009:24) order_status     -> Order.status
//   orders.kot_sent              (0009:25) boolean          -> Order.kot_sent
//   orders.bill_no               (0009:27) bigint NULL       -> Order.bill_no (Number())
//   orders.kot_no                (0009:28) bigint NULL       -> Order.kot_no (Number())
//   orders.customer_name         (0009:30) text NULL         -> Order.customer_name
//   orders.customer_phone        (0009:31) text NULL         -> Order.customer_phone
//   orders.customer_otp          (0009:32) text NULL         -> Order.otp
//   orders.subtotal_amount       (0009:34) numeric(12,2)     -> Order.subtotal_amount
//   orders.tax_amount            (0009:35) numeric(12,2)     -> Order.tax_amount
//   orders.discount_amount       (0009:36) numeric(12,2)     -> Order.discount_amount
//   orders.grand_total_amount    (0009:37) numeric(12,2)     -> Order.grand_total_amount
//   orders.created_at/updated_at (0009:43-44) timestamptz    -> Order.created_at/updated_at (ISO)
//   (orders has no column for Order.total_override_reason — see below.)
//
//   order_items.id                    (0009:69) uuid          -> OrderItem.id
//   order_items.order_id              (0009:71) uuid          -> OrderItem.order_id
//   order_items.outlet_id             (0009:70) uuid          -> OrderItem.outlet_id
//   order_items.menu_item_id          (0009:72) uuid          -> OrderItem.item_id
//   order_items.item_name_snapshot    (0009:73) text          -> OrderItem.item_name
//   order_items.unit_price            (0009:74) numeric(12,2) -> OrderItem.unit_price
//   order_items.quantity              (0009:75) numeric(10,2) -> OrderItem.quantity
//   order_items.line_total_amount     (0009:79) numeric(12,2) -> OrderItem.line_total
//   order_items.notes                 (0009:80) text NULL      -> OrderItem.notes
//   order_items.created_at/updated_at (0009:81-82)             -> OrderItem.created_at/updated_at
//   (order_items also has line_subtotal_amount/line_tax_amount/
//   line_discount_amount, which OrderItem does not expose; this repository
//   writes them equal to line_total_amount/0/0 respectively since
//   OrdersService's item pricing is tax-agnostic at the line level — see
//   README "orders schema notes" for the full rationale.)
//
// `orders` HAS NO COLUMN for `Order.total_override_reason` (set only by
// OrdersService's overrideTotal() flow). Rather than inventing a column
//0009 doesn't define, this repository stores it in order_audit_log via
// PgOrderAuditLog (that table already exists precisely for this kind of
// state-changing action, see 0011) and reconstructs it on read as "the
// after.total_override_reason of the most recent 'total_override' audit
// entry for this order, or null if none exists." This keeps orders' own
// row schema untouched while still round-tripping the field losslessly.
//
// Transactions: save() writes `orders` and replaces all of that order's
// `order_items` in a single BEGIN/COMMIT (delete-then-reinsert of items is
// simplest and correct here since OrdersService always hands save() the
// complete, current item list — there is no incremental "append one item"
// repository method to support).

import type { Pool } from 'pg';
import { withTransaction, type Queryable } from '../../shared/src/db/Pool';
import type { Order, OrderItem } from './types';
import type { Repository } from './OrdersRepository';
import { PgOrderAuditLog } from './PgOrderAuditLog';

interface OrderRow {
  id: string;
  outlet_id: string;
  table_id: string | null;
  channel: string;
  status: string;
  kot_sent: boolean;
  bill_no: string | null;
  kot_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_otp: string | null;
  subtotal_amount: string;
  tax_amount: string;
  discount_amount: string;
  grand_total_amount: string;
  created_at: Date;
  updated_at: Date;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  outlet_id: string;
  menu_item_id: string;
  item_name_snapshot: string;
  unit_price: string;
  quantity: string;
  line_total_amount: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    outlet_id: row.outlet_id,
    item_id: row.menu_item_id,
    item_name: row.item_name_snapshot,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total_amount),
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PgOrdersRepository implements Repository<Order> {
  private readonly auditLog: PgOrderAuditLog;

  constructor(private readonly pool: Pool) {
    this.auditLog = new PgOrderAuditLog(pool);
  }

  async findById(id: string): Promise<Order | null> {
    const orderResult = await this.pool.query<OrderRow>(
      `SELECT * FROM orders WHERE id = $1`,
      [id],
    );
    const orderRow = orderResult.rows[0];
    if (!orderRow) return null;
    return this.assemble(orderRow, this.pool);
  }

  async findAll(): Promise<Order[]> {
    const orderResult = await this.pool.query<OrderRow>(`SELECT * FROM orders`);
    return Promise.all(orderResult.rows.map((row) => this.assemble(row, this.pool)));
  }

  async findByOutlet(outletId: string): Promise<Order[]> {
    const orderResult = await this.pool.query<OrderRow>(
      `SELECT * FROM orders WHERE outlet_id = $1`,
      [outletId],
    );
    return Promise.all(orderResult.rows.map((row) => this.assemble(row, this.pool)));
  }

  async save(entity: Order): Promise<Order> {
    return withTransaction(this.pool, async (client) => {
      const upserted = await client.query<OrderRow>(
        `INSERT INTO orders (
           id, outlet_id, table_id, channel, status, kot_sent, bill_no, kot_no,
           customer_name, customer_phone, customer_otp,
           subtotal_amount, tax_amount, discount_amount, grand_total_amount,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
         ON CONFLICT (id) DO UPDATE SET
           outlet_id = EXCLUDED.outlet_id,
           table_id = EXCLUDED.table_id,
           channel = EXCLUDED.channel,
           status = EXCLUDED.status,
           kot_sent = EXCLUDED.kot_sent,
           bill_no = EXCLUDED.bill_no,
           kot_no = EXCLUDED.kot_no,
           customer_name = EXCLUDED.customer_name,
           customer_phone = EXCLUDED.customer_phone,
           customer_otp = EXCLUDED.customer_otp,
           subtotal_amount = EXCLUDED.subtotal_amount,
           tax_amount = EXCLUDED.tax_amount,
           discount_amount = EXCLUDED.discount_amount,
           grand_total_amount = EXCLUDED.grand_total_amount,
           updated_at = now()
         RETURNING *`,
        [
          entity.id,
          entity.outlet_id,
          entity.table_id,
          entity.channel,
          entity.status,
          entity.kot_sent,
          entity.bill_no,
          entity.kot_no,
          entity.customer_name,
          entity.customer_phone,
          entity.otp,
          entity.subtotal_amount,
          entity.tax_amount,
          entity.discount_amount,
          entity.grand_total_amount,
        ],
      );

      // Replace-all strategy for line items: OrdersService always passes
      // save() the complete, authoritative item list, so a delete-then-
      // reinsert is simplest and avoids having to diff item lists here.
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [entity.id]);
      for (const item of entity.items) {
        await client.query(
          `INSERT INTO order_items (
             id, outlet_id, order_id, menu_item_id, item_name_snapshot,
             unit_price, quantity,
             line_subtotal_amount, line_tax_amount, line_discount_amount, line_total_amount,
             notes, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,$10, now())`,
          [
            item.id,
            entity.outlet_id,
            entity.id,
            item.item_id,
            item.item_name,
            item.unit_price,
            item.quantity,
            item.line_total,
            item.line_total,
            item.notes ?? null,
          ],
        );
      }

      if (entity.total_override_reason != null) {
        await this.appendOverrideAudit(client, entity);
      }

      return this.assemble(upserted.rows[0]!, client, entity.items, entity.total_override_reason);
    });
  }

  async delete(id: string): Promise<void> {
    // order_items has ON DELETE CASCADE from order_id -> orders.id (0009:71),
    // so deleting the order row is sufficient.
    await this.pool.query(`DELETE FROM orders WHERE id = $1`, [id]);
  }

  private async appendOverrideAudit(client: Queryable, entity: Order): Promise<void> {
    // Records the override reason so it can be reconstructed on read (see
    // file header). Only fires when save() is called with a non-null
    // total_override_reason, i.e. right after OrdersService.overrideTotal().
    await client.query(
      `INSERT INTO order_audit_log (outlet_id, order_id, action, before_val, after_val)
       VALUES ($1, $2, 'total_override', '{}'::jsonb, $3::jsonb)`,
      [
        entity.outlet_id,
        entity.id,
        JSON.stringify({
          total_override_reason: entity.total_override_reason,
          grand_total_amount: entity.grand_total_amount,
        }),
      ],
    );
  }

  private async assemble(
    orderRow: OrderRow,
    conn: Queryable,
    knownItems?: OrderItem[],
    knownOverrideReason?: string | null,
  ): Promise<Order> {
    const items =
      knownItems ??
      (
        await conn.query<OrderItemRow>(
          `SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
          [orderRow.id],
        )
      ).rows.map(toOrderItem);

    const overrideReason =
      knownOverrideReason !== undefined
        ? knownOverrideReason
        : await this.latestOverrideReason(conn, orderRow.id);

    return {
      id: orderRow.id,
      outlet_id: orderRow.outlet_id,
      status: orderRow.status as Order['status'],
      kot_sent: orderRow.kot_sent,
      channel: orderRow.channel as Order['channel'],
      table_id: orderRow.table_id,
      bill_no: orderRow.bill_no != null ? Number(orderRow.bill_no) : null,
      kot_no: orderRow.kot_no != null ? Number(orderRow.kot_no) : null,
      items,
      subtotal_amount: Number(orderRow.subtotal_amount),
      tax_amount: Number(orderRow.tax_amount),
      discount_amount: Number(orderRow.discount_amount),
      grand_total_amount: Number(orderRow.grand_total_amount),
      total_override_reason: overrideReason,
      customer_name: orderRow.customer_name,
      customer_phone: orderRow.customer_phone,
      otp: orderRow.customer_otp,
      created_at: orderRow.created_at.toISOString(),
      updated_at: orderRow.updated_at.toISOString(),
    };
  }

  private async latestOverrideReason(conn: Queryable, orderId: string): Promise<string | null> {
    const result = await conn.query<{ after_val: { total_override_reason?: string } }>(
      `SELECT after_val FROM order_audit_log
       WHERE order_id = $1 AND action = 'total_override'
       ORDER BY at DESC LIMIT 1`,
      [orderId],
    );
    return result.rows[0]?.after_val?.total_override_reason ?? null;
  }
}
