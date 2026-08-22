import type {
  OutletBillingSettingsShape,
  OutletPrintSettingsShape,
  PrintDocumentShape,
  PrintingService,
  SettingsService,
  TaxComputeInput,
  TaxComputeResult,
  TaxService,
  KotRenderInput,
  BillRenderInput,
} from '../../shared/src/interfaces';

const DEFAULT_BILLING_SETTINGS: OutletBillingSettingsShape = {
  outlet_id: 'test-outlet',
  default_order_type: 'dine_in',
  default_payment_type: 'cash',
  default_table_no: null,
  delivery_charge_enabled: false,
  delivery_charge_amount: 0,
  container_charge_enabled: false,
  container_charge_auto_channels: [],
  container_charge_mode: 'order_wise',
  container_charge_label: 'Container Charge',
  service_charge_enabled: false,
  tax_before_discount: true,
  backward_tax_after_discount: false,
  discount_calc_basis: 'total',
  updated_at: new Date(0).toISOString(),
};

const DEFAULT_PRINT_SETTINGS: OutletPrintSettingsShape = {
  outlet_id: 'test-outlet',
  print_kot_on_bill: false,
  consider_nonprepared_kot_in_bill: true,
  print_only_modified_kot: false,
  print_only_modified_items: false,
  print_deleted_items_inline: false,
  print_deleted_items_separate: false,
  print_cancelled_kot: false,
  kot_no_as_token: false,
  cwt_bifurcation: false,
  item_price_backward_tax_mode: false,
  show_backward_tax_on_bill: false,
  show_duplicate_marker_bill: true,
  show_duplicate_marker_kot: true,
  highlight_orderid_mode: 'none',
  restaurant_name: 'Test Restaurant',
  header_text: '',
  footer_text: '',
  new_customer_message: '',
  show_restaurant_name: true,
  show_retail_invoice: false,
  show_srno_column: true,
  show_assign_label: false,
  updated_at: new Date(0).toISOString(),
};

/** Deterministic fake tax: flat 5% of subtotal, regardless of channel.
 * Real branching logic (Backward/Forward tax mode) lives in the real
 * TaxService implementation, out of scope here. */
export class FakeTaxService implements TaxService {
  constructor(private readonly rate = 0.05) {}

  async computeTax(input: TaxComputeInput): Promise<TaxComputeResult> {
    const mode = input.channel === 'dine_in' || input.channel === 'pickup' ? 'backward' : 'forward';
    const taxAmount = Math.round(input.subtotalAmount * this.rate * 100) / 100;
    return {
      mode,
      totalRatePercent: this.rate * 100,
      netBeforeTax: input.subtotalAmount,
      taxAmount,
      totalWithTax: Math.round((input.subtotalAmount + taxAmount) * 100) / 100,
      breakdown: [{ taxId: 'FAKE_GST', title: 'Fake GST', ratePercent: this.rate * 100, amount: taxAmount }],
    };
  }
}

export class FakeSettingsService implements SettingsService {
  private billingOverrides = new Map<string, Partial<OutletBillingSettingsShape>>();
  private printOverrides = new Map<string, Partial<OutletPrintSettingsShape>>();

  setBillingOverride(outletId: string, override: Partial<OutletBillingSettingsShape>): void {
    this.billingOverrides.set(outletId, override);
  }

  async getBillingSettings(outletId: string): Promise<OutletBillingSettingsShape> {
    return { ...DEFAULT_BILLING_SETTINGS, outlet_id: outletId, ...(this.billingOverrides.get(outletId) ?? {}) };
  }

  async updateBillingSettings(
    outletId: string,
    patch: Partial<Omit<OutletBillingSettingsShape, 'outlet_id'>>,
  ): Promise<OutletBillingSettingsShape> {
    const current = await this.getBillingSettings(outletId);
    const updated = { ...current, ...patch, outlet_id: outletId };
    this.billingOverrides.set(outletId, updated);
    return updated;
  }

  async getPrintSettings(outletId: string): Promise<OutletPrintSettingsShape> {
    return { ...DEFAULT_PRINT_SETTINGS, outlet_id: outletId, ...(this.printOverrides.get(outletId) ?? {}) };
  }

  async updatePrintSettings(
    outletId: string,
    patch: Partial<Omit<OutletPrintSettingsShape, 'outlet_id'>>,
  ): Promise<OutletPrintSettingsShape> {
    const current = await this.getPrintSettings(outletId);
    const updated = { ...current, ...patch, outlet_id: outletId };
    this.printOverrides.set(outletId, updated);
    return updated;
  }
}

export class FakePrintingService implements PrintingService {
  renderedKots: KotRenderInput[] = [];
  renderedBills: BillRenderInput[] = [];

  renderKot(order: KotRenderInput, _printSettings: OutletPrintSettingsShape): PrintDocumentShape {
    this.renderedKots.push(order);
    return { type: 'kot', outletId: order.outletId, orderId: order.id, isReprint: order.isReprint, lines: [{ text: `KOT #${order.orderNumber}`, style: 'header' }] };
  }

  renderBill(order: BillRenderInput, _printSettings: OutletPrintSettingsShape): PrintDocumentShape {
    this.renderedBills.push(order);
    return { type: 'bill', outletId: order.outletId, orderId: order.id, isReprint: order.isReprint, lines: [{ text: `Bill #${order.orderNumber}`, style: 'header' }] };
  }
}
