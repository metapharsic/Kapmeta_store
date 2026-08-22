// services/printing/src/types.ts

import { OrderChannel } from '../../settings/src/types';

export type PrintDocumentType = 'bill' | 'kot';

export type PrintLineStyle = 'normal' | 'bold' | 'header' | 'divider' | 'small';

export interface PrintLine {
  text: string;
  style?: PrintLineStyle;
}

/**
 * Structured, settings-driven print output. Not actual PDF/ESC-POS bytes --
 * a lower-level renderer (out of scope here) turns these lines into printer
 * commands or a rendered PDF/HTML preview.
 */
export interface PrintDocument {
  type: PrintDocumentType;
  outletId: string;
  orderId: string;
  isReprint: boolean;
  lines: PrintLine[];
}

/** Minimal order-item shape this service needs. Orders service owns the real type. */
export interface PrintableOrderItem {
  id: string;
  name: string;
  qty: number;
  amount: number;
  isModified?: boolean;
  isCancelled?: boolean;
  isDeleted?: boolean;
  isPrepared?: boolean;
}

interface PrintableOrderBase {
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

export interface KotRenderInput extends PrintableOrderBase {
  isReprint: boolean;
}

export interface BillRenderInput extends PrintableOrderBase {
  isReprint: boolean;
}

import { OutletPrintSettings } from '../../settings/src/types';

export interface PrintingService {
  renderKot(order: KotRenderInput, printSettings: OutletPrintSettings): PrintDocument;
  renderBill(order: BillRenderInput, printSettings: OutletPrintSettings): PrintDocument;
}
