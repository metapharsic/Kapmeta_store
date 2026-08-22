// services/printing/src/adapters.ts
//
// Converts OrdersService's own `PrintableOrder` projection (see
// services/shared/src/interfaces.ts) into the real `KotRenderInput`/
// `BillRenderInput` shapes that `PrintingService` actually renders from.
//
// `PrintableOrder` only knows what `Order`/`OrderItem` currently store
// (services/orders/src/types.ts): it has no per-line tax breakdown, no
// container/delivery/service charge, no customer info, and no reprint flag
// — those are either not yet tracked on `Order` or are orchestration-layer
// concerns outside this service's scope (see interface-audit.md #1). Fields
// that Orders does not have are filled with safe, non-fabricated defaults
// (0 / empty array / undefined) rather than invented values.

import type { OrderChannel } from '../../settings/src/types';
import type { BillRenderInput, KotRenderInput, PrintableOrderItem } from './types';

/** Matches services/shared/src/interfaces.ts's PrintableOrder/PrintableOrderItem. */
export interface PrintableOrderItemLike {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isCancelled?: boolean;
  isModified?: boolean;
  isDeleted?: boolean;
  isPrepared?: boolean;
}

export interface PrintableOrderLike {
  orderId: string;
  outletId: string;
  channel: OrderChannel;
  kotNo?: number;
  billNo?: number;
  tableNo?: string | null;
  isDuplicatePrint?: boolean;
  items: PrintableOrderItemLike[];
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
}

function toRenderItems(items: PrintableOrderItemLike[]): PrintableOrderItem[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    qty: i.quantity,
    amount: i.lineTotal,
    isModified: i.isModified,
    isCancelled: i.isCancelled,
    isDeleted: i.isDeleted,
    isPrepared: i.isPrepared,
  }));
}

interface RenderInputBase {
  id: string;
  outletId: string;
  channel: OrderChannel;
  tokenNumber?: string;
  orderNumber: string;
  items: PrintableOrderItem[];
  subtotal: number;
  taxAmount: number;
  taxBreakdown: { title: string; amount: number }[];
  discountAmount: number;
  containerCharge: number;
  deliveryCharge: number;
  serviceCharge: number;
  grandTotal: number;
  customerName?: string;
  isNewCustomer?: boolean;
}

function toRenderInputBase(order: PrintableOrderLike, docNo: number | undefined): RenderInputBase {
  return {
    id: order.orderId,
    outletId: order.outletId,
    channel: order.channel,
    tokenNumber: order.kotNo !== undefined ? String(order.kotNo) : undefined,
    orderNumber: docNo !== undefined ? String(docNo) : order.orderId,
    items: toRenderItems(order.items),
    subtotal: order.subtotalAmount,
    taxAmount: order.taxAmount,
    // Orders does not currently persist a per-tax-row breakdown on Order
    // itself (TaxService.computeTax() returns one, but OrdersService only
    // stores the aggregate tax_amount) — an empty breakdown here is
    // accurate to what is actually known at render time, not a fabricated
    // value. PrintingService.taxLines() falls back to the "Tax Included"
    // note when item_price_backward_tax_mode is set, and otherwise renders
    // whatever rows are present (none, here).
    taxBreakdown: [],
    // Charges/discount are not represented on Order yet either (see
    // OrdersService.calculateTotals()'s own comment on this same gap).
    discountAmount: 0,
    containerCharge: 0,
    deliveryCharge: 0,
    serviceCharge: 0,
    grandTotal: order.totalAmount,
    customerName: undefined,
    isNewCustomer: undefined,
  };
}

export function toKotRenderInput(order: PrintableOrderLike, isReprint = false): KotRenderInput {
  return { ...toRenderInputBase(order, order.kotNo), isReprint };
}

export function toBillRenderInput(order: PrintableOrderLike, isReprint = false): BillRenderInput {
  return { ...toRenderInputBase(order, order.billNo), isReprint };
}
