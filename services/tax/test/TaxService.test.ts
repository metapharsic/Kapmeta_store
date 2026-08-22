// services/tax/test/TaxService.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { TaxRepository } from '../src/TaxRepository';
import { TaxService } from '../src/TaxService';

const OUTLET_ID = 'outlet-1';

async function seedFivePercentSplit(repo: TaxRepository, channel: 'dine_in' | 'pickup' | 'delivery' | 'swiggy' | 'zomato', mode: 'backward' | 'forward') {
  const cgst = await repo.createTax({ outletId: OUTLET_ID, title: 'CGST', calcType: 'percentage', rate: 2.5, active: true });
  const sgst = await repo.createTax({ outletId: OUTLET_ID, title: 'SGST', calcType: 'percentage', rate: 2.5, active: true });
  await repo.createChannelRule({ outletId: OUTLET_ID, channel, mode, taxIds: [cgst.id, sgst.id] });
  return { cgst, sgst };
}

describe('TaxService', () => {
  let repo: TaxRepository;
  let service: TaxService;

  beforeEach(() => {
    repo = new TaxRepository();
    service = new TaxService(repo);
  });

  it('backward tax on subtotal 200 with 5% total rate extracts ~9.52 tax, net ~190.48', async () => {
    await seedFivePercentSplit(repo, 'dine_in', 'backward');

    const result = await service.computeTax({ outletId: OUTLET_ID, channel: 'dine_in', subtotalAmount: 200 });

    expect(result.mode).toBe('backward');
    expect(result.taxAmount).toBeCloseTo(9.52, 2);
    expect(result.netBeforeTax).toBeCloseTo(190.48, 2);
    expect(result.totalWithTax).toBeCloseTo(200, 2);

    expect(result.breakdown).toHaveLength(2);
    const cgstLine = result.breakdown.find((b) => b.title === 'CGST')!;
    const sgstLine = result.breakdown.find((b) => b.title === 'SGST')!;
    expect(cgstLine.amount).toBeCloseTo(4.76, 2);
    expect(sgstLine.amount).toBeCloseTo(4.76, 2);
    expect(roundedSum(cgstLine.amount, sgstLine.amount)).toBeCloseTo(9.52, 2);
  });

  it('forward tax on subtotal 200 with 5% total rate adds exactly 10.00 tax', async () => {
    await seedFivePercentSplit(repo, 'swiggy', 'forward');

    const result = await service.computeTax({ outletId: OUTLET_ID, channel: 'swiggy', subtotalAmount: 200 });

    expect(result.mode).toBe('forward');
    expect(result.taxAmount).toBe(10.0);
    expect(result.netBeforeTax).toBe(200);
    expect(result.totalWithTax).toBe(210.0);

    expect(result.breakdown).toHaveLength(2);
    const cgstLine = result.breakdown.find((b) => b.title === 'CGST')!;
    const sgstLine = result.breakdown.find((b) => b.title === 'SGST')!;
    expect(cgstLine.amount).toBe(5.0);
    expect(sgstLine.amount).toBe(5.0);
  });

  it('dine_in maps to backward mode and swiggy maps to forward mode by LOCKED default, same outlet, same rate', async () => {
    // Same outlet, two different channel rules configured simultaneously —
    // proving tax mode is channel-scoped, never a single outlet-wide toggle.
    await seedFivePercentSplit(repo, 'dine_in', 'backward');
    const swiggyTaxes = await seedFivePercentSplit(repo, 'swiggy', 'forward');
    expect(swiggyTaxes.cgst.id).not.toBe(undefined);

    const dineIn = await service.computeTax({ outletId: OUTLET_ID, channel: 'dine_in', subtotalAmount: 200 });
    const swiggy = await service.computeTax({ outletId: OUTLET_ID, channel: 'swiggy', subtotalAmount: 200 });

    expect(dineIn.mode).toBe('backward');
    expect(swiggy.mode).toBe('forward');
    expect(dineIn.taxAmount).not.toBe(swiggy.taxAmount);
    expect(dineIn.taxAmount).toBeCloseTo(9.52, 2);
    expect(swiggy.taxAmount).toBe(10.0);
  });

  it('falls back to the LOCKED default mode mapping when no channel rule has been configured', async () => {
    // No tax rows/rules configured at all for 'pickup' at this outlet.
    const result = await service.computeTax({ outletId: OUTLET_ID, channel: 'pickup', subtotalAmount: 200 });
    expect(result.mode).toBe('backward');
    expect(result.taxAmount).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });

  it('supports full CRUD on tax rows without any hardcoded rate in the service', async () => {
    const created = await repo.createTax({ outletId: OUTLET_ID, title: 'VAT', calcType: 'percentage', rate: 12.5, active: true });
    expect(created.id).toBeTruthy();

    const updated = await repo.updateTax(created.id, { rate: 18 });
    expect(updated?.rate).toBe(18);

    const listed = await repo.listTaxesForOutlet(OUTLET_ID);
    expect(listed.some((t) => t.id === created.id)).toBe(true);

    const deleted = await repo.deleteTax(created.id);
    expect(deleted).toBe(true);
    const afterDelete = await repo.listTaxesForOutlet(OUTLET_ID);
    expect(afterDelete.some((t) => t.id === created.id)).toBe(false);
  });
});

function roundedSum(a: number, b: number): number {
  return Math.round((a + b + Number.EPSILON) * 100) / 100;
}
