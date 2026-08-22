import { describe, it, expect } from 'vitest';
import { mapSwiggyPayload, mapZomatoPayload } from '../src/AggregatorOrderMapper';
import type { AggregatorOrderPayload } from '../src/types';

const swiggyPayload: AggregatorOrderPayload = {
  platform: 'swiggy',
  outlet_id: 'outlet_1',
  external_order_id: 'sw_ord_1',
  customer_name: 'Asha',
  customer_phone: '9999999999',
  items: [
    { item_id: 'menu_1', name: 'Paneer Tikka', quantity: 2, price: 100 },
    { item_id: 'menu_2', name: 'Coke', quantity: 1, price: 50, notes: 'no ice' },
  ],
};

const zomatoPayload: AggregatorOrderPayload = {
  platform: 'zomato',
  outlet_id: 'outlet_2',
  external_order_id: 'zo_ord_1',
  customer_name: null,
  customer_phone: null,
  items: [{ item_id: 'menu_3', name: 'Butter Naan', quantity: 4, price: 30 }],
};

describe('mapSwiggyPayload', () => {
  it('maps to createOrder input with channel swiggy', () => {
    const mapped = mapSwiggyPayload(swiggyPayload);
    expect(mapped.createOrderInput).toEqual({
      outlet_id: 'outlet_1',
      channel: 'swiggy',
      customer_name: 'Asha',
      customer_phone: '9999999999',
    });
    expect(mapped.items).toEqual([
      { item_id: 'menu_1', item_name: 'Paneer Tikka', quantity: 2, unit_price: 100, notes: null },
      { item_id: 'menu_2', item_name: 'Coke', quantity: 1, unit_price: 50, notes: 'no ice' },
    ]);
  });

  it('throws when handed a non-swiggy payload', () => {
    expect(() => mapSwiggyPayload(zomatoPayload)).toThrow();
  });
});

describe('mapZomatoPayload', () => {
  it('maps to createOrder input with channel zomato', () => {
    const mapped = mapZomatoPayload(zomatoPayload);
    expect(mapped.createOrderInput).toEqual({
      outlet_id: 'outlet_2',
      channel: 'zomato',
      customer_name: null,
      customer_phone: null,
    });
    expect(mapped.items).toEqual([
      { item_id: 'menu_3', item_name: 'Butter Naan', quantity: 4, unit_price: 30, notes: null },
    ]);
  });

  it('throws when handed a non-zomato payload', () => {
    expect(() => mapZomatoPayload(swiggyPayload)).toThrow();
  });
});
