// services/admin/src/BackupJobsRepository.ts

import { BackupJob } from './types';
import { InMemoryRepository } from './Repository';

export class BackupJobsRepository extends InMemoryRepository<BackupJob> {
  findByOutlet(outletId: string): BackupJob[] {
    return this.findWhere((b) => b.outletId === outletId);
  }

  /** Most recent backup for the outlet, by createdAt. */
  mostRecentForOutlet(outletId: string): BackupJob | undefined {
    const jobs = this.findByOutlet(outletId);
    if (jobs.length === 0) return undefined;
    return jobs.reduce((latest, job) =>
      job.createdAt.getTime() > latest.createdAt.getTime() ? job : latest
    );
  }
}
