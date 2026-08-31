import { PrismaClient } from "@prisma/client";

export class PrismaPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrderBalance(orderId: string, outletId: string) {
    const [order, payments] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId, outletId },
      }),
      this.prisma.payment.findMany({
        where: { orderId, outletId },
      }),
    ]);
    if (!order) throw new Error("Order not found");

    const totalPaid = payments
      .filter((p: any) => p.status === "CAPTURED" || p.status === "SUCCESS")
      .reduce((acc: bigint, p: any) => acc + BigInt(p.amount), 0n);

    return {
      grandTotal: order.grandTotal,
      totalPaid,
      balance: order.grandTotal - totalPaid,
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
