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
    const event = await this.prisma.inboundEvent.create({
      data: {
        channelAccountId: args.channelAccountId,
        externalEventId: args.externalEventId,
        eventType: args.eventType,
        rawPayload: args.rawPayload as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    });
    return { id: event.id };
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.inboundEvent.update({
      where: { id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });
  }

  async markQuarantined(id: string, reason: string): Promise<void> {
    const event = await this.prisma.inboundEvent.update({
      where: { id },
      data: { status: "QUARANTINED" },
    });

    await this.prisma.integrationError.create({
      data: {
        channelAccountId: event.channelAccountId,
        source: "INBOUND_EVENT",
        sourceId: id,
        errorCode: "QUARANTINED",
        message: reason,
      },
    });
  }
}
