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

    const invoices = await this.prisma.invoice.findMany({
      where: {
        outletId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        order: {
          include: {
            payments: true
          }
        }
      }
    });

    let totalSales = 0n;
    let totalTax = 0n;
    const paymentModes: Record<string, bigint> = {};

    for (const inv of invoices) {
      totalSales += inv.amount - inv.taxAmount;
      totalTax += inv.taxAmount;

      for (const p of inv.order.payments) {
        if (!paymentModes[p.method]) {
          paymentModes[p.method] = 0n;
        }
        paymentModes[p.method] += p.amount;
      }
    }

    return {
      outletId,
      date: startOfDay.toISOString().split('T')[0],
      totalSales,
      totalTax,
      grandTotal: totalSales + totalTax,
      paymentModes,
      invoiceCount: invoices.length
    };
  }
}
