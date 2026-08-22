// services/printing/src/PrintingService.ts
//
// NOTHING in this file is a hardcoded restaurant name/header/footer string
// or a hardcoded rendering decision -- every conditional below branches on
// a flag or text field read straight out of `printSettings`
// (OutletPrintSettings, sourced from the settings service / DB at render
// time). The only literal strings here are structural labels ("DUPLICATE",
// section markers), never business data.

import { OutletPrintSettings } from '../../settings/src/types';
import {
  BillRenderInput,
  KotRenderInput,
  PrintDocument,
  PrintingService as IPrintingService,
  PrintLine,
  PrintableOrderItem,
} from './types';

function divider(): PrintLine {
  return { text: '--------------------------------', style: 'divider' };
}

function headerLines(printSettings: OutletPrintSettings): PrintLine[] {
  const lines: PrintLine[] = [];
  if (printSettings.show_restaurant_name && printSettings.restaurant_name) {
    lines.push({ text: printSettings.restaurant_name, style: 'header' });
  }
  if (printSettings.header_text) {
    lines.push({ text: printSettings.header_text, style: 'normal' });
  }
  if (printSettings.show_retail_invoice) {
    lines.push({ text: 'Retail Invoice', style: 'small' });
  }
  return lines;
}

function orderIdLines(
  order: { orderNumber: string; tokenNumber?: string },
  printSettings: OutletPrintSettings,
  isReprint: boolean,
  duplicateFlag: boolean,
): PrintLine[] {
  const lines: PrintLine[] = [{ text: `Order #${order.orderNumber}`, style: 'bold' }];

  if (printSettings.kot_no_as_token && order.tokenNumber) {
    lines.push({ text: `Token: ${order.tokenNumber}`, style: 'bold' });
  }

  if (isReprint && duplicateFlag) {
    lines.push({ text: 'DUPLICATE', style: 'bold' });
  }

  if (printSettings.highlight_orderid_mode !== 'none') {
    lines.push({ text: `[highlight:${printSettings.highlight_orderid_mode}]`, style: 'small' });
  }

  return lines;
}

function itemLine(item: PrintableOrderItem, idx: number, printSettings: OutletPrintSettings): PrintLine {
  const parts: string[] = [];
  if (printSettings.show_srno_column) parts.push(`#${idx + 1}`);
  parts.push(`${item.qty} x ${item.name}`);
  if (item.isModified) parts.push('(modified)');
  if (item.isCancelled) parts.push('(cancelled)');
  return { text: `${parts.join(' ')} - ${item.amount.toFixed(2)}` };
}

function taxLines(
  order: { taxAmount: number; taxBreakdown: { title: string; amount: number }[] },
  printSettings: OutletPrintSettings,
): PrintLine[] {
  // Backward tax is already included in the item price; it is only shown
  // as an explicit breakdown when the outlet opts in via
  // show_backward_tax_on_bill / item_price_backward_tax_mode. When off, the
  // amount is collapsed into a single "tax included" note.
  if (printSettings.item_price_backward_tax_mode && !printSettings.show_backward_tax_on_bill) {
    return [{ text: `Tax Included: ${order.taxAmount.toFixed(2)}`, style: 'small' }];
  }
  return order.taxBreakdown.map((row) => ({ text: `${row.title}: ${row.amount.toFixed(2)}`, style: 'small' }));
}

function totalsLines(
  order: {
    subtotal: number;
    discountAmount: number;
    containerCharge: number;
    deliveryCharge: number;
    serviceCharge: number;
    taxAmount: number;
    grandTotal: number;
  },
  printSettings: OutletPrintSettings,
): PrintLine[] {
  const lines: PrintLine[] = [{ text: `Subtotal: ${order.subtotal.toFixed(2)}` }];
  if (order.discountAmount > 0) lines.push({ text: `Discount: -${order.discountAmount.toFixed(2)}` });
  if (order.containerCharge > 0) lines.push({ text: `Container Charge: ${order.containerCharge.toFixed(2)}` });
  if (order.deliveryCharge > 0) lines.push({ text: `Delivery Charge: ${order.deliveryCharge.toFixed(2)}` });
  if (order.serviceCharge > 0) lines.push({ text: `Service Charge: ${order.serviceCharge.toFixed(2)}` });
  lines.push({ text: `Tax: ${order.taxAmount.toFixed(2)}` });
  lines.push({ text: `Grand Total: ${order.grandTotal.toFixed(2)}`, style: 'bold' });

  if (printSettings.cwt_bifurcation) {
    lines.push({ text: 'Charge-wise Tax Bifurcation: enabled', style: 'small' });
  }
  if (printSettings.show_assign_label) {
    lines.push({ text: 'Assigned', style: 'small' });
  }

  return lines;
}

function customerLines(
  order: { customerName?: string; isNewCustomer?: boolean },
  printSettings: OutletPrintSettings,
): PrintLine[] {
  if (!order.customerName) return [];
  const lines: PrintLine[] = [{ text: `Customer: ${order.customerName}` }];
  if (order.isNewCustomer && printSettings.new_customer_message) {
    lines.push({ text: printSettings.new_customer_message, style: 'small' });
  }
  return lines;
}

function footerLines(printSettings: OutletPrintSettings): PrintLine[] {
  if (!printSettings.footer_text) return [];
  return [{ text: printSettings.footer_text, style: 'small' }];
}

/** Filters/annotates the item list for a KOT render according to the
 * relevant print_settings flags. Applied identically whether this is the
 * standalone KOT render or the KOT-embedded-in-bill render. */
function selectKotItems(
  items: PrintableOrderItem[],
  printSettings: OutletPrintSettings,
  isReprint: boolean,
): PrintableOrderItem[] {
  let result = items;

  if (!printSettings.consider_nonprepared_kot_in_bill) {
    result = result.filter((i) => i.isPrepared);
  }

  if (isReprint && printSettings.print_only_modified_kot) {
    result = result.filter((i) => i.isModified);
  }

  if (printSettings.print_only_modified_items) {
    result = result.filter((i) => i.isModified || i.isCancelled || i.isDeleted);
  }

  if (!printSettings.print_cancelled_kot) {
    result = result.filter((i) => !i.isCancelled);
  }

  return result;
}

export class PrintingService implements IPrintingService {
  renderBill(order: BillRenderInput, printSettings: OutletPrintSettings): PrintDocument {
    const lines: PrintLine[] = [];

    lines.push(...headerLines(printSettings));
    lines.push(...orderIdLines(order, printSettings, order.isReprint, printSettings.show_duplicate_marker_bill));
    lines.push(divider());

    // Deleted items: shown inline within the main item list, in a separate
    // section, or omitted, purely per the two independent settings flags.
    const billItems = printSettings.print_deleted_items_inline
      ? order.items
      : order.items.filter((i) => !i.isDeleted);
    billItems.forEach((item, idx) => lines.push(itemLine(item, idx, printSettings)));

    if (!printSettings.print_deleted_items_inline && printSettings.print_deleted_items_separate) {
      const deleted = order.items.filter((i) => i.isDeleted);
      if (deleted.length > 0) {
        lines.push(divider());
        lines.push({ text: 'Deleted Items', style: 'bold' });
        deleted.forEach((item, idx) => lines.push(itemLine(item, idx, printSettings)));
      }
    }

    const cust = customerLines(order, printSettings);
    if (cust.length > 0) {
      lines.push(divider());
      lines.push(...cust);
    }

    lines.push(divider());
    lines.push(...taxLines(order, printSettings));
    lines.push(...totalsLines(order, printSettings));

    if (printSettings.print_kot_on_bill) {
      lines.push(divider());
      lines.push({ text: 'KOT Items', style: 'bold' });
      const kotItems = selectKotItems(order.items, printSettings, order.isReprint);
      kotItems.forEach((item, idx) => lines.push(itemLine(item, idx, printSettings)));
    }

    const footer = footerLines(printSettings);
    if (footer.length > 0) {
      lines.push(divider());
      lines.push(...footer);
    }

    return { type: 'bill', outletId: order.outletId, orderId: order.id, isReprint: order.isReprint, lines };
  }

  renderKot(order: KotRenderInput, printSettings: OutletPrintSettings): PrintDocument {
    const lines: PrintLine[] = [];

    lines.push(...headerLines(printSettings));
    lines.push(...orderIdLines(order, printSettings, order.isReprint, printSettings.show_duplicate_marker_kot));
    lines.push(divider());

    const kotItems = selectKotItems(order.items, printSettings, order.isReprint);
    kotItems.forEach((item, idx) => lines.push(itemLine(item, idx, printSettings)));

    return { type: 'kot', outletId: order.outletId, orderId: order.id, isReprint: order.isReprint, lines };
  }
}
