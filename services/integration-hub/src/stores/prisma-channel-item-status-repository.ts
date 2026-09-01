import { PrismaClient } from "@prisma/client";
import type { ChannelItemStatusRepository } from "../channel-item-status";

export class PrismaChannelItemStatusRepository implements ChannelItemStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listMappings(outletId: string, channel?: string) {
    const accounts = await this.prisma.channelAccount.findMany({
      where: { outletId, is_active: true },
    });
    const filtered = channel
      ? accounts.filter((a) => (a.credentialsRef || "").toUpperCase() === channel.toUpperCase())
      : accounts;
    const accountIds = filtered.map((a) => a.id);
    const accountById = new Map(filtered.map((a) => [a.id, a]));

    const menuItems = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: { category: true },
    });
    const itemById = new Map(menuItems.map((i) => [i.id, i]));

    const rows = await this.prisma.item_availability.findMany({
      where: {
        outlet_id: outletId,
        ...(accountIds.length > 0 ? { channel_id: { in: accountIds } } : {}),
      },
    });

    return rows
      .map((row) => {
        const item = itemById.get(row.item_id);
        const account = accountById.get(row.channel_id);
        if (!item || !account) return null;
        return {
          mappingId: row.id,
          channelAccountId: account.id,
          channel: account.credentialsRef || "CHANNEL",
          menuItemId: item.id,
          name: item.name,
          onlineDisplayName: item.name,
          categoryName: item.category?.name ?? "General",
          isAvailable: row.state !== "OFF",
          version: row.version,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean): Promise<boolean> {
    const result = await this.prisma.item_availability.updateMany({
      where: {
        id: mappingId,
        version: expectedVersion,
      },
      data: {
        state: isAvailable ? "ON" : "OFF",
        version: { increment: 1 },
        updated_at: new Date(),
      },
    });

    if (result.count === 0) {
      return false;
    }

    const mapping = await this.prisma.item_availability.findUnique({
      where: { id: mappingId },
    });
    if (mapping) {
      await this.prisma.auditLog.create({
        data: {
          outletId: mapping.outlet_id,
          userId: "SYSTEM",
          action: "UPDATE",
          entityType: "CHANNEL_ITEM_AVAILABILITY",
          entityId: mappingId,
          beforeState: { isAvailable: !isAvailable },
          afterState: { isAvailable, version: expectedVersion + 1 },
          createdAt: new Date(),
        },
      });
    }

    return true;
  }

  async getMapping(mappingId: string): Promise<{ version: number } | null> {
    const mapping = await this.prisma.item_availability.findUnique({
      where: { id: mappingId },
    });
    if (!mapping) return null;
    return { version: mapping.version };
  }
}
