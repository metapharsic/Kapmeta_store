// services/admin/src/interfaces.ts
//
// Dependency-injection interfaces for collaborators that live in
// other services (Orders service owns the real bill/kot sequence and
// the real order/KOT records). AdminService depends only on these
// interfaces so it never reimplements or reaches into another
// service's internal storage.

/**
 * Owned by the Orders service. The bill_no / kot_no sequence is
 * per-outlet-local by design: resetting outlet A's sequence must
 * never touch outlet B's counter.
 */
export interface BillKotSequenceResetter {
  /** Returns the current bill_no/kot_no counter values for the outlet, without mutating them. */
  getCurrentSequence(outletId: string): Promise<{ billNoSeq: number; kotNoSeq: number }>;

  /** Resets the outlet's bill_no/kot_no counters to their initial values. Returns the new values. */
  resetSequence(outletId: string): Promise<{ billNoSeq: number; kotNoSeq: number }>;
}

/**
 * A single order/KOT record as understood by the admin service for
 * the purposes of archiving. The Orders service is the source of
 * truth for the full shape; admin only needs enough to move records
 * into an archive store.
 */
export interface OrderRecord {
  id: string;
  outletId: string;
  [key: string]: unknown;
}

/**
 * Owned by the Orders service. AdminService never deletes orders
 * itself -- it asks the Orders service (via this interface) to
 * archive them, which is the safer default vs. a hard delete.
 */
export interface OrdersArchiver {
  /** Returns all live (non-archived) orders/KOT for the outlet. */
  listLiveOrders(outletId: string): Promise<OrderRecord[]>;

  /**
   * Moves all live orders/KOT for the outlet into an archived store.
   * Returns the count of records archived. Must NOT hard-delete.
   */
  archiveAllForOutlet(outletId: string): Promise<{ archivedCount: number }>;
}

/** Owned by an external migration runner / job orchestrator. */
export interface MigrationRunner {
  /** Kicks off a migration asynchronously and returns immediately with a job id. */
  startMigration(outletId: string): Promise<{ jobId: string }>;

  /** Polls the status of a previously-started migration job. */
  getStatus(jobId: string): Promise<{
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    error?: string;
  }>;
}
