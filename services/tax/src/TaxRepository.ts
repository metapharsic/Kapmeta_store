// services/tax/src/TaxRepository.ts
//
// PLACEHOLDER in-memory repository. This mirrors the same Repository<T>
// pattern used across the rest of the codebase; it exists so the calculation
// logic never contains hardcoded business data. The real implementation
// reads from the Postgres tables created by db/migrations (taxes,
// tax_channel_rules) — swap this class out without touching TaxService.

import { OrderChannel, Tax, TaxChannelRule } from './types';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export class TaxRepository {
  private taxes = new Map<string, Tax>();
  private channelRules = new Map<string, TaxChannelRule>();

  // ---- Tax row CRUD -------------------------------------------------

  async createTax(input: Omit<Tax, 'id'>): Promise<Tax> {
    const tax: Tax = { ...input, id: nextId('tax') };
    this.taxes.set(tax.id, tax);
    return tax;
  }

  async updateTax(id: string, patch: Partial<Omit<Tax, 'id'>>): Promise<Tax | undefined> {
    const existing = this.taxes.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.taxes.set(id, updated);
    return updated;
  }

  async deleteTax(id: string): Promise<boolean> {
    return this.taxes.delete(id);
  }

  async getTax(id: string): Promise<Tax | undefined> {
    return this.taxes.get(id);
  }

  async listTaxesForOutlet(outletId: string): Promise<Tax[]> {
    return [...this.taxes.values()].filter((t) => t.outletId === outletId);
  }

  // ---- Channel-scope rule CRUD ---------------------------------------

  async createChannelRule(input: Omit<TaxChannelRule, 'id'>): Promise<TaxChannelRule> {
    const rule: TaxChannelRule = { ...input, id: nextId('rule') };
    this.channelRules.set(rule.id, rule);
    return rule;
  }

  async updateChannelRule(
    id: string,
    patch: Partial<Omit<TaxChannelRule, 'id'>>,
  ): Promise<TaxChannelRule | undefined> {
    const existing = this.channelRules.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.channelRules.set(id, updated);
    return updated;
  }

  /** Returns the channel rule configured for this outlet + channel, if any.
   * Returns undefined when the outlet has never configured a rule for this
   * channel — TaxService then falls back to the LOCKED default mode
   * mapping (dine_in/pickup=backward, delivery/swiggy/zomato=forward) with
   * zero tax rows, never a hardcoded rate. */
  async getChannelRule(outletId: string, channel: OrderChannel): Promise<TaxChannelRule | undefined> {
    return [...this.channelRules.values()].find(
      (r) => r.outletId === outletId && r.channel === channel,
    );
  }

  async getTaxesByIds(ids: string[]): Promise<Tax[]> {
    return ids
      .map((id) => this.taxes.get(id))
      .filter((t): t is Tax => !!t && t.active);
  }
}
