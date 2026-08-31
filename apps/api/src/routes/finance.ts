import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import {
  SettlementEngine,
  ZReportGenerator,
  TaxEngine,
  PrismaFinanceRepository,
  listRefunds,
  listLedgerEntries,
} from "@kapmeta/finance";
import type { RefundStatus } from "@kapmeta/shared-types/finance";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

export const financeRouter = Router();
const settlementEngine = new SettlementEngine(prisma);
const zReportGenerator = new ZReportGenerator(prisma);
const financeRepository = new PrismaFinanceRepository(prisma);

const VALID_REFUND_STATUSES: RefundStatus[] = ["INITIATED", "PENDING", "SUCCESS", "FAILED"];

// Calculate Tax for a given subtotal
financeRouter.post("/calculate-tax", requireAuth, (req: AuthedRequest, res) => {
  const { subTotalMinor } = req.body;
  if (subTotalMinor === undefined) {
    return res.status(400).json({ error: "Missing subTotalMinor" });
  }

  try {
    const taxData = TaxEngine.calculateStatutoryTaxes(BigInt(subTotalMinor));
    // JSON.stringify doesn't handle BigInt, convert to string
    res.json({
      subTotal: taxData.subTotal.toString(),
      cgst: taxData.cgst.toString(),
      sgst: taxData.sgst.toString(),
      grandTotal: taxData.grandTotal.toString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Settle an Order
financeRouter.post("/settle", requireAuth, requirePermission("finance.settle"), async (req: AuthedRequest, res) => {
  const { orderId, payments } = req.body;
  
  if (!orderId || !payments || !Array.isArray(payments)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const parsedPayments = payments.map(p => ({
      ...p,
      amountMinor: BigInt(p.amountMinor)
    }));

    const invoice = await settlementEngine.settleOrder(req.auth!.outletId, orderId, parsedPayments, req.auth!.userId);
    
    // convert bigints to strings
    res.status(200).json({
      ...invoice,
      amount: invoice.amount.toString(),
      taxAmount: invoice.taxAmount.toString(),
      waivedOffMinor: invoice.waivedOffMinor.toString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Z-Report
financeRouter.get("/z-report", requireAuth, requirePermission("finance.report"), async (req: AuthedRequest, res) => {
  const dateParam = req.query.date as string;
  const date = dateParam ? new Date(dateParam) : new Date();
  
  try {
    const report = await zReportGenerator.generateDailyReport(req.auth!.outletId, date);
    
    // convert bigints
    const paymentModesStr: Record<string, string> = {};
    for (const [k, v] of Object.entries(report.paymentModes)) {
      paymentModesStr[k] = v.toString();
    }

    res.status(200).json({
      ...report,
      totalSales: report.totalSales.toString(),
      totalTax: report.totalTax.toString(),
      grandTotal: report.grandTotal.toString(),
      paymentModes: paymentModesStr
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reprint an invoice — increments reprintCount for leakage tracking.
financeRouter.post("/invoices/:id/reprint", requireAuth, requirePermission("finance.invoice.void"), async (req: AuthedRequest, res) => {
  const { id } = req.params;

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing || existing.outletId !== req.auth!.outletId) {
        return null;
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: { reprintCount: { increment: 1 } },
      });

      await writeAuditLog(tx, {
        outletId: req.auth!.outletId,
        userId: req.auth!.userId,
        action: "INVOICE_REPRINTED",
        entityType: "PAYMENT",
        entityId: id,
        beforeState: { reprintCount: existing.reprintCount },
        afterState: { reprintCount: updated.reprintCount },
      });

      return updated;
    });

    if (!invoice) {
      return res.status(404).json({ error: "invoice not found" });
    }

    res.status(200).json({
      ...invoice,
      amount: invoice.amount.toString(),
      taxAmount: invoice.taxAmount.toString(),
      waivedOffMinor: invoice.waivedOffMinor.toString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Waive off an invoice balance — records the waived amount and reason for leakage tracking.
financeRouter.post("/invoices/:id/waive-off", requireAuth, requirePermission("finance.invoice.void"), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { waivedOffMinor, waivedOffReason } = req.body;

  if (waivedOffMinor === undefined || waivedOffMinor === null) {
    return res.status(400).json({ error: "Missing waivedOffMinor" });
  }
  if (typeof waivedOffReason !== "string" || waivedOffReason.trim().length === 0) {
    return res.status(400).json({ error: "Missing or empty waivedOffReason" });
  }

  let waivedOffAmount: bigint;
  try {
    waivedOffAmount = BigInt(waivedOffMinor);
  } catch {
    return res.status(400).json({ error: "waivedOffMinor must be a valid integer" });
  }
  if (waivedOffAmount <= 0n) {
    return res.status(400).json({ error: "waivedOffMinor must be a positive integer" });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing || existing.outletId !== req.auth!.outletId) {
        return null;
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: { waivedOffMinor: waivedOffAmount, waivedOffReason },
      });

      await writeAuditLog(tx, {
        outletId: req.auth!.outletId,
        userId: req.auth!.userId,
        action: "INVOICE_WAIVED_OFF",
        entityType: "PAYMENT",
        entityId: id,
        beforeState: { waivedOffMinor: existing.waivedOffMinor.toString(), waivedOffReason: existing.waivedOffReason },
        afterState: { waivedOffMinor: updated.waivedOffMinor.toString(), waivedOffReason: updated.waivedOffReason },
        reasonCode: waivedOffReason,
      });

      return updated;
    });

    if (!invoice) {
      return res.status(404).json({ error: "invoice not found" });
    }

    res.status(200).json({
      ...invoice,
      amount: invoice.amount.toString(),
      taxAmount: invoice.taxAmount.toString(),
      waivedOffMinor: invoice.waivedOffMinor.toString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List ledger entries for the outlet, optionally filtered by date range / account.
financeRouter.get("/ledger-entries", requireAuth, requirePermission("finance.report"), async (req: AuthedRequest, res) => {
  const { fromDate, toDate, account } = req.query as { fromDate?: string; toDate?: string; account?: string };

  const parsedFromDate = fromDate ? new Date(fromDate) : undefined;
  const parsedToDate = toDate ? new Date(toDate) : undefined;
  if ((fromDate && isNaN(parsedFromDate!.getTime())) || (toDate && isNaN(parsedToDate!.getTime()))) {
    return res.status(400).json({ error: "Invalid fromDate/toDate" });
  }

  try {
    const entries = await listLedgerEntries(
      req.auth!.outletId,
      { fromDate: parsedFromDate, toDate: parsedToDate, account },
      financeRepository,
    );

    res.status(200).json(
      entries.map((e) => ({
        ...e,
        debitMinor: e.debitMinor.toString(),
        creditMinor: e.creditMinor.toString(),
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List refunds for the outlet, optionally filtered by date range / status.
financeRouter.get("/refunds", requireAuth, requirePermission("finance.report"), async (req: AuthedRequest, res) => {
  const { fromDate, toDate, status } = req.query as { fromDate?: string; toDate?: string; status?: string };

  const parsedFromDate = fromDate ? new Date(fromDate) : undefined;
  const parsedToDate = toDate ? new Date(toDate) : undefined;
  if ((fromDate && isNaN(parsedFromDate!.getTime())) || (toDate && isNaN(parsedToDate!.getTime()))) {
    return res.status(400).json({ error: "Invalid fromDate/toDate" });
  }
  if (status !== undefined && !VALID_REFUND_STATUSES.includes(status as RefundStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const refunds = await listRefunds(
      req.auth!.outletId,
      { fromDate: parsedFromDate, toDate: parsedToDate, status: status as RefundStatus | undefined },
      financeRepository,
    );

    res.status(200).json(
      refunds.map((r) => ({
        ...r,
        amountMinor: r.amountMinor.toString(),
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
