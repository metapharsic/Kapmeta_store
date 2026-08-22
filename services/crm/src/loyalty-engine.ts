import { PrismaClient } from "@prisma/client";
import { onOrderSettled, OrderSettledEvent } from "../../../apps/api/src/events";

export class LoyaltyEngine {
  private prisma: PrismaClient;

  // 1 point per 100 INR (10000 minor units)
  private readonly POINTS_EARN_RATE = 10000n;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  start() {
    onOrderSettled(this.handleOrderSettled.bind(this));
    console.log("[LoyaltyEngine] Started listening for invoice.settled events");
  }

  async handleOrderSettled(event: OrderSettledEvent) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId, outletId: event.outletId }
      });

      if (!order || !order.customerId) {
        return; // No customer attached, no points to earn
      }

      const customerId = order.customerId;

      // Calculate points to earn based on grandTotal
      const pointsEarned = Number(order.grandTotal / this.POINTS_EARN_RATE);

      if (pointsEarned > 0) {
        await this.prisma.$transaction(async (tx) => {
          // Update customer points
          await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { increment: pointsEarned } }
          });

          // Record transaction
          await tx.loyaltyTransaction.create({
            data: {
              outletId: event.outletId,
              customerId,
              orderId: order.id,
              pointsEarned: pointsEarned,
              pointsRedeemed: 0
            }
          });
        });
        
        console.log(`[LoyaltyEngine] Awarded ${pointsEarned} points to customer ${order.customerId} for order ${order.id}`);
      }
    } catch (error) {
      console.error(`[LoyaltyEngine] Error processing loyalty for order ${event.orderId}:`, error);
    }
  }

  async redeemPoints(outletId: string, customerId: string, pointsToRedeem: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId, outletId }
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (customer.loyaltyPoints < pointsToRedeem) {
      throw new Error("Insufficient loyalty points");
    }

    // Points are deducted via transaction
    return await this.prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { decrement: pointsToRedeem } }
      });
      
      // Note: A real implementation would link this redemption to a specific Order/Discount ID. 
      // For now we just deduct the points and assume it's applied via an external mechanism.

      return updatedCustomer;
    });
  }
}
