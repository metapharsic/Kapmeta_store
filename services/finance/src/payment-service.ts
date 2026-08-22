import { PrismaClient } from "@prisma/client";

export class PrismaPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrderBalance(orderId: string, outletId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, outletId },
      include: { payments: true }
    });
    if (!order) throw new Error("Order not found");

    const totalPaid = order.payments
      .filter(p => p.status === "CAPTURED")
      .reduce((acc, p) => acc + p.amount, 0n);

    return {
      grandTotal: order.grandTotal,
      totalPaid,
      balance: order.grandTotal - totalPaid
    };
  }

  async recordPayment(orderId: string, outletId: string, amountMinor: bigint, method: string, transactionId?: string) {
    return this.prisma.payment.create({
      data: {
        outletId,
        orderId,
        amount: amountMinor,
        method,
        status: "CAPTURED",
        transactionId
      }
    });
  }
}
