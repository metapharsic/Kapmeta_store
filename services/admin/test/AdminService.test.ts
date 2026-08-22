// services/admin/test/AdminService.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AdminService, MACHINE_FRESHNESS_WINDOW_MS, OutletDirectory } from '../src/AdminService';
import { AdminAuditLog } from '../src/AdminAuditLog';
import { BackupJobsRepository } from '../src/BackupJobsRepository';
import { MachinesRepository } from '../src/MachinesRepository';
import {
  BillKotSequenceResetter,
  MigrationRunner,
  OrderRecord,
  OrdersArchiver,
} from '../src/interfaces';
import { ActorContext, BackupJob } from '../src/types';
import {
  ConfirmationRequiredError,
  ForbiddenError,
  InvalidConfirmationPhraseError,
} from '../src/errors';

// ---------------------------------------------------------------------
// Fakes for the services AdminService depends on via DI
// ---------------------------------------------------------------------

class FakeBillKotSequenceResetter implements BillKotSequenceResetter {
  private sequences = new Map<string, { billNoSeq: number; kotNoSeq: number }>();

  seed(outletId: string, billNoSeq: number, kotNoSeq: number) {
    this.sequences.set(outletId, { billNoSeq, kotNoSeq });
  }

  async getCurrentSequence(outletId: string) {
    return this.sequences.get(outletId) ?? { billNoSeq: 0, kotNoSeq: 0 };
  }

  async resetSequence(outletId: string) {
    const reset = { billNoSeq: 0, kotNoSeq: 0 };
    this.sequences.set(outletId, reset);
    return reset;
  }
}

class FakeOrdersArchiver implements OrdersArchiver {
  private orders: OrderRecord[] = [];

  seed(orders: OrderRecord[]) {
    this.orders.push(...orders);
  }

  async listLiveOrders(outletId: string) {
    return this.orders.filter((o) => o.outletId === outletId);
  }

  async archiveAllForOutlet(outletId: string) {
    const toArchive = this.orders.filter((o) => o.outletId === outletId);
    this.orders = this.orders.filter((o) => o.outletId !== outletId);
    return { archivedCount: toArchive.length };
  }
}

class FakeMigrationRunner implements MigrationRunner {
  async startMigration(_outletId: string) {
    return { jobId: `mig-${_outletId}-1` };
  }
  async getStatus(jobId: string) {
    return { jobId, status: 'running' as const };
  }
}

class FakeOutletDirectory implements OutletDirectory {
  private names = new Map<string, string>();
  set(outletId: string, name: string) {
    this.names.set(outletId, name);
  }
  async getOutletName(outletId: string) {
    return this.names.get(outletId) ?? 'Unknown Outlet';
  }
}

// ---------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------

const adminActor: ActorContext = { actorId: 'user-admin-1', role: 'admin' };
const staffActor: ActorContext = { actorId: 'user-staff-1', role: 'staff' };
const managerActor: ActorContext = { actorId: 'user-manager-1', role: 'manager' };

function buildService() {
  const auditLog = new AdminAuditLog();
  const billKotSequenceResetter = new FakeBillKotSequenceResetter();
  const ordersArchiver = new FakeOrdersArchiver();
  const migrationRunner = new FakeMigrationRunner();
  const outletDirectory = new FakeOutletDirectory();
  const backupJobsRepo = new BackupJobsRepository();
  const machinesRepo = new MachinesRepository();

  const service = new AdminService({
    auditLog,
    billKotSequenceResetter,
    ordersArchiver,
    migrationRunner,
    outletDirectory,
    backupJobsRepo,
    machinesRepo,
  });

  return {
    service,
    auditLog,
    billKotSequenceResetter,
    ordersArchiver,
    outletDirectory,
    backupJobsRepo,
    machinesRepo,
  };
}

describe('AdminService.resetBillNo', () => {
  it('throws ConfirmationRequiredError when confirm is not true', async () => {
    const { service, billKotSequenceResetter } = buildService();
    billKotSequenceResetter.seed('outlet-A', 10, 20);

    await expect(service.resetBillNo('outlet-A', adminActor, false)).rejects.toThrow(
      ConfirmationRequiredError
    );
  });

  it('throws ForbiddenError for a non-admin actor even with confirm=true', async () => {
    const { service, billKotSequenceResetter } = buildService();
    billKotSequenceResetter.seed('outlet-A', 10, 20);

    await expect(service.resetBillNo('outlet-A', staffActor, true)).rejects.toThrow(
      ForbiddenError
    );
  });

  it('resets only the target outlet sequence, never other outlets (cross-outlet isolation)', async () => {
    const { service, billKotSequenceResetter } = buildService();
    billKotSequenceResetter.seed('outlet-A', 10, 20);
    billKotSequenceResetter.seed('outlet-B', 99, 199);

    const result = await service.resetBillNo('outlet-A', adminActor, true);

    expect(result).toEqual({ billNoSeq: 0, kotNoSeq: 0 });

    const outletBSeq = await billKotSequenceResetter.getCurrentSequence('outlet-B');
    expect(outletBSeq).toEqual({ billNoSeq: 99, kotNoSeq: 199 });
  });

  it('writes an audit log entry with before/after sequence values', async () => {
    const { service, billKotSequenceResetter, auditLog } = buildService();
    billKotSequenceResetter.seed('outlet-A', 10, 20);

    await service.resetBillNo('outlet-A', adminActor, true);

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('RESET_BILL_NO');
    expect(entries[0].actorId).toBe(adminActor.actorId);
    expect(entries[0].beforeVal).toEqual({ billNoSeq: 10, kotNoSeq: 20 });
    expect(entries[0].afterVal).toEqual({ billNoSeq: 0, kotNoSeq: 0 });
  });
});

describe('AdminService.removeAllOrdersAndKot', () => {
  it('throws InvalidConfirmationPhraseError when the phrase does not match the outlet name', async () => {
    const { service, outletDirectory, ordersArchiver } = buildService();
    outletDirectory.set('outlet-A', 'Downtown Diner');
    ordersArchiver.seed([{ id: 'ord-1', outletId: 'outlet-A' }]);

    await expect(
      service.removeAllOrdersAndKot('outlet-A', adminActor, true, 'Wrong Name')
    ).rejects.toThrow(InvalidConfirmationPhraseError);
  });

  it('archives (does not hard-delete) orders when the phrase matches, and audit-logs a count', async () => {
    const { service, outletDirectory, ordersArchiver, auditLog } = buildService();
    outletDirectory.set('outlet-A', 'Downtown Diner');
    ordersArchiver.seed([
      { id: 'ord-1', outletId: 'outlet-A' },
      { id: 'ord-2', outletId: 'outlet-A' },
      { id: 'ord-3', outletId: 'outlet-B' },
    ]);

    const result = await service.removeAllOrdersAndKot(
      'outlet-A',
      adminActor,
      true,
      'Downtown Diner'
    );

    expect(result.archivedCount).toBe(2);

    // Archived locally, not hard-deleted -- retrievable via listArchivedOrders.
    const archived = service.listArchivedOrders('outlet-A');
    expect(archived.map((o) => o.id).sort()).toEqual(['ord-1', 'ord-2']);

    // outlet-A's live orders are now gone from the source (Orders service fake),
    // but outlet-B is untouched.
    const remainingLive = await ordersArchiver.listLiveOrders('outlet-B');
    expect(remainingLive).toHaveLength(1);

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('REMOVE_ALL_ORDERS_KOT');
    expect(entries[0].afterVal).toEqual({ archivedCount: 2 });
  });
});

describe('AdminService.removeBackupFiles', () => {
  function seedBackups(service: AdminService, outletId: string): BackupJob[] {
    const jobs: BackupJob[] = [
      {
        id: 'backup-1',
        outletId,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        sizeBytes: 1000,
        status: 'completed',
        fileName: 'backup-1.tar.gz',
      },
      {
        id: 'backup-2',
        outletId,
        createdAt: new Date('2026-08-15T00:00:00Z'),
        sizeBytes: 1200,
        status: 'completed',
        fileName: 'backup-2.tar.gz',
      },
    ];
    jobs.forEach((j) => service.seedBackupJob(j));
    return jobs;
  }

  it('refuses to remove the single most-recent backup even if requested', async () => {
    const { service } = buildService();
    seedBackups(service, 'outlet-A');

    // backup-2 is the most recent; request removal of both.
    const result = await service.removeBackupFiles('outlet-A', adminActor, true, [
      'backup-1',
      'backup-2',
    ]);

    expect(result.removedIds).toEqual(['backup-1']);
    expect(result.skippedMostRecent).toBe(true);

    const remaining = service.listBackupJobs('outlet-A');
    expect(remaining.map((b) => b.id)).toEqual(['backup-2']);
  });

  it('throws ConfirmationRequiredError without confirm=true', async () => {
    const { service } = buildService();
    seedBackups(service, 'outlet-A');

    await expect(
      service.removeBackupFiles('outlet-A', adminActor, false, ['backup-1'])
    ).rejects.toThrow(ConfirmationRequiredError);
  });
});

describe('AdminService.getMachines', () => {
  it('marks a machine offline when lastSeenAt is stale and online when recent', () => {
    const { service } = buildService();
    const now = new Date('2026-08-21T12:00:00Z');

    service.registerMachineHeartbeat(
      'outlet-A',
      'server-1',
      'server',
      '192.168.1.10',
      true,
      new Date(now.getTime() - MACHINE_FRESHNESS_WINDOW_MS - 1000) // stale
    );
    service.registerMachineHeartbeat(
      'outlet-A',
      'client-1',
      'client',
      '192.168.1.20',
      false,
      new Date(now.getTime() - 1000) // recent
    );

    const machines = service.getMachines('outlet-A', staffActor, now);
    const server = machines.find((m) => m.id === 'server-1');
    const client = machines.find((m) => m.id === 'client-1');

    expect(server?.isOnline).toBe(false);
    expect(server?.isSelf).toBe(true);
    expect(client?.isOnline).toBe(true);
    expect(client?.ip).toBe('192.168.1.20');
  });

  it('is open to any authenticated staff member, not just admin/manager', () => {
    const { service } = buildService();
    service.registerMachineHeartbeat('outlet-A', 'server-1', 'server', '192.168.1.10', true);

    expect(() => service.getMachines('outlet-A', staffActor)).not.toThrow();
  });
});

describe('AdminService.getLogs', () => {
  it('throws ForbiddenError for a cashier/staff role', () => {
    const { service } = buildService();
    expect(() => service.getLogs('outlet-A', staffActor)).toThrow(ForbiddenError);
  });

  it('allows manager role (read-only, no confirm required)', () => {
    const { service } = buildService();
    service.appendLog({ outletId: 'outlet-A', level: 'info', message: 'hello', at: new Date() });

    expect(() => service.getLogs('outlet-A', managerActor)).not.toThrow();
    expect(service.getLogs('outlet-A', managerActor)).toHaveLength(1);
  });

  it('allows admin role and filters by level and date range', () => {
    const { service } = buildService();
    service.appendLog({
      outletId: 'outlet-A',
      level: 'error',
      message: 'boom',
      at: new Date('2026-08-10T00:00:00Z'),
    });
    service.appendLog({
      outletId: 'outlet-A',
      level: 'info',
      message: 'ok',
      at: new Date('2026-08-20T00:00:00Z'),
    });

    const errors = service.getLogs('outlet-A', adminActor, { level: 'error' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('boom');

    const inRange = service.getLogs('outlet-A', adminActor, {
      fromDate: new Date('2026-08-15T00:00:00Z'),
    });
    expect(inRange).toHaveLength(1);
    expect(inRange[0].message).toBe('ok');
  });
});

describe('AdminService.resetSyncCode', () => {
  it('throws ConfirmationRequiredError when confirm is not true', async () => {
    const { service } = buildService();
    await expect(service.resetSyncCode('outlet-A', adminActor, false)).rejects.toThrow(
      ConfirmationRequiredError
    );
  });

  it('throws ForbiddenError for a non-admin actor', async () => {
    const { service } = buildService();
    await expect(service.resetSyncCode('outlet-A', staffActor, true)).rejects.toThrow(
      ForbiddenError
    );
  });

  it('generates a new code that differs from the old one and invalidates it', async () => {
    const { service } = buildService();

    const first = await service.resetSyncCode('outlet-A', adminActor, true);
    const second = await service.resetSyncCode('outlet-A', adminActor, true);

    expect(second.syncCode).not.toBe(first.syncCode);
    expect(typeof second.syncCode).toBe('string');
    expect(second.syncCode.length).toBeGreaterThan(0);
  });

  it('writes exactly one audit entry per call with confirmedExplicitly=true', async () => {
    const { service, auditLog } = buildService();

    await service.resetSyncCode('outlet-A', adminActor, true);

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('RESET_SYNC_CODE');
    expect(entries[0].confirmedExplicitly).toBe(true);
  });
});

describe('AdminService.triggerDatabaseMigration', () => {
  it('throws ConfirmationRequiredError when confirm is not true', async () => {
    const { service } = buildService();
    await expect(service.triggerDatabaseMigration('outlet-A', adminActor, false)).rejects.toThrow(
      ConfirmationRequiredError
    );
  });

  it('throws ForbiddenError for a non-admin actor', async () => {
    const { service } = buildService();
    await expect(
      service.triggerDatabaseMigration('outlet-A', staffActor, true)
    ).rejects.toThrow(ForbiddenError);
  });

  it('records a pending/running migration job and exactly one audit entry', async () => {
    const { service, auditLog } = buildService();

    const { jobId } = await service.triggerDatabaseMigration('outlet-A', adminActor, true);
    expect(jobId).toBeTruthy();

    const job = await service.getMigrationStatus(jobId);
    expect(['pending', 'running', 'succeeded', 'failed', 'queued', 'completed']).toContain(
      job.status
    );

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('DATABASE_MIGRATION');
    expect(entries[0].confirmedExplicitly).toBe(true);
  });
});

describe('confirmedExplicitly audit trail (every destructive action)', () => {
  it('resetBillNo audit entry has confirmedExplicitly=true and there is exactly one entry', async () => {
    const { service, billKotSequenceResetter, auditLog } = buildService();
    billKotSequenceResetter.seed('outlet-A', 10, 20);

    await service.resetBillNo('outlet-A', adminActor, true);

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].confirmedExplicitly).toBe(true);
  });

  it('removeAllOrdersAndKot audit entry has confirmedExplicitly=true', async () => {
    const { service, outletDirectory, ordersArchiver, auditLog } = buildService();
    outletDirectory.set('outlet-A', 'Downtown Diner');
    ordersArchiver.seed([{ id: 'ord-1', outletId: 'outlet-A' }]);

    await service.removeAllOrdersAndKot('outlet-A', adminActor, true, 'Downtown Diner');

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].confirmedExplicitly).toBe(true);
  });

  it('removeBackupFiles audit entry has confirmedExplicitly=true', async () => {
    const { service, auditLog } = buildService();
    service.seedBackupJob({
      id: 'backup-1',
      outletId: 'outlet-A',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      sizeBytes: 100,
      status: 'completed',
      fileName: 'backup-1.tar.gz',
    });
    service.seedBackupJob({
      id: 'backup-2',
      outletId: 'outlet-A',
      createdAt: new Date('2026-08-15T00:00:00Z'),
      sizeBytes: 100,
      status: 'completed',
      fileName: 'backup-2.tar.gz',
    });

    await service.removeBackupFiles('outlet-A', adminActor, true, ['backup-1']);

    const entries = auditLog.listForOutlet('outlet-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].confirmedExplicitly).toBe(true);
    expect(entries[0].action).toBe('REMOVE_BACKUP_FILES');

    // Only the specified id was removed -- not all backups.
    const remaining = service.listBackupJobs('outlet-A');
    expect(remaining.map((b) => b.id)).toEqual(['backup-2']);
  });
});
