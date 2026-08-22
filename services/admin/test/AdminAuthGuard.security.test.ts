// services/admin/test/AdminAuthGuard.security.test.ts
//
// Hardening tests: every destructive AdminService action must reject
// (a) a non-admin actor, (b) confirm:false, and (c) a missing confirm
// field (undefined), regardless of role.

import { describe, it, expect } from 'vitest';
import { AdminService, OutletDirectory } from '../src/AdminService';
import { AdminAuditLog } from '../src/AdminAuditLog';
import { BackupJobsRepository } from '../src/BackupJobsRepository';
import { MachinesRepository } from '../src/MachinesRepository';
import {
  BillKotSequenceResetter,
  MigrationRunner,
  OrderRecord,
  OrdersArchiver,
} from '../src/interfaces';
import { ActorContext } from '../src/types';
import { ConfirmationRequiredError, ForbiddenError } from '../src/errors';

class FakeBillKotSequenceResetter implements BillKotSequenceResetter {
  async getCurrentSequence(_outletId: string) {
    return { billNoSeq: 0, kotNoSeq: 0 };
  }
  async resetSequence(_outletId: string) {
    return { billNoSeq: 0, kotNoSeq: 0 };
  }
}

class FakeOrdersArchiver implements OrdersArchiver {
  private orders: OrderRecord[] = [];
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
  async startMigration(outletId: string) {
    return { jobId: `mig-${outletId}-1` };
  }
  async getStatus(jobId: string) {
    return { jobId, status: 'running' as const };
  }
}

class FakeOutletDirectory implements OutletDirectory {
  async getOutletName(_outletId: string) {
    return 'Test Outlet';
  }
}

const adminActor: ActorContext = { actorId: 'user-admin-1', role: 'admin' };
const staffActor: ActorContext = { actorId: 'user-staff-1', role: 'staff' };
const managerActor: ActorContext = { actorId: 'user-manager-1', role: 'manager' };

function buildService() {
  return new AdminService({
    auditLog: new AdminAuditLog(),
    billKotSequenceResetter: new FakeBillKotSequenceResetter(),
    ordersArchiver: new FakeOrdersArchiver(),
    migrationRunner: new FakeMigrationRunner(),
    outletDirectory: new FakeOutletDirectory(),
    backupJobsRepo: new BackupJobsRepository(),
    machinesRepo: new MachinesRepository(),
  });
}

// Each destructive action, expressed as a call that always uses confirm:true
// with an admin actor when we want a "would otherwise succeed" baseline, and
// as a factory so we can vary actor/confirm per test.
type Invoke = (service: AdminService, actor: ActorContext, confirm: unknown) => Promise<unknown>;

const destructiveActions: Array<{ name: string; invoke: Invoke }> = [
  {
    name: 'resetBillNo',
    invoke: (service, actor, confirm) =>
      service.resetBillNo('outlet-1', actor, confirm as boolean),
  },
  {
    name: 'resetSyncCode',
    invoke: (service, actor, confirm) =>
      service.resetSyncCode('outlet-1', actor, confirm as boolean),
  },
  {
    name: 'triggerDatabaseMigration',
    invoke: (service, actor, confirm) =>
      service.triggerDatabaseMigration('outlet-1', actor, confirm as boolean),
  },
  {
    name: 'removeAllOrdersAndKot',
    invoke: (service, actor, confirm) =>
      service.removeAllOrdersAndKot('outlet-1', actor, confirm as boolean, 'Test Outlet'),
  },
  {
    name: 'removeBackupFiles',
    invoke: (service, actor, confirm) =>
      service.removeBackupFiles('outlet-1', actor, confirm as boolean, ['backup-1']),
  },
];

describe('AdminAuthGuard hardening: destructive action surface', () => {
  for (const { name, invoke } of destructiveActions) {
    describe(name, () => {
      it('rejects a non-admin (staff) actor even with confirm:true', async () => {
        const service = buildService();
        await expect(invoke(service, staffActor, true)).rejects.toBeInstanceOf(ForbiddenError);
      });

      it('rejects a non-admin (manager) actor even with confirm:true', async () => {
        const service = buildService();
        await expect(invoke(service, managerActor, true)).rejects.toBeInstanceOf(ForbiddenError);
      });

      it('rejects an admin actor when confirm is explicitly false', async () => {
        const service = buildService();
        await expect(invoke(service, adminActor, false)).rejects.toBeInstanceOf(
          ConfirmationRequiredError
        );
      });

      it('rejects an admin actor when confirm is missing (undefined)', async () => {
        const service = buildService();
        await expect(invoke(service, adminActor, undefined)).rejects.toBeInstanceOf(
          ConfirmationRequiredError
        );
      });

      it('reports the role problem (not the confirm problem) when both are wrong', async () => {
        // A non-admin, unconfirmed request should surface as a permission
        // problem first -- confirms AdminService's documented ordering in
        // assertConfirmedAdmin(): role check before confirm check.
        const service = buildService();
        await expect(invoke(service, staffActor, false)).rejects.toBeInstanceOf(ForbiddenError);
      });
    });
  }

  it('getLogs (read-only) still rejects staff role', () => {
    const service = buildService();
    expect(() => service.getLogs('outlet-1', staffActor)).toThrow(ForbiddenError);
  });

  it('getLogs (read-only) allows manager role', () => {
    const service = buildService();
    expect(() => service.getLogs('outlet-1', managerActor)).not.toThrow();
  });
});
