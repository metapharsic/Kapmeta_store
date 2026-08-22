/**
 * Order domain types. Field names/shape must match db/migrations exactly
 * once Phase 2-3 lands the Postgres schema.
 */

/** Order lifecycle status. `kot_sent` is intentionally NOT part of this enum —
 * it is a separate boolean flag that can be true/false independent of status
 * (e.g. status can be 'running' with kot_sent true or false). */
export type OrderStatus = 'open' | 'running' | 'printed' | 'paid' | 'cancelled';

export type OrderChannel = 'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato';

export interface OrderItem {
  id: string;
  order_id: string;
  outlet_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number; // roundMoney(quantity * unit_price)
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  outlet_id: string;

  status: OrderStatus;
  kot_sent: boolean;
  channel: OrderChannel;

  table_id: string | null;

  bill_no: number | null; // assigned on first print/finalization, per-outlet sequential
  kot_no: number | null; // assigned on first KOT send, per-outlet sequential

  items: OrderItem[];

  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  grand_total_amount: number;

  /** Set only via overrideTotal(); null otherwise. */
  total_override_reason: string | null;

  customer_name: string | null;
  customer_phone: string | null;
  otp: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateOrderInput {
  outlet_id: string;
  channel: OrderChannel;
  table_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}

export interface AddItemInput {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  notes?: string | null;
}
