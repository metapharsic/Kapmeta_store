import type {
  AddOrderItemRequest,
  CreateOrderRequest,
  MenuCategory,
  MenuItem,
  Order,
  PrintBillRequest,
  PrintKotRequest,
  RestaurantTable,
} from './types';

/**
 * Typed API client interface for the Kapmeta POS frontend, matching the
 * endpoints conceptually described in /contracts/*.yaml for
 * services/orders, services/tables, services/tax, services/settings,
 * services/printing, services/admin.
 *
 * A real implementation (calling the deployed HTTP services) is out of
 * scope for this agent and must be wired by a future integration pass
 * once the backend services agents' work is merged. Screens depend only
 * on this interface so that swap-in is a one-line change at the app root.
 */
export interface KapmetaApiClient {
  // -- Tables (services/tables) ------------------------------------------
  listTables(): Promise<RestaurantTable[]>;
  getTable(tableId: string): Promise<RestaurantTable>;
  addTable(zone: string, name: string, capacity?: number): Promise<RestaurantTable>;

  // -- Menu (services/settings / admin) -----------------------------------
  listMenuCategories(): Promise<MenuCategory[]>;
  listMenu(): Promise<MenuItem[]>;

  // -- Orders (services/orders) --------------------------------------------
  createOrder(req: CreateOrderRequest): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  addOrderItem(req: AddOrderItemRequest): Promise<Order>;
  removeOrderItem(orderId: string, orderItemId: string): Promise<Order>;
  updateOrderStatus(orderId: string, status: Order['status']): Promise<Order>;

  // -- Printing (services/printing) ----------------------------------------
  printBill(req: PrintBillRequest): Promise<{ success: boolean }>;
  printKot(req: PrintKotRequest): Promise<{ success: boolean }>;
}

// ---------------------------------------------------------------------------
// mock data for local development and tests only — never used in production,
// production always calls the real HTTP client (not built here, out of scope
// for this agent).
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const minutesAgoIso = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class InMemoryMockApiClient implements KapmetaApiClient {
  // mock data for local development and tests only — never used in production
  private tables: RestaurantTable[] = [
    { id: 't1', name: 'AC-1', zone: 'AC', capacity: 4, activeOrderId: null, status: null, kotSent: false, runningSince: null, runningAmount: null },
    { id: 't2', name: 'AC-2', zone: 'AC', capacity: 2, activeOrderId: 'o1', status: 'running', kotSent: false, runningSince: minutesAgoIso(12), runningAmount: 480 },
    { id: 't3', name: 'AC-3', zone: 'AC', capacity: 4, activeOrderId: 'o2', status: 'running', kotSent: true, runningSince: minutesAgoIso(30), runningAmount: 1120 },
    { id: 't4', name: 'NAC-1', zone: 'Non AC', capacity: 6, activeOrderId: 'o3', status: 'printed', kotSent: true, runningSince: minutesAgoIso(45), runningAmount: 2050 },
    { id: 't5', name: 'NAC-2', zone: 'Non AC', capacity: 4, activeOrderId: 'o4', status: 'paid', kotSent: true, runningSince: minutesAgoIso(60), runningAmount: 990 },
    { id: 't6', name: 'NAC-3', zone: 'Non AC', capacity: 2, activeOrderId: null, status: null, kotSent: false, runningSince: null, runningAmount: null },
  ];

  private categories: MenuCategory[] = [
    { id: 'c1', name: 'Starters', sortOrder: 1 },
    { id: 'c2', name: 'Main Course', sortOrder: 2 },
    { id: 'c3', name: 'Breads', sortOrder: 3 },
    { id: 'c4', name: 'Beverages', sortOrder: 4 },
  ];

  private menuItems: MenuItem[] = [
    { id: 'm1', categoryId: 'c1', name: 'Paneer Tikka', price: 220, isAvailable: true },
    { id: 'm2', categoryId: 'c1', name: 'Veg Spring Roll', price: 180, isAvailable: true },
    { id: 'm3', categoryId: 'c2', name: 'Dal Makhani', price: 210, isAvailable: true },
    { id: 'm4', categoryId: 'c2', name: 'Paneer Butter Masala', price: 260, isAvailable: true },
    { id: 'm5', categoryId: 'c3', name: 'Butter Naan', price: 45, isAvailable: true },
    { id: 'm6', categoryId: 'c3', name: 'Tandoori Roti', price: 30, isAvailable: true },
    { id: 'm7', categoryId: 'c4', name: 'Masala Chaas', price: 60, isAvailable: true },
    { id: 'm8', categoryId: 'c4', name: 'Cold Coffee', price: 90, isAvailable: false },
  ];

  private orders: Map<string, Order> = new Map();

  constructor() {
    this.orders.set('o1', this.seedOrder('o1', 'dine_in', 't2', 'running', false));
    this.orders.set('o2', this.seedOrder('o2', 'dine_in', 't3', 'running', true));
    this.orders.set('o3', this.seedOrder('o3', 'dine_in', 't4', 'printed', true));
    this.orders.set('o4', this.seedOrder('o4', 'dine_in', 't5', 'paid', true));
  }

  private seedOrder(id: string, orderType: Order['orderType'], tableId: string, status: Order['status'], kotSent: boolean): Order {
    const items = [
      { id: makeId('oi'), menuItemId: 'm1', name: 'Paneer Tikka', qty: 2, price: 220, amount: 440 },
    ];
    const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
    const tax = Math.round(subtotal * 0.05);
    return {
      id,
      orderType,
      status,
      kotSent,
      tableId,
      items,
      subtotal_amount: subtotal,
      tax_amount: tax,
      discount_amount: 0,
      grand_total_amount: subtotal + tax,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  async listTables(): Promise<RestaurantTable[]> {
    return this.tables.map((t) => ({ ...t }));
  }

  async getTable(tableId: string): Promise<RestaurantTable> {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) throw new Error(`Table not found: ${tableId}`);
    return { ...table };
  }

  async addTable(zone: string, name: string, capacity?: number): Promise<RestaurantTable> {
    const table: RestaurantTable = {
      id: makeId('t'),
      name,
      zone,
      capacity,
      activeOrderId: null,
      status: null,
      kotSent: false,
      runningSince: null,
      runningAmount: null,
    };
    this.tables.push(table);
    return { ...table };
  }

  async listMenuCategories(): Promise<MenuCategory[]> {
    return this.categories.map((c) => ({ ...c }));
  }

  async listMenu(): Promise<MenuItem[]> {
    return this.menuItems.map((m) => ({ ...m }));
  }

  async createOrder(req: CreateOrderRequest): Promise<Order> {
    const order: Order = {
      id: makeId('o'),
      orderType: req.orderType,
      status: 'open',
      kotSent: false,
      tableId: req.tableId ?? null,
      items: [],
      customer: req.customer,
      subtotal_amount: 0,
      tax_amount: 0,
      discount_amount: 0,
      grand_total_amount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.orders.set(order.id, order);
    if (req.tableId) {
      const table = this.tables.find((t) => t.id === req.tableId);
      if (table) {
        table.activeOrderId = order.id;
        table.status = 'open';
      }
    }
    return { ...order };
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    return { ...order };
  }

  async addOrderItem(req: AddOrderItemRequest): Promise<Order> {
    const order = this.orders.get(req.orderId);
    if (!order) throw new Error(`Order not found: ${req.orderId}`);
    const menuItem = this.menuItems.find((m) => m.id === req.menuItemId);
    if (!menuItem) throw new Error(`Menu item not found: ${req.menuItemId}`);
    order.items.push({
      id: makeId('oi'),
      menuItemId: menuItem.id,
      name: menuItem.name,
      qty: req.qty,
      price: menuItem.price,
      amount: menuItem.price * req.qty,
      notes: req.notes,
    });
    this.recalculate(order);
    return { ...order };
  }

  async removeOrderItem(orderId: string, orderItemId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    order.items = order.items.filter((it) => it.id !== orderItemId);
    this.recalculate(order);
    return { ...order };
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    order.status = status;
    order.updatedAt = nowIso();
    return { ...order };
  }

  async printBill(req: PrintBillRequest): Promise<{ success: boolean }> {
    const order = this.orders.get(req.orderId);
    if (order) {
      order.status = 'printed';
      order.updatedAt = nowIso();
    }
    return { success: true };
  }

  async printKot(req: PrintKotRequest): Promise<{ success: boolean }> {
    const order = this.orders.get(req.orderId);
    if (order) {
      order.kotSent = true;
      order.updatedAt = nowIso();
    }
    return { success: true };
  }

  private recalculate(order: Order): void {
    const subtotal = order.items.reduce((sum, it) => sum + it.amount, 0);
    const tax = Math.round(subtotal * 0.05);
    order.subtotal_amount = subtotal;
    order.tax_amount = tax;
    order.grand_total_amount = subtotal + tax - order.discount_amount;
    order.updatedAt = nowIso();
  }
}
