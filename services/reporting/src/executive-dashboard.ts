import { PrismaClient } from "@prisma/client";

export class ExecutiveDashboard {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async getKPIDashboard(outletId: string, startDate: Date, endDate: Date) {
    // 1. Fetch Orders for the period
    const orders = await this.prisma.order.findMany({
      where: {
        outletId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ["SETTLED", "COMPLETED"] } // Only completed orders
      },
      include: {
        orderItems: {
          include: {
            menuItem: {
              include: { category: true }
            }
          }
        },
        invoices: true
      }
    });

    let totalRevenue = 0n;
    let orderCount = orders.length;
    let totalDiscount = 0n;

    // Hourly Sales Velocity Matrix (0-23)
    const hourlyVelocity = new Array(24).fill(0n);

    // Category Mix Matrix
    const categoryMix: Record<string, { quantity: number, revenue: bigint }> = {};

    for (const order of orders) {
      totalRevenue += order.grandTotal;
      totalDiscount += order.discountTotal;

      const hour = order.createdAt.getHours();
      hourlyVelocity[hour] += order.grandTotal;

      for (const item of order.orderItems) {
        const catName = item.menuItem.category.name;
        if (!categoryMix[catName]) {
          categoryMix[catName] = { quantity: 0, revenue: 0n };
        }
        categoryMix[catName].quantity += item.quantity;
        categoryMix[catName].revenue += item.subtotal;
      }
    }

    // Convert bigints to strings for JSON serialization
    const hourlyVelocityStr = hourlyVelocity.map(v => v.toString());
    const categoryMixStr: Record<string, { quantity: number, revenue: string }> = {};
    for (const [cat, data] of Object.entries(categoryMix)) {
      categoryMixStr[cat] = {
        quantity: data.quantity,
        revenue: data.revenue.toString()
      };
    }

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      kpi: {
        totalRevenue: totalRevenue.toString(),
        orderCount,
        averageOrderValue: orderCount > 0 ? (totalRevenue / BigInt(orderCount)).toString() : "0",
        totalDiscount: totalDiscount.toString()
      },
      hourlyVelocity: hourlyVelocityStr,
      categoryMix: categoryMixStr
    };
  }
}
