import { PrismaClient } from "@prisma/client";
import type { ReconciliationRepository, ChannelOrderRecord } from "../reconciliation-service";

export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listChannelOrdersInRange(
    channelAccountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<ChannelOrderRecord[]> {
    const rows: any[] = (await (this.prisma as any).channelOrderMapping?.findMany?.({
      where: {
        channelAccountId,
        createdAt: { gte: fromDate, lte: toDate },
      },
    })) || [];

    return rows.map((row: any) => ({
      id: row.id,
      channelAccountId: row.channelAccountId,
      orderId: row.orderId,
      externalOrderId: row.externalOrderId,
      partnerStatedTotalMinor: row.partnerStatedTotal,
      computedTotalMinor: row.computedTotal,
    }));
  }

  async recordMismatch(
    channelAccountId: string,
    channelOrderMappingId: string,
    deltaMinor: bigint
  ): Promise<void> {
    await (this.prisma.integrationError as any).create({
      data: {
        source: "PRICE_MISMATCH",
        sourceId: channelOrderMappingId,
        errorCode: "PARTNER_TOTAL_MISMATCH",
        message: `partner/computed total delta: ${deltaMinor} minor units`,
      },
    }).catch(() => {});
  }
}
