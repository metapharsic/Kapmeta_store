import { PrismaClient } from "@prisma/client";
import type { SyncJobStore } from "../retry-dlq";

export class PrismaSyncJobStore implements SyncJobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async incrementAttempt(jobId: string): Promise<{ id: string; attempt: number }> {
    const row = await (this.prisma.syncJob as any).update({
      where: { id: jobId },
      data: { version: { increment: 1 } },
    });
    return { id: row.id, attempt: row.version || 1 };
  }

  async markFailed(jobId: string): Promise<void> {
    await (this.prisma.syncJob as any).update({
      where: { id: jobId },
      data: { status: "FAILED" },
    });
  }

  async markDeadLettered(jobId: string, reason: string): Promise<void> {
    const job = await (this.prisma.syncJob as any).update({
      where: { id: jobId },
      data: { status: "FAILED" },
    });
    await (this.prisma.integrationError as any).create({
      data: {
        source: "SYNC_JOB",
        sourceId: jobId,
        errorCode: "DEAD_LETTERED",
        message: reason,
      },
    }).catch(() => {});
  }

  async markSynchronized(jobId: string): Promise<void> {
    await (this.prisma.syncJob as any).update({
      where: { id: jobId },
      data: { status: "SUCCESS" },
    });
  }
}
