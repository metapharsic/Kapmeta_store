// services/settings/src/PgSettingsRepository.ts
//
// Real Postgres-backed replacement for the in-memory SettingsRepository,
// backed by `outlet_billing_settings` + `outlet_print_settings` from
// db-migrations/0013_create_outlet_billing_and_print_settings.sql, extended
// by 0016_extend_outlet_settings_jsonb.sql (added by this agent — see that
// file's header and services/shared/src/db/README.md "Settings schema/
// interface mismatch" for why).
//
// First-run defaults: getBillingSettings/getPrintSettings, on a cache miss,
// INSERT a defaults row (using each column's own DEFAULT, i.e. the
// defaults live in the migration DDL, not as a literal in this file) and
// then SELECT it back, so the defaults are genuinely DB-sourced rather than
// an application-code literal — matching the in-memory repository's
// documented intent ("NOT hardcoded business data") but backed by a real
// row instead of an in-memory object literal.
//
// Column mapping — fields with a first-class column on outlet_billing_settings:
//   outlet_billing_settings.service_charge_enabled -> OutletBillingSettings.service_charge_enabled
// Column mapping — fields with a first-class column on outlet_print_settings:
//   outlet_print_settings.footer_message -> OutletPrintSettings.footer_text
// All other OutletBillingSettings/OutletPrintSettings fields (there is no
// column for default_order_type, container_charge_*, tax_before_discount,
// print_kot_on_bill, show_duplicate_marker_*, restaurant_name, etc.) are
// stored in the `extended_settings jsonb` column added by 0016. Because
// jsonb has no DB-level defaults for individual keys the way a typed column
// does, THIS FILE'S `firstRunExtendedBillingDefaults`/
// `firstRunExtendedPrintDefaults` constants are the actual source of the
// first-run values for those fields — copied verbatim from the original
// in-memory SettingsRepository.ts, which is the closest thing to a spec
// these fields have. This is a known, documented exception to "the DB row
// is the source of the default": the *column* defaults for the six
// first-class fields are DB-sourced; the jsonb overflow fields' defaults
// are still a code literal, written once into the row on first INSERT, same
// as the in-memory repository did, just now persisted afterward. See
// README for the recommended follow-up (give these fields real columns).

import type { Pool } from 'pg';
import { OutletBillingSettings, OutletPrintSettings } from './types';

type BillingExtended = Omit<
  OutletBillingSettings,
  'outlet_id' | 'service_charge_enabled' | 'updated_at'
>;

type PrintExtended = Omit<OutletPrintSettings, 'outlet_id' | 'footer_text' | 'updated_at'>;

function firstRunExtendedBillingDefaults(): BillingExtended {
  return {
    default_order_type: 'dine_in',
    default_payment_type: 'cash',
    default_table_no: null,
    delivery_charge_enabled: false,
    delivery_charge_amount: 0,
    container_charge_enabled: false,
    container_charge_auto_channels: [],
    container_charge_mode: 'order_wise',
    container_charge_label: 'Container Charge',
    tax_before_discount: true,
    backward_tax_after_discount: false,
    discount_calc_basis: 'total',
  };
}

function firstRunExtendedPrintDefaults(): PrintExtended {
  return {
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
    restaurant_name: '',
    header_text: '',
    new_customer_message: '',
    show_restaurant_name: true,
    show_retail_invoice: false,
    show_srno_column: true,
    show_assign_label: false,
  };
}

interface BillingRow {
  outlet_id: string;
  service_charge_enabled: boolean;
  extended_settings: BillingExtended;
  updated_at: Date;
}

interface PrintRow {
  outlet_id: string;
  footer_message: string | null;
  extended_settings: PrintExtended;
  updated_at: Date;
}

function toBillingSettings(row: BillingRow): OutletBillingSettings {
  return {
    outlet_id: row.outlet_id,
    service_charge_enabled: row.service_charge_enabled,
    ...row.extended_settings,
    updated_at: row.updated_at.toISOString(),
  };
}

function toPrintSettings(row: PrintRow): OutletPrintSettings {
  return {
    outlet_id: row.outlet_id,
    footer_text: row.footer_message ?? '',
    ...row.extended_settings,
    updated_at: row.updated_at.toISOString(),
  };
}

export class PgSettingsRepository {
  constructor(private readonly pool: Pool) {}

  async getBillingSettings(outletId: string): Promise<OutletBillingSettings> {
    const existing = await this.pool.query<BillingRow>(
      `SELECT outlet_id, service_charge_enabled, extended_settings, updated_at
       FROM outlet_billing_settings WHERE outlet_id = $1`,
      [outletId],
    );
    if (existing.rows[0]) return toBillingSettings(existing.rows[0]);

    // Explicit check-then-insert rather than `INSERT ... ON CONFLICT
    // (outlet_id) DO UPDATE` — both express "insert defaults on first
    // access" against real Postgres (0013's `ux_outlet_billing_settings_
    // outlet` unique index on outlet_id makes ON CONFLICT valid there), but
    // pg-mem (this project's test engine) does not recognize a
    // separately-created unique index as an ON CONFLICT target, only an
    // inline UNIQUE/PRIMARY KEY column constraint. See
    // services/shared/db/README.md. This is not fully race-free against two
    // concurrent first-time callers the way ON CONFLICT would be — a real
    // deployment relying on ON CONFLICT working (it does, against real
    // Postgres) is the documented intent.
    const inserted = await this.pool.query<BillingRow>(
      `INSERT INTO outlet_billing_settings (outlet_id, extended_settings)
       VALUES ($1, $2::jsonb)
       RETURNING outlet_id, service_charge_enabled, extended_settings, updated_at`,
      [outletId, JSON.stringify(firstRunExtendedBillingDefaults())],
    );
    return toBillingSettings(inserted.rows[0]!);
  }

  async saveBillingSettings(settings: OutletBillingSettings): Promise<OutletBillingSettings> {
    const { outlet_id, service_charge_enabled, updated_at, ...rest } = settings;
    const existing = await this.pool.query(`SELECT 1 FROM outlet_billing_settings WHERE outlet_id = $1`, [
      outlet_id,
    ]);
    const result = existing.rows[0]
      ? await this.pool.query<BillingRow>(
          `UPDATE outlet_billing_settings
           SET service_charge_enabled = $2, extended_settings = $3::jsonb, updated_at = now()
           WHERE outlet_id = $1
           RETURNING outlet_id, service_charge_enabled, extended_settings, updated_at`,
          [outlet_id, service_charge_enabled, JSON.stringify(rest)],
        )
      : await this.pool.query<BillingRow>(
          `INSERT INTO outlet_billing_settings (outlet_id, service_charge_enabled, extended_settings)
           VALUES ($1, $2, $3::jsonb)
           RETURNING outlet_id, service_charge_enabled, extended_settings, updated_at`,
          [outlet_id, service_charge_enabled, JSON.stringify(rest)],
        );
    return toBillingSettings(result.rows[0]!);
  }

  async getPrintSettings(outletId: string): Promise<OutletPrintSettings> {
    const existing = await this.pool.query<PrintRow>(
      `SELECT outlet_id, footer_message, extended_settings, updated_at
       FROM outlet_print_settings WHERE outlet_id = $1`,
      [outletId],
    );
    if (existing.rows[0]) return toPrintSettings(existing.rows[0]);

    // See getBillingSettings() above for why this is check-then-insert
    // rather than ON CONFLICT.
    const inserted = await this.pool.query<PrintRow>(
      `INSERT INTO outlet_print_settings (outlet_id, footer_message, extended_settings)
       VALUES ($1, $2, $3::jsonb)
       RETURNING outlet_id, footer_message, extended_settings, updated_at`,
      [outletId, '', JSON.stringify(firstRunExtendedPrintDefaults())],
    );
    return toPrintSettings(inserted.rows[0]!);
  }

  async savePrintSettings(settings: OutletPrintSettings): Promise<OutletPrintSettings> {
    const { outlet_id, footer_text, updated_at, ...rest } = settings;
    const existing = await this.pool.query(`SELECT 1 FROM outlet_print_settings WHERE outlet_id = $1`, [
      outlet_id,
    ]);
    const result = existing.rows[0]
      ? await this.pool.query<PrintRow>(
          `UPDATE outlet_print_settings
           SET footer_message = $2, extended_settings = $3::jsonb, updated_at = now()
           WHERE outlet_id = $1
           RETURNING outlet_id, footer_message, extended_settings, updated_at`,
          [outlet_id, footer_text, JSON.stringify(rest)],
        )
      : await this.pool.query<PrintRow>(
          `INSERT INTO outlet_print_settings (outlet_id, footer_message, extended_settings)
           VALUES ($1, $2, $3::jsonb)
           RETURNING outlet_id, footer_message, extended_settings, updated_at`,
          [outlet_id, footer_text, JSON.stringify(rest)],
        );
    return toPrintSettings(result.rows[0]!);
  }
}
