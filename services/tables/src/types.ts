import type { OrderStatus } from '../../orders/src/types';

export type TableZone = 'AC' | 'NonAC';

/**
 * Live table status is DERIVED, not stored directly — it comes from the
 * linked order's status + kot_sent flag (see deriveTableStatus below).
 * Matches artifact-01's mapping:
 *   open                      -> 'Blank'
 *   running, kot_sent=false   -> 'Running'
 *   running, kot_sent=true    -> 'Running-KOT'
 *   printed                   -> 'Printed'
 *   paid                      -> 'Paid'
 *   cancelled                 -> 'Blank' (table freed up)
 */
export type TableDisplayStatus = 'Blank' | 'Running' | 'Running-KOT' | 'Printed' | 'Paid';

export interface RestaurantTable {
  id: string;
  outlet_id: string;
  name: string;
  zone: TableZone;
  seating_capacity: number;
  /** Currently linked open/running/printed order, if any. Null when the
   * table is free (Blank). */
  active_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableSession {
  id: string;
  outlet_id: string;
  table_id: string;
  order_id: string;
  opened_at: string;
  closed_at: string | null;
}

export interface CreateTableInput {
  outlet_id: string;
  name: string;
  zone: TableZone;
  seating_capacity: number;
}

/** Convenience shape returned by listTables(): the table plus its derived
 * live status, computed from the linked order (if any). */
export interface TableWithStatus extends RestaurantTable {
  display_status: TableDisplayStatus;
}

export function deriveTableStatus(
  orderStatus: OrderStatus | null,
  kotSent: boolean,
): TableDisplayStatus {
  if (orderStatus === null || orderStatus === 'cancelled') return 'Blank';
  switch (orderStatus) {
    case 'open':
      return 'Blank';
    case 'running':
      return kotSent ? 'Running-KOT' : 'Running';
    case 'printed':
      return 'Printed';
    case 'paid':
      return 'Paid';
    default:
      return 'Blank';
  }
}
