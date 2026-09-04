import { PrismaClient } from "@prisma/client";
import { PrismaPaymentRepository } from "./payment-service";

export type PaymentMethodInput = {
  method: string;
  amountMinor: bigint;
  transactionId?: string;
};

export type OrderSettledCallback = (event: { invoiceId: string; orderId: string; outletId: string }) => void;

export class SettlementEngine {
  private prisma: PrismaClient;
  private paymentRepo: PrismaPaymentRepository;
  private onOrderSettled?: OrderSettledCallback;

  constructor(prismaClient: PrismaClient, onOrderSettled?: OrderSettledCallback) {
    this.prisma = prismaClient;
    this.paymentRepo = new PrismaPaymentRepository(prismaClient);
    this.onOrderSettled = onOrderSettled;
  }

  async settleOrder(outletId: string, orderId: string, payments: PaymentMethodInput[], userId: string) {
    // 1. Validate order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, outletId }
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if ((order.status as any) === "COMPLETED") {
      throw new Error("Order is already settled");
    }

    // 2. Validate total payment amounts match the grand total
    const totalPayment = payments.reduce((acc, p) => acc + p.amountMinor, 0n);
    if (totalPayment !== order.grandTotal) {
      throw new Error(`Payment mismatch: expected ${order.grandTotal}, got ${totalPayment}`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // 3. Record all payments
      for (const p of payments) {
        await tx.payment.create({
          data: {
            outletId,
            orderId,
            amount: p.amountMinor,
            method: p.method,
            status: "CAPTURED",
            transactionId: p.transactionId
          }
        });
      }

      // 4. Generate Invoice Number
      const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

      // 5. Update Order Status
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" }
      });

      // 6. Write Audit Log
      await tx.auditLog.create({
        data: {
          outletId,
          userId,
          action: "UPDATE",
          entityType: "ORDER",
          entityId: orderId,
          afterState: { status: "COMPLETED", invoiceNumber }
        }
      });

      const invoiceRecord = { id: orderId, invoiceNo: invoiceNumber };

      // 8. Emit Async Event if callback provided
      if (this.onOrderSettled) {
        const payload = {
          invoiceId: invoiceRecord.id,
          orderId: order.id,
          outletId,
        };
        setTimeout(() => {
          this.onOrderSettled?.(payload);
        }, 0);
      }

      return invoiceRecord;
    });
  }
}
