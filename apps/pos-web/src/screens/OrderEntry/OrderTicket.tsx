import React from 'react';
import type { Order, OrderItem, OrderType } from '../../api/types';

export interface OrderTicketProps {
  orderType: OrderType;
  onOrderTypeChange: (type: OrderType) => void;
  items: OrderItem[];
  money: Pick<Order, 'subtotal_amount' | 'tax_amount' | 'discount_amount' | 'grand_total_amount'>;
  customer: { mobile: string; name: string; address: string; locality: string };
  onCustomerChange: (field: 'mobile' | 'name' | 'address' | 'locality', value: string) => void;
  onRemoveItem: (orderItemId: string) => void;
  onSplit: () => void;
  onAdvanceOrder: () => void;
  onPrintAndEBill: () => void;
}

const ORDER_TYPE_TABS: { value: OrderType; label: string }[] = [
  { value: 'dine_in', label: 'Dine In' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pick Up' },
];

/**
 * Right-side order ticket panel: order-type tabs, conditional customer
 * fields (Delivery / Pick Up only), the item ticket list, and the footer
 * action buttons (Split / Advance Order / Total / Print & EBill).
 */
export const OrderTicket: React.FC<OrderTicketProps> = ({
  orderType,
  onOrderTypeChange,
  items,
  money,
  customer,
  onCustomerChange,
  onRemoveItem,
  onSplit,
  onAdvanceOrder,
  onPrintAndEBill,
}) => {
  // Customer details are only relevant for Delivery / Pick Up orders — never
  // shown for Dine In, per the locked screen contract.
  const showCustomerFields = orderType === 'delivery' || orderType === 'pickup';

  return (
    <aside
      style={{ display: 'flex', flexDirection: 'column', width: 340, borderLeft: '1px solid #dfe4ea', height: '100%' }}
      data-testid="order-ticket"
    >
      <div style={{ display: 'flex', borderBottom: '1px solid #dfe4ea' }} role="tablist" aria-label="Order type">
        {ORDER_TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={orderType === tab.value}
            data-testid={`order-type-tab-${tab.value}`}
            onClick={() => onOrderTypeChange(tab.value)}
            style={{
              flex: 1,
              padding: 10,
              border: 'none',
              borderBottom: orderType === tab.value ? '2px solid #1e6fd9' : '2px solid transparent',
              background: 'transparent',
              fontWeight: orderType === tab.value ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showCustomerFields && (
        <div data-testid="customer-fields" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          <input
            aria-label="Mobile"
            placeholder="Mobile"
            value={customer.mobile}
            onChange={(e) => onCustomerChange('mobile', e.target.value)}
          />
          <input
            aria-label="Name"
            placeholder="Name"
            value={customer.name}
            onChange={(e) => onCustomerChange('name', e.target.value)}
          />
          <input
            aria-label="Address"
            placeholder="Address"
            value={customer.address}
            onChange={(e) => onCustomerChange('address', e.target.value)}
          />
          <input
            aria-label="Locality"
            placeholder="Locality"
            value={customer.locality}
            onChange={(e) => onCustomerChange('locality', e.target.value)}
          />
        </div>
      )}

      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #dfe4ea' }}>
              <th>Items</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th aria-label="Check items" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} data-testid={`ticket-item-${item.id}`}>
                <td>{item.name}</td>
                <td style={{ textAlign: 'center' }}>{item.qty}</td>
                <td style={{ textAlign: 'right' }}>₹{item.amount.toFixed(2)}</td>
                <td>
                  <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemoveItem(item.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: '#6b7684' }}>
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 12, borderTop: '1px solid #dfe4ea', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal</span>
          <span>₹{money.subtotal_amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Tax</span>
          <span>₹{money.tax_amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Discount</span>
          <span>-₹{money.discount_amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4 }}>
          <span>Total</span>
          <span data-testid="grand-total">₹{money.grand_total_amount.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #dfe4ea' }}>
        <button type="button" onClick={onSplit} style={{ flex: 1 }}>
          Split
        </button>
        <button type="button" onClick={onAdvanceOrder} style={{ flex: 1 }}>
          Advance Order
        </button>
        <button
          type="button"
          onClick={onPrintAndEBill}
          style={{ flex: 2, background: '#1e6fd9', color: '#fff', border: 'none', fontWeight: 600 }}
        >
          Print &amp; EBill
        </button>
      </div>
    </aside>
  );
};

export default OrderTicket;
