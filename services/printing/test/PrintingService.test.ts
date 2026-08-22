// services/printing/test/PrintingService.test.ts
import { describe, expect, it } from 'vitest';
import { OutletPrintSettings } from '../../settings/src/types';
import { PrintingService } from '../src/PrintingService';
import { BillRenderInput, KotRenderInput } from '../src/types';

function baseSettings(overrides: Partial<OutletPrintSettings> = {}): OutletPrintSettings {
  return {
    outlet_id: 'outlet-1',
    print_kot_on_bill: false,
    consider_nonprepared_kot_in_bill: true,
    print_only_modified_kot: false,
    print_only_modified_items: false,
    print_deleted_items_inline: false,
    print_deleted_items_separate: true,
    print_cancelled_kot: true,
    kot_no_as_token: false,
    cwt_bifurcation: false,
    item_price_backward_tax_mode: false,
    show_backward_tax_on_bill: true,
    show_duplicate_marker_bill: true,
    show_duplicate_marker_kot: true,
    highlight_orderid_mode: 'none',
    restaurant_name: 'Test Restaurant',
    header_text: 'Welcome',
    footer_text: 'Thank you, visit again',
    new_customer_message: 'Welcome, first timer!',
    show_restaurant_name: true,
    show_retail_invoice: false,
    show_srno_column: true,
    show_assign_label: false,
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function baseOrder(overrides: Partial<BillRenderInput & KotRenderInput> = {}): BillRenderInput & KotRenderInput {
  return {
    id: 'order-1',
    outletId: 'outlet-1',
    channel: 'dine_in',
    orderNumber: 'ORD-100',
    tokenNumber: 'T7',
    isReprint: false,
    items: [
      { id: 'i1', name: 'Paneer Tikka', qty: 1, amount: 100, isCancelled: false, isPrepared: true },
      { id: 'i2', name: 'Butter Naan', qty: 2, amount: 40, isCancelled: true, isPrepared: false },
    ],
    subtotal: 140,
    taxAmount: 5,
    taxBreakdown: [{ title: 'CGST', amount: 2.5 }, { title: 'SGST', amount: 2.5 }],
    discountAmount: 0,
    containerCharge: 0,
    deliveryCharge: 0,
    serviceCharge: 0,
    grandTotal: 145,
    ...overrides,
  };
}

function textOf(doc: { lines: { text: string }[] }): string[] {
  return doc.lines.map((l) => l.text);
}

describe('PrintingService', () => {
  const service = new PrintingService();

  it('omits the cancelled item from the KOT when print_cancelled_kot is off', () => {
    const kot = service.renderKot(baseOrder(), baseSettings({ print_cancelled_kot: false }));
    const lines = textOf(kot);
    expect(lines.some((t) => t.includes('Butter Naan'))).toBe(false);
    expect(lines.some((t) => t.includes('Paneer Tikka'))).toBe(true);
  });

  it('includes the cancelled item on the KOT when print_cancelled_kot is on', () => {
    const kot = service.renderKot(baseOrder(), baseSettings({ print_cancelled_kot: true }));
    expect(textOf(kot).some((t) => t.includes('Butter Naan'))).toBe(true);
  });

  it('does not include the restaurant name line when show_restaurant_name is false', () => {
    const bill = service.renderBill(baseOrder(), baseSettings({ show_restaurant_name: false, restaurant_name: 'Hotel Kapila' }));
    expect(textOf(bill).some((t) => t.includes('Hotel Kapila'))).toBe(false);
  });

  it('includes the restaurant name line when show_restaurant_name is true', () => {
    const bill = service.renderBill(baseOrder(), baseSettings({ show_restaurant_name: true, restaurant_name: 'Hotel Kapila' }));
    expect(textOf(bill).some((t) => t.includes('Hotel Kapila'))).toBe(true);
  });

  it('never contains a literal restaurant name unless it came from settings', () => {
    const settings = baseSettings({ restaurant_name: 'Custom Diner Name', header_text: 'Custom Header', footer_text: 'Custom Footer' });
    const bill = service.renderBill(baseOrder(), settings);
    const lines = textOf(bill);
    expect(lines).toContain('Custom Diner Name');
    expect(lines).toContain('Custom Header');
    expect(lines).toContain('Custom Footer');
  });

  it('collapses the tax breakdown when item_price_backward_tax_mode is on but show_backward_tax_on_bill is off', () => {
    const order = baseOrder();
    const collapsed = service.renderBill(order, baseSettings({ item_price_backward_tax_mode: true, show_backward_tax_on_bill: false }));
    const expanded = service.renderBill(order, baseSettings({ item_price_backward_tax_mode: false, show_backward_tax_on_bill: true }));

    expect(textOf(collapsed).some((t) => t.startsWith('Tax Included:'))).toBe(true);
    expect(textOf(expanded).some((t) => t.startsWith('CGST:'))).toBe(true);
    expect(textOf(expanded).some((t) => t.startsWith('SGST:'))).toBe(true);
  });

  it('adds a DUPLICATE marker on reprint only when show_duplicate_marker_bill/kot is on', () => {
    const order = baseOrder({ isReprint: true });
    const withMarker = service.renderKot(order, baseSettings({ show_duplicate_marker_kot: true }));
    const withoutMarker = service.renderKot(order, baseSettings({ show_duplicate_marker_kot: false }));
    const firstPrint = service.renderKot(baseOrder({ isReprint: false }), baseSettings({ show_duplicate_marker_kot: true }));

    expect(textOf(withMarker)).toContain('DUPLICATE');
    expect(textOf(withoutMarker)).not.toContain('DUPLICATE');
    expect(textOf(firstPrint)).not.toContain('DUPLICATE');
  });

  it('embeds KOT items on the bill only when print_kot_on_bill is on', () => {
    const order = baseOrder();
    const withKot = service.renderBill(order, baseSettings({ print_kot_on_bill: true }));
    const withoutKot = service.renderBill(order, baseSettings({ print_kot_on_bill: false }));

    expect(textOf(withKot)).toContain('KOT Items');
    expect(textOf(withoutKot)).not.toContain('KOT Items');
  });

  it('shows a separate deleted-items section only when print_deleted_items_inline is off and print_deleted_items_separate is on', () => {
    const order = baseOrder({
      items: [
        { id: 'i1', name: 'Paneer Tikka', qty: 1, amount: 100, isDeleted: true },
        { id: 'i2', name: 'Butter Naan', qty: 2, amount: 40 },
      ],
    });

    const inline = service.renderBill(order, baseSettings({ print_deleted_items_inline: true }));
    const separate = service.renderBill(order, baseSettings({ print_deleted_items_inline: false, print_deleted_items_separate: true }));
    const neither = service.renderBill(order, baseSettings({ print_deleted_items_inline: false, print_deleted_items_separate: false }));

    expect(textOf(inline)).not.toContain('Deleted Items');
    expect(textOf(separate)).toContain('Deleted Items');
    expect(textOf(neither)).not.toContain('Deleted Items');
    // Inline mode still shows the deleted item, just not in its own section.
    expect(textOf(inline).some((t) => t.includes('Paneer Tikka'))).toBe(true);
  });

  it('drops non-prepared items from the KOT when consider_nonprepared_kot_in_bill is off', () => {
    const order = baseOrder({
      items: [
        { id: 'i1', name: 'Paneer Tikka', qty: 1, amount: 100, isPrepared: true },
        { id: 'i2', name: 'Butter Naan', qty: 2, amount: 40, isPrepared: false },
      ],
    });
    const kot = service.renderKot(order, baseSettings({ consider_nonprepared_kot_in_bill: false }));
    expect(textOf(kot).some((t) => t.includes('Butter Naan'))).toBe(false);
    expect(textOf(kot).some((t) => t.includes('Paneer Tikka'))).toBe(true);
  });
});
