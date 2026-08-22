import { randomUUID } from 'node:crypto';
import type { InMemoryOrdersRepository } from './OrdersRepository';
import type {
  AddItemInput,
  CreateOrderInput,
  Order,
  OrderItem,
  OrderStatus,
} from './types';
import { roundMoney } from './money';
import { BillKotSequence } from './BillKotSequence';
import { OrderAuditLog } from './OrderAuditLog';
import type {
  OutletPrintSettingsShape,
  PrintableOrder,
  PrintingService,
  SettingsService,
  TaxService,
} from '../../shared/src/interfaces';
import { toKotRenderInput, toBillRenderInput } from '../../printing/src/adapters';

/**
 * Valid order status transitions. Enforced strictly by transitionStatus().
 * `kot_sent` is a separate boolean and is never part of this table.
 */
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  open: ['running', 'cancelled'],
  running: ['printed', 'cancelled'],
  printed: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export class InvalidStatusTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order status transition: '${from}' -> '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}

export interface OrdersServiceDeps {
  repository: InMemoryOrdersRepository;
  taxService: TaxService;
  settingsService: SettingsService;
  printingService: PrintingService;
  sequence?: BillKotSequence;
  auditLog?: OrderAuditLog;
}

function toPrintableOrder(order: Order): PrintableOrder {
  return {
    orderId: order.id,
    outletId: order.outlet_id,
    channel: order.channel,
    kotNo: order.kot_no ?? undefined,
    billNo: order.bill_no ?? undefined,
    tableNo: order.table_id,
    items: order.items.map((i) => ({
      id: i.id,
      itemId: i.item_id,
      name: i.item_name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
    })),
    subtotalAmount: order.subtotal_amount,
    taxAmount: order.tax_amount,
    totalAmount: order.grand_total_amount,
    createdAt: order.created_at,
  };
}

export class OrdersService {
  private readonly repo: InMemoryOrdersRepository;
  private readonly taxService: TaxService;
  private readonly settingsService: SettingsService;
  private readonly printingService: PrintingService;
  readonly sequence: BillKotSequence;
  readonly auditLog: OrderAuditLog;

  constructor(deps: OrdersServiceDeps) {
    this.repo = deps.repository;
    this.taxService = deps.taxService;
    this.settingsService = deps.settingsService;
    this.printingService = deps.printingService;
    this.sequence = deps.sequence ?? new BillKotSequence();
    this.auditLog = deps.auditLog ?? new OrderAuditLog();
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      outlet_id: input.outlet_id,
      status: 'open',
      kot_sent: false,
      channel: input.channel,
      table_id: input.table_id ?? null,
      bill_no: null,
      kot_no: null,
      items: [],
      subtotal_amount: 0,
      tax_amount: 0,
      discount_amount: 0,
      grand_total_amount: 0,
      total_override_reason: null,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      otp: null,
      created_at: now,
      updated_at: now,
    };
    return this.repo.save(order);
  }

  async getOrderOrThrow(orderId: string): Promise<Order> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new OrderNotFoundError(orderId);
    return order;
  }

  async addItem(orderId: string, input: AddItemInput): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    if (order.status === 'cancelled' || order.status === 'paid') {
      throw new Error(`Cannot add items to an order in status '${order.status}'`);
    }
    const now = new Date().toISOString();
    const item: OrderItem = {
      id: randomUUID(),
      order_id: order.id,
      outlet_id: order.outlet_id,
      item_id: input.item_id,
      item_name: input.item_name,
      quantity: input.quantity,
      unit_price: input.unit_price,
      line_total: roundMoney(input.quantity * input.unit_price),
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    };
    order.items.push(item);
    order.updated_at = now;
    const withTotals = await this.calculateTotals(order);
    return this.repo.save(withTotals);
  }

  async removeItem(orderId: string, itemId: string): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    if (order.status === 'cancelled' || order.status === 'paid') {
      throw new Error(`Cannot remove items from an order in status '${order.status}'`);
    }
    const before = order.items.length;
    order.items = order.items.filter((i) => i.id !== itemId);
    if (order.items.length === before) {
      throw new Error(`Order item not found: ${itemId}`);
    }
    order.updated_at = new Date().toISOString();
    const withTotals = await this.calculateTotals(order);
    return this.repo.save(withTotals);
  }

  /**
   * Recomputes subtotal/tax/grand_total for an order. Tax math itself is
   * fully delegated to TaxService.computeTax() — that service is expected
   * to branch internally by channel (Backward Tax for dine_in/pickup,
   * Forward Tax for swiggy/zomato/aggregator delivery); this method only
   * builds the input and applies the result. Charge toggles (container/
   * delivery/service charge) are read from
   * SettingsService.getBillingSettings() — this module only reacts to
   * flags it is handed (e.g. applying a configured delivery charge
   * amount), it never invents or hardcodes charge amounts/rates itself.
   * Amounts not exposed on OutletBillingSettingsShape (e.g. a concrete
   * service-charge rate or per-item container charge amount) are resolved
   * by the settings/billing module elsewhere and are out of scope here.
   *
   * This does NOT persist the order — callers persist via repo.save().
   */
  async calculateTotals(order: Order): Promise<Order> {
    const subtotal = roundMoney(
      order.items.reduce((sum, item) => sum + item.line_total, 0),
    );

    const taxResult = await this.taxService.computeTax({
      outletId: order.outlet_id,
      channel: order.channel,
      subtotalAmount: subtotal,
    });

    const settings = await this.settingsService.getBillingSettings(order.outlet_id);

    let extraCharges = 0;
    if (
      order.channel === 'delivery' &&
      settings.delivery_charge_enabled
    ) {
      extraCharges += settings.delivery_charge_amount;
    }
    // container_charge_enabled / service_charge_enabled are read here so the
    // hook point exists, but their concrete amounts are computed by the
    // settings/billing module (order-wise vs item-wise container charge,
    // service-charge rate resolution, etc.) and are not represented as a
    // flat amount on OutletBillingSettingsShape — out of scope for this
    // orchestration method.
    extraCharges = roundMoney(extraCharges);

    const taxAmount = roundMoney(taxResult.taxAmount);
    const grandTotal = roundMoney(
      subtotal + taxAmount + extraCharges - order.discount_amount,
    );

    return {
      ...order,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      grand_total_amount: grandTotal,
    };
  }

  /**
   * The ONLY sanctioned way to manually change grand_total_amount. Never
   * write order.grand_total_amount directly elsewhere. Always appends an
   * audit log entry with before/after values.
   */
  async overrideTotal(
    orderId: string,
    newTotal: number,
    reason: string,
    actorId: string,
  ): Promise<Order> {
    if (!reason || !reason.trim()) {
      throw new Error('overrideTotal requires a non-empty reason');
    }
    const order = await this.getOrderOrThrow(orderId);
    if (order.status === 'cancelled') {
      throw new Error('Cannot override total on a cancelled order');
    }
    const before = {
      grand_total_amount: order.grand_total_amount,
      total_override_reason: order.total_override_reason,
    };
    const roundedTotal = roundMoney(newTotal);
    order.grand_total_amount = roundedTotal;
    order.total_override_reason = reason;
    order.updated_at = new Date().toISOString();

    const saved = await this.repo.save(order);

    this.auditLog.append({
      order_id: order.id,
      outlet_id: order.outlet_id,
      action: 'total_override',
      actor_id: actorId,
      reason,
      before,
      after: {
        grand_total_amount: roundedTotal,
        total_override_reason: reason,
      },
    });

    return saved;
  }

  /**
   * Cancels an order via the status state machine (paid -> cancelled is
   * rejected by transitionStatus, since a paid order must go through a
   * separate refund flow instead). Always appends an audit log entry.
   */
  async cancelOrder(orderId: string, actorId: string, reason?: string): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    const before = { status: order.status };
    const updated = await this.transitionStatus(orderId, 'cancelled');

    this.auditLog.append({
      order_id: order.id,
      outlet_id: order.outlet_id,
      action: 'cancel_order',
      actor_id: actorId,
      reason: reason ?? null,
      before,
      after: { status: 'cancelled' },
    });

    return updated;
  }

  /**
   * Enforces the STATUS_TRANSITIONS state machine. Throws
   * InvalidStatusTransitionError for any disallowed edge (e.g.
   * cancelled -> running, open -> paid, paid -> cancelled).
   */
  async transitionStatus(orderId: string, to: OrderStatus): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(to)) {
      throw new InvalidStatusTransitionError(order.status, to);
    }
    order.status = to;
    order.updated_at = new Date().toISOString();
    return this.repo.save(order);
  }

  private async getPrintSettingsSafe(outletId: string): Promise<OutletPrintSettingsShape> {
    return this.settingsService.getPrintSettings(outletId);
  }

  async printKot(orderId: string): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    if (order.kot_no === null) {
      order.kot_no = this.sequence.nextKotNo(order.outlet_id);
    }
    order.kot_sent = true;
    if (order.status === 'open') {
      order.status = 'running';
    }
    order.updated_at = new Date().toISOString();
    const saved = await this.repo.save(order);

    const printSettings = await this.getPrintSettingsSafe(order.outlet_id);
    this.printingService.renderKot(toKotRenderInput(toPrintableOrder(saved)), printSettings);

    return saved;
  }

  async printBill(orderId: string): Promise<Order> {
    const order = await this.getOrderOrThrow(orderId);
    if (order.bill_no === null) {
      order.bill_no = this.sequence.nextBillNo(order.outlet_id);
    }
    let toSave = order;
    if (order.status === 'running') {
      toSave = { ...order, status: 'printed' };
    } else if (order.status !== 'printed') {
      throw new InvalidStatusTransitionError(order.status, 'printed');
    }
    toSave.updated_at = new Date().toISOString();
    const saved = await this.repo.save(toSave);

    const printSettings = await this.getPrintSettingsSafe(order.outlet_id);
    this.printingService.renderBill(toBillRenderInput(toPrintableOrder(saved)), printSettings);

    return saved;
  }

  /**
   * Splits selected items off the source order into a brand-new order
   * (same outlet/channel/table by default), recalculating totals on both.
   */
  async splitOrder(orderId: string, itemIds: string[]): Promise<{ original: Order; split: Order }> {
    const order = await this.getOrderOrThrow(orderId);
    if (order.status === 'cancelled' || order.status === 'paid') {
      throw new Error(`Cannot split an order in status '${order.status}'`);
    }
    if (itemIds.length === 0) {
      throw new Error('splitOrder requires at least one item id');
    }
    const itemIdSet = new Set(itemIds);
    const movingItems = order.items.filter((i) => itemIdSet.has(i.id));
    if (movingItems.length !== itemIds.length) {
      throw new Error('One or more item ids not found on order');
    }
    if (movingItems.length === order.items.length) {
      throw new Error('Cannot split all items out of an order; leave at least one behind');
    }

    const remainingItems = order.items.filter((i) => !itemIdSet.has(i.id));
    const now = new Date().toISOString();

    const newOrder: Order = {
      id: randomUUID(),
      outlet_id: order.outlet_id,
      status: 'open',
      kot_sent: order.kot_sent,
      channel: order.channel,
      table_id: order.table_id,
      bill_no: null,
      kot_no: null,
      items: movingItems.map((i) => ({ ...i, id: randomUUID(), order_id: '' })),
      subtotal_amount: 0,
      tax_amount: 0,
      discount_amount: 0,
      grand_total_amount: 0,
      total_override_reason: null,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      otp: null,
      created_at: now,
      updated_at: now,
    };
    newOrder.items = newOrder.items.map((i) => ({ ...i, order_id: newOrder.id }));

    order.items = remainingItems;
    order.updated_at = now;

    const savedOriginal = await this.calculateTotals(order).then((o) => this.repo.save(o));
    const calculatedNew = await this.calculateTotals(newOrder);
    const savedNew = await this.repo.save(calculatedNew);

    return { original: savedOriginal, split: savedNew };
  }
}
