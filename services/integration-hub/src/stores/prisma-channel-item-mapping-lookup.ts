import { PrismaClient } from "@prisma/client";
import type { ChannelItemMappingLookup } from "../mapping-engine";

export class PrismaChannelItemMappingLookup implements ChannelItemMappingLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalItemId(
    channelAccountId: string,
    externalItemId: string,
  ): Promise<{ menuItemId: string; channelPriceMinor: bigint | null } | null> {
    const row = await this.prisma.channelItemMapping.findUnique({
      where: {
        channelAccountId_externalItemId: {
          channelAccountId,
          externalItemId,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      menuItemId: row.menuItemId,
      channelPriceMinor: row.channelPrice,
    };
  }
}
