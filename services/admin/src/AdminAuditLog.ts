// services/admin/src/AdminAuditLog.ts
//
// Append-only audit log for destructive/system-config admin actions.
// Mirrors the shape of the Orders service's audit-log pattern
// (actorId, action, beforeVal, afterVal, at) with an added outletId
// since every admin action here is scoped to a single outlet.

import { randomUUID } from 'crypto';
import { AdminActionType } from './types';
import { InMemoryRepository, Repository } from './Repository';

export interface AdminAuditLogEntry {
  id: string;
  outletId: string;
  actorId: string;
  action: AdminActionType;
  beforeVal: unknown;
  afterVal: unknown;
  at: Date;
  /**
   * True when the actor supplied the required explicit confirm: true
   * flag (and, for the most destructive action, the matching typed
   * outlet-name phrase). Every entry written by AdminService for a
   * successful destructive action has this set to true -- it exists
   * mainly so audit consumers never have to trust that "successful"
   * implies "explicitly confirmed" by re-deriving it themselves.
   */
  confirmedExplicitly: boolean;
}

export class AdminAuditLog {
  constructor(
    private readonly repo: Repository<AdminAuditLogEntry> = new InMemoryRepository<AdminAuditLogEntry>()
  ) {}

  /** Append a new audit entry. Audit logs are never mutated or removed. */
  record(entry: {
    outletId: string;
    actorId: string;
    action: AdminActionType;
    beforeVal: unknown;
    afterVal: unknown;
    confirmedExplicitly: boolean;
  }): AdminAuditLogEntry {
    const full: AdminAuditLogEntry = {
      id: randomUUID(),
      at: new Date(),
      ...entry,
    };
    this.repo.insert(full);
    return full;
  }

  listForOutlet(outletId: string): AdminAuditLogEntry[] {
    return this.repo
      .findWhere((e) => e.outletId === outletId)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  listAll(): AdminAuditLogEntry[] {
    return this.repo.findAll().sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
