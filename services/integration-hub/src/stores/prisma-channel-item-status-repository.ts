import { PrismaClient } from "@prisma/client";
import type { ChannelItemStatusRepository } from "../channel-item-status";

export class PrismaChannelItemStatusRepository implements ChannelItemStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listMappings(outletId: string, channel?: string) {
    // Fetch channel item mappings from real table
    const mappings = await (this.prisma as any).channel_item_mapping.findMany({
      where: {
        outlet_id: outletId,
        is_active: true,
        ...(channel ? { channel_code: channel.toUpperCase() } : {}),
      },
      include: {
        menu_items: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return mappings.map((m: any) => ({
      mappingId: m.id,
      channelAccountId: m.channel_account_id,
      channel: m.channel_code,
      menuItemId: m.menu_item_id,
      name: m.menu_items.name,
      onlineDisplayName: m.display_name || m.menu_items.name,
      categoryName: m.menu_items.category?.name ?? "General",
      isAvailable: m.is_available,
      version: m.version,
    }));
  }

  async updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean): Promise<boolean> {
    // Use real table with optimistic locking
    const result = await (this.prisma as any).channel_item_mapping.updateMany({
      where: {
        id: mappingId,
        version: expectedVersion,
      },
      data: {
        is_available: isAvailable,
        version: { increment: 1 },
        updated_at: new Date(),
      },
    });

    if (result.count === 0) {
      return false; // Version mismatch or not found
    }

    // Still write audit log for compliance
    const mapping = await (this.prisma as any).channel_item_mapping.findUnique({
      where: { id: mappingId },
    });
    if (mapping) {
      await this.prisma.auditLog.create({
        data: {
          outletId: mapping.outlet_id,
          action: "UPDATE",
          entityType: "CHANNEL_ITEM_AVAILABILITY",
          entityId: mappingId,
          beforeState: { isAvailable: !isAvailable },
          afterState: { channel: mapping.channel_code, isAvailable, version: expectedVersion + 1 },
          createdAt: new Date(),
        },
      });
    }

    return true;
  }

  async getMapping(mappingId: string): Promise<{ version: number } | null> {
    const mapping = await (this.prisma as any).channel_item_mapping.findUnique({
      where: { id: mappingId },
    });

    if (!mapping) {
      return null;
    }

    return { version: mapping.version };
  }
}
