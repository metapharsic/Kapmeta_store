import { PrismaClient } from "@prisma/client";
import type { SyncJobStore } from "../retry-dlq";

export class PrismaSyncJobStore implements SyncJobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async incrementAttempt(jobId: string): Promise<{ id: string; attempt: number }> {
    const row = await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { attempt: { increment: 1 } },
    });
    return { id: row.id, attempt: row.attempt };
  }

  async markFailed(jobId: string): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "FAILED" },
    });
  }

  async markDeadLettered(jobId: string, reason: string): Promise<void> {
    const job = await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "DEAD_LETTERED" },
    });
    await this.prisma.integrationError.create({
      data: {
        channelAccountId: job.channelAccountId,
        source: "SYNC_JOB",
        sourceId: jobId,
        errorCode: "DEAD_LETTERED",
        message: reason,
      },
    });
  }

  async markSynchronized(jobId: string): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "SYNCHRONIZED", completedAt: new Date() },
    });
  }
}
