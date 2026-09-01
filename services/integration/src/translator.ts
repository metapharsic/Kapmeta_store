import { PrismaClient } from '@prisma/client';

export interface SwiggyOrderPayload {
  order_id: string;
  total_amount: number;
  items: Array<{
    item_id: string; // external item ID
    quantity: number;
    price: number;
    notes?: string;
  }>;
}

export class IntegrationTranslator {
  constructor(private prisma: PrismaClient) {}

  async translateSwiggyOrder(
    channelAccountId: string,
    payload: SwiggyOrderPayload
  ) {
    const channelAccount = await this.prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
    });

    if (!channelAccount) {
      throw new Error(`Channel account ${channelAccountId} not found`);
    }

    const itemMappings: any[] = (channelAccount as any).itemMappings ?? (await (this.prisma as any).channelItemMapping?.findMany({
      where: { channelAccountId },
    })) ?? [];

    const outletId = channelAccount.outletId;
    const orderLines: any[] = [];
    const kotLines: any[] = [];
    
    let computedTotal = 0n;

    for (const extItem of payload.items) {
      const mapping = itemMappings.find(
        (m) => m.externalItemId === extItem.item_id
      );

      if (!mapping) {
        throw new Error(`Unmapped external item ID: ${extItem.item_id}`);
      }

      // Convert price to minor units
      const unitPrice = BigInt(Math.round(extItem.price * 100));
      const subtotal = unitPrice * BigInt(extItem.quantity);
      computedTotal += subtotal;

      const itemId = (mapping as any).item_id || (mapping as any).menuItemId;
      orderLines.push({
        menuItemId: itemId,
        quantity: extItem.quantity,
        unitPrice,
        subtotal,
        notes: extItem.notes,
      });

      kotLines.push({
        menuItemId: itemId,
        quantity: extItem.quantity,
        notes: extItem.notes,
      });
    }

    // Return structured data ready for the Order Agent
    return {
      outletId,
      externalOrderId: payload.order_id,
      partnerStatedTotal: BigInt(Math.round(payload.total_amount * 100)),
      computedTotal,
      orderInput: {
        outletId,
        orderType: 'AGGREGATOR',
        lines: orderLines,
        // The aggregator total will become the order subtotal
        discountTotal: 0n,
        taxTotal: 0n, // Simple assumption, normally calculated via Tax agent
      },
      kotInput: {
        outletId,
        lines: kotLines,
      },
    };
  }
}
