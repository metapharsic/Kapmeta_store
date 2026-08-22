// services/tax/src/PgTaxRepository.ts
//
// Real Postgres-backed replacement for the in-memory TaxRepository, backed
// by `taxes` + `tax_channel_rules` from db-migrations/0007_create_taxes.sql.
//
// Column mapping:
//   taxes.id            uuid          -> Tax.id
//   taxes.outlet_id     uuid          -> Tax.outletId
//   taxes.name          text          -> Tax.title
//   taxes.rate_percent  numeric(6,3)  -> Tax.rate
//   taxes.is_active     boolean       -> Tax.active
//   (Tax.calcType has NO column on `taxes` — 0007 only models percentage-
//   based rates via rate_percent, there is no calc_type/flat-amount column.
//   This repository always writes/reads calcType as 'percentage' and
//   rejects createTax/updateTax calls that pass calcType: 'flat', since
//   persisting that value would silently lie about how the row is actually
//   interpreted by SQL sums over rate_percent. See README "tax schema
//   notes" for the full rationale and the recommended follow-up migration
//   if flat-amount taxes are ever needed.)
//
//   tax_channel_rules.id         uuid          -> (not surfaced; TaxChannelRule.id
//                                                    is the rule's own row id, one
//                                                    row per outlet+channel — see below)
//   tax_channel_rules.outlet_id  uuid          -> TaxChannelRule.outletId
//   tax_channel_rules.tax_id     uuid          -> aggregated into TaxChannelRule.taxIds
//   tax_channel_rules.channel    order_channel -> TaxChannelRule.channel
//   tax_channel_rules.mode       tax_mode      -> TaxChannelRule.mode
//   tax_channel_rules.is_active  boolean       -> filter (only active rules count)
//
// SHAPE MISMATCH: the TS `TaxChannelRule` is "one rule per outlet+channel,
// with a `taxIds: string[]` array", but the DB schema is normalized to one
// `tax_channel_rules` row PER tax_id+channel (unique index on
// (tax_id, channel), 0007:57-58) — there is no single row representing "the
// rule" as a whole. This repository bridges that by treating "the rule for
// (outletId, channel)" as an aggregate: `id` is deterministically synthesized
// as `${outletId}:${channel}`, `mode` is read from any one of the matching
// rows (0007's own comment says a channel has one mode; rows sharing a
// channel are expected to agree — this repo takes the mode of the
// most-recently-created row if they ever disagree, rather than guessing),
// and `taxIds` is the aggregated list of tax_id values. createChannelRule /
// updateChannelRule operate the same way: they INSERT/UPSERT one
// tax_channel_rules row per taxId in the input's taxIds array.

import type { Pool } from 'pg';
import { withTransaction } from '../../shared/src/db/Pool';
import { OrderChannel, Tax, TaxChannelRule } from './types';

interface TaxRow {
  id: string;
  outlet_id: string;
  name: string;
  rate_percent: string;
  is_active: boolean;
}

interface RuleRow {
  outlet_id: string;
  channel: string;
  mode: string;
  tax_id: string;
  created_at: Date;
}

function toTax(row: TaxRow): Tax {
  return {
    id: row.id,
    outletId: row.outlet_id,
    title: row.name,
    calcType: 'percentage',
    rate: Number(row.rate_percent),
    active: row.is_active,
  };
}

export class PgTaxRepository {
  constructor(private readonly pool: Pool) {}

  // ---- Tax row CRUD -------------------------------------------------

  async createTax(input: Omit<Tax, 'id'>): Promise<Tax> {
    if (input.calcType !== 'percentage') {
      throw new Error(
        `PgTaxRepository.createTax: taxes.rate_percent has no flat-amount column; ` +
          `calcType 'flat' cannot be persisted against this schema (see file header).`,
      );
    }
    const result = await this.pool.query<TaxRow>(
      `INSERT INTO taxes (outlet_id, name, rate_percent, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, outlet_id, name, rate_percent, is_active`,
      [input.outletId, input.title, input.rate, input.active],
    );
    return toTax(result.rows[0]!);
  }

  async updateTax(id: string, patch: Partial<Omit<Tax, 'id'>>): Promise<Tax | undefined> {
    if (patch.calcType != null && patch.calcType !== 'percentage') {
      throw new Error(`PgTaxRepository.updateTax: calcType 'flat' is not supported (see file header).`);
    }
    const existingResult = await this.pool.query<TaxRow>(`SELECT * FROM taxes WHERE id = $1`, [id]);
    const existing = existingResult.rows[0];
    if (!existing) return undefined;
    const merged = { ...toTax(existing), ...patch };
    const result = await this.pool.query<TaxRow>(
      `UPDATE taxes SET name = $2, rate_percent = $3, is_active = $4, updated_at = now()
       WHERE id = $1
       RETURNING id, outlet_id, name, rate_percent, is_active`,
      [id, merged.title, merged.rate, merged.active],
    );
    return toTax(result.rows[0]!);
  }

  async deleteTax(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM taxes WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getTax(id: string): Promise<Tax | undefined> {
    const result = await this.pool.query<TaxRow>(`SELECT * FROM taxes WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toTax(row) : undefined;
  }

  async listTaxesForOutlet(outletId: string): Promise<Tax[]> {
    const result = await this.pool.query<TaxRow>(
      `SELECT * FROM taxes WHERE outlet_id = $1 ORDER BY name ASC`,
      [outletId],
    );
    return result.rows.map(toTax);
  }

  // ---- Channel-scope rule CRUD ---------------------------------------

  async createChannelRule(input: Omit<TaxChannelRule, 'id'>): Promise<TaxChannelRule> {
    await withTransaction(this.pool, async (client) => {
      for (const taxId of input.taxIds) {
        await client.query(
          `INSERT INTO tax_channel_rules (outlet_id, tax_id, channel, mode, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (tax_id, channel) DO UPDATE SET
             mode = EXCLUDED.mode, is_active = true, updated_at = now()`,
          [input.outletId, taxId, input.channel, input.mode],
        );
      }
    });
    const rule = await this.getChannelRule(input.outletId, input.channel as OrderChannel);
    if (!rule) throw new Error('PgTaxRepository.createChannelRule: rule vanished after insert');
    return rule;
  }

  async updateChannelRule(
    id: string,
    patch: Partial<Omit<TaxChannelRule, 'id'>>,
  ): Promise<TaxChannelRule | undefined> {
    // `id` here is the synthesized `${outletId}:${channel}` key (see file
    // header) since there is no single physical row to update by primary key.
    const [outletId, channel] = id.split(':');
    if (!outletId || !channel) return undefined;
    const existing = await this.getChannelRule(outletId, channel as OrderChannel);
    if (!existing) return undefined;
    const merged: Omit<TaxChannelRule, 'id'> = {
      outletId,
      channel: (patch.channel ?? existing.channel) as OrderChannel,
      mode: patch.mode ?? existing.mode,
      taxIds: patch.taxIds ?? existing.taxIds,
    };
    await withTransaction(this.pool, async (client) => {
      // Deactivate rows for tax_ids no longer in the merged set, then
      // upsert the current set — keeps tax_channel_rules consistent with
      // "this rule's taxIds are exactly `merged.taxIds`". Done as: fetch
      // this (outlet, channel)'s currently-active tax_ids, diff in JS, then
      // deactivate each removed row individually by (tax_id, channel) —
      // rather than one `UPDATE ... WHERE tax_id NOT IN (...)` — because a
      // NOT IN/ <> ALL(array) filter against tax_channel_rules' indexed
      // tax_id column crashes pg-mem (this project's test engine; see
      // services/shared/db/README.md), even though both forms are valid,
      // equivalent SQL against real Postgres.
      const keepSet = new Set(merged.taxIds);
      const toRemove = existing.taxIds.filter((taxId) => !keepSet.has(taxId));
      for (const taxId of toRemove) {
        await client.query(
          `UPDATE tax_channel_rules SET is_active = false, updated_at = now()
           WHERE outlet_id = $1 AND channel = $2 AND tax_id = $3`,
          [outletId, existing.channel, taxId],
        );
      }
      for (const taxId of merged.taxIds) {
        await client.query(
          `INSERT INTO tax_channel_rules (outlet_id, tax_id, channel, mode, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (tax_id, channel) DO UPDATE SET
             mode = EXCLUDED.mode, is_active = true, updated_at = now()`,
          [outletId, taxId, merged.channel, merged.mode],
        );
      }
    });
    return this.getChannelRule(outletId, merged.channel);
  }

  async getChannelRule(outletId: string, channel: OrderChannel): Promise<TaxChannelRule | undefined> {
    const result = await this.pool.query<RuleRow>(
      `SELECT outlet_id, channel, mode, tax_id, created_at
       FROM tax_channel_rules
       WHERE outlet_id = $1 AND channel = $2 AND is_active = true
       ORDER BY created_at ASC`,
      [outletId, channel],
    );
    if (result.rows.length === 0) return undefined;
    // Per the schema, all rows for a given (outlet, channel) should share
    // one mode; take the earliest row's mode as authoritative if they ever
    // disagree, rather than guessing which is "right".
    const mode = result.rows[0]!.mode as TaxChannelRule['mode'];
    return {
      id: `${outletId}:${channel}`,
      outletId,
      channel,
      mode,
      taxIds: result.rows.map((r) => r.tax_id),
    };
  }

  async getTaxesByIds(ids: string[]): Promise<Tax[]> {
    if (ids.length === 0) return [];
    // `id IN ($1, $2, ...)` rather than `id = ANY($1::uuid[])` — see
    // PgTablesRepository.activeOrderIdsByTable's comment for why: pg-mem
    // (this project's test engine) has a bug where `= ANY(uuid[])` against
    // an indexed uuid column (taxes.id is the PK, always indexed) silently
    // matches nothing, while the equivalent IN-list works correctly.
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.pool.query<TaxRow>(
      `SELECT * FROM taxes WHERE id IN (${placeholders}) AND is_active = true`,
      ids,
    );
    return result.rows.map(toTax);
  }
}
