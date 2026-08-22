// services/settings/src/types.ts

export type OrderChannel = 'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato';

export type ContainerChargeMode = 'item_wise' | 'order_wise' | 'fix_per_item';

export type DiscountCalcBasis = 'total' | 'core';

export type HighlightOrderIdMode = 'none' | 'background' | 'border';

/**
 * Mirrors outlet_billing_settings. Every field here is outlet-configurable
 * via admin CRUD — code only ever reads these, never hardcodes a value.
 */
export interface OutletBillingSettings {
  outlet_id: string;

  default_order_type: OrderChannel;
  default_payment_type: string;
  default_table_no: string | null;

  delivery_charge_enabled: boolean;
  delivery_charge_amount: number;

  container_charge_enabled: boolean;
  /** Which of dine_in/pickup/delivery get the container charge auto-applied. */
  container_charge_auto_channels: OrderChannel[];
  container_charge_mode: ContainerChargeMode;
  container_charge_label: string;

  service_charge_enabled: boolean;

  /** Whether tax is computed before discount is applied. */
  tax_before_discount: boolean;
  /** Whether backward tax should be recalculated after discount is applied. */
  backward_tax_after_discount: boolean;

  discount_calc_basis: DiscountCalcBasis;

  updated_at: string;
}

/**
 * Mirrors outlet_print_settings. Every field here is outlet-configurable via
 * admin CRUD; PrintingService reads them at render time and never hardcodes
 * restaurant name/header/footer or any layout decision they govern.
 */
export interface OutletPrintSettings {
  outlet_id: string;

  print_kot_on_bill: boolean;
  consider_nonprepared_kot_in_bill: boolean;
  print_only_modified_kot: boolean;
  print_only_modified_items: boolean;
  print_deleted_items_inline: boolean;
  print_deleted_items_separate: boolean;
  print_cancelled_kot: boolean;
  kot_no_as_token: boolean;
  cwt_bifurcation: boolean;
  item_price_backward_tax_mode: boolean;
  show_backward_tax_on_bill: boolean;
  show_duplicate_marker_bill: boolean;
  show_duplicate_marker_kot: boolean;
  highlight_orderid_mode: HighlightOrderIdMode;

  restaurant_name: string;
  header_text: string;
  footer_text: string;
  new_customer_message: string;

  show_restaurant_name: boolean;
  show_retail_invoice: boolean;
  show_srno_column: boolean;
  show_assign_label: boolean;

  updated_at: string;
}

export interface SettingsService {
  getBillingSettings(outletId: string): Promise<OutletBillingSettings>;
  updateBillingSettings(
    outletId: string,
    patch: Partial<Omit<OutletBillingSettings, 'outlet_id'>>,
  ): Promise<OutletBillingSettings>;

  getPrintSettings(outletId: string): Promise<OutletPrintSettings>;
  updatePrintSettings(
    outletId: string,
    patch: Partial<Omit<OutletPrintSettings, 'outlet_id'>>,
  ): Promise<OutletPrintSettings>;
}
