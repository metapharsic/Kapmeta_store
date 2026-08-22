/**
 * Aggregator (Swiggy/Zomato) integration types.
 */

export type AggregatorPlatform = 'swiggy' | 'zomato';

/** Raw webhook item shape, roughly common across platforms once normalized
 * at the mapper boundary. Real payloads are platform-specific and messier;
 * this is the slice this service actually reads. */
export interface AggregatorRawItem {
  item_id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string | null;
}

/** Raw webhook payload shape per platform, as received on the order-created
 * webhook. Both platforms are normalized to this same envelope shape by the
 * caller (route handler) before being handed to the mapper — only the
 * `platform` discriminant and nested field names differ upstream in
 * practice, which is why Swiggy/Zomato get separate mapper functions even
 * though the type below is shared. */
export interface AggregatorOrderPayload {
  platform: AggregatorPlatform;
  outlet_id: string;
  external_order_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: AggregatorRawItem[];
}

export interface OosMarkInput {
  itemId: string;
  outletId: string;
  altItemAllowed: boolean;
  propagateToOtherChannels: boolean;
}

export interface ChannelResult {
  channel: AggregatorPlatform;
  success: boolean;
  error?: string;
}

export interface BulkMarkReadyResult {
  orderId: string;
  success: boolean;
  error?: string;
}
