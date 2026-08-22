/**
 * Reporting domain types — read-only aggregations over already-committed
 * order data (orders, order_payments, order_items). Matches the two
 * screens specified in docs artifact-08-day-summary-and-item-report.md:
 * Part A (Day-End Payment Summary) and Part B (Item Report).
 *
 * `order_payments` and the menu-item/category shapes referenced here have
 * no canonical definition elsewhere in the codebase yet (services/orders'
 * `Order`/`OrderItem` types carry no payment-tender or category/code
 * fields). Following the same pattern services/finance used for
 * `DuesOrderInput`, this service defines its own minimal input record
 * shapes (`ReportOrder`, `ReportOrderPayment`, `ReportOrderItem`) below —
 * these should be reconciled with the real `orders`/`order_payments`
 * Postgres schema once it lands, per docs artifact-08 section A.3.
 */

import type { Money } from '../../shared/src/interfaces';
import type { OrderStatus } from '../../orders/src/types';

// ---------------------------------------------------------------------------
// Input record shapes (minimal slices of the real order/payment/item data
// this service needs — see file header note).
// ---------------------------------------------------------------------------

/** Minimal order slice needed for reporting. Mirrors the money fields on
 * `services/orders/src/types.ts` Order (subtotal_amount/tax_amount/
 * discount_amount/grand_total_amount) exactly, plus the fields the day
 * summary / item report need that Order does not yet carry
 * (`is_complimentary`, `business_date`). */
export interface ReportOrder {
  id: string;
  outlet_id: string;
  status: OrderStatus;
  /** Per docs artifact-08 A.3.1: order-level flag, order-wide comp only.
   * Not part of `services/orders/src/types.ts` Order today — proposed
   * addition, see file header note. */
  is_complimentary: boolean;
  subtotal_amount: Money;
  tax_amount: Money;
  discount_amount: Money;
  grand_total_amount: Money;
  /** Business date (outlet day-close boundary), as YYYY-MM-DD. Falls back
   * to created_at's calendar date if the outlet has no day-close-time
   * setting — see docs artifact-08 A.10.4 (open question). */
  business_date: string;
  created_at: string;
}

/** One row of `order_payments` — split-tender orders produce more than one
 * of these per order (docs artifact-08 A.6.4). */
export interface ReportOrderPayment {
  id: string;
  order_id: string;
  outlet_id: string;
  /** `payment_type_master.label` — tenant-configurable, never hardcoded
   * (docs artifact-08 A.7). Plain string here since the payment-type
   * master table has no canonical type in this codebase yet. */
  payment_type: string;
  amount: Money;
}

/** Minimal `order_items` slice, extended with the category/code fields
 * Part B's item report needs. `services/orders/src/types.ts` OrderItem has
 * no `category`/`code` — those live on the menu catalog (`menu_items` /
 * `menu_categories`), which also has no canonical type in this codebase
 * yet, so this flattens the join docs artifact-08 B.3.1 specifies
 * (`order_items` JOIN `menu_items` JOIN `menu_categories`) into one record. */
export interface ReportOrderItem {
  id: string;
  order_id: string;
  outlet_id: string;
  category: string;
  item_name: string;
  code: string;
  quantity: number;
  line_total: Money;
  business_date: string;
}

// ---------------------------------------------------------------------------
// Part A — Day Summary
// ---------------------------------------------------------------------------

export interface PaymentTypeRow {
  label: string;
  total: Money;
}

export interface DaySummary {
  byPaymentType: PaymentTypeRow[];
  grandTotal: Money;
  complimentary: {
    count: number;
    amount: Money;
  };
  /** Sales returns block. No `sales_returns` input data model is wired up
   * yet (docs artifact-08 A.3.2/A.10.1 flags the full schema as inferred,
   * pending DEC-014 re-capture) — always empty/zero for now, kept on the
   * result shape so callers/tests can rely on the field existing. */
  salesReturns: {
    orderId: string;
    orderNumber?: string;
    total: Money;
  }[];
}

// ---------------------------------------------------------------------------
// Part B — Item Report
// ---------------------------------------------------------------------------

export interface ItemReportRow {
  category: string;
  item: string;
  code: string;
  qty: number;
  total: Money;
}

export interface ItemCategoryGroup {
  category: string;
  subTotal: { qty: number; total: Money };
  items: ItemReportRow[];
}

export interface ItemReportResult {
  grandTotal: { qty: number; total: Money };
  byCategory: ItemCategoryGroup[];
}
