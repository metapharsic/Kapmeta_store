import { PrismaClient } from '@prisma/client';
import {
  createDefaultRegistry,
  PrismaChannelItemMappingLookup,
  mapInboundOrderItems,
  checkTotalMismatch,
} from "@kapmeta/integration-hub";
import {
  createOrder,
  transitionOrder,
  PrismaMenuPriceLookup,
  PrismaOrderRepository,
} from "@kapmeta/orders";
import type { InboundWebhookPayload, ChannelCode } from "@kapmeta/shared-types/channel";

export class WebhookWorker {
  private registry = createDefaultRegistry();

  constructor(
    private prisma: PrismaClient,
    private onOrderConfirmed?: (event: { orderId: string }) => void
  ) {}

  async processInboundEvent(eventId: string) {
    const event = await this.prisma.inboundEvent.findUnique({
      where: { id: eventId },
    });

    if (!event || (event as any).status !== 'RECEIVED') {
      return; // Already processed or quarantined
    }

    try {
      const channelAccount = await this.prisma.channelAccount.findUnique({
        where: { id: event.channelAccountId },
      });

      if (!channelAccount) {
        throw new Error(`Channel account ${event.channelAccountId} not found`);
      }

      if ((channelAccount as any).status && (channelAccount as any).status !== "ACTIVE") {
        await (this.prisma.inboundEvent as any).update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
        return;
      }

      const channel = ((channelAccount as any).channel || "SWIGGY") as ChannelCode;
      const adapter = this.registry.get(channel);
      
      const payload: InboundWebhookPayload = {
        channel,
        externalEventId: event.externalEventId,
        eventType: (event as any).eventType || "ORDER",
        receivedAt: ((event as any).receivedAt || event.created_at).toISOString(),
        raw: event.rawPayload,
      };

      // 1. Normalize Event using adapter
      const normalization = await adapter.normalizeInboundEvent(payload);

      if (normalization.status === "CANCELLATION" && normalization.externalOrderId) {
        // Handle cancellation
        const mapping = await (this.prisma as any).channelOrderMapping?.findFirst({
          where: {
            channelAccountId: event.channelAccountId,
            externalOrderId: normalization.externalOrderId,
          },
        });

        if (mapping) {
          const transitionResult = await transitionOrder(
            mapping.orderId,
            "CANCELLED",
            new PrismaOrderRepository(this.prisma),
            "SYSTEM_INTEGRATION",
            "CUSTOMER_CANCELLED"
          );

          if (!transitionResult.ok) {
            throw new Error(`Failed to cancel order ${mapping.orderId}: ${transitionResult.reason}`);
          }
        }

        await (this.prisma.inboundEvent as any).update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() }
        });
        return;
      }

      if (normalization.status === "ORDER" && normalization.order) {
        const order = normalization.order;

        // 2. Map external item IDs to internal menu item IDs using integration-hub mapping engine
        const lookup = new PrismaChannelItemMappingLookup(this.prisma);
        const mappingResult = await mapInboundOrderItems(event.channelAccountId, order, lookup);

        if (!mappingResult.ok) {
          throw new Error(`Unmapped external item IDs found: ${mappingResult.unmappedExternalItemIds.join(", ")}`);
        }

        // 3. Create the order using core orders service
        const createInput = {
          outletId: channelAccount.outletId,
          orderType: 'AGGREGATOR' as const,
          terminalNumber: 'AGGREGATOR',
          idempotencyKey: `EXT-${event.externalEventId}`,
          lines: mappingResult.lines.map((l) => {
            const originalItem = order.items.find(oi => oi.externalItemId === l.externalItemId);
            return {
              menuItemId: l.menuItemId,
              quantity: l.quantity,
              modifierOptionIds: [],
              notes: originalItem?.notes || "",
            };
          }),
        };

        const orderResult = await createOrder(
          createInput,
          new PrismaMenuPriceLookup(this.prisma),
          new PrismaOrderRepository(this.prisma)
        );

        const createdOrder = await this.prisma.order.findUnique({
          where: { id: orderResult.id },
        });
        const computedTotalMinor = createdOrder?.grandTotal ?? 0n;

        // 4. Record Price Mismatch as integration error if computed total differs from partner stated total
        const mismatchCheck = checkTotalMismatch(order.partnerStatedTotalMinor, computedTotalMinor);
        if (mismatchCheck.mismatched && (this.prisma.integrationError as any)?.create) {
          try {
            await (this.prisma.integrationError as any).create({
              data: {
                channelAccountId: event.channelAccountId,
                source: "WEBHOOK_WORKER",
                sourceId: event.externalEventId,
                errorCode: "PRICE_MISMATCH",
                message: `Price mismatch: partner stated ₹${Number(order.partnerStatedTotalMinor) / 100}, computed ₹${Number(computedTotalMinor) / 100}. Delta: ₹${Number(mismatchCheck.deltaMinor) / 100}`,
              },
            });
          } catch {}
        }

        // 5. Transition order to CONFIRMED
        const transitionResult = await transitionOrder(
          orderResult.id,
          "CONFIRMED",
          new PrismaOrderRepository(this.prisma),
          "SYSTEM_INTEGRATION"
        );

        if (!transitionResult.ok) {
          throw new Error(`Failed to transition order ${orderResult.id} to CONFIRMED: ${transitionResult.reason}`);
        }

        // 6. Map channel order
        await (this.prisma as any).channelOrderMapping?.create?.({
          data: {
            channelAccountId: event.channelAccountId,
            orderId: orderResult.id,
            externalOrderId: order.externalOrderId,
            partnerStatedTotal: order.partnerStatedTotalMinor,
            computedTotal: computedTotalMinor,
          }
        });

        // 7. Mark event as processed
        await (this.prisma.inboundEvent as any).update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() }
        });

        // 8. Emit order.confirmed to run KOT ticket generation & WS notification
        this.onOrderConfirmed?.({ orderId: orderResult.id });
      } else {
        // Unknown event status or not order/cancellation
        await (this.prisma.inboundEvent as any).update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() }
        });
      }
    } catch (err: any) {
      console.error(`Failed to process event ${eventId}:`, err);
      // DLQ logic: Move to QUARANTINED
      if ((this.prisma.inboundEvent as any)?.update) {
        try {
          await (this.prisma.inboundEvent as any).update({
            where: { id: event.id },
            data: { status: 'QUARANTINED' }
          });
        } catch {}
      }
      
      // Log integration error
      if ((this.prisma.integrationError as any)?.create) {
        try {
          await (this.prisma.integrationError as any).create({
            data: {
              channelAccountId: event.channelAccountId,
              source: 'WEBHOOK_WORKER',
              sourceId: event.externalEventId,
              errorCode: 'TRANSLATION_FAILED',
              message: err.message || 'Unknown error',
            }
          });
        } catch {}
      }
    }
  }

  // A cron-like method to retry quarantined events
  async retryQuarantinedEvents() {
    const quarantined = await (this.prisma.inboundEvent as any).findMany({
      where: { status: 'QUARANTINED' },
      take: 10,
    });

    for (const event of quarantined) {
      await (this.prisma.inboundEvent as any).update({
        where: { id: event.id },
        data: { status: 'RECEIVED' }
      });
      await this.processInboundEvent(event.id);
    }
  }
}
