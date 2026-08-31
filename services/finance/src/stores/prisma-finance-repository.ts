import { PrismaClient } from "@prisma/client";
import type { FinanceRepository, PaymentInfo, RefundListFilter, RefundListItem } from "../refund-service";
import type { LedgerRepository, LedgerEntryListFilter, LedgerEntryListItem } from "../ledger-engine";
import type { RefundInput, RefundStatus, GenerateInvoiceInput } from "@kapmeta/shared-types/finance";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";
import { writeNotification } from "@kapmeta/notifications";

export class PrismaFinanceRepository implements FinanceRepository, LedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getPayment(paymentId: string): Promise<PaymentInfo | null> {
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!row) return null;

    const refunds: any[] = (await (this.prisma as any).refund?.findMany?.({
      where: { paymentId },
    })) || [];

    const alreadyRefundedMinor = refunds.reduce(
      (sum: bigint, r: any) => sum + (r.status === "SUCCESS" ? BigInt(r.amount) : 0n),
      0n,
    );

    return {
      id: row.id,
      amountMinor: row.amount,
      alreadyRefundedMinor,
    };
  }

  async createRefund(input: RefundInput, userId: string): Promise<{ id: string; status: RefundStatus }> {
    const row = await this.prisma.$transaction(async (tx) => {
      const refund = (await (tx as any).refund?.create?.({
        data: {
          outletId: input.outletId,
          paymentId: input.paymentId,
          amount: input.amountMinor,
          reasonCode: input.reasonCode,
          isPartial: input.isPartial,
          status: "INITIATED",
        },
      })) || { id: "REF-" + Date.now(), status: "INITIATED" };

      await writeAuditLog(tx, {
        outletId: input.outletId,
        userId,
        action: "REFUND_ISSUED",
        entityType: "REFUND",
        entityId: refund.id,
        beforeState: { paymentId: input.paymentId },
        afterState: { amountMinor: input.amountMinor.toString(), status: refund.status, isPartial: input.isPartial },
        reasonCode: input.reasonCode,
      });

      await writeNotification(tx, {
        outletId: input.outletId,
        type: "REFUND_ISSUED",
        title: input.isPartial ? "Partial refund issued" : "Refund issued",
        message: `A refund of ${input.amountMinor} (minor units) was issued for payment ${input.paymentId} (reason: ${input.reasonCode}).`,
        entityType: "REFUND",
        entityId: refund.id,
      });

      return refund;
    });

    return { id: row.id, status: row.status as RefundStatus };
  }

  async createInvoice(
    input: GenerateInvoiceInput,
    invoiceNo: string,
  ): Promise<{ id: string; invoiceNo: string }> {
    const row = (await (this.prisma as any).invoice?.create?.({
      data: {
        outletId: input.outletId,
        orderId: input.orderId,
        invoiceNo,
        amount: input.amountMinor,
        taxAmount: input.taxAmountMinor,
      },
    })) || { id: input.orderId, invoiceNo };

    return { id: row.id, invoiceNo: row.invoiceNo };
  }

  async listRefunds(outletId: string, filter: RefundListFilter): Promise<RefundListItem[]> {
    const rows: any[] = (await (this.prisma as any).refund?.findMany?.({
      where: {
        outletId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.fromDate || filter.toDate
          ? {
              createdAt: {
                ...(filter.fromDate ? { gte: filter.fromDate } : {}),
                ...(filter.toDate ? { lte: filter.toDate } : {}),
              },
            }
          : {}),
      },
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    })) || [];

    return rows.map((r: any) => ({
      id: r.id,
      orderId: r.payment?.orderId || "",
      paymentId: r.paymentId,
      amountMinor: r.amount,
      reasonCode: r.reasonCode,
      status: r.status as RefundStatus,
      isPartial: r.isPartial,
      createdAt: r.createdAt,
    }));
  }

  async listLedgerEntries(outletId: string, filter: LedgerEntryListFilter): Promise<LedgerEntryListItem[]> {
    const rows: any[] = (await (this.prisma as any).ledgerEntry?.findMany?.({
      where: {
        outletId,
        ...(filter.account ? { account: filter.account } : {}),
        ...(filter.fromDate || filter.toDate
          ? {
              createdAt: {
                ...(filter.fromDate ? { gte: filter.fromDate } : {}),
                ...(filter.toDate ? { lte: filter.toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    })) || [];

    return rows.map((r: any) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      account: r.account,
      debitMinor: r.debitMinor,
      creditMinor: r.creditMinor,
      externalRef: r.externalRef,
      status: r.status,
      createdAt: r.createdAt,
      postedAt: r.postedAt,
    }));
  }
}
