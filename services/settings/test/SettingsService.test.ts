// services/settings/test/SettingsService.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../src/SettingsRepository';
import { SettingsService } from '../src/SettingsService';

const OUTLET_ID = 'outlet-1';

describe('SettingsService', () => {
  let repo: SettingsRepository;
  let service: SettingsService;

  beforeEach(() => {
    repo = new SettingsRepository();
    service = new SettingsService(repo);
  });

  describe('billing settings', () => {
    it('returns first-run defaults for an outlet that has never been configured', async () => {
      const settings = await service.getBillingSettings(OUTLET_ID);
      expect(settings.outlet_id).toBe(OUTLET_ID);
      expect(settings.default_order_type).toBe('dine_in');
      expect(settings.delivery_charge_enabled).toBe(false);
      expect(settings.container_charge_auto_channels).toEqual([]);
      expect(settings.discount_calc_basis).toBe('total');
    });

    it('round-trips an update through get after patching', async () => {
      const updated = await service.updateBillingSettings(OUTLET_ID, {
        delivery_charge_enabled: true,
        delivery_charge_amount: 25,
        container_charge_enabled: true,
        container_charge_auto_channels: ['delivery', 'pickup'],
        container_charge_mode: 'item_wise',
        discount_calc_basis: 'core',
      });

      expect(updated.delivery_charge_enabled).toBe(true);
      expect(updated.delivery_charge_amount).toBe(25);
      expect(updated.container_charge_auto_channels).toEqual(['delivery', 'pickup']);

      const fetched = await service.getBillingSettings(OUTLET_ID);
      expect(fetched).toEqual(updated);
    });

    it('only patches the fields provided, leaving the rest untouched', async () => {
      const before = await service.getBillingSettings(OUTLET_ID);
      const updated = await service.updateBillingSettings(OUTLET_ID, { service_charge_enabled: true });

      expect(updated.service_charge_enabled).toBe(true);
      expect(updated.default_payment_type).toBe(before.default_payment_type);
      expect(updated.tax_before_discount).toBe(before.tax_before_discount);
    });

    it('keeps settings isolated per outlet', async () => {
      await service.updateBillingSettings('outlet-A', { delivery_charge_enabled: true });
      const outletB = await service.getBillingSettings('outlet-B');
      expect(outletB.delivery_charge_enabled).toBe(false);
    });
  });

  describe('print settings', () => {
    it('returns first-run defaults with no hardcoded restaurant text', async () => {
      const settings = await service.getPrintSettings(OUTLET_ID);
      expect(settings.restaurant_name).toBe('');
      expect(settings.header_text).toBe('');
      expect(settings.footer_text).toBe('');
      expect(settings.print_cancelled_kot).toBe(true);
      expect(settings.highlight_orderid_mode).toBe('none');
    });

    it('round-trips a print settings update through get after patching', async () => {
      const updated = await service.updatePrintSettings(OUTLET_ID, {
        restaurant_name: 'Hotel Kapila',
        header_text: 'GSTIN: 12ABCDE',
        footer_text: 'Thank you, visit again!',
        show_restaurant_name: true,
        print_cancelled_kot: false,
      });

      expect(updated.restaurant_name).toBe('Hotel Kapila');
      expect(updated.print_cancelled_kot).toBe(false);

      const fetched = await service.getPrintSettings(OUTLET_ID);
      expect(fetched).toEqual(updated);
    });

    it('bumps updated_at on every write', async () => {
      const before = await service.getPrintSettings(OUTLET_ID);
      const updated = await service.updatePrintSettings(OUTLET_ID, { show_srno_column: false });
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(before.updated_at).getTime(),
      );
    });
  });
});
