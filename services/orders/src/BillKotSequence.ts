/**
 * Per-outlet-local sequential number generator for bill_no / kot_no.
 *
 * IMPORTANT: This in-memory implementation is ONLY correct for a single
 * process with no concurrent terminals. The real implementation (Phase 2-3)
 * MUST use a DB sequence scoped per outlet_id (e.g. a
 * `outlet_bill_sequences(outlet_id, next_bill_no, next_kot_no)` table
 * updated via `SELECT ... FOR UPDATE` or `UPDATE ... RETURNING`) or a
 * Postgres advisory lock keyed by outlet_id, to avoid two POS terminals at
 * the same outlet racing to get the same bill_no/kot_no. Do not ship this
 * in-memory version to production.
 */
export class BillKotSequence {
  private readonly billCounters = new Map<string, number>();
  private readonly kotCounters = new Map<string, number>();

  nextBillNo(outletId: string): number {
    const next = (this.billCounters.get(outletId) ?? 0) + 1;
    this.billCounters.set(outletId, next);
    return next;
  }

  nextKotNo(outletId: string): number {
    const next = (this.kotCounters.get(outletId) ?? 0) + 1;
    this.kotCounters.set(outletId, next);
    return next;
  }

  /** Test/debug helper only. */
  peekBillNo(outletId: string): number {
    return this.billCounters.get(outletId) ?? 0;
  }

  peekKotNo(outletId: string): number {
    return this.kotCounters.get(outletId) ?? 0;
  }

  /** Resets both counters for the outlet back to 0. Used by the admin
   * "Reset Bill No." system-configuration action (see
   * services/admin/src/interfaces.ts `BillKotSequenceResetter`). */
  resetSequence(outletId: string): { billNoSeq: number; kotNoSeq: number } {
    this.billCounters.set(outletId, 0);
    this.kotCounters.set(outletId, 0);
    return { billNoSeq: 0, kotNoSeq: 0 };
  }
}
