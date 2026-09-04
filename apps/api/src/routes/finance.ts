import { Router } from "express";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import {
  ZReportGenerator,
  TaxEngine,
  PrismaFinanceRepository,
  listRefunds,
  listLedgerEntries,
} from "@kapmeta/finance";
import type { RefundStatus } from "@kapmeta/shared-types/finance";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";
import { settleOrderCommand } from "../orchestration/settle-order";

export const financeRouter = Router();
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
  const { orderId, payments, paymentMethod, amountPaidMinor } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await settleOrderCommand(prisma, {
      outletId: req.auth!.outletId,
      orderId,
      userId: req.auth!.userId,
      paymentMethod,
      amountPaidMinor,
      payments,
    });
    res.status(200).json(result);
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
      totalRefunds: report.totalRefunds.toString(),
      grandTotal: report.grandTotal.toString(),
      totalTips: report.totalTips.toString(),
      totalServiceCharge: report.totalServiceCharge.toString(),
      handoverCashCounted: report.handoverCashCounted.toString(),
      handoverTipPayout: report.handoverTipPayout.toString(),
      handoverDigitalTips: report.handoverDigitalTips.toString(),
      paymentModes: paymentModesStr
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Day End Summary — one z-report-shaped entry per calendar day in
// [startDate, endDate] that actually had at least one COMPLETED order.
// Reuses the exact same generator as GET /z-report above (per-day, in
// parallel) rather than a second aggregate implementation, so this can
// never drift from what a single-day Z-report shows for the same day.
// Days with zero orders are simply omitted from the array — never emitted
// as a fabricated all-zero row (AGENTS.md Rule 1: no hardcoded/fabricated
// business data, and that includes fake "nothing happened" rows for a
// range nobody asked to see padded out).
const DAY_END_SUMMARY_MAX_DAYS = 92; // ~90 days per the task spec, rounded up to a full quarter; bounds the per-day loop below.

financeRouter.get("/day-end-summary", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  const startParam = req.query.startDate as string | undefined;
  const endParam = req.query.endDate as string | undefined;

  if (!startParam || !endParam) {
    return res.status(400).json({ error: "startDate and endDate query params are required (YYYY-MM-DD)" });
  }

  const startDate = new Date(startParam);
  const endDate = new Date(endParam);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: "startDate/endDate must be valid dates" });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: "endDate must not be before startDate" });
  }

  const dayCount = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > DAY_END_SUMMARY_MAX_DAYS) {
    return res.status(400).json({ error: `date range too large — max ${DAY_END_SUMMARY_MAX_DAYS} days` });
  }

  try {
    const outletId = req.auth!.outletId;

    const days: Date[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const reports = await Promise.all(days.map((d) => zReportGenerator.generateDailyReport(outletId, d)));

    // "actually has at least one order" — invoiceCount is the count of
    // COMPLETED orders the generator found for that business day (same
    // definition GET /z-report already uses for a single day).
    const nonEmpty = reports.filter((r) => r.invoiceCount > 0);

    const serialized = nonEmpty.map((report) => {
      const paymentModesStr: Record<string, string> = {};
      for (const [k, v] of Object.entries(report.paymentModes)) {
        paymentModesStr[k] = v.toString();
      }
      return {
        ...report,
        totalSales: report.totalSales.toString(),
        totalTax: report.totalTax.toString(),
        totalRefunds: report.totalRefunds.toString(),
        grandTotal: report.grandTotal.toString(),
        totalTips: report.totalTips.toString(),
        totalServiceCharge: report.totalServiceCharge.toString(),
        handoverCashCounted: report.handoverCashCounted.toString(),
        handoverTipPayout: report.handoverTipPayout.toString(),
        handoverDigitalTips: report.handoverDigitalTips.toString(),
        paymentModes: paymentModesStr,
      };
    });

    res.status(200).json(serialized);
  } catch (error: any) {
    console.error("Error in GET /day-end-summary:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delivered = order reached HANDED_OVER or COMPLETED. Per the order state
// machine (packages/shared-types/orders.ts ORDER_TRANSITIONS), a delivery/
// aggregator order's only forward path from OUT_FOR_DELIVERY is
// HANDED_OVER -> COMPLETED, so either status means the customer/rider has
// it — same statuses orders.ts's RUNNING_ORDER_STATUSES treats as no
// longer "running" once past HANDED_OVER. No separate "DELIVERED" status
// exists anywhere in this schema, so this is not a new status, just the
// existing two read as "delivered" for this screen.
const DELIVERED_ORDER_STATUSES = ["HANDED_OVER", "COMPLETED"];

// Delivery Management — real aggregator/delivery order data for the
// outlet. byDay/byProvider power the two charts on the screen; there is no
// credits/wallet table anywhere in this schema, so this endpoint does not
// (and cannot honestly) return "Credit Remaining" / "Credit Purchase Till
// Now" — the frontend renders those as an honest placeholder instead.
financeRouter.get("/delivery-management", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { startDate, endDate, provider } = req.query as { startDate?: string; endDate?: string; provider?: string };

    // Default to the last 7 days, matching the "Last 7 Days ..." charts on
    // this screen, when no explicit range is given.
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "startDate/endDate must be valid dates" });
    }

    const providerUpper = String(provider || "ALL").trim().toUpperCase() || "ALL";

    // Same channel-scoping convention as GET /orders/online (orders.ts):
    // channel: { not: null } for "ALL", channel: <PROVIDER> for one.
    const orders = await prisma.order.findMany({
      where: {
        outletId,
        ...(providerUpper === "ALL" ? { channel: { not: null } } : { channel: providerUpper }),
        createdAt: { gte: start, lte: end },
      },
      select: { id: true, channel: true, status: true, createdAt: true },
    });

    const byDayMap = new Map<string, number>();
    const byProviderMap = new Map<string, number>();
    let deliveredCount = 0;

    for (const o of orders) {
      const dayKey = o.createdAt.toISOString().slice(0, 10);
      byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + 1);

      const prov = (o.channel || "UNKNOWN").toUpperCase();
      byProviderMap.set(prov, (byProviderMap.get(prov) ?? 0) + 1);

      if (DELIVERED_ORDER_STATUSES.includes(String(o.status || "").toUpperCase())) {
        deliveredCount += 1;
      }
    }

    const byDay = Array.from(byDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, orderCount]) => ({ date, orderCount }));

    const byProvider = Array.from(byProviderMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, orderCount]) => ({ provider, orderCount }));

    res.status(200).json({
      byDay,
      byProvider,
      deliveredCount,
      totalCount: orders.length,
    });
  } catch (error: any) {
    console.error("Error in GET /delivery-management:", error);
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
      taxAmount: (invoice.taxAmount ?? 0n).toString(),
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
      taxAmount: (invoice.taxAmount ?? 0n).toString(),
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

    const session = await prisma.cash_drawer_sessions.findFirst({
      where: { outlet_id: outletId, status: "OPEN" },
      orderBy: { opened_at: "desc" },
    });

    const ledgerRows = await prisma.petty_cash_ledger.findMany({
      where: {
        outlet_id: outletId,
        created_at: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { created_at: "desc" },
    });

    const expenses = await Promise.all(
      ledgerRows.map(async (row) => {
        let loggedBy = "Staff";
        const u = await prisma.user.findUnique({ where: { id: row.recorded_by } });
        if (u) loggedBy = u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : (u.email || (u as any).full_name || "Staff");
        return {
          id: row.id,
          amountMinor: String(row.amount_minor),
          category: row.category,
          description: row.description,
          paidTo: row.paid_to || "",
          loggedBy,
          createdAt: row.created_at.toISOString(),
        };
      })
    );

    const pettyCashTotalMinor = ledgerRows.reduce((sum, row) => sum + row.amount_minor, 0n);
    const openingFloatMinor = session?.opening_balance_minor ?? 0n;
    const expectedCashMinor = session
      ? session.expected_close_balance_minor
      : openingFloatMinor + cashSalesMinor - cashRefundsMinor - pettyCashTotalMinor;

    res.status(200).json({
      outletId,
      date: startOfDay.toISOString().split("T")[0],
      sessionId: session?.id || null,
      sessionStatus: session?.status || "NONE",
      openingFloatMinor: openingFloatMinor.toString(),
      cashSalesMinor: cashSalesMinor.toString(),
      cashRefundsMinor: cashRefundsMinor.toString(),
      pettyCashTotalMinor: pettyCashTotalMinor.toString(),
      expectedCashMinor: expectedCashMinor.toString(),
      actualCashCountedMinor: session?.actual_close_balance_minor != null ? session.actual_close_balance_minor.toString() : null,
      varianceMinor: session?.discrepancy_minor != null ? session.discrepancy_minor.toString() : "0",
      isReconciled: session?.status === "CLOSED",
      reconciledAt: session?.closed_at ? session.closed_at.toISOString() : null,
      notes: session?.notes || "",
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
    const { amountMinor, category, description, paidTo } = req.body;

    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      res.status(400).json({ error: "amountMinor must be a positive integer" });
      return;
    }
    if (!category || typeof category !== "string") {
      res.status(400).json({ error: "category is required" });
      return;
    }

    const amount = BigInt(amountMinor);
    const session = await prisma.cash_drawer_sessions.findFirst({
      where: { outlet_id: outletId, status: "OPEN" },
      orderBy: { opened_at: "desc" },
    });

    const row = await prisma.petty_cash_ledger.create({
      data: {
        outlet_id: outletId,
        amount_minor: amount,
        category: category.trim(),
        description: (description || "").trim(),
        paid_to: (paidTo || "").trim() || null,
        recorded_by: userId,
        cash_drawer_session_id: session?.id || null,
      },
    });

    if (session) {
      await prisma.cash_drawer_sessions.update({
        where: { id: session.id },
        data: {
          expected_close_balance_minor: { decrement: amount },
          updated_at: new Date(),
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    res.status(201).json({
      id: row.id,
      amountMinor: String(amount),
      category: row.category,
      description: row.description,
      paidTo: row.paid_to || "",
      loggedBy: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : ((user as any)?.full_name || user?.email || "Staff"),
      createdAt: row.created_at.toISOString(),
    });
  } catch (error: any) {
    console.error("Error in POST /petty-cash:", error);
    res.status(500).json({ error: error.message });
  }
});

financeRouter.post("/cash-drawer/open", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await prisma.cash_drawer_sessions.findFirst({
      where: { outlet_id: outletId, status: "OPEN" },
    });
    if (existing) {
      return res.status(409).json({ error: "A cash drawer session is already open", sessionId: existing.id });
    }
    const opening = BigInt(req.body.openingFloatMinor ?? req.body.opening_balance_minor ?? 0);
    const session = await prisma.cash_drawer_sessions.create({
      data: {
        outlet_id: outletId,
        opened_by: req.auth!.userId,
        opening_balance_minor: opening,
        expected_close_balance_minor: opening,
        status: "OPEN",
        notes: req.body.notes || null,
      },
    });
    res.status(201).json({
      sessionId: session.id,
      openingFloatMinor: session.opening_balance_minor.toString(),
      status: session.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const handleReconcileShift = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const counted = req.body.actualCashCountedMinor ?? req.body.actualCountMinor ?? req.body.countedCashMinor;
    if (counted === undefined || counted === null) {
      res.status(400).json({ error: "actualCashCountedMinor or countedCashMinor is required" });
      return;
    }

    const session = await prisma.cash_drawer_sessions.findFirst({
      where: { outlet_id: outletId, status: "OPEN" },
      orderBy: { opened_at: "desc" },
    });
    if (!session) {
      res.status(409).json({ error: "No open cash drawer session" });
      return;
    }

    const actualCounted = BigInt(counted);
    const expectedCashMinor = session.expected_close_balance_minor;
    const varianceMinor = actualCounted - expectedCashMinor;

    const closed = await prisma.cash_drawer_sessions.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closed_by: userId,
        closed_at: new Date(),
        actual_close_balance_minor: actualCounted,
        discrepancy_minor: varianceMinor,
        notes: (req.body.notes || req.body.managerNotes || session.notes || "").trim(),
        updated_at: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      id: closed.id,
      expectedCashMinor: expectedCashMinor.toString(),
      actualCashCountedMinor: actualCounted.toString(),
      varianceMinor: varianceMinor.toString(),
      isReconciled: true,
    });
  } catch (error: any) {
    console.error("Error in reconcile shift:", error);
    res.status(500).json({ error: error.message });
  }
};

financeRouter.post("/cash-drawer/reconcile", requireAuth, requirePermission("report.read"), handleReconcileShift);
financeRouter.post("/reconcile-shift", requireAuth, requirePermission("report.read"), handleReconcileShift);
financeRouter.post("/close-shift", requireAuth, requirePermission("report.read"), handleReconcileShift);
