// services/admin/src/AdminService.ts
//
// Real implementations for the "System Configuration" destructive
// tiles (Reset Bill No., Reset Sync Code, Database Migration, Remove
// All Orders/KOT, Remove Backup Files, Logs, Check Machine).
//
// Safety model (see README.md for the full writeup):
//   - every destructive action requires confirm === true
//   - every destructive action requires an ActorContext with role === 'admin'
//   - every destructive action is written to AdminAuditLog (before/after)
//   - the single most destructive action (remove all orders/KOT) requires
//     an additional typed "type the outlet name to confirm" phrase
//   - remove all orders/KOT ARCHIVES rather than hard-deletes
//   - remove backup files always keeps at least one backup

import { randomUUID } from 'crypto';
import {
  ActorContext,
  BackupJob,
  LogEntry,
  LogFilters,
  MachineInfo,
  MachineRole,
  MigrationJob,
} from './types';
import {
  ConfirmationRequiredError,
  InvalidConfirmationPhraseError,
  NotFoundError,
} from './errors';
import { AdminAuditLog } from './AdminAuditLog';
import { requireAdminRole, requireRoleAtLeast } from './AdminAuthGuard';
import { BackupJobsRepository } from './BackupJobsRepository';
import { MachinesRepository } from './MachinesRepository';
import { InMemoryRepository, Repository } from './Repository';
import {
  BillKotSequenceResetter,
  MigrationRunner,
  OrderRecord,
  OrdersArchiver,
} from './interfaces';

/** Machines are considered online if a heartbeat landed within this window. */
export const MACHINE_FRESHNESS_WINDOW_MS = 30_000;

export interface OutletDirectory {
  /** Looks up an outlet's display name, used for the double-confirm phrase check. */
  getOutletName(outletId: string): Promise<string>;
}

export interface AdminServiceDeps {
  auditLog: AdminAuditLog;
  billKotSequenceResetter: BillKotSequenceResetter;
  ordersArchiver: OrdersArchiver;
  migrationRunner: MigrationRunner;
  outletDirectory: OutletDirectory;
  backupJobsRepo?: BackupJobsRepository;
  machinesRepo?: MachinesRepository;
  logsRepo?: Repository<LogEntry>;
  migrationJobsRepo?: Repository<MigrationJob>;
  archivedOrdersRepo?: Repository<OrderRecord & { id: string }>;
  syncCodeStore?: Map<string, string>;
}

function assertConfirmedAdmin(actor: ActorContext, confirm: boolean): void {
  // Role check first: an unconfirmed request from a non-admin should still
  // surface as a permission problem, not merely "you forgot to confirm".
  requireAdminRole(actor);
  if (confirm !== true) {
    throw new ConfirmationRequiredError();
  }
}

export class AdminService {
  private readonly auditLog: AdminAuditLog;
  private readonly billKotSequenceResetter: BillKotSequenceResetter;
  private readonly ordersArchiver: OrdersArchiver;
  private readonly migrationRunner: MigrationRunner;
  private readonly outletDirectory: OutletDirectory;
  private readonly backupJobsRepo: BackupJobsRepository;
  private readonly machinesRepo: MachinesRepository;
  private readonly logsRepo: Repository<LogEntry>;
  private readonly migrationJobsRepo: Repository<MigrationJob>;
  private readonly archivedOrdersRepo: Repository<OrderRecord & { id: string }>;
  /** outletId -> current sync code. Old codes are simply overwritten (invalidated). */
  private readonly syncCodeStore: Map<string, string>;

  constructor(deps: AdminServiceDeps) {
    this.auditLog = deps.auditLog;
    this.billKotSequenceResetter = deps.billKotSequenceResetter;
    this.ordersArchiver = deps.ordersArchiver;
    this.migrationRunner = deps.migrationRunner;
    this.outletDirectory = deps.outletDirectory;
    this.backupJobsRepo = deps.backupJobsRepo ?? new BackupJobsRepository();
    this.machinesRepo = deps.machinesRepo ?? new MachinesRepository();
    this.logsRepo = deps.logsRepo ?? new InMemoryRepository<LogEntry>();
    this.migrationJobsRepo = deps.migrationJobsRepo ?? new InMemoryRepository<MigrationJob>();
    this.archivedOrdersRepo =
      deps.archivedOrdersRepo ?? new InMemoryRepository<OrderRecord & { id: string }>();
    this.syncCodeStore = deps.syncCodeStore ?? new Map<string, string>();
  }

  // ---------------------------------------------------------------------
  // Reset Bill No.
  // ---------------------------------------------------------------------

  async resetBillNo(
    outletId: string,
    actor: ActorContext,
    confirm: boolean
  ): Promise<{ billNoSeq: number; kotNoSeq: number }> {
    assertConfirmedAdmin(actor, confirm);

    const before = await this.billKotSequenceResetter.getCurrentSequence(outletId);
    const after = await this.billKotSequenceResetter.resetSequence(outletId);

    this.auditLog.record({
      outletId,
      actorId: actor.actorId,
      action: 'RESET_BILL_NO',
      beforeVal: before,
      afterVal: after,
      confirmedExplicitly: true,
    });

    return after;
  }

  // ---------------------------------------------------------------------
  // Reset Sync Code
  // ---------------------------------------------------------------------

  async resetSyncCode(
    outletId: string,
    actor: ActorContext,
    confirm: boolean
  ): Promise<{ syncCode: string }> {
    assertConfirmedAdmin(actor, confirm);

    const before = this.syncCodeStore.get(outletId) ?? null;
    // crypto.randomUUID() is CSPRNG-backed; never use Math.random() here.
    const newCode = randomUUID();
    this.syncCodeStore.set(outletId, newCode);

    this.auditLog.record({
      outletId,
      actorId: actor.actorId,
      action: 'RESET_SYNC_CODE',
      beforeVal: { syncCode: before },
      afterVal: { syncCode: newCode },
      confirmedExplicitly: true,
    });

    return { syncCode: newCode };
  }

  // ---------------------------------------------------------------------
  // Database Migration
  // ---------------------------------------------------------------------

  async triggerDatabaseMigration(
    outletId: string,
    actor: ActorContext,
    confirm: boolean
  ): Promise<{ jobId: string }> {
    assertConfirmedAdmin(actor, confirm);

    const { jobId } = await this.migrationRunner.startMigration(outletId);

    const job: MigrationJob = {
      id: jobId,
      outletId,
      status: 'running',
      startedAt: new Date(),
    };
    this.migrationJobsRepo.insert(job);

    this.auditLog.record({
      outletId,
      actorId: actor.actorId,
      action: 'DATABASE_MIGRATION',
      beforeVal: null,
      afterVal: { jobId, status: 'running' },
      confirmedExplicitly: true,
    });

    // Real migrations are async; the caller must poll getMigrationStatus(jobId).
    return { jobId };
  }

  /** Polls (and locally reconciles) the status of a previously-started migration job. */
  async getMigrationStatus(jobId: string): Promise<MigrationJob> {
    const local = this.migrationJobsRepo.findById(jobId);
    if (!local) {
      throw new NotFoundError(`No migration job found with id ${jobId}`);
    }

    const remote = await this.migrationRunner.getStatus(jobId);
    const finishedAt =
      remote.status === 'completed' || remote.status === 'failed' ? new Date() : local.finishedAt;

    const updated = this.migrationJobsRepo.update(jobId, {
      status: remote.status,
      error: remote.error,
      finishedAt,
    });

    return updated as MigrationJob;
  }

  // ---------------------------------------------------------------------
  // Remove All Orders/KOT
  //
  // NOTE: this is modeled as archiving (moving live orders/KOT into an
  // `archivedOrders` store) rather than a hard/permanent delete. A
  // "remove everything" tile should almost certainly never be a real
  // hard-delete in production -- archive-then-purge-on-a-retention-
  // schedule is the safer default, and it's what's implemented here.
  // ---------------------------------------------------------------------

  async removeAllOrdersAndKot(
    outletId: string,
    actor: ActorContext,
    confirm: boolean,
    doubleConfirmPhrase: string
  ): Promise<{ archivedCount: number }> {
    assertConfirmedAdmin(actor, confirm);

    const outletName = await this.outletDirectory.getOutletName(outletId);
    if (doubleConfirmPhrase !== outletName) {
      throw new InvalidConfirmationPhraseError(
        `Expected the outlet name '${outletName}' to be typed exactly to confirm this action`
      );
    }

    const liveOrders = await this.ordersArchiver.listLiveOrders(outletId);
    const { archivedCount } = await this.ordersArchiver.archiveAllForOutlet(outletId);

    // Keep our own local copy of what was archived, for admin-side visibility
    // (e.g. surfacing "recently archived" in a support tool) independent of
    // whatever the Orders service does internally.
    for (const order of liveOrders) {
      this.archivedOrdersRepo.insert(order as OrderRecord & { id: string });
    }

    this.auditLog.record({
      outletId,
      actorId: actor.actorId,
      action: 'REMOVE_ALL_ORDERS_KOT',
      beforeVal: { liveOrderCount: liveOrders.length },
      afterVal: { archivedCount },
      confirmedExplicitly: true,
    });

    return { archivedCount };
  }

  /** Read-only view of what this admin service has locally recorded as archived. */
  listArchivedOrders(outletId: string): Array<OrderRecord & { id: string }> {
    return this.archivedOrdersRepo.findWhere((o) => o.outletId === outletId);
  }

  // ---------------------------------------------------------------------
  // Remove Backup Files
  // ---------------------------------------------------------------------

  async removeBackupFiles(
    outletId: string,
    actor: ActorContext,
    confirm: boolean,
    backupIds: string[]
  ): Promise<{ removedIds: string[]; skippedMostRecent: boolean }> {
    assertConfirmedAdmin(actor, confirm);

    const mostRecent = this.backupJobsRepo.mostRecentForOutlet(outletId);
    const idsToRemove = new Set(backupIds);
    let skippedMostRecent = false;

    if (mostRecent && idsToRemove.has(mostRecent.id)) {
      // Safety rail: always keep at least one backup, even if explicitly requested.
      idsToRemove.delete(mostRecent.id);
      skippedMostRecent = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[AdminService] Refused to remove backup ${mostRecent.id} for outlet ${outletId}: ` +
          `it is the most recent backup and at least one must always be retained.`
      );
    }

    const before = this.backupJobsRepo
      .findByOutlet(outletId)
      .filter((b) => idsToRemove.has(b.id));

    const removedIds: string[] = [];
    for (const backup of before) {
      if (backup.outletId !== outletId) continue; // defense in depth: never cross-outlet
      this.backupJobsRepo.delete(backup.id);
      removedIds.push(backup.id);
    }

    this.auditLog.record({
      outletId,
      actorId: actor.actorId,
      action: 'REMOVE_BACKUP_FILES',
      beforeVal: { requestedIds: backupIds, removableSnapshot: before.map((b) => b.id) },
      afterVal: { removedIds, skippedMostRecent, skippedId: skippedMostRecent ? mostRecent?.id : undefined },
      confirmedExplicitly: true,
    });

    return { removedIds, skippedMostRecent };
  }

  // ---------------------------------------------------------------------
  // Logs (read-only, no confirm needed)
  // ---------------------------------------------------------------------

  getLogs(outletId: string, actor: ActorContext, filters: LogFilters = {}): LogEntry[] {
    // Read-only, but still not open to cashiers -- manager or admin only.
    requireRoleAtLeast(actor, ['manager', 'admin']);
    return this.logsRepo
      .findWhere((log) => {
        if (log.outletId !== outletId) return false;
        if (filters.level && log.level !== filters.level) return false;
        if (filters.fromDate && log.at.getTime() < filters.fromDate.getTime()) return false;
        if (filters.toDate && log.at.getTime() > filters.toDate.getTime()) return false;
        return true;
      })
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** Test/seed helper -- appends a log entry. Not exposed as a "destructive" action. */
  appendLog(entry: Omit<LogEntry, 'id'>): LogEntry {
    const full: LogEntry = { id: randomUUID(), ...entry };
    this.logsRepo.insert(full);
    return full;
  }

  // ---------------------------------------------------------------------
  // Check Machine (LAN sync topology: Main Server + Client Machines)
  // ---------------------------------------------------------------------

  /**
   * Read-only "Check Machine" view: any authenticated staff member may
   * view the sync topology (no destructive potential here), so there is
   * no role gate beyond `actor` simply being a recognized staff member.
   */
  getMachines(outletId: string, _actor?: ActorContext, now: Date = new Date()): MachineInfo[] {
    return this.machinesRepo.findByOutlet(outletId).map((machine) => ({
      ...machine,
      isOnline: now.getTime() - machine.lastSeenAt.getTime() <= MACHINE_FRESHNESS_WINDOW_MS,
    }));
  }

  /** @deprecated use getMachines -- kept as an alias for call-site compatibility. */
  checkMachines(outletId: string, now: Date = new Date()): MachineInfo[] {
    return this.getMachines(outletId, undefined, now);
  }

  /**
   * Called periodically by each machine (main server or client) to report
   * liveness. This is the sole mechanism that keeps getMachines() accurate.
   */
  registerMachineHeartbeat(
    outletId: string,
    machineId: string,
    role: MachineRole,
    ip: string,
    isSelf = false,
    at: Date = new Date()
  ): MachineInfo {
    const existing = this.machinesRepo.findByOutletAndId(outletId, machineId);

    if (existing) {
      const updated = this.machinesRepo.update(machineId, {
        role,
        ip,
        isSelf,
        lastSeenAt: at,
      }) as MachineInfo;
      return { ...updated, isOnline: true };
    }

    const created: MachineInfo = {
      id: machineId,
      outletId,
      role,
      ip,
      isSelf,
      lastSeenAt: at,
      isOnline: true,
    };
    this.machinesRepo.insert(created);
    return created;
  }

  // ---------------------------------------------------------------------
  // Test/seed helpers -- not part of the admin action surface.
  // ---------------------------------------------------------------------

  /** Exposed for tests/seeding: directly registers a backup job. */
  seedBackupJob(job: BackupJob): BackupJob {
    return this.backupJobsRepo.insert(job);
  }

  listBackupJobs(outletId: string): BackupJob[] {
    return this.backupJobsRepo.findByOutlet(outletId);
  }

  getAuditLog(): AdminAuditLog {
    return this.auditLog;
  }
}
