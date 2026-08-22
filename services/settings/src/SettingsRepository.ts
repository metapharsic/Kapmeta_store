// services/settings/src/SettingsRepository.ts
//
// PLACEHOLDER in-memory repository. Real implementation reads/writes the
// Postgres tables outlet_billing_settings / outlet_print_settings created by
// db/migrations, seeded per-outlet by the admin CRUD flows. The defaults
// below are FIRST-RUN DEFAULTS ONLY — the safe values an outlet starts with
// before ever touching the admin settings screen. They are NOT hardcoded
// business data: every one of these fields is stored per-outlet and the
// outlet operator can change every single one of them via the admin UI at
// any time. No code outside this fallback ever assumes these particular
// values.

import { OutletBillingSettings, OutletPrintSettings } from './types';

function firstRunBillingDefaults(outletId: string): OutletBillingSettings {
  // First-run defaults, not hardcoded business data — outlet must be able
  // to change every one of these via admin UI.
  return {
    outlet_id: outletId,
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
}

function firstRunPrintDefaults(outletId: string): OutletPrintSettings {
  // First-run defaults, not hardcoded business data — outlet must be able
  // to change every one of these via admin UI.
  return {
    outlet_id: outletId,

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

    // Intentionally blank — the printing renderer must never fall back to a
    // literal restaurant name; an outlet that hasn't configured these yet
    // simply prints blank lines until the admin sets real values.
    restaurant_name: '',
    header_text: '',
    footer_text: '',
    new_customer_message: '',

    show_restaurant_name: true,
    show_retail_invoice: false,
    show_srno_column: true,
    show_assign_label: false,

    updated_at: new Date(0).toISOString(),
  };
}

export class SettingsRepository {
  private billingByOutlet = new Map<string, OutletBillingSettings>();
  private printByOutlet = new Map<string, OutletPrintSettings>();

  async getBillingSettings(outletId: string): Promise<OutletBillingSettings> {
    let existing = this.billingByOutlet.get(outletId);
    if (!existing) {
      existing = firstRunBillingDefaults(outletId);
      this.billingByOutlet.set(outletId, existing);
    }
    return existing;
  }

  async saveBillingSettings(settings: OutletBillingSettings): Promise<OutletBillingSettings> {
    this.billingByOutlet.set(settings.outlet_id, settings);
    return settings;
  }

  async getPrintSettings(outletId: string): Promise<OutletPrintSettings> {
    let existing = this.printByOutlet.get(outletId);
    if (!existing) {
      existing = firstRunPrintDefaults(outletId);
      this.printByOutlet.set(outletId, existing);
    }
    return existing;
  }

  async savePrintSettings(settings: OutletPrintSettings): Promise<OutletPrintSettings> {
    this.printByOutlet.set(settings.outlet_id, settings);
    return settings;
  }
}
