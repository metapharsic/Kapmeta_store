import { PrismaClient } from "@prisma/client";

export class ZReportGenerator {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async generateDailyReport(outletId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        outletId,
        status: "CAPTURED",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let totalSales = 0n;
    let totalTax = 0n;
    const paymentModes: Record<string, bigint> = {};

    for (const ord of orders) {
      totalSales += ord.subtotalMinor;
      totalTax += ord.taxTotalMinor;
    }

    for (const p of payments) {
      if (!paymentModes[p.method]) {
        paymentModes[p.method] = 0n;
      }
      paymentModes[p.method] += p.amount;
    }

    return {
      outletId,
      date: startOfDay.toISOString().split("T")[0],
      totalSales,
      totalTax,
      grandTotal: totalSales + totalTax,
      paymentModes,
      invoiceCount: orders.length,
    };
  }
}

