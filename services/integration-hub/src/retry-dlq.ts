// Retry/Dead-letter Queue. Failure handling per source doc 11.3:
// temporary network error -> exponential retry; repeated failure -> DLQ + alert.
export interface RetryableJob {
  id: string;
  attempt: number;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

export function nextBackoffMs(attempt: number): number {
  return BASE_DELAY_MS * 2 ** attempt;
}

export function shouldDeadLetter(job: RetryableJob): boolean {
  return job.attempt >= MAX_ATTEMPTS;
}

export interface SyncJobStore {
  incrementAttempt(jobId: string): Promise<{ id: string; attempt: number }>;
  markFailed(jobId: string): Promise<void>;
  markDeadLettered(jobId: string, reason: string): Promise<void>;
  markSynchronized(jobId: string): Promise<void>;
}

export async function handleSyncJobFailure(
  jobId: string,
  reason: string,
  store: SyncJobStore,
): Promise<{ deadLettered: boolean; nextDelayMs?: number }> {
  const updated = await store.incrementAttempt(jobId);
  if (shouldDeadLetter(updated)) {
    await store.markDeadLettered(jobId, reason);
    return { deadLettered: true };
  }
  await store.markFailed(jobId);
  return { deadLettered: false, nextDelayMs: nextBackoffMs(updated.attempt) };
}
