import { PrismaClient, Prisma } from "@prisma/client";
import type { InboundEventStore } from "../webhook-receiver";

export class PrismaInboundEventStore implements InboundEventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalEventId(channelAccountId: string, externalEventId: string): Promise<{ id: string } | null> {
    const event = await this.prisma.inboundEvent.findUnique({
      where: {
        channelAccountId_externalEventId: {
          channelAccountId,
          externalEventId,
        },
      },
    });
    return event ? { id: event.id } : null;
  }

  async persistRaw(args: {
    channelAccountId: string;
    externalEventId: string;
    eventType: string;
    rawPayload: unknown;
  }): Promise<{ id: string }> {
    const event = await (this.prisma.inboundEvent as any).create({
      data: {
        channelAccountId: args.channelAccountId,
        externalEventId: args.externalEventId,
        rawPayload: args.rawPayload as Prisma.InputJsonValue,
      },
    });
    return { id: event.id };
  }

  async markProcessed(id: string): Promise<void> {
    await (this.prisma.inboundEvent as any).update({
      where: { id },
      data: {
        processedAt: new Date(),
      },
    });
  }

  async markQuarantined(id: string, reason: string): Promise<void> {
    const event = await (this.prisma.inboundEvent as any).update({
      where: { id },
      data: { processedAt: new Date() },
    });

    await (this.prisma.integrationError as any).create({
      data: {
        source: "INBOUND_EVENT",
        sourceId: id,
        errorCode: "QUARANTINED",
        message: reason,
      },
    }).catch(() => {});
  }
}
