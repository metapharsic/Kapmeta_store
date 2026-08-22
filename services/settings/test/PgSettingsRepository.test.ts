// services/settings/test/PgSettingsRepository.test.ts
//
// Exercises PgSettingsRepository against a pg-mem database loaded with the
// real schema (outlet_billing_settings + outlet_print_settings from
// db-migrations/0013, extended by 0016_extend_outlet_settings_jsonb.sql —
// see that file and services/shared/db/README.md for why). See
// services/orders/test/PgOrdersRepository.test.ts's file header for why
// pg-mem, and how to point this at a real Postgres instead.

import { describe, expect, it } from 'vitest';
import { createTestPool, seedOutlet } from '../../shared/test/pgMemHarness';
import { PgSettingsRepository } from '../src/PgSettingsRepository';

describe('PgSettingsRepository', () => {
  it('first-run access INSERTs a defaults row and returns it (defaults live in the DB, not a literal)', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgSettingsRepository(pool as any);

    const billing = await repo.getBillingSettings(outletId);
    expect(billing.outlet_id).toBe(outletId);
    expect(billing.service_charge_enabled).toBe(false); // outlet_billing_settings' own column DEFAULT
    expect(billing.default_order_type).toBe('dine_in'); // extended_settings first-run value

    const rawRow = await pool.query(
      `SELECT service_charge_enabled, extended_settings FROM outlet_billing_settings WHERE outlet_id = $1`,
      [outletId],
    );
    expect(rawRow.rows).toHaveLength(1); // a real row now exists, not just an in-memory return value
    expect(rawRow.rows[0]!.service_charge_enabled).toBe(false);
  });

  it('getBillingSettings is idempotent: a second call reads the same row rather than re-inserting', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgSettingsRepository(pool as any);

    await repo.getBillingSettings(outletId);
    await repo.getBillingSettings(outletId);

    const rows = await pool.query(`SELECT * FROM outlet_billing_settings WHERE outlet_id = $1`, [outletId]);
    expect(rows.rows).toHaveLength(1);
  });

  it('saveBillingSettings persists both the first-class column and the jsonb overflow fields', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgSettingsRepository(pool as any);

    const current = await repo.getBillingSettings(outletId);
    const updated = await repo.saveBillingSettings({
      ...current,
      service_charge_enabled: true,
      container_charge_enabled: true,
      container_charge_label: 'Packing Charge',
    });
    expect(updated.service_charge_enabled).toBe(true);
    expect(updated.container_charge_label).toBe('Packing Charge');

    const reread = await repo.getBillingSettings(outletId);
    expect(reread.service_charge_enabled).toBe(true);
    expect(reread.container_charge_enabled).toBe(true);
    expect(reread.container_charge_label).toBe('Packing Charge');
  });

  it('print settings: footer_text maps to the footer_message column, rest to extended_settings', async () => {
    const pool = createTestPool();
    const outletId = await seedOutlet(pool);
    const repo = new PgSettingsRepository(pool as any);

    const defaults = await repo.getPrintSettings(outletId);
    expect(defaults.footer_text).toBe('');
    expect(defaults.print_kot_on_bill).toBe(false);
    expect(defaults.show_srno_column).toBe(true);

    const updated = await repo.savePrintSettings({
      ...defaults,
      footer_text: 'Thank you, visit again!',
      restaurant_name: 'Hotel kapila',
    });
    expect(updated.footer_text).toBe('Thank you, visit again!');

    const rawRow = await pool.query(
      `SELECT footer_message FROM outlet_print_settings WHERE outlet_id = $1`,
      [outletId],
    );
    expect(rawRow.rows[0]!.footer_message).toBe('Thank you, visit again!');

    const reread = await repo.getPrintSettings(outletId);
    expect(reread.restaurant_name).toBe('Hotel kapila');
  });

  it('settings are isolated per outlet', async () => {
    const pool = createTestPool();
    const outletA = await seedOutlet(pool, 'A');
    const outletB = await seedOutlet(pool, 'B');
    const repo = new PgSettingsRepository(pool as any);

    const a = await repo.getBillingSettings(outletA);
    await repo.saveBillingSettings({ ...a, service_charge_enabled: true });

    const b = await repo.getBillingSettings(outletB);
    expect(b.service_charge_enabled).toBe(false);
  });
});
