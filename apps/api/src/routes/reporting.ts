import { Router } from "express";
import { prisma } from "../db";
import {
  getSalesSummary,
  getItemPerformance,
  getPaymentBreakdown,
  getChannelBreakdown,
  getTableTurnaroundAverage,
  getLeakageReport,
  PrismaReportingRepository,
} from "@kapmeta/reporting";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const router = Router();

function parseRange(req: AuthedRequest): { fromDate: Date; toDate: Date } | null {
  const fromDate = req.query.fromDate;
  const toDate = req.query.toDate;
  if (typeof fromDate !== "string" || typeof toDate !== "string") {
    return null;
  }
  return { fromDate: new Date(fromDate), toDate: new Date(toDate) };
}

router.get("/sales-summary", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const summary = await getSalesSummary(outletId, range, repo);

    res.status(200).json({
      ...summary,
      netSalesMinor: String(summary.netSalesMinor),
      averageOrderValueMinor: String(summary.averageOrderValueMinor),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/item-performance", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const rows = await getItemPerformance(outletId, range, repo);

    res.status(200).json(rows.map((row) => ({ ...row, netSalesMinor: String(row.netSalesMinor) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/payment-breakdown", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const breakdown = await getPaymentBreakdown(outletId, range, repo);

    res.status(200).json({
      ...breakdown,
      totalAmountMinor: String(breakdown.totalAmountMinor),
      methods: breakdown.methods.map((m) => ({ ...m, amountMinor: String(m.amountMinor) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/channel-breakdown", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const breakdown = await getChannelBreakdown(outletId, range, repo);

    res.status(200).json({
      ...breakdown,
      channels: breakdown.channels.map((c) => ({ ...c, netSalesMinor: String(c.netSalesMinor) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/table-turnaround", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const tta = await getTableTurnaroundAverage(outletId, range, repo);

    res.status(200).json(tta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/leakage-report", requireAuth, requirePermission("report.financial.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const report = await getLeakageReport(outletId, range, repo);

    res.status(200).json({
      ...report,
      totalWaivedOffMinor: String(report.totalWaivedOffMinor),
      estimatedRevenueAtRiskMinor: String(report.estimatedRevenueAtRiskMinor),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

import { ExecutiveDashboard, ERPExportGenerator } from "@kapmeta/reporting";
const executiveDashboard = new ExecutiveDashboard(prisma);
const erpExportGenerator = new ERPExportGenerator(prisma);

router.get("/dashboard", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const dashboard = await executiveDashboard.getKPIDashboard(req.auth!.outletId, range.fromDate, range.toDate);
    res.status(200).json(dashboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/tally-export", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();

    const tallyExport = await erpExportGenerator.generateTallyExport(req.auth!.outletId, date);
    res.status(200).json(tallyExport);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export const reportingRouter = router;
