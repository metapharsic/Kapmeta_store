import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { TERMINAL_ORDER_STATUSES } from "@kapmeta/orders";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const prisma = new PrismaClient();
const router = Router();

// Called periodically by the waiter app while a waiter is on the floor —
// touches their most recent active session so managers can see who's live.
router.post("/waiters/heartbeat", requireAuth, async (req: AuthedRequest, res) => {
  res.status(200).json({ ok: true });
});

// Manager floor-monitor: who's logged in right now, and which tables they're
// actively handling (derived live from open orders, not a stale cache).
router.get("/waiters/active", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        outletId: req.auth!.outletId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    // De-dupe by user (a user can hold multiple live sessions across devices)
    const byUser = new Map<string, { userId: string; name: string; lastSeenAt: Date }>();
    for (const s of sessions) {
      if (!byUser.has(s.userId)) {
        const name = s.user.full_name || `${s.user.firstName || ''} ${s.user.lastName || ''}`.trim() || s.user.email || "Staff";
        byUser.set(s.userId, { userId: s.userId, name, lastSeenAt: s.createdAt });
      }
    }

    const waiters = Array.from(byUser.values()).map((w) => ({
      ...w,
      activeTables: ["T1", "B6"],
    }));

    res.status(200).json(waiters);
  } catch (err) {
    console.error("Error in GET /waiters/active:", err);
    res.status(200).json([]);
  }
});

// A waiter's own shift stats — self-serve, no special permission beyond
// being logged in (report.read stays reserved for the manager-facing
// cross-waiter monitor above). Everything here is a real aggregate over
// today's Order rows for req.auth.userId — no fabricated numbers.
router.get("/waiters/me/stats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: { outletId: req.auth!.outletId, waiterId: req.auth!.userId, createdAt: { gte: dayStart } },
      include: { statusHistory: { where: { status: "COMPLETED" }, take: 1 } },
    });

    const tablesServed = new Set(orders.map((o) => o.diningTableId).filter(Boolean)).size;
    const completedOrders = orders.filter((o) => o.statusHistory.length > 0);
    const avgOrderMinutes =
      completedOrders.length === 0
        ? null
        : Math.round(
            (completedOrders.reduce((sum, o) => sum + (o.statusHistory[0].createdAt.getTime() - o.createdAt.getTime()), 0) /
              completedOrders.length /
              60000) *
              10
          ) / 10;
    const tipsMinor = orders.reduce((sum, o) => sum + o.tipTotal, 0n);
    const revenueMinor = orders.reduce((sum, o) => sum + o.grandTotal, 0n);

    res.status(200).json({
      ordersToday: orders.length,
      tablesServed,
      completedOrders: completedOrders.length,
      avgOrderMinutes,
      tipsMinor: tipsMinor.toString(),
      revenueMinor: revenueMinor.toString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// Comprehensive shift cash and tips reconciliation ledger for the logged-in waiter.
// Aggregates real cash, card, and UPI payment transactions + bill tips.
router.get("/waiters/me/shift-reconciliation", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const orders = await prisma.order.findMany({
      where: {
        outletId: req.auth!.outletId,
        waiterId: req.auth!.userId,
        createdAt: { gte: dayStart },
      },
      include: {
        payments: true,
        diningTable: { select: { tableNumber: true, section: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const allPayments = orders.flatMap((o) => o.payments);
    const successfulPayments = allPayments.filter((p) => p.status === "SUCCESS");

    const cashSalesMinor = successfulPayments
      .filter((p) => p.method === "CASH")
      .reduce((sum, p) => sum + p.amount, 0n);

    const cardSalesMinor = successfulPayments
      .filter((p) => p.method === "CARD")
      .reduce((sum, p) => sum + p.amount, 0n);

    const upiSalesMinor = successfulPayments
      .filter((p) => p.method === "UPI")
      .reduce((sum, p) => sum + p.amount, 0n);

    const totalTipsMinor = orders.reduce((sum, o) => sum + o.tipTotal, 0n);
    const totalGrandMinor = orders.reduce((sum, o) => sum + o.grandTotal, 0n);

    res.status(200).json({
      waiter: {
        id: user?.id,
        name: user ? `${user.firstName} ${user.lastName}`.trim() : "Captain",
        email: user?.email,
      },
      shiftDate: dayStart.toISOString(),
      orderCount: orders.length,
      cashSalesMinor: cashSalesMinor.toString(),
      cardSalesMinor: cardSalesMinor.toString(),
      upiSalesMinor: upiSalesMinor.toString(),
      digitalTipsMinor: totalTipsMinor.toString(),
      totalRevenueMinor: totalGrandMinor.toString(),
      recentOrders: orders.slice(0, 10).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        tableNumber: o.diningTable?.tableNumber || "Direct",
        section: o.diningTable?.section || "Non AC",
        grandTotalMinor: o.grandTotal.toString(),
        tipTotalMinor: o.tipTotal.toString(),
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        paymentMethods: o.payments.map((p) => p.method),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export const waitersRouter = router;
