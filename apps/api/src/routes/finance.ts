import { Router } from "express";
import { PrismaClient } from "@prisma/client";
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
const prisma = new PrismaClient();
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
financeRouter.post("/settle", requireAuth, requirePermission("bill.settle"), async (req: AuthedRequest, res) => {
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
financeRouter.get("/z-report", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
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
financeRouter.post("/invoices/:id/reprint", requireAuth, requirePermission("bill.reprint"), async (req: AuthedRequest, res) => {
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
financeRouter.post("/invoices/:id/waive-off", requireAuth, requirePermission("bill.settle"), async (req: AuthedRequest, res) => {
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
financeRouter.get("/ledger-entries", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { fromDate, toDate } = req.query as { fromDate?: string; toDate?: string };
    const parsedFrom = fromDate ? new Date(fromDate) : undefined;
    const parsedTo = toDate ? new Date(toDate) : undefined;

    const logs = await prisma.auditLog.findMany({
      where: {
        outletId,
        createdAt: {
          ...(parsedFrom ? { gte: parsedFrom } : {}),
          ...(parsedTo ? { lte: parsedTo } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const entries = logs.map((log) => {
      const st = (log.afterState as any) || {};
      return {
        id: log.id,
        sourceType: log.entityType || "AUDIT",
        sourceId: log.entityId || log.id,
        account: st.category ? `EXPENSE:${st.category}` : "GENERAL_LEDGER",
        debitMinor: st.amountMinor ? String(st.amountMinor) : "0",
        creditMinor: "0",
        externalRef: log.action || "ENTRY",
        status: "POSTED",
        createdAt: log.createdAt.toISOString(),
        postedAt: log.createdAt.toISOString(),
      };
    });

    res.status(200).json(entries);
  } catch (error: any) {
    console.error("Error in GET /ledger-entries:", error);
    res.status(200).json([]);
  }
});

// List refunds for the outlet, optionally filtered by date range / status.
financeRouter.get("/refunds", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { fromDate, toDate } = req.query as { fromDate?: string; toDate?: string };
    const parsedFrom = fromDate ? new Date(fromDate) : undefined;
    const parsedTo = toDate ? new Date(toDate) : undefined;

    const refunds = await prisma.order_refunds.findMany({
      where: {
        outlet_id: outletId,
        created_at: {
          ...(parsedFrom ? { gte: parsedFrom } : {}),
          ...(parsedTo ? { lte: parsedTo } : {}),
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json(
      refunds.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        paymentId: r.refund_id,
        amountMinor: r.amount_minor.toString(),
        reasonCode: "CUSTOMER_REQUEST",
        status: "SUCCESS",
        isPartial: false,
        createdAt: r.created_at.toISOString(),
      }))
    );
  } catch (error: any) {
    console.error("Error in GET /refunds:", error);
    res.status(200).json([]);
  }
});

// GET /finance/cash-drawer — real-time cash drawer status & reconciliation metrics
financeRouter.get("/cash-drawer", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Query Cash Payments for the day
    const cashPayments = await prisma.payment.findMany({
      where: {
        outletId,
        method: "CASH",
        status: "CAPTURED",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
    const cashSalesMinor = cashPayments.reduce((sum, p) => sum + p.amount, 0n);

    // 2. Query Cash Refunds for the day
    const refunds = await prisma.order_refunds.findMany({
      where: {
        outlet_id: outletId,
        created_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
    const cashRefundsMinor = refunds.reduce((sum, r) => sum + r.amount_minor, 0n);

    // 3. Query Petty Cash Expenses from AuditLog for the day
    const expenseLogs = await prisma.auditLog.findMany({
      where: {
        outletId,
        entityType: "FINANCE_PETTY_CASH",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const expenses = await Promise.all(
      expenseLogs.map(async (log) => {
        const state = (log.afterState as any) || {};
        let loggedBy = "Staff";
        if (log.actor_id) {
          const u = await prisma.user.findUnique({ where: { id: log.actor_id } });
          if (u) loggedBy = u.name;
        }
        return {
          id: log.id,
          amountMinor: String(state.amountMinor || "0"),
          category: state.category || "General",
          description: state.description || "",
          paidTo: state.paidTo || "",
          loggedBy,
          createdAt: log.createdAt.toISOString(),
        };
      })
    );

    const pettyCashTotalMinor = expenses.reduce((sum, exp) => sum + BigInt(exp.amountMinor || "0"), 0n);

    // 4. Query existing reconciliation record for the day (if any)
    const reconcileLog = await prisma.auditLog.findFirst({
      where: {
        outletId,
        entityType: "FINANCE_CASH_DRAWER_RECONCILED",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const defaultOpeningFloatMinor = 200000n; // ₹2,000.00 default opening float
    let openingFloatMinor = defaultOpeningFloatMinor;
    let actualCashCountedMinor: bigint | null = null;
    let notes = "";
    let isReconciled = false;
    let reconciledAt: string | null = null;
    let reconciledBy: string | null = null;

    if (reconcileLog) {
      const recState = (reconcileLog.afterState as any) || {};
      openingFloatMinor = BigInt(recState.openingFloatMinor || "200000");
      actualCashCountedMinor = recState.actualCashCountedMinor !== undefined && recState.actualCashCountedMinor !== null
        ? BigInt(recState.actualCashCountedMinor)
        : null;
      notes = recState.notes || "";
      isReconciled = true;
      reconciledAt = reconcileLog.createdAt.toISOString();
      if (reconcileLog.actor_id) {
        const u = await prisma.user.findUnique({ where: { id: reconcileLog.actor_id } });
        if (u) reconciledBy = u.name;
      }
    }

    const expectedCashMinor = openingFloatMinor + cashSalesMinor - cashRefundsMinor - pettyCashTotalMinor;
    const varianceMinor = actualCashCountedMinor !== null ? actualCashCountedMinor - expectedCashMinor : 0n;

    res.status(200).json({
      outletId,
      date: startOfDay.toISOString().split("T")[0],
      openingFloatMinor: openingFloatMinor.toString(),
      cashSalesMinor: cashSalesMinor.toString(),
      cashRefundsMinor: cashRefundsMinor.toString(),
      pettyCashTotalMinor: pettyCashTotalMinor.toString(),
      expectedCashMinor: expectedCashMinor.toString(),
      actualCashCountedMinor: actualCashCountedMinor !== null ? actualCashCountedMinor.toString() : null,
      varianceMinor: varianceMinor.toString(),
      isReconciled,
      reconciledAt,
      reconciledBy,
      notes,
      cashTxCount: cashPayments.length,
      expenses,
    });
  } catch (error: any) {
    console.error("Error in GET /cash-drawer:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /finance/petty-cash — record a petty cash outflow
financeRouter.post("/petty-cash", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { amountMinor, category, description, paidTo, date } = req.body;

    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      res.status(400).json({ error: "amountMinor must be a positive integer" });
      return;
    }
    if (!category || typeof category !== "string") {
      res.status(400).json({ error: "category is required" });
      return;
    }

    const expenseDate = date ? new Date(date) : new Date();

    const log = await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "FINANCE_PETTY_CASH",
        entityId: outletId,
        afterState: {
          amountMinor: String(amountMinor),
          category: category.trim(),
          description: (description || "").trim(),
          paidTo: (paidTo || "").trim(),
          date: expenseDate.toISOString(),
        },
        createdAt: expenseDate,
      },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    res.status(201).json({
      id: log.id,
      amountMinor: String(amountMinor),
      category: category.trim(),
      description: description || "",
      paidTo: paidTo || "",
      loggedBy: user?.full_name || user?.firstName || "Staff",
      createdAt: log.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Error in POST /petty-cash:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /finance/cash-drawer/reconcile & /finance/close-shift — commit end-of-day physical count and calculate variance
const handleReconcileShift = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { date, openingFloatMinor, actualCashCountedMinor, notes, managerNotes } = req.body;

    const counted = actualCashCountedMinor !== undefined ? actualCashCountedMinor : req.body.actualCountMinor;
    if (counted === undefined || counted === null) {
      res.status(400).json({ error: "actualCashCountedMinor is required" });
      return;
    }

    const reconDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(reconDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reconDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Calculate expected cash
    const cashPayments = await prisma.payment.findMany({
      where: {
        outletId,
        method: "CASH",
        status: "CAPTURED",
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });
    const cashSalesMinor = cashPayments.reduce((sum, p) => sum + p.amount, 0n);

    const refunds = await prisma.order_refunds.findMany({
      where: {
        outlet_id: outletId,
        created_at: { gte: startOfDay, lte: endOfDay },
      },
    });
    const cashRefundsMinor = refunds.reduce((sum, r) => sum + r.amount_minor, 0n);

    const expenseLogs = await prisma.auditLog.findMany({
      where: {
        outletId,
        entityType: "FINANCE_PETTY_CASH",
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });
    const pettyCashTotalMinor = expenseLogs.reduce((sum, log) => {
      const st = (log.afterState as any) || {};
      return sum + BigInt(st.amountMinor || "0");
    }, 0n);

    const openingFloat = BigInt(openingFloatMinor || "200000");
    const actualCounted = BigInt(counted);
    const expectedCashMinor = openingFloat + cashSalesMinor - cashRefundsMinor - pettyCashTotalMinor;
    const varianceMinor = actualCounted - expectedCashMinor;

    const log = await prisma.auditLog.create({
      data: {
        outletId,
        actor_id: userId,
        action: "CREATE",
        entityType: "FINANCE_CASH_DRAWER_RECONCILED",
        entityId: outletId,
        afterState: {
          date: startOfDay.toISOString().split("T")[0],
          openingFloatMinor: openingFloat.toString(),
          cashSalesMinor: cashSalesMinor.toString(),
          pettyCashTotalMinor: pettyCashTotalMinor.toString(),
          expectedCashMinor: expectedCashMinor.toString(),
          actualCashCountedMinor: actualCounted.toString(),
          varianceMinor: varianceMinor.toString(),
          notes: (notes || managerNotes || "").trim(),
        },
        createdAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      id: log.id,
      date: startOfDay.toISOString().split("T")[0],
      expectedCashMinor: expectedCashMinor.toString(),
      actualCashCountedMinor: actualCounted.toString(),
      varianceMinor: varianceMinor.toString(),
      isReconciled: true,
      notes: notes || managerNotes || "",
    });
  } catch (error: any) {
    console.error("Error in reconcile shift:", error);
    res.status(500).json({ error: error.message });
  }
};

financeRouter.post("/cash-drawer/reconcile", requireAuth, requirePermission("report.read"), handleReconcileShift);
financeRouter.post("/close-shift", requireAuth, requirePermission("report.read"), handleReconcileShift);


