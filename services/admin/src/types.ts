// services/admin/src/types.ts

export type AdminRole = 'admin' | 'manager' | 'staff';

export interface ActorContext {
  actorId: string;
  role: AdminRole;
}

export type AdminActionType =
  | 'RESET_BILL_NO'
  | 'RESET_SYNC_CODE'
  | 'DATABASE_MIGRATION'
  | 'REMOVE_ALL_ORDERS_KOT'
  | 'REMOVE_BACKUP_FILES';

export type MachineRole = 'server' | 'client';

export interface MachineInfo {
  id: string;
  outletId: string;
  role: MachineRole;
  ip: string;
  lastSeenAt: Date;
  /** True when this record represents the machine issuing the request. */
  isSelf: boolean;
  /**
   * Computed at read-time by AdminService.checkMachines(), not stored
   * as a persisted fact -- freshness is always evaluated against "now".
   */
  isOnline: boolean;
}

/** Alias matching the spec's `BackupFile` naming; same shape as BackupJob. */
export type BackupFile = BackupJob;

export type BackupJobStatus = 'completed' | 'failed' | 'in_progress';

export interface BackupJob {
  id: string;
  outletId: string;
  createdAt: Date;
  sizeBytes: number;
  status: BackupJobStatus;
  fileName: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  outletId: string;
  level: LogLevel;
  message: string;
  at: Date;
  source?: string;
}

export interface LogFilters {
  fromDate?: Date;
  toDate?: Date;
  level?: LogLevel;
}

export type MigrationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface MigrationJob {
  id: string;
  outletId: string;
  status: MigrationJobStatus;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}
