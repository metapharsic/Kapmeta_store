import type { CreateOrderInput } from '../../orders/src/types';
import type { AggregatorOrderPayload } from './types';

/**
 * Maps a raw aggregator webhook payload into OrdersService.createOrder's
 * input shape. Items are NOT part of CreateOrderInput — callers append them
 * via OrdersService.addItem() per item after creating the order, so mappers
 * here only produce the order-creation input and hand the raw item list
 * back separately for the caller to add.
 */
export interface MappedAggregatorOrder {
  createOrderInput: CreateOrderInput;
  items: Array<{ item_id: string; item_name: string; quantity: number; unit_price: number; notes?: string | null }>;
}

function assertPlatform(payload: AggregatorOrderPayload, expected: 'swiggy' | 'zomato'): void {
  if (payload.platform !== expected) {
    throw new Error(`Expected ${expected} payload, got platform '${payload.platform}'`);
  }
}

export function mapSwiggyPayload(payload: AggregatorOrderPayload): MappedAggregatorOrder {
  assertPlatform(payload, 'swiggy');
  return {
    createOrderInput: {
      outlet_id: payload.outlet_id,
      channel: 'swiggy',
      customer_name: payload.customer_name ?? null,
      customer_phone: payload.customer_phone ?? null,
    },
    items: payload.items.map((i) => ({
      item_id: i.item_id,
      item_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
      notes: i.notes ?? null,
    })),
  };
}

export function mapZomatoPayload(payload: AggregatorOrderPayload): MappedAggregatorOrder {
  assertPlatform(payload, 'zomato');
  return {
    createOrderInput: {
      outlet_id: payload.outlet_id,
      channel: 'zomato',
      customer_name: payload.customer_name ?? null,
      customer_phone: payload.customer_phone ?? null,
    },
    items: payload.items.map((i) => ({
      item_id: i.item_id,
      item_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
      notes: i.notes ?? null,
    })),
  };
}
