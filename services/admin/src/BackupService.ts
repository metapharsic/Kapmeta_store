// services/admin/src/BackupService.ts
//
// Backup *creation* and *listing* are read/append-only (no confirm or
// admin-role gate needed to create or view a backup); *removal* of
// backups is destructive and lives on AdminService.removeBackupFiles
// (confirm + admin-role + audit), which reuses this service's
// BackupJobsRepository so both halves see the same records.
//
// createBackup() is a documented placeholder: a real implementation
// would shell out to a pg_dump-style job runner and poll it to
// completion. Here it simulates that by immediately recording a
// 'completed' BackupJob with a fake file path.

import { randomUUID } from 'crypto';
import { BackupFile, BackupJob } from './types';
import { BackupJobsRepository } from './BackupJobsRepository';

export class BackupService {
  constructor(private readonly repo: BackupJobsRepository = new BackupJobsRepository()) {}

  /**
   * Placeholder for a real pg_dump-style backup job. Real implementation
   * would shell out to a backup runner and poll job status; this
   * simulates an immediately-completed backup with a fake file path.
   */
  async createBackup(outletId: string): Promise<BackupFile> {
    const now = new Date();
    const fileName = `backup-${outletId}-${now.getTime()}.sql.gz`;
    const job: BackupJob = {
      id: randomUUID(),
      outletId,
      createdAt: now,
      // Simulated size -- a real pg_dump job would report the actual bytes written.
      sizeBytes: 0,
      status: 'completed',
      fileName: `/var/backups/kapmeta/${fileName}`,
    };
    return this.repo.insert(job);
  }

  listBackups(outletId: string): BackupFile[] {
    return this.repo.findByOutlet(outletId);
  }

  /** Shared repository accessor so AdminService can operate on the same backups. */
  get repository(): BackupJobsRepository {
    return this.repo;
  }
}
