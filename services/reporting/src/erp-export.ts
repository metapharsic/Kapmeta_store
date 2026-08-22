import { PrismaClient } from "@prisma/client";

export class ERPExportGenerator {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  // Generates a JSON representation of Journal Entries for an ERP system (like Tally)
  async generateTallyExport(outletId: string, date: Date) {
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
          include: { payments: true }
        }
      }
    });

    const journalEntries: Array<{
      date: string,
      voucherNumber: string,
      narration: string,
      ledgers: Array<{ account: string, isDebit: boolean, amountMinor: string }>
    }> = [];

    // Map each invoice into a standard Sales Journal Voucher
    for (const inv of invoices) {
      const ledgers = [];

      // Credit Sales Account
      ledgers.push({
        account: "Sales A/c",
        isDebit: false,
        amountMinor: (inv.amount - inv.taxAmount).toString()
      });

      // Credit Output Tax Account (GST)
      if (inv.taxAmount > 0n) {
        ledgers.push({
          account: "Output GST A/c",
          isDebit: false,
          amountMinor: inv.taxAmount.toString()
        });
      }

      // Debit Cash/Bank/Debtor Accounts based on payment methods
      for (const p of inv.order.payments) {
        let accountName = "Cash A/c";
        if (p.method === "CARD" || p.method === "UPI") {
          accountName = "Bank A/c";
        }

        ledgers.push({
          account: accountName,
          isDebit: true,
          amountMinor: p.amount.toString()
        });
      }

      journalEntries.push({
        date: inv.createdAt.toISOString().split('T')[0],
        voucherNumber: inv.invoiceNo,
        narration: `Sales for Invoice ${inv.invoiceNo} (Order ${inv.order.orderNumber})`,
        ledgers
      });
    }

    return {
      outletId,
      exportDate: new Date().toISOString(),
      reportDate: startOfDay.toISOString().split('T')[0],
      totalVouchers: journalEntries.length,
      vouchers: journalEntries
    };
  }
}
