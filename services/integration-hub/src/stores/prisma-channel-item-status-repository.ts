import { PrismaClient } from "@prisma/client";
import type { ChannelItemStatusRepository } from "../channel-item-status";

export class PrismaChannelItemStatusRepository implements ChannelItemStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listMappings(outletId: string, channel?: string) {
    const rows = await this.prisma.channelItemMapping.findMany({
      where: {
        channelAccount: {
          outletId,
          ...(channel ? { channel } : {}),
        },
      },
      include: {
        channelAccount: true,
        menuItem: { include: { category: true } },
      },
      orderBy: { menuItem: { name: "asc" } },
    });

    return rows.map((row) => ({
      mappingId: row.id,
      channelAccountId: row.channelAccountId,
      channel: row.channelAccount.channel,
      menuItemId: row.menuItemId,
      name: row.menuItem.name,
      onlineDisplayName: row.menuItem.onlineDisplayName,
      categoryName: row.menuItem.category?.name ?? "",
      isAvailable: row.isAvailable,
      version: row.version,
    }));
  }

  async updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean): Promise<boolean> {
    const result = await this.prisma.channelItemMapping.updateMany({
      where: { id: mappingId, version: expectedVersion },
      data: { isAvailable, version: { increment: 1 } },
    });
    return result.count > 0;
  }

  async getMapping(mappingId: string): Promise<{ version: number } | null> {
    const row = await this.prisma.channelItemMapping.findUnique({
      where: { id: mappingId },
      select: { version: true },
    });
    return row ? { version: row.version } : null;
  }
}
