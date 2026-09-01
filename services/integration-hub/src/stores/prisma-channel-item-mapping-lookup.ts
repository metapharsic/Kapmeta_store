import { PrismaClient } from "@prisma/client";
import type { ChannelItemMappingLookup } from "../mapping-engine";

export class PrismaChannelItemMappingLookup implements ChannelItemMappingLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalItemId(
    channelAccountId: string,
    externalItemId: string,
  ): Promise<{ menuItemId: string; channelPriceMinor: bigint | null } | null> {
    try {
      const row = await (this.prisma as any).channelItemMapping?.findUnique?.({
        where: {
          channelAccountId_externalItemId: {
            channelAccountId,
            externalItemId,
          },
        },
      }).catch(() => null);

      if (row) {
        return {
          menuItemId: (row as any).item_id || (row as any).menuItemId,
          channelPriceMinor: (row as any).channelPrice || (row as any).channel_price || null,
        };
      }

      const firstRow = await (this.prisma as any).channelItemMapping?.findFirst?.({
        where: {
          channelAccountId,
          externalItemId,
        },
      }).catch(() => null);

      if (firstRow) {
        return {
          menuItemId: (firstRow as any).item_id || (firstRow as any).menuItemId,
          channelPriceMinor: (firstRow as any).channelPrice || (firstRow as any).channel_price || null,
        };
      }

      const channelAccount = await (this.prisma as any).channelAccount?.findUnique?.({
        where: { id: channelAccountId },
      }).catch(() => null);

      if (channelAccount?.itemMappings) {
        const mapping = channelAccount.itemMappings.find((m: any) => m.externalItemId === externalItemId);
        if (mapping) {
          return {
            menuItemId: mapping.menuItemId || mapping.item_id,
            channelPriceMinor: mapping.channelPrice || mapping.channelPriceMinor || null,
          };
        }
      }
    } catch {}

    return null;
  }
}
