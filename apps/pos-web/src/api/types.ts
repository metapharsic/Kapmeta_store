/**
 * TypeScript types mirroring the Kapmeta backend API contracts
 * (services/orders, services/tables, services/tax, services/settings,
 * services/printing, services/admin — see /contracts/*.yaml).
 *
 * Kept intentionally close to the OpenAPI shapes so the future real
 * HTTP client can be typed against these with minimal drift.
 */

export type OrderStatus = 'open' | 'running' | 'printed' | 'paid' | 'cancelled';

/** Order type ("order-type tabs" on the Order Entry screen). */
export type OrderType = 'dine_in' | 'delivery' | 'pickup';

/** Table occupancy status is derived from OrderStatus + kot_sent — see getTableStatusColor. */
export interface RestaurantTable {
  id: string;
  name: string;
  /** Zone / floor grouping, e.g. "AC", "Non AC". */
  zone: string;
  /** Seating capacity, informational. */
  capacity?: number;
  /** Null when the table has no active order (grey / open). */
  activeOrderId: string | null;
  status: OrderStatus | null;
  kotSent: boolean;
  /** ISO timestamp the current order started running; used to compute elapsed minutes. */
  runningSince: string | null;
  /** Running total for the current order. */
  runningAmount: number | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  price: number;
  /** Line total = qty * price, kept denormalized to match API responses. */
  amount: number;
  notes?: string;
}

/** Money fields exactly as returned by services/orders + services/tax. */
export interface OrderMoney {
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  grand_total_amount: number;
}

export interface CustomerDetails {
  mobile?: string;
  name?: string;
  address?: string;
  locality?: string;
}

export interface Order extends OrderMoney {
  id: string;
  orderType: OrderType;
  status: OrderStatus;
  kotSent: boolean;
  tableId?: string | null;
  items: OrderItem[];
  customer?: CustomerDetails;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  orderType: OrderType;
  tableId?: string | null;
  customer?: CustomerDetails;
}

export interface AddOrderItemRequest {
  orderId: string;
  menuItemId: string;
  qty: number;
  notes?: string;
}

export interface PrintBillRequest {
  orderId: string;
}

export interface PrintKotRequest {
  orderId: string;
  itemIds?: string[];
}
