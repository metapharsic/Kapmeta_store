// services/tax/test/PgTaxRepository.test.ts
//
// Exercises PgTaxRepository against a pg-mem database loaded with the real
// schema (taxes + tax_channel_rules from db-migrations/0007_create_taxes.sql).
// See services/orders/test/PgOrdersRepository.test.ts's file header for why
// pg-mem, and how to point this at a real Postgres instead.

import { describe, expect, it } from 'vitest';
import { createTestPool, seedOutlet } from '../../shared/test/pgMemHarness';
import { PgTaxRepository } from '../src/PgTaxRepository';

describe('PgTaxRepository', () => {
  it('creates and reads back a tax row (calcType always percentage)', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTaxRepository(pool as any);

    const tax = await repo.createTax({
      outletId,
      title: 'CGST',
      calcType: 'percentage',
      rate: 2.5,
      active: true,
    });
    expect(tax.id).toBeTruthy();

    const found = await repo.getTax(tax.id);
    expect(found).toEqual(tax);
  });

  it('rejects calcType "flat" since taxes.rate_percent has no flat-amount column', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTaxRepository(pool as any);

    await expect(
      repo.createTax({ outletId, title: 'Flat Fee', calcType: 'flat', rate: 10, active: true }),
    ).rejects.toThrow(/flat/i);
  });

  it('listTaxesForOutlet only returns rows for that outlet', async () => {
    const pool = createTestPool();
    const outletA = await seedOutlet(pool, 'A');
    const outletB = await seedOutlet(pool, 'B');
    const repo = new PgTaxRepository(pool as any);

    await repo.createTax({ outletId: outletA, title: 'CGST', calcType: 'percentage', rate: 2.5, active: true });
    await repo.createTax({ outletId: outletB, title: 'SGST', calcType: 'percentage', rate: 2.5, active: true });

    const taxesA = await repo.listTaxesForOutlet(outletA);
    expect(taxesA).toHaveLength(1);
    expect(taxesA[0]!.title).toBe('CGST');
  });

  it('reproduces the "Hotel kapila" scenario: backward dine_in + forward online simultaneously', async () => {
    // Mirrors the scenario documented in 0007_create_taxes.sql's own header
    // comment (lines 10-24): CGST+SGST backward for dine_in, CGST[Online]+
    // SGST[Online] forward for online, both active at once for one outlet.
    const pool = createTestPool();
    const outletId = await seedOutlet(pool, 'Hotel kapila');
    const repo = new PgTaxRepository(pool as any);

    const cgst = await repo.createTax({ outletId, title: 'CGST', calcType: 'percentage', rate: 2.5, active: true });
    const sgst = await repo.createTax({ outletId, title: 'SGST', calcType: 'percentage', rate: 2.5, active: true });
    const cgstOnline = await repo.createTax({
      outletId, title: 'CGST [Online]', calcType: 'percentage', rate: 2.5, active: true,
    });
    const sgstOnline = await repo.createTax({
      outletId, title: 'SGST [Online]', calcType: 'percentage', rate: 2.5, active: true,
    });

    await repo.createChannelRule({
      outletId, channel: 'dine_in', mode: 'backward', taxIds: [cgst.id, sgst.id],
    });
    // NOTE: 'online' is a valid DB `order_channel` enum value but is NOT a
    // member of the TS `OrderChannel` union in tax/src/types.ts — see the
    // 'takeaway' note further down in this file, and
    // services/shared/db/README.md "OrderChannel schema/interface mismatch".
    await repo.createChannelRule({
      outletId, channel: 'online' as any, mode: 'forward', taxIds: [cgstOnline.id, sgstOnline.id],
    });

    const dineInRule = await repo.getChannelRule(outletId, 'dine_in');
    expect(dineInRule?.mode).toBe('backward');
    expect(new Set(dineInRule?.taxIds)).toEqual(new Set([cgst.id, sgst.id]));

    const onlineRule = await repo.getChannelRule(outletId, 'online' as any);
    expect(onlineRule?.mode).toBe('forward');
    expect(new Set(onlineRule?.taxIds)).toEqual(new Set([cgstOnline.id, sgstOnline.id]));

    const dineInTaxes = await repo.getTaxesByIds(dineInRule!.taxIds);
    expect(dineInTaxes.map((t) => t.title).sort()).toEqual(['CGST', 'SGST']);
  });

  it('getChannelRule returns undefined when the outlet never configured a rule (falls back to LOCKED default in TaxService)', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTaxRepository(pool as any);
    expect(await repo.getChannelRule(outletId, 'delivery')).toBeUndefined();
  });

  it('updateChannelRule replaces the taxIds set for a channel', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTaxRepository(pool as any);
    const cgst = await repo.createTax({ outletId, title: 'CGST', calcType: 'percentage', rate: 2.5, active: true });
    const sgst = await repo.createTax({ outletId, title: 'SGST', calcType: 'percentage', rate: 2.5, active: true });
    // NOTE: 'takeaway' is a valid value of the DB `order_channel` enum
    // (0001_extensions_and_enums.sql:20-25) but is NOT a member of the TS
    // `OrderChannel` union in tax/src/types.ts ('dine_in' | 'pickup' |
    // 'delivery' | 'swiggy' | 'zomato') — a real, documented schema/
    // interface mismatch (see services/shared/db/README.md "OrderChannel
    // schema/interface mismatch"). Cast through `any` here specifically to
    // exercise a channel value this repository can actually persist; a
    // TS-valid-but-DB-invalid value like 'pickup' throws at the DB layer
    // (also demonstrated by this repository's real behavior).
    const rule = await repo.createChannelRule({
      outletId,
      channel: 'takeaway' as any,
      mode: 'backward',
      taxIds: [cgst.id],
    });

    const updated = await repo.updateChannelRule(rule.id, { taxIds: [cgst.id, sgst.id] });
    expect(new Set(updated?.taxIds)).toEqual(new Set([cgst.id, sgst.id]));

    const narrowed = await repo.updateChannelRule(rule.id, { taxIds: [sgst.id] });
    expect(narrowed?.taxIds).toEqual([sgst.id]);
  });

  it('deleteTax removes the row', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgTaxRepository(pool as any);
    const tax = await repo.createTax({ outletId, title: 'CGST', calcType: 'percentage', rate: 2.5, active: true });
    expect(await repo.deleteTax(tax.id)).toBe(true);
    expect(await repo.getTax(tax.id)).toBeUndefined();
  });
});
