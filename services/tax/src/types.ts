// services/tax/src/types.ts

export type OrderChannel = 'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato';

export type TaxCalcType = 'percentage' | 'flat';

/**
 * 'backward' = tax is treated as already INCLUDED in the item price and is
 *   extracted from it (dine_in / pickup).
 * 'forward'  = tax is ADDED ON TOP of the item price (delivery / swiggy /
 *   zomato).
 */
export type TaxMode = 'backward' | 'forward';

/**
 * A single outlet-configurable tax row (e.g. "CGST", "SGST"). Never
 * hardcoded — created/edited/deleted per outlet via admin CRUD. Real
 * outlets run multiple rows simultaneously (CGST 2.5% + SGST 2.5% = 5%
 * total).
 */
export interface Tax {
  id: string;
  outletId: string;
  title: string;
  calcType: TaxCalcType;
  /** For calcType='percentage', a percent value (2.5 = 2.5%). For
   * calcType='flat', a flat money amount. */
  rate: number;
  active: boolean;
}

/**
 * Channel-scoped tax rule: which tax rows apply to a given order channel at
 * a given outlet, and which mode (backward/forward) governs that channel.
 * Tax rows are channel-scoped, never a single outlet-wide toggle — dine_in
 * and pickup use backward mode, delivery/swiggy/zomato use forward mode,
 * both existing simultaneously for the same outlet.
 */
export interface TaxChannelRule {
  id: string;
  outletId: string;
  channel: OrderChannel;
  mode: TaxMode;
  /** Tax rows that apply for this channel at this outlet. */
  taxIds: string[];
}

export interface TaxBreakdownLine {
  taxId: string;
  title: string;
  ratePercent: number;
  amount: number;
}

export interface TaxComputeInput {
  outletId: string;
  channel: OrderChannel;
  /** Backward channels: tax-inclusive subtotal. Forward channels:
   * tax-exclusive subtotal. */
  subtotalAmount: number;
}

export interface TaxComputeResult {
  mode: TaxMode;
  totalRatePercent: number;
  /** Subtotal net of tax, regardless of mode. */
  netBeforeTax: number;
  taxAmount: number;
  /** Final tax-inclusive amount for this subtotal. */
  totalWithTax: number;
  breakdown: TaxBreakdownLine[];
}

export interface TaxService {
  computeTax(input: TaxComputeInput): Promise<TaxComputeResult>;
}
