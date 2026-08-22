import React from 'react';
import type { KapmetaApiClient } from '../../api/ApiClient';
import type { MenuCategory, MenuItem, Order, OrderItem, OrderType } from '../../api/types';
import { OrderTicket } from './OrderTicket';

export interface OrderEntryProps {
  apiClient: KapmetaApiClient;
  /** Existing order id to resume, or undefined to start a fresh order. */
  orderId?: string;
  /** Table this order is attached to, when opened from the Table Floor View. */
  tableId?: string | null;
}

interface CustomerFormState {
  mobile: string;
  name: string;
  address: string;
  locality: string;
}

const EMPTY_CUSTOMER: CustomerFormState = { mobile: '', name: '', address: '', locality: '' };
const EMPTY_MONEY = { subtotal_amount: 0, tax_amount: 0, discount_amount: 0, grand_total_amount: 0 };

/**
 * Order Entry / Billing screen: left category rail + item grid rendered
 * from ApiClient.listMenu() (categories/items are never hardcoded), and a
 * right OrderTicket panel with order-type tabs, conditional customer
 * fields, the item ticket list, and footer actions.
 */
export const OrderEntry: React.FC<OrderEntryProps> = ({ apiClient, orderId, tableId = null }) => {
  const [categories, setCategories] = React.useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<Order | null>(null);
  const [orderType, setOrderType] = React.useState<OrderType>('dine_in');
  const [customer, setCustomer] = React.useState<CustomerFormState>(EMPTY_CUSTOMER);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const [cats, items] = await Promise.all([
          apiClient.listMenuCategories(),
          apiClient.listMenu(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setMenuItems(items);
        setSelectedCategoryId(cats[0]?.id ?? null);

        let currentOrder: Order;
        if (orderId) {
          currentOrder = await apiClient.getOrder(orderId);
        } else {
          currentOrder = await apiClient.createOrder({ orderType: 'dine_in', tableId });
        }
        if (cancelled) return;
        setOrder(currentOrder);
        setOrderType(currentOrder.orderType);
        setCustomer({
          mobile: currentOrder.customer?.mobile ?? '',
          name: currentOrder.customer?.name ?? '',
          address: currentOrder.customer?.address ?? '',
          locality: currentOrder.customer?.locality ?? '',
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load order entry');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // orderId/tableId identify which order to bootstrap; apiClient is stable per app instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, tableId]);

  const itemsInCategory = React.useMemo(
    () => menuItems.filter((item) => item.categoryId === selectedCategoryId),
    [menuItems, selectedCategoryId],
  );

  const handleAddItem = async (menuItem: MenuItem) => {
    if (!order || !menuItem.isAvailable) return;
    const updated = await apiClient.addOrderItem({ orderId: order.id, menuItemId: menuItem.id, qty: 1 });
    setOrder(updated);
  };

  const handleRemoveItem = async (orderItemId: string) => {
    if (!order) return;
    const updated = await apiClient.removeOrderItem(order.id, orderItemId);
    setOrder(updated);
  };

  const handleOrderTypeChange = (type: OrderType) => {
    setOrderType(type);
    // A real implementation would PATCH the order's orderType via the
    // ApiClient here too; kept as local UI state for now since there is no
    // dedicated endpoint for it in the current contract draft.
  };

  const handleCustomerChange = (field: keyof CustomerFormState, value: string) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handleSplit = () => {
    // Stub: wired for a future split-order flow.
  };

  const handleAdvanceOrder = () => {
    // Stub: wired for a future advance/pre-order flow.
  };

  const handlePrintAndEBill = async () => {
    if (!order) return;
    await apiClient.printBill({ orderId: order.id });
    const refreshed = await apiClient.getOrder(order.id);
    setOrder(refreshed);
  };

  const items: OrderItem[] = order?.items ?? [];
  const money = order
    ? {
        subtotal_amount: order.subtotal_amount,
        tax_amount: order.tax_amount,
        discount_amount: order.discount_amount,
        grand_total_amount: order.grand_total_amount,
      }
    : EMPTY_MONEY;

  if (loading) return <div style={{ padding: 16 }}>Loading order entry…</div>;
  if (error) return <div role="alert" style={{ padding: 16 }}>Error: {error}</div>;

  return (
    <div style={{ display: 'flex', height: '100%' }} data-testid="order-entry-screen">
      <nav style={{ width: 160, borderRight: '1px solid #dfe4ea', overflowY: 'auto' }} aria-label="Menu categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            data-testid={`category-${category.id}`}
            onClick={() => setSelectedCategoryId(category.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 12,
              border: 'none',
              borderLeft: selectedCategoryId === category.id ? '3px solid #1e6fd9' : '3px solid transparent',
              background: selectedCategoryId === category.id ? '#eef4fd' : 'transparent',
              fontWeight: selectedCategoryId === category.id ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <section
        style={{
          flex: '1 1 auto',
          padding: 16,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
          alignContent: 'start',
        }}
        aria-label="Menu items"
      >
        {itemsInCategory.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`menu-item-${item.id}`}
            disabled={!item.isAvailable}
            onClick={() => handleAddItem(item)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              padding: 12,
              borderRadius: 8,
              border: '1px solid #dfe4ea',
              background: item.isAvailable ? '#fff' : '#f4f6f9',
              opacity: item.isAvailable ? 1 : 0.5,
              cursor: item.isAvailable ? 'pointer' : 'not-allowed',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            <span style={{ color: '#6b7684' }}>₹{item.price.toFixed(2)}</span>
          </button>
        ))}
        {itemsInCategory.length === 0 && <p>No items in this category.</p>}
      </section>

      <OrderTicket
        orderType={orderType}
        onOrderTypeChange={handleOrderTypeChange}
        items={items}
        money={money}
        customer={customer}
        onCustomerChange={handleCustomerChange}
        onRemoveItem={handleRemoveItem}
        onSplit={handleSplit}
        onAdvanceOrder={handleAdvanceOrder}
        onPrintAndEBill={handlePrintAndEBill}
      />
    </div>
  );
};

export default OrderEntry;
