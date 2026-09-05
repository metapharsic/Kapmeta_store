import { Router } from "express";
import { prisma } from "../prisma";
import {
  getSalesSummary,
  getItemPerformance,
  getPaymentBreakdown,
  getChannelBreakdown,
  getTableTurnaroundAverage,
  getLeakageReport,
  getTaxBreakdown,
  getItemMarginReport,
  getInventoryVarianceReport,
  getStaffPerformance,
  getTableUtilization,
  computeDiscountVoidAnalysis,
  PrismaReportingRepository,
} from "@kapmeta/reporting";
import { getRevenueTrend, PrismaOrderRepository } from "@kapmeta/orders";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const router = Router();

function parseRange(req: AuthedRequest): { fromDate: Date; toDate: Date } {
  const fromDate = req.query.fromDate ?? req.query.startDate;
  const toDate = req.query.toDate ?? req.query.endDate;
  if (typeof fromDate === "string" && typeof toDate === "string") {
    return { fromDate: new Date(fromDate), toDate: new Date(toDate) };
  }
  // Default to current month range
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { fromDate: start, toDate: end };
}

router.get("/revenue-trend", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const orderRepo = new PrismaOrderRepository(prisma);
    const points = await getRevenueTrend(req.auth!.outletId, range.fromDate, range.toDate, orderRepo);
    res.status(200).json(points);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/sales-summary", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
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

router.get("/tax-breakdown", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const taxBreakdown = await getTaxBreakdown(outletId, range, repo);

    res.status(200).json({
      ...taxBreakdown,
      totalTaxableSalesMinor: String(taxBreakdown.totalTaxableSalesMinor),
      totalTaxCollectedMinor: String(taxBreakdown.totalTaxCollectedMinor),
      components: taxBreakdown.components.map((c) => ({
        ...c,
        taxableAmountMinor: String(c.taxableAmountMinor),
        taxCollectedMinor: String(c.taxCollectedMinor),
      })),
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

    // Fetch names for all menu items
    const itemIds = rows.map((r) => r.menuItemId);
    const menuItems = itemIds.length > 0
      ? await prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(menuItems.map((m) => [m.id, m.name]));

    res.status(200).json(
      rows.map((row) => ({
        ...row,
        menuItemName: nameMap.get(row.menuItemId) || `Dish (${row.menuItemId.slice(0, 6)})`,
        name: nameMap.get(row.menuItemId) || `Dish (${row.menuItemId.slice(0, 6)})`,
        netSalesMinor: String(row.netSalesMinor),
      }))
    );
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

router.get("/staff-performance", requireAuth, requirePermission("report.financial.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);

    // Waiter names come from the User table (not the denormalized
    // WaiterShiftHandover.waiterName) via a distinct-id lookup, matching the
    // /item-performance pattern of enriching ids with names at the route layer.
    const distinctWaiterIds = await prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        waiterId: { not: null },
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      distinct: ["waiterId"],
      select: { waiterId: true },
    });
    const waiterIds = distinctWaiterIds.map((r) => r.waiterId).filter((id): id is string => !!id);
    const users = waiterIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: waiterIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const waiterNames = new Map(
      users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.id])
    );

    const report = await getStaffPerformance(outletId, range, repo, waiterNames);

    res.status(200).json({
      ...report,
      staff: report.staff.map((s) => ({
        ...s,
        netSalesMinor: String(s.netSalesMinor),
        averageOrderValueMinor: String(s.averageOrderValueMinor),
        cashTipMinor: String(s.cashTipMinor),
        digitalTipMinor: String(s.digitalTipMinor),
        serviceChargeMinor: String(s.serviceChargeMinor),
        cashVarianceMinor: String(s.cashVarianceMinor),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/table-utilization", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    if (!range) {
      res.status(400).json({ error: "fromDate, toDate query params required" });
      return;
    }
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const report = await getTableUtilization(outletId, range, repo);

    res.status(200).json({
      ...report,
      tables: report.tables.map((t) => ({ ...t, totalRevenueMinor: String(t.totalRevenueMinor) })),
      sections: report.sections.map((s) => ({ ...s, totalRevenueMinor: String(s.totalRevenueMinor) })),
    });
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

router.get("/customer-insights", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const outletId = req.auth!.outletId;

    const orders = await prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        customerId: { not: null },
        createdAt: { gte: range.fromDate, lte: range.toDate },
      },
      select: { customerId: true, grandTotal: true, createdAt: true },
    });

    type Agg = { totalSpendMinor: bigint; orderCount: number; lastVisitAt: Date };
    const byCustomer = new Map<string, Agg>();
    for (const o of orders) {
      const customerId = o.customerId as string;
      const existing = byCustomer.get(customerId);
      if (existing) {
        existing.totalSpendMinor += o.grandTotal;
        existing.orderCount += 1;
        if (o.createdAt > existing.lastVisitAt) existing.lastVisitAt = o.createdAt;
      } else {
        byCustomer.set(customerId, {
          totalSpendMinor: o.grandTotal,
          orderCount: 1,
          lastVisitAt: o.createdAt,
        });
      }
    }

    const totalUniqueCustomers = byCustomer.size;
    const repeatCustomers = Array.from(byCustomer.values()).filter((a) => a.orderCount > 1).length;
    const repeatCustomerRatePercent = totalUniqueCustomers === 0 ? 0 : (repeatCustomers / totalUniqueCustomers) * 100;
    const totalOrders = orders.length;
    const averageVisitFrequency = totalUniqueCustomers === 0 ? 0 : totalOrders / totalUniqueCustomers;

    const topSpenderEntries = Array.from(byCustomer.entries())
      .sort((a, b) => Number(b[1].totalSpendMinor) - Number(a[1].totalSpendMinor))
      .slice(0, 20);

    const customerRecords = topSpenderEntries.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: topSpenderEntries.map(([id]) => id) } },
          select: { id: true, name: true, firstName: true, lastName: true, phone: true },
        })
      : [];
    const customerById = new Map(customerRecords.map((c) => [c.id, c]));

    const topSpenders = topSpenderEntries.map(([customerId, agg]) => {
      const c = customerById.get(customerId);
      const name = c?.name || [c?.firstName, c?.lastName].filter(Boolean).join(" ") || null;
      return {
        customerId,
        name,
        phone: c?.phone || null,
        totalSpendMinor: String(agg.totalSpendMinor),
        orderCount: agg.orderCount,
        lastVisitAt: agg.lastVisitAt.toISOString(),
      };
    });

    res.status(200).json({
      outletId,
      fromDate: range.fromDate,
      toDate: range.toDate,
      totalUniqueCustomers,
      repeatCustomers,
      repeatCustomerRatePercent: Number(repeatCustomerRatePercent.toFixed(2)),
      averageVisitFrequency: Number(averageVisitFrequency.toFixed(2)),
      topSpenders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/discount-void-analysis", requireAuth, requirePermission("report.financial.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const outletId = req.auth!.outletId;

    // Row fetching only -- every sum/grouping below the fetch lives in
    // computeDiscountVoidAnalysis (@kapmeta/reporting), which
    // GET /bi/query?dataset=discounts_voids also calls, so the two endpoints
    // cannot drift apart on the same money figures.
    const voidedItems = await prisma.orderItem.findMany({
      where: {
        outletId,
        isVoided: true,
        order: { createdAt: { gte: range.fromDate, lte: range.toDate } },
      },
      select: {
        subtotal: true,
        quantity: true,
        voidReason: true,
        voidedBy: true,
        order: { select: { createdAt: true } },
      },
    });

    const discountOrders = await prisma.order.findMany({
      where: {
        outletId,
        status: "COMPLETED",
        createdAt: { gte: range.fromDate, lte: range.toDate },
        discountTotal: { gt: 0 },
      },
      select: { discountTotal: true, createdAt: true },
    });

    const analysis = computeDiscountVoidAnalysis(
      outletId,
      range,
      voidedItems.map((i) => ({
        subtotalMinor: i.subtotal,
        quantity: Number(i.quantity),
        voidReason: i.voidReason,
        voidedBy: i.voidedBy,
        orderCreatedAt: i.order.createdAt,
      })),
      discountOrders.map((o) => ({
        discountTotalMinor: o.discountTotal ?? 0n,
        createdAt: o.createdAt,
      }))
    );

    res.status(200).json({
      outletId: analysis.outletId,
      fromDate: analysis.fromDate,
      toDate: analysis.toDate,
      voids: {
        count: analysis.voids.count,
        totalValueMinor: String(analysis.voids.totalValueMinor),
        byReason: analysis.voids.byReason.map((r) => ({
          reason: r.reason,
          count: r.count,
          valueMinor: String(r.valueMinor),
        })),
        byStaff: analysis.voids.byStaff.map((r) => ({
          voidedBy: r.voidedBy,
          count: r.count,
          valueMinor: String(r.valueMinor),
        })),
        byDay: analysis.voids.byDay.map((r) => ({
          date: r.date,
          count: r.count,
          quantity: r.quantity,
          valueMinor: String(r.valueMinor),
        })),
      },
      discounts: {
        totalDiscountMinor: String(analysis.discounts.totalDiscountMinor),
        orderCountWithDiscount: analysis.discounts.orderCountWithDiscount,
        byDay: analysis.discounts.byDay.map((d) => ({
          date: d.date,
          count: d.count,
          totalMinor: String(d.totalMinor),
        })),
      },
      note: analysis.note,
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

router.get("/invoices", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
    const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;

    const where: any = {
      outletId,
      status: "COMPLETED",
    };

    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const orders = await prisma.order.findMany({
      where,
      take: limit,
      orderBy: { orderNumber: "desc" },
      include: {
        diningTable: {
          select: {
            tableNumber: true,
            section: true,
          },
        },
        orderItems: {
          include: {
            menuItem: {
              select: {
                name: true,
                isVeg: true,
              },
            },
          },
        },
      },
    });

    const orderIds = orders.map((o) => o.id);
    const payments = orderIds.length > 0
      ? await prisma.payment.findMany({
          where: { orderId: { in: orderIds } },
        })
      : [];

    const paymentsByOrder = new Map<string, typeof payments>();
    for (const p of payments) {
      if (!paymentsByOrder.has(p.orderId)) {
        paymentsByOrder.set(p.orderId, []);
      }
      paymentsByOrder.get(p.orderId)!.push(p);
    }

    const dbInvoices = orderIds.length > 0
      ? await prisma.invoice.findMany({ where: { orderId: { in: orderIds } } })
      : [];
    const invoiceByOrder = new Map(dbInvoices.map((inv) => [inv.orderId, inv]));

    const invoices = orders.map((o) => {
      const orderPayments = paymentsByOrder.get(o.id) || [];
      const primaryPayment = orderPayments[0];
      const paymentMethod = orderPayments.length > 1
        ? "SPLIT"
        : (primaryPayment?.method || "CASH");
      const paymentStatus = primaryPayment?.status || "CAPTURED";

      const subtotalMinor = o.subtotal ?? (o.grandTotal - (o.taxTotal ?? 0n));
      const taxTotalMinor = o.taxTotal ?? 0n;
      const discountTotalMinor = o.discountTotal ?? 0n;

      const items = o.orderItems.map((item) => ({
        id: item.id,
        name: item.menuItem?.name || `Item ${item.menuItemId || ""}`.trim() || "Menu Item",
        quantity: Number(item.quantity),
        priceMinor: String(item.unitPrice ?? 0n),
        totalMinor: String((item as any).totalPrice ?? (item.unitPrice ? BigInt(Math.round(Number(item.quantity))) * item.unitPrice : 0n)),
        isVeg: item.menuItem?.isVeg ?? true,
      }));

      return {
        id: o.id,
        invoiceNumber: invoiceByOrder.get(o.id)?.invoiceNumber || `INV-${o.orderNumber || o.id.slice(0, 8).toUpperCase()}`,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        status: o.status,
        tableNumber: o.diningTable?.tableNumber || (o as any).table_number || null,
        section: o.diningTable?.section || null,
        subtotalMinor: String(subtotalMinor),
        taxTotalMinor: String(taxTotalMinor),
        discountTotalMinor: String(discountTotalMinor),
        grandTotalMinor: String(o.grandTotal),
        paymentMethod,
        paymentStatus,
        itemCount: o.orderItems.reduce((sum, it) => sum + Number(it.quantity), 0),
        items,
        createdAt: o.createdAt.toISOString(),
      };
    });

    res.status(200).json(invoices);
  } catch (err) {
    console.error("Error fetching settled invoices:", err);
    res.status(500).json({ error: "Failed to fetch settled invoices" });
  }
});


router.get("/item-margin", requireAuth, requirePermission("report.financial.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const report = await getItemMarginReport(outletId, range, repo);

    const itemIds = report.items.map((r) => r.menuItemId);
    const menuItems = itemIds.length > 0
      ? await prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(menuItems.map((m) => [m.id, m.name]));

    res.status(200).json({
      ...report,
      items: report.items.map((row) => ({
        ...row,
        menuItemName: nameMap.get(row.menuItemId) || `Dish (${row.menuItemId.slice(0, 6)})`,
        netSalesMinor: String(row.netSalesMinor),
        foodCostMinor: row.foodCostMinor === null ? null : String(row.foodCostMinor),
        marginMinor: row.marginMinor === null ? null : String(row.marginMinor),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/inventory-variance", requireAuth, requirePermission("report.financial.read"), async (req: AuthedRequest, res) => {
  try {
    const range = parseRange(req);
    const outletId = req.auth!.outletId;

    const repo = new PrismaReportingRepository(prisma);
    const report = await getInventoryVarianceReport(outletId, range, repo);

    const ingredientIds = report.ingredients.map((r) => r.ingredientId);
    const ingredients = ingredientIds.length > 0
      ? await prisma.ingredients.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, name: true, unit_of_measure: true },
        })
      : [];
    const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

    res.status(200).json({
      ...report,
      ingredients: report.ingredients.map((row) => ({
        ...row,
        ingredientName: ingredientMap.get(row.ingredientId)?.name || `Ingredient (${row.ingredientId.slice(0, 6)})`,
        unitOfMeasure: ingredientMap.get(row.ingredientId)?.unit_of_measure || "",
        purchasedCostMinor: String(row.purchasedCostMinor),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export const reportingRouter = router;

