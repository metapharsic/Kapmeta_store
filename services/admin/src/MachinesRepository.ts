// services/admin/src/MachinesRepository.ts

import { MachineInfo } from './types';
import { InMemoryRepository } from './Repository';

/**
 * MachinesRepository stores raw machine records WITHOUT a computed
 * isOnline flag persisted -- isOnline is always derived at read-time
 * in AdminService.checkMachines() from lastSeenAt vs "now", so the
 * repository's isOnline field is a best-effort snapshot only and
 * should not be relied upon directly by callers.
 */
export class MachinesRepository extends InMemoryRepository<MachineInfo> {
  findByOutlet(outletId: string): MachineInfo[] {
    return this.findWhere((m) => m.outletId === outletId);
  }

  findByOutletAndId(outletId: string, machineId: string): MachineInfo | undefined {
    return this.findByOutlet(outletId).find((m) => m.id === machineId);
  }
}
