import type { PrismaClient } from "@prisma/client";

let timer: NodeJS.Timeout | null = null;

export function startOutboxProcessor(prisma: PrismaClient, intervalMs = 2000): void {
  if (timer) return;
  timer = setInterval(() => {
    drainOutbox(prisma).catch((err) => console.error("outbox drain failed", err));
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

export async function drainOutbox(prisma: PrismaClient): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (pending.length === 0) return 0;

  let processed = 0;
  for (const event of pending) {
    try {
      const { broadcast } = await import("../websockets");
      broadcast(event.outletId, event.eventType, event.payload);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      processed += 1;
    } catch (err) {
      const attempts = event.attempts + 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          status: attempts >= event.maxAttempts ? "FAILED" : "PENDING",
        },
      });
    }
  }
  return processed;
}
