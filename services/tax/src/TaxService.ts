// services/tax/src/TaxService.ts
//
// Real backward/forward tax arithmetic against a single subtotal.
//
// Worked example (also asserted in test/TaxService.test.ts):
//
//   subtotal = 200.00, two active rows CGST 2.5% + SGST 2.5% (total 5%).
//
//   BACKWARD (dine_in / pickup — tax already included in the 200 subtotal):
//     netBeforeTax = 200 / 1.05          = 190.476190...  -> round -> 190.48
//     taxAmount    = 200 - 190.48                          =   9.52
//     totalWithTax = 200.00 (unchanged — tax was already inside the price)
//
//   FORWARD (delivery / swiggy / zomato — tax added on top of 200):
//     taxAmount    = 200 * 0.05 = 10.00
//     totalWithTax = 200 + 10.00 = 210.00
//
// No business data (rates, which mode a channel uses beyond the LOCKED
// default mapping, channel scoping) is hardcoded — rates and channel-rule
// assignments are always read from TaxRepository, the in-memory placeholder
// for the real Postgres-backed repository.

import { roundMoney } from './money';
import { TaxRepository } from './TaxRepository';
import {
  OrderChannel,
  Tax,
  TaxBreakdownLine,
  TaxComputeInput,
  TaxComputeResult,
  TaxMode,
  TaxService as ITaxService,
} from './types';

/**
 * LOCKED default channel -> tax mode mapping (business decision, not a
 * rate): dine_in/pickup are backward (tax-inclusive pricing), delivery and
 * aggregator channels are forward (tax-exclusive pricing). Used only when
 * the outlet has not (yet) configured an explicit TaxChannelRule for the
 * channel — actual RATES always come from outlet-configured Tax rows, never
 * from this mapping.
 */
const DEFAULT_MODE_BY_CHANNEL: Record<OrderChannel, TaxMode> = {
  dine_in: 'backward',
  pickup: 'backward',
  delivery: 'forward',
  swiggy: 'forward',
  zomato: 'forward',
};

export class TaxService implements ITaxService {
  constructor(private readonly repo: TaxRepository) {}

  async computeTax(input: TaxComputeInput): Promise<TaxComputeResult> {
    const { outletId, channel, subtotalAmount } = input;

    const rule = await this.repo.getChannelRule(outletId, channel);
    const mode: TaxMode = rule?.mode ?? DEFAULT_MODE_BY_CHANNEL[channel];
    const taxes: Tax[] = rule ? await this.repo.getTaxesByIds(rule.taxIds) : [];

    const percentageTaxes = taxes.filter((t) => t.calcType === 'percentage' && t.active);
    const flatTaxes = taxes.filter((t) => t.calcType === 'flat' && t.active);

    const totalRatePercent = percentageTaxes.reduce((sum, t) => sum + t.rate, 0);
    const flatTotal = flatTaxes.reduce((sum, t) => sum + t.rate, 0);

    let netBeforeTax: number;
    let taxAmount: number;

    if (mode === 'backward') {
      // Tax-inclusive: extract tax from the subtotal.
      netBeforeTax = roundMoney(subtotalAmount / (1 + totalRatePercent / 100));
      taxAmount = roundMoney(subtotalAmount - netBeforeTax + flatTotal);
    } else {
      // Tax-exclusive: add tax on top of the subtotal.
      netBeforeTax = roundMoney(subtotalAmount);
      taxAmount = roundMoney((subtotalAmount * totalRatePercent) / 100 + flatTotal);
    }

    const totalWithTax =
      mode === 'backward' ? roundMoney(subtotalAmount + flatTotal) : roundMoney(netBeforeTax + taxAmount);

    const breakdown: TaxBreakdownLine[] = this.buildBreakdown(
      percentageTaxes,
      flatTaxes,
      mode,
      subtotalAmount,
      totalRatePercent,
      taxAmount,
    );

    return { mode, totalRatePercent, netBeforeTax, taxAmount, totalWithTax, breakdown };
  }

  /** Splits the computed taxAmount across each configured row, proportional
   * to that row's own rate share of the combined percentage rate (plus flat
   * rows added at face value). Rounding remainder is assigned to the last
   * row so the breakdown always sums exactly to taxAmount. */
  private buildBreakdown(
    percentageTaxes: Tax[],
    flatTaxes: Tax[],
    mode: TaxMode,
    subtotalAmount: number,
    totalRatePercent: number,
    taxAmount: number,
  ): TaxBreakdownLine[] {
    const lines: TaxBreakdownLine[] = [];
    const percentagePortion = roundMoney(
      taxAmount - flatTaxes.reduce((sum, t) => sum + roundMoney(t.rate), 0),
    );

    let allocated = 0;
    percentageTaxes.forEach((tax, idx) => {
      const isLast = idx === percentageTaxes.length - 1;
      const share = totalRatePercent > 0 ? tax.rate / totalRatePercent : 0;
      let amount = roundMoney(percentagePortion * share);
      if (isLast) amount = roundMoney(percentagePortion - allocated);
      allocated = roundMoney(allocated + amount);
      lines.push({ taxId: tax.id, title: tax.title, ratePercent: tax.rate, amount });
    });

    flatTaxes.forEach((tax) => {
      lines.push({ taxId: tax.id, title: tax.title, ratePercent: 0, amount: roundMoney(tax.rate) });
    });

    return lines;
  }
}
