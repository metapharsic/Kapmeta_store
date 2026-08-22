// services/settings/src/SettingsService.ts

import { SettingsRepository } from './SettingsRepository';
import {
  OutletBillingSettings,
  OutletPrintSettings,
  SettingsService as ISettingsService,
} from './types';

export class SettingsService implements ISettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async getBillingSettings(outletId: string): Promise<OutletBillingSettings> {
    return this.repo.getBillingSettings(outletId);
  }

  async updateBillingSettings(
    outletId: string,
    patch: Partial<Omit<OutletBillingSettings, 'outlet_id'>>,
  ): Promise<OutletBillingSettings> {
    const current = await this.repo.getBillingSettings(outletId);
    const updated: OutletBillingSettings = {
      ...current,
      ...patch,
      outlet_id: outletId,
      updated_at: new Date().toISOString(),
    };
    return this.repo.saveBillingSettings(updated);
  }

  async getPrintSettings(outletId: string): Promise<OutletPrintSettings> {
    return this.repo.getPrintSettings(outletId);
  }

  async updatePrintSettings(
    outletId: string,
    patch: Partial<Omit<OutletPrintSettings, 'outlet_id'>>,
  ): Promise<OutletPrintSettings> {
    const current = await this.repo.getPrintSettings(outletId);
    const updated: OutletPrintSettings = {
      ...current,
      ...patch,
      outlet_id: outletId,
      updated_at: new Date().toISOString(),
    };
    return this.repo.savePrintSettings(updated);
  }
}
