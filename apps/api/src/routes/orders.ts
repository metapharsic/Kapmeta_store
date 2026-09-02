import { Router } from "express";
import { requireAuth, requirePermission, checkPermissionDirect, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import {
  createOrder,
  transitionOrder,
  listOrders,
  countOrders,
  getOrderDetail,
  addOrderItems,
  PrismaOrderRepository,
  PrismaMenuPriceLookup,
  PrismaModifierPriceLookup,
} from "@kapmeta/orders";
import type { OrderStatus, CreateOrderInput } from "@kapmeta/shared-types/orders";
import { onOrderConfirmed, onItemsAdded } from "../orchestration/order-lifecycle";
import { settleOrderCommand } from "../orchestration/settle-order";
import { TaxEngine } from "@kapmeta/finance";
import { dissolveMergeGroupForTable, expandMergeMemberIds, findLiveOrdersOnTables, occupyMergeMembers, resolveAnchorTable, stampOrderMergeLabel } from "../orchestration/table-merge";

const orderRepo = new PrismaOrderRepository(prisma);
const menuPriceLookup = new PrismaMenuPriceLookup(prisma);
const modifierPriceLookup = new PrismaModifierPriceLookup(prisma);

export const ordersRouter = Router();

// GET /orders - List orders with optional filters.
// Returns an envelope ({ orders, total, page, limit }) because the orders
// table footer shows "Showing 1 to N of TOTAL records" - the page slice alone
// cannot produce that number.
ordersRouter.get("/orders", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { status, channel, orderType, view, page, limit, fromDate, toDate, orderNumber, search } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

    const filter: any = { limit: limitNum, offset: (pageNum - 1) * limitNum };
    if (status) filter.status = status as OrderStatus;
    if (channel) filter.channel = channel as any;
    if (orderType) filter.orderType = orderType as any;
    if (view === "live" || view === "online" || view === "all") filter.view = view;
    // The header quick-search sends orderNumber/search; the repository filter
    // calls it orderNumberSearch. Without this mapping the search was silently
    // dropped and the caller got the unfiltered first page back.
    const numberSearch = String(orderNumber || search || "").trim();
    if (numberSearch) filter.orderNumberSearch = numberSearch;
    if (fromDate) filter.fromDate = new Date(String(fromDate));
    if (toDate) filter.toDate = new Date(String(toDate));

    const [orders, total] = await Promise.all([
      listOrders(outletId, filter, orderRepo),
      countOrders(outletId, filter, orderRepo),
    ]);

    res.status(200).json({ orders, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("Error listing orders:", err);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// POST /orders - Create order
ordersRouter.post("/orders", requireAuth, requirePermission("order.create"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const body = req.body;

    // Normalize lines
    const rawLines = Array.isArray(body.lines)
      ? body.lines
      : Array.isArray(body.items)
      ? body.items
      : [];

    const lines = rawLines.map((it: any) => ({
      menuItemId: it.menuItemId || it.itemId || it.id,
      quantity: Number(it.quantity || 1),
      modifierOptionIds: Array.isArray(it.modifierOptionIds) ? it.modifierOptionIds : [],
      notes: it.notes || undefined,
      course: it.course || undefined,
      seatNumber: it.seatNumber || undefined,
    }));

    if (lines.length === 0) {
      return res.status(400).json({ error: "Order must have at least one line item" });
    }

    // Auto-resolve diningTableId if tableNumber or diningTableId is provided
    let diningTableId = body.diningTableId || undefined;
    const tableIdentifier = diningTableId || body.tableNumber;
    if (tableIdentifier) {
      const anchor = await resolveAnchorTable(prisma, outletId, tableIdentifier);
      if (anchor) {
        diningTableId = anchor.id;
        body.tableNumber = body.tableNumber || anchor.tableNumber;
      } else {
        diningTableId = undefined;
      }
    }

    if (diningTableId) {
      const liveOnAnchor = await findLiveOrdersOnTables(prisma, outletId, [diningTableId]);
      const existingLive = liveOnAnchor[0];
      if (existingLive) {
        const added = await addOrderItems(
          outletId,
          existingLive.id,
          lines,
          menuPriceLookup,
          orderRepo,
          req.auth!.userId,
          modifierPriceLookup
        );
        await onItemsAdded(existingLive.id, prisma).catch(() => {});
        if (body.action === "KOT" || body.status === "ACTIVE" || body.status === "KOT_CREATED") {
          if (existingLive.status === "DRAFT" || existingLive.status === "PLACED") {
            await transitionOrder(existingLive.id, "CONFIRMED", orderRepo, req.auth!.userId).catch(() => {});
            await transitionOrder(existingLive.id, "KOT_CREATED", orderRepo, req.auth!.userId).catch(() => {});
          }
          await onOrderConfirmed(existingLive.id, prisma).catch(() => {});
        }
        await occupyMergeMembers(prisma, outletId, diningTableId);
        await stampOrderMergeLabel(prisma, outletId, existingLive.id, diningTableId);
        const orderDetail = await getOrderDetail(outletId, existingLive.id, orderRepo);
        const attachMembers = await expandMergeMemberIds(prisma, outletId, [diningTableId]);
        import("../websockets").then(({ broadcast }) => {
          broadcast(outletId, "order.updated", { orderId: existingLive.id, diningTableId });
          broadcast(outletId, "kot.created", { orderId: existingLive.id, diningTableId });
          for (const id of attachMembers.length > 0 ? attachMembers : [diningTableId]) {
            broadcast(outletId, "table.status_updated", { tableId: id, orderId: existingLive.id, status: "OCCUPIED" });
          }
        }).catch(() => {});
        return res.status(200).json({ ...orderDetail, added, attachedToExisting: true });
      }
    }

    const orderType = (body.orderType === "TAKEAWAY" || body.orderType === "PICKUP") ? "PICKUP" : (body.orderType === "DELIVERY" ? "DELIVERY" : "DINE_IN");
    const idempotencyKey = body.idempotencyKey || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const input: CreateOrderInput = {
      outletId,
      terminalNumber: body.terminalNumber || "POS-01",
      orderType: orderType as any,
      idempotencyKey,
      lines,
      diningTableId,
      customerId: body.customerId || undefined,
      waiterId: body.waiterId || undefined,
    };

    const result = await createOrder(input, menuPriceLookup, orderRepo, modifierPriceLookup);

    if (diningTableId) {
      await prisma.order.update({
        where: { id: result.id },
        data: {
          diningTableId,
        },
      }).catch(() => {});
    }

    if (body.scheduledFireAt) {
      await prisma.order.update({
        where: { id: result.id },
        data: {
          scheduledFireAt: new Date(body.scheduledFireAt),
          promisedAt: body.promisedAt ? new Date(body.promisedAt) : undefined,
          depositMinor: body.depositMinor != null ? BigInt(body.depositMinor) : undefined,
          advanceStatus: "SCHEDULED",
        },
      }).catch(() => undefined);
    }

    // If KOT creation requested (action: "KOT" or status: "ACTIVE" or "KOT_CREATED"):
    if (body.action === "KOT" || body.status === "ACTIVE" || body.status === "KOT_CREATED") {
      if (!body.scheduledFireAt) {
        await transitionOrder(result.id, "CONFIRMED", orderRepo, req.auth!.userId);
        await transitionOrder(result.id, "KOT_CREATED", orderRepo, req.auth!.userId);
        await onOrderConfirmed(result.id, prisma);
      }

      if (diningTableId) {
        await occupyMergeMembers(prisma, outletId, diningTableId);
        await stampOrderMergeLabel(prisma, outletId, result.id, diningTableId);
      }
    }
    // If Bill / Immediate Settlement requested (action: "BILL" or isPaid: true or status: "COMPLETED"):
    else if (body.action === "BILL" || body.isPaid || body.status === "COMPLETED") {
      await transitionOrder(result.id, "CONFIRMED", orderRepo, req.auth!.userId);
      await onOrderConfirmed(result.id, prisma);
      await settleOrderCommand(prisma, {
        outletId,
        orderId: result.id,
        userId: req.auth!.userId,
        paymentMethod: body.paymentMethod,
        amountPaidMinor: body.amountPaidMinor,
        payments: body.payments,
      });
    }

    const orderDetail = await getOrderDetail(outletId, result.id, orderRepo);
    const createMembers = diningTableId
      ? await expandMergeMemberIds(prisma, outletId, [diningTableId])
      : [];

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "order.created", {
        orderId: result.id,
        orderNumber: orderDetail?.orderNumber || "NEW",
        tableId: diningTableId,
        status: orderDetail?.status || result.status,
      });
      broadcast(outletId, "kot.created", { orderId: result.id, diningTableId });
      const occupyIds = createMembers.length > 0 ? createMembers : (diningTableId ? [diningTableId] : []);
      for (const id of occupyIds) {
        broadcast(outletId, "table.status_updated", {
          tableId: id,
          orderId: result.id,
          status: body.action === "BILL" ? "AVAILABLE" : "OCCUPIED",
          stage: body.action === "KOT" ? "QUEUED" : undefined,
        });
      }
    }).catch(() => {});

    res.status(201).json({
      ...result,
      id: result.id,
      orderNumber: orderDetail?.orderNumber || "NEW",
      status: orderDetail?.status || result.status,
      grandTotalMinor: orderDetail ? String(orderDetail.grandTotalMinor) : "0",
      taxTotalMinor: orderDetail ? String(orderDetail.taxTotalMinor) : "0",
      subtotalMinor: orderDetail ? String(orderDetail.subtotalMinor) : "0",
      diningTableId,
      items: orderDetail?.items || [],
    });
  } catch (err: any) {
    console.error("Error creating order:", err);
    if (err.message && err.message.includes("Idempotency conflict")) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || "Failed to create order" });
  }
});

// GET /orders/advance - List scheduled advance / future orders
ordersRouter.get("/orders/advance", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const advanceOrders = await prisma.order.findMany({
      where: {
        outletId,
        OR: [
          { scheduledFireAt: { not: null } },
          { advanceStatus: { not: null } },
        ],
      },
      include: {
        orderItems: true,
        diningTable: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(advanceOrders);
  } catch (err) {
    console.error("Error fetching advance orders:", err);
    res.status(500).json({ error: "Failed to fetch advance orders" });
  }
});

// GET /orders/live - Get all active/live orders in preparation or on tables
ordersRouter.get("/orders/live", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const activeOrders = await prisma.order.findMany({
      where: {
        outletId,
        status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED", "HANDED_OVER", "OUT_FOR_DELIVERY"] },
      },
      include: {
        orderItems: true,
        diningTable: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(activeOrders);
  } catch (err) {
    console.error("Error fetching live orders:", err);
    res.status(500).json({ error: "Failed to fetch live orders" });
  }
});

// Non-terminal statuses = an order still "running" on the floor / in the pass.
const RUNNING_ORDER_STATUSES = [
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "KOT_CREATED",
  "IN_PREPARATION",
  "READY",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "SERVED",
  "HANDED_OVER",
];

// orders.order_type is a free-text column (there is no Prisma enum), and older
// rows still carry TAKEAWAY / AGGREGATOR. Fold them onto the three buckets the
// Running Orders header actually shows.
function normalizeOrderTypeBucket(orderType: string | null | undefined): "DINE_IN" | "PICKUP" | "DELIVERY" {
  const t = String(orderType || "").toUpperCase();
  if (t === "PICKUP" || t === "TAKEAWAY" || t === "CURBSIDE" || t === "DRIVE_THRU") return "PICKUP";
  if (t === "DELIVERY" || t === "AGGREGATOR") return "DELIVERY";
  return "DINE_IN";
}

// GET /orders/live/summary - Running Orders header tiles.
// "Running"  = every non-terminal order, split by order type.
// "Pending"  = the three kitchen/fulfilment waits the screen calls out.
ordersRouter.get("/orders/live/summary", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const rows = await prisma.order.findMany({
      where: { outletId, status: { in: RUNNING_ORDER_STATUSES } },
      select: { status: true, orderType: true, grandTotal: true },
    });

    const bucket = () => ({ count: 0, amountMinor: 0n });
    const running = {
      total: bucket(),
      DINE_IN: bucket(),
      PICKUP: bucket(),
      DELIVERY: bucket(),
    };
    const pending = {
      total: bucket(),
      inPreparation: bucket(),
      waitingForPickup: bucket(),
      outForDelivery: bucket(),
    };

    for (const row of rows) {
      const amount = BigInt(row.grandTotal ?? 0n);
      const type = normalizeOrderTypeBucket(row.orderType);
      const status = String(row.status || "").toUpperCase();

      running.total.count += 1;
      running.total.amountMinor += amount;
      running[type].count += 1;
      running[type].amountMinor += amount;

      let pendingKey: "inPreparation" | "waitingForPickup" | "outForDelivery" | null = null;
      if (status === "IN_PREPARATION") pendingKey = "inPreparation";
      else if (status === "READY" && type === "PICKUP") pendingKey = "waitingForPickup";
      else if (status === "OUT_FOR_DELIVERY") pendingKey = "outForDelivery";

      if (pendingKey) {
        pending[pendingKey].count += 1;
        pending[pendingKey].amountMinor += amount;
        pending.total.count += 1;
        pending.total.amountMinor += amount;
      }
    }

    const ser = (b: { count: number; amountMinor: bigint }) => ({
      count: b.count,
      amountMinor: b.amountMinor.toString(),
    });

    res.status(200).json({
      outletId,
      running: {
        totalOrders: running.total.count,
        totalAmountMinor: running.total.amountMinor.toString(),
        byOrderType: {
          DINE_IN: ser(running.DINE_IN),
          PICKUP: ser(running.PICKUP),
          DELIVERY: ser(running.DELIVERY),
        },
      },
      pending: {
        totalOrders: pending.total.count,
        totalAmountMinor: pending.total.amountMinor.toString(),
        inPreparation: ser(pending.inPreparation),
        waitingForPickup: ser(pending.waitingForPickup),
        outForDelivery: ser(pending.outForDelivery),
      },
    });
  } catch (err) {
    console.error("Error building live order summary:", err);
    res.status(500).json({ error: "Failed to build live order summary" });
  }
});

// Aggregator/dispatch columns landed on orders after the checked-in Prisma
// client was generated. Read them in a separate, catch-guarded query so a
// stale client degrades these fields to null instead of 500-ing the screen.
//
// customerName/customerPhone are NOT selected here: schema.prisma / orders
// (db/migrations/0039) has no customer_name or customer_phone column, so
// including them used to make Prisma reject this entire select as one
// unknown-argument error -- which meant channel/externalOrderId/rider/otp
// (all real columns) never came back either, every single time this ran.
// The OTP column is `customerOtp` in the Prisma model (maps to
// orders.customer_otp), not `otp`.
async function loadOnlineOrderColumns(orderIds: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (orderIds.length === 0) return map;
  try {
    const rows: any[] = await (prisma.order as any).findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        channel: true,
        externalOrderId: true,
        riderName: true,
        riderPhone: true,
        customerOtp: true,
        receivedAt: true,
        acceptedAt: true,
      },
    });
    for (const r of rows) map.set(r.id, r);
  } catch {
    // Columns not in the generated client yet.
  }
  return map;
}

// GET /orders/online - Aggregator (Zomato/Swiggy) order list.
// Registered before /orders/:id so "online" is not swallowed as an order id.
ordersRouter.get("/orders/online", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { channel, status, orderNo, fromDate, toDate, page, limit } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    const channelUpper = String(channel || "ALL").trim().toUpperCase() || "ALL";

    const baseWhere: any = { outletId };
    if (status) {
      const statuses = String(status)
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean);
      if (statuses.length === 1) baseWhere.status = statuses[0];
      else if (statuses.length > 1) baseWhere.status = { in: statuses };
    }
    if (orderNo) {
      baseWhere.orderNumber = { contains: String(orderNo).trim(), mode: "insensitive" };
    }
    if (fromDate || toDate) {
      const createdAt: any = {};
      if (fromDate) createdAt.gte = new Date(String(fromDate));
      if (toDate) createdAt.lte = new Date(String(toDate));
      baseWhere.createdAt = createdAt;
    }

    // Preferred scoping: the orders.channel column. Fallback (stale client /
    // pre-migration rows): orderType AGGREGATOR plus the "<CHANNEL>-<id>"
    // orderNumber prefix the webhook writes.
    const channelWhere: any = {
      ...baseWhere,
      ...(channelUpper === "ALL" ? { channel: { not: null } } : { channel: channelUpper }),
    };
    const fallbackWhere: any = {
      ...baseWhere,
      OR:
        channelUpper === "ALL"
          ? [
              { orderType: "AGGREGATOR" },
              { orderNumber: { startsWith: "ZOMATO-" } },
              { orderNumber: { startsWith: "SWIGGY-" } },
            ]
          : [{ orderNumber: { startsWith: `${channelUpper}-` } }],
    };

    const runQuery = async (where: any) =>
      Promise.all([
        (prisma.order as any).findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          include: { diningTable: { select: { tableNumber: true } } },
        }),
        (prisma.order as any).count({ where }),
      ]);

    let rows: any[];
    let total: number;
    try {
      [rows, total] = await runQuery(channelWhere);
    } catch {
      [rows, total] = await runQuery(fallbackWhere);
    }

    const [outlet, extras] = await Promise.all([
      prisma.outlet.findUnique({ where: { id: outletId }, select: { name: true } }).catch(() => null),
      loadOnlineOrderColumns(rows.map((r: any) => r.id)),
    ]);

    const now = Date.now();
    const orders = rows.map((row: any) => {
      const extra = extras.get(row.id) || {};
      const channelFromNumber = String(row.orderNumber || "").includes("-")
        ? String(row.orderNumber).split("-")[0].toUpperCase()
        : null;
      const createdAt: Date = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);

      return {
        id: row.id,
        orderNo: row.orderNumber,
        orderNumber: row.orderNumber,
        externalOrderId: extra.externalOrderId ?? row.externalOrderId ?? null,
        outletName: outlet?.name ?? null,
        channel:
          extra.channel ??
          row.channel ??
          (channelFromNumber === "ZOMATO" || channelFromNumber === "SWIGGY" ? channelFromNumber : null),
        orderType: row.orderType,
        tableNumber: row.diningTable?.tableNumber ?? null,
        riderName: extra.riderName ?? row.riderName ?? null,
        riderPhone: extra.riderPhone ?? row.riderPhone ?? null,
        // No customer_name/customer_phone column exists on orders (see
        // loadOnlineOrderColumns above) -- surfaced as null rather than a
        // fabricated value; the raw customer payload is still captured in
        // the AGGREGATOR_WEBHOOK audit log entry for this order.
        customerName: null,
        customerPhone: null,
        otp: extra.customerOtp ?? row.customerOtp ?? null,
        createdAt,
        receivedAt: extra.receivedAt ?? row.receivedAt ?? null,
        acceptedAt: extra.acceptedAt ?? row.acceptedAt ?? null,
        updatedAt: row.updatedAt ?? null,
        grandTotalMinor: String(row.grandTotal ?? 0n),
        status: row.status,
        elapsedMinutes: Math.max(0, Math.floor((now - createdAt.getTime()) / 60000)),
      };
    });

    res.status(200).json({ orders, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("Error listing online orders:", err);
    res.status(500).json({ error: "Failed to list online orders" });
  }
});

// GET /orders/advance/cumulative-items - "how much of each dish do I owe over
// this window", aggregated across advance orders. Same advance predicate as
// GET /orders/advance.
ordersRouter.get("/orders/advance/cumulative-items", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { fromDate, toDate } = req.query;

    const from = fromDate ? new Date(String(fromDate)) : null;
    const to = toDate ? new Date(String(toDate)) : null;

    // Same predicate GET /orders/advance uses.
    const advancePredicate: any = {
      OR: [{ scheduledFireAt: { not: null } }, { advanceStatus: { not: null } }],
    };

    const andClauses: any[] = [advancePredicate];
    if (from || to) {
      const range: any = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      // Range applies to when the order is due; orders with no fire time fall
      // back to when they were taken.
      andClauses.push({
        OR: [
          { scheduledFireAt: range },
          { AND: [{ scheduledFireAt: null }, { createdAt: range }] },
        ],
      });
    }

    const orders: any[] = await (prisma.order as any).findMany({
      where: { outletId, AND: andClauses },
      select: { id: true },
    });

    const orderIds = orders.map((o) => o.id);
    const items = orderIds.length
      ? await prisma.orderItem.findMany({
          where: { outletId, orderId: { in: orderIds }, isVoided: false },
          include: { menuItem: { select: { name: true } } },
        })
      : [];

    const byItem = new Map<string, { menuItemId: string; menuItemName: string; totalQuantity: number; totalAmountMinor: bigint }>();
    let totalQuantity = 0;
    let totalAmountMinor = 0n;

    for (const it of items as any[]) {
      const key = it.menuItemId;
      const name = it.item_name || it.menuItem?.name || "Menu Item";
      const qty = Number(it.quantity || 0);
      const amount = BigInt(it.subtotal ?? 0n);

      const agg = byItem.get(key) || { menuItemId: key, menuItemName: name, totalQuantity: 0, totalAmountMinor: 0n };
      agg.totalQuantity += qty;
      agg.totalAmountMinor += amount;
      byItem.set(key, agg);

      totalQuantity += qty;
      totalAmountMinor += amount;
    }

    const rows = Array.from(byItem.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity || a.menuItemName.localeCompare(b.menuItemName))
      .map((r) => ({
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        totalQuantity: r.totalQuantity,
        totalAmountMinor: r.totalAmountMinor.toString(),
      }));

    res.status(200).json({
      outletId,
      fromDate: from ? from.toISOString() : null,
      toDate: to ? to.toISOString() : null,
      orderCount: orderIds.length,
      items: rows,
      totals: { totalQuantity, totalAmountMinor: totalAmountMinor.toString() },
    });
  } catch (err) {
    console.error("Error aggregating advance order items:", err);
    res.status(500).json({ error: "Failed to aggregate advance order items" });
  }
});

// GET /orders/:id - Get order detail
ordersRouter.get("/orders/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const orderId = req.params.id;
    const order = await getOrderDetail(outletId, orderId, orderRepo);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, outletId },
      orderBy: { createdAt: "asc" },
    }).catch(() => []);

    const kotTickets = await prisma.kOTTicket.findMany({
      where: { orderId: order.id },
      include: { kotItems: true },
    }).catch(() => []);
    const kitchenRank: Record<string, number> = {
      QUEUED: 1, KOT_CREATED: 1, PENDING: 1,
      PREPARING: 2, COOKING: 2, IN_PREPARATION: 2,
      READY: 3, SERVED: 4,
    };
    const kitchenByOrderItem = new Map<string, string>();
    for (const ticket of kotTickets) {
      for (const ki of ticket.kotItems || []) {
        if (!ki.orderItemId) continue;
        const prev = kitchenByOrderItem.get(ki.orderItemId);
        const next = ticket.status;
        if (!prev || (kitchenRank[next] || 0) >= (kitchenRank[prev] || 0)) {
          kitchenByOrderItem.set(ki.orderItemId, next);
        }
      }
    }


    res.status(200).json({
      ...order,
      grandTotalMinor: String(order.grandTotalMinor),
      subtotalMinor: String(order.subtotalMinor),
      taxTotalMinor: String(order.taxTotalMinor),
      discountTotalMinor: String(order.discountTotalMinor),
      paymentMethod: order.paymentMethod || (payments[0]?.method ?? null),
      items: (order.items || []).map((it: any) => ({
        ...it,
        unitPriceMinor: String(it.unitPriceMinor),
        subtotalMinor: String(it.subtotalMinor),
        kitchenStatus: kitchenByOrderItem.get(it.id) || null,
      })),
      payments: (payments.length > 0 ? payments : (order.payments || [])).map((p: any) => ({
        id: p.id,
        amountMinor: String(p.amount ?? p.amountMinor ?? "0"),
        method: p.method,
        status: p.status,
        transactionId: p.transaction_id || p.transactionId || p.id,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })),
    });
  } catch (err: any) {
    console.error("Error fetching order detail:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// PATCH /orders/:id/status - Status transition
ordersRouter.patch("/orders/:id/status", requireAuth, requirePermission("order.update"), async (req: AuthedRequest, res) => {
  try {
    const userId = req.auth!.userId;
    const targetStatus = (req.body.toStatus || req.body.status) as OrderStatus;
    const { reasonCode, approverUserId } = req.body;

    if (!targetStatus) {
      return res.status(400).json({ error: "status or toStatus is required" });
    }

    const orderId = req.params.id;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Auto-progress prerequisite steps if skipping
    const cur = order.status;
    if (cur === "PLACED" && (targetStatus === "IN_PREPARATION" || (targetStatus as any) === "PREPARING" || targetStatus === "READY")) {
      await transitionOrder(orderId, "CONFIRMED", orderRepo, userId).catch(() => {});
      await transitionOrder(orderId, "KOT_CREATED", orderRepo, userId).catch(() => {});
    }

    const mappedTarget = targetStatus === ("PREPARING" as any) ? "IN_PREPARATION" : targetStatus;
    const result = await transitionOrder(
      orderId,
      mappedTarget as OrderStatus,
      orderRepo,
      userId,
      reasonCode,
      approverUserId
    );

    if (mappedTarget === "CONFIRMED" || mappedTarget === "KOT_CREATED") {
      await onOrderConfirmed(orderId, prisma).catch(() => {});
    }

    if (mappedTarget === "COMPLETED") {
      if (order.diningTableId) {
        await dissolveMergeGroupForTable(prisma, order.outletId, order.diningTableId).catch(() => {});
      }
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error updating order status:", err);
    res.status(400).json({ error: err.message || "Failed to transition order status" });
  }
});

// GET /orders/:id/bill - Get bill summary
ordersRouter.get("/orders/:id/bill", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const bill = await orderRepo.getBill(outletId, req.params.id);
    if (!bill) {
      return res.status(404).json({ error: "Order or bill not found" });
    }
    res.status(200).json({
      orderId: bill.orderId,
      orderNumber: bill.orderNumber,
      subtotalMinor: bill.subtotalMinor.toString(),
      discountTotalMinor: bill.discountTotalMinor.toString(),
      taxTotalMinor: bill.taxTotalMinor.toString(),
      tipTotalMinor: bill.tipTotalMinor.toString(),
      serviceChargeTotalMinor: bill.serviceChargeTotalMinor.toString(),
      grandTotalMinor: bill.grandTotalMinor.toString(),
      paidMinor: bill.paidMinor.toString(),
      dueMinor: bill.dueMinor.toString(),
    });
  } catch (err: any) {
    console.error("Error fetching bill:", err);
    res.status(500).json({ error: err.message || "Failed to fetch bill" });
  }
});

// POST /orders/:id/payments & POST /orders/:id/settle - Record payment and settle order
const handleRecordPayment = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const amountMinor = req.body.amountMinor || req.body.amountPaidMinor || req.body.amount;
    const method = req.body.method || req.body.paymentMethod || "CASH";
    const seatNumber = req.body.seatNumber;

    if (!amountMinor) {
      return res.status(400).json({ error: "amountMinor is required" });
    }

    const payment = await orderRepo.recordPayment(
      outletId,
      req.params.id,
      BigInt(amountMinor),
      method,
      userId,
      seatNumber
    );

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
    });

    res.status(201).json({
      ...payment,
      amountMinor: payment.amountMinor.toString(),
      paymentMethod: method,
      orderStatus: order?.status,
      success: true,
    });
  } catch (err: any) {
    console.error("Error recording payment:", err);
    res.status(400).json({ error: err.message || "Failed to record payment" });
  }
};

ordersRouter.post("/orders/:id/payments", requireAuth, requirePermission("bill.settle"), handleRecordPayment);

// POST /orders/:id/items - Add items to existing running order
ordersRouter.post("/orders/:id/items", requireAuth, requirePermission("order.create"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { lines } = req.body;

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "lines must be a non-empty array" });
    }

    const added = await addOrderItems(
      outletId,
      req.params.id,
      lines,
      menuPriceLookup,
      orderRepo,
      userId,
      modifierPriceLookup
    );
    await onItemsAdded(req.params.id, prisma).catch(() => {});
    const live = await prisma.order.findFirst({
      where: { id: req.params.id, outletId },
      select: { id: true, diningTableId: true, table_number: true },
    });
    if (live?.diningTableId) {
      await occupyMergeMembers(prisma, outletId, live.diningTableId);
      await stampOrderMergeLabel(prisma, outletId, live.id, live.diningTableId);
    }
    const itemMembers = live?.diningTableId
      ? await expandMergeMemberIds(prisma, outletId, [live.diningTableId])
      : [];
    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "order.updated", { orderId: req.params.id, diningTableId: live?.diningTableId || null });
      broadcast(outletId, "kot.created", { orderId: req.params.id, diningTableId: live?.diningTableId || null });
      for (const id of itemMembers) {
        broadcast(outletId, "table.status_updated", { tableId: id, orderId: req.params.id, status: "OCCUPIED" });
      }
    }).catch(() => {});
    res.status(200).json(added);
  } catch (err: any) {
    console.error("Error adding items to order:", err);
    res.status(400).json({ error: err.message || "Failed to add items" });
  }
});

// POST & PATCH /orders/:id/items/:itemId/void - Void an item from order
const handleVoidItem = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const reasonCode = req.body?.reasonCode || req.body?.reason || "CUSTOMER_VOID";

    const result = await orderRepo.voidItem(
      outletId,
      req.params.id,
      req.params.itemId,
      reasonCode,
      userId
    );
    if (!result.ok) {
      return res.status(404).json({ error: "Item not found or already voided" });
    }
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error voiding order item:", err);
    res.status(400).json({ error: err.message || "Failed to void item" });
  }
};

ordersRouter.post("/orders/:id/items/:itemId/void", requireAuth, requirePermission("order.void"), handleVoidItem);
ordersRouter.patch("/orders/:id/items/:itemId/void", requireAuth, requirePermission("order.void"), handleVoidItem);

// POST & PATCH /orders/:id/charges - Apply discounts / tips / service charges
const handleCharges = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const { tipMinor, serviceChargeMinor } = req.body;

    const updated = await orderRepo.setCharges(
      outletId,
      req.params.id,
      BigInt(tipMinor || 0),
      BigInt(serviceChargeMinor || 0)
    );
    res.status(200).json({
      ...updated,
      tipTotalMinor: updated.tipTotalMinor.toString(),
      serviceChargeTotalMinor: updated.serviceChargeTotalMinor.toString(),
      grandTotalMinor: updated.grandTotalMinor.toString(),
    });
  } catch (err: any) {
    console.error("Error applying charges:", err);
    res.status(400).json({ error: err.message || "Failed to apply charges" });
  }
};

ordersRouter.post("/orders/:id/charges", requireAuth, requirePermission("order.discount"), handleCharges);
ordersRouter.patch("/orders/:id/charges", requireAuth, requirePermission("order.discount"), handleCharges);

// POST /orders/:id/settle - Settle and complete order with payment.
// Cashiers use bill.settle. Captains with order.create may settle a table they collected payment on.
ordersRouter.post("/orders/:id/settle", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const settlePerm = await checkPermissionDirect(req.auth!.userId, req.auth!.outletId, "bill.settle");
    const createPerm = await checkPermissionDirect(req.auth!.userId, req.auth!.outletId, "order.create");
    if (!settlePerm.allowed && !createPerm.allowed) {
      return res.status(403).json({ error: settlePerm.reason || "not allowed to settle" });
    }
    const result = await settleOrderCommand(prisma, {
      outletId: req.auth!.outletId,
      orderId: req.params.id,
      userId: req.auth!.userId,
      paymentMethod: req.body.paymentMethod,
      amountPaidMinor: req.body.amountPaidMinor,
      payments: req.body.payments,
    });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error settling order:", err);
    res.status(500).json({ error: err.message || "Failed to settle order" });
  }
});

ordersRouter.post("/orders/:id/hold", requireAuth, requirePermission("order.update"), async (req: AuthedRequest, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, outletId: req.auth!.outletId },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "DRAFT" && order.status !== "PLACED") {
      return res.status(409).json({ error: "Only DRAFT or PLACED orders can be held" });
    }
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "DRAFT", advanceStatus: "HELD" },
    });
    res.status(200).json({ ok: true, orderId: updated.id, status: updated.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to hold order" });
  }
});

// POST /orders/:id/fire-advance - Dispatch a scheduled advance order to Kitchen KDS
ordersRouter.post("/orders/:id/fire-advance", requireAuth, requirePermission("order.update"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const orderId = req.params.id;

    await prisma.order.update({
      where: { id: orderId },
      data: { advanceStatus: "FIRED" },
    }).catch(() => undefined);
    await transitionOrder(orderId, "CONFIRMED", orderRepo, req.auth!.userId).catch(() => {});
    await transitionOrder(orderId, "KOT_CREATED", orderRepo, req.auth!.userId).catch(() => {});
    await onOrderConfirmed(orderId, prisma);

    res.status(200).json({ ok: true, orderId, status: "KOT_CREATED" });
  } catch (err: any) {
    console.error("Error firing advance order:", err);
    res.status(500).json({ error: "Failed to fire advance order to kitchen" });
  }
});

// POST /orders/:id/cancel - Cancel order
ordersRouter.post("/orders/:id/cancel", requireAuth, requirePermission("order.void"), async (req: AuthedRequest, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.auth!.userId;
    const { reason, reasonCode } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status === "COMPLETED") {
      return res.status(400).json({ error: "Cannot cancel a completed order. Use refund instead." });
    }

    if (order.status === "CANCELLED") {
      return res.status(400).json({ error: "Order is already cancelled." });
    }

    await transitionOrder(orderId, "CANCELLED" as OrderStatus, orderRepo, userId, reason || reasonCode || "CUSTOMER_CANCELLED");

    const dissolved = order.diningTableId
      ? await dissolveMergeGroupForTable(prisma, order.outletId, order.diningTableId)
      : { ids: [] as string[] };

    import("../websockets").then(({ broadcast }) => {
      broadcast(order.outletId, "order.status_updated", { orderId, status: "CANCELLED", tableId: order.diningTableId });
      for (const id of dissolved.ids.length > 0 ? dissolved.ids : order.diningTableId ? [order.diningTableId] : []) {
        broadcast(order.outletId, "table.status_updated", { tableId: id, orderId, status: "VACANT" });
      }
    }).catch(() => {});

    res.status(200).json({ ok: true, orderId, status: "CANCELLED", reason: reason || reasonCode || "CUSTOMER_CANCELLED" });
  } catch (err: any) {
    console.error("Error cancelling order:", err);
    res.status(500).json({ error: err.message || "Failed to cancel order" });
  }
});

// GET /orders/by-table/:tableId/active - Get running order on a table
ordersRouter.get("/orders/by-table/:tableId/active", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.tableId;
    const anchor = await resolveAnchorTable(prisma, outletId, tableId);
    const memberIds = await expandMergeMemberIds(prisma, outletId, [anchor?.id || tableId]);
    const candidateIds = Array.from(new Set([
      anchor?.id,
      tableId,
      ...memberIds,
    ].filter(Boolean) as string[]));
    const liveOrders = await findLiveOrdersOnTables(
      prisma,
      outletId,
      candidateIds
    );
    const order = liveOrders[0];

    if (!order) {
      return res.status(404).json({ error: "No active order for this table" });
    }

    res.status(200).json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      grandTotalMinor: order.grandTotal.toString(),
      subtotalMinor: order.subtotal.toString(),
      taxTotalMinor: (order.taxTotal || 0n).toString(),
      items: (order.orderItems || []).map((item: any) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.item_name || "Dish",
        quantity: item.quantity,
        unitPriceMinor: item.unitPrice.toString(),
        subtotalMinor: item.subtotal.toString(),
        notes: item.notes,
        isVoided: item.is_voided ?? item.isVoided,
        course: item.course,
        seatNumber: item.seat_number ?? item.seatNumber,
      })),
    });
  } catch (err: any) {
    console.error("Error fetching active table order:", err);
    res.status(500).json({ error: err.message || "Failed to fetch active table order" });
  }
});

// GET /orders/:id/bill/by-seat - Group item totals and paid amounts by seat number
ordersRouter.get("/orders/:id/bill/by-seat", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const orderId = req.params.id;

    const result = await orderRepo.getBillBySeat(outletId, orderId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error generating seat bill:", err);
    res.status(500).json({ error: err.message || "Failed to generate seat bill" });
  }
});

// ---------------------------------------------------------------------------
// Seat-level billing (persisted split-by-seat) — see docs/02-requirements/
// artifact-02-seat-and-merge-plan.md §3/§4. The 5 new Prisma models below
// (table_merge_groups, table_merge_members, table_seats, order_seat_bills,
// order_item_seat_shares) predate `prisma generate` being re-run in this
// environment, so every access goes through `(prisma as any).<model>` —
// same pattern as services/menu/src/menu-catalog-repository.ts:linkModifierToItem.
// ---------------------------------------------------------------------------


// POST /orders/:id/seats/:seatNumber/items - assign order items to a seat
ordersRouter.post(
  "/orders/:id/seats/:seatNumber/items",
  requireAuth,
  requirePermission("order.update"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const orderId = req.params.id;
      const seatNumber = Number(req.params.seatNumber);
      const itemIds: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];

      if (!Number.isInteger(seatNumber) || seatNumber < 1) {
        return res.status(400).json({ error: "seatNumber must be a positive integer" });
      }
      if (itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds is required" });
      }

      const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Resolve the seat's id (table_seats) if the order's table has one seeded
      // for this seat number — OrderItem.seatId is nullable, seatNumber always set.
      let seatId: string | null = null;
      if (order.diningTableId) {
        const seatRow = await (prisma as any).table_seats.findFirst({
          where: { outlet_id: outletId, dining_table_id: order.diningTableId, seat_number: seatNumber },
        });
        seatId = seatRow?.id ?? null;
      }

      const result = await (prisma.orderItem.updateMany as any)({
        where: { id: { in: itemIds }, orderId, outletId },
        data: { seatNumber, seatId },
      });

      res.status(200).json({ ok: true, updatedCount: result.count, seatNumber, seatId });
    } catch (err: any) {
      console.error("Error assigning items to seat:", err);
      res.status(400).json({ error: err.message || "Failed to assign items to seat" });
    }
  }
);

// POST /orders/:id/items/:itemId/seat-shares - split ONE item across multiple seats
ordersRouter.post(
  "/orders/:id/items/:itemId/seat-shares",
  requireAuth,
  requirePermission("order.update"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const orderId = req.params.id;
      const itemId = req.params.itemId;
      const shares: { seatNumber: number; shareNumerator: number; shareDenominator: number }[] =
        Array.isArray(req.body?.shares) ? req.body.shares : [];

      if (shares.length < 2) {
        return res.status(400).json({ error: "At least two shares are required to split an item across seats" });
      }
      for (const s of shares) {
        if (
          !Number.isInteger(s.seatNumber) || s.seatNumber < 1 ||
          !Number.isInteger(s.shareNumerator) || s.shareNumerator <= 0 ||
          !Number.isInteger(s.shareDenominator) || s.shareDenominator <= 0
        ) {
          return res.status(400).json({ error: "Each share needs a positive seatNumber, shareNumerator, shareDenominator" });
        }
      }
      // Validation: all denominators must agree, and numerators must sum to that
      // denominator exactly (the item is fully and exclusively allocated).
      const denominator = shares[0].shareDenominator;
      const allSameDenominator = shares.every((s) => s.shareDenominator === denominator);
      const numeratorSum = shares.reduce((sum, s) => sum + s.shareNumerator, 0);
      if (!allSameDenominator || numeratorSum !== denominator) {
        return res.status(400).json({
          error: "Shares must use a common denominator and numerators must sum to it (fully allocate the item)",
        });
      }

      const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId, outletId } });
      if (!item) {
        return res.status(404).json({ error: "Order item not found" });
      }

      // Allocate the item's subtotal across shares with the same largest-remainder
      // technique used elsewhere in this file, so shares sum exactly to item.subtotal.
      const amounts = shares.map((s) => (item.subtotal * BigInt(s.shareNumerator)) / BigInt(denominator));
      const allocated = amounts.reduce((sum, a) => sum + a, 0n);
      let leftover = item.subtotal - allocated;
      const allocatedSubtotals = amounts.map((a) => {
        if (leftover > 0n) {
          leftover -= 1n;
          return a + 1n;
        }
        return a;
      });

      const created = await prisma.$transaction(async (tx) => {
        await (tx as any).order_item_seat_shares.deleteMany({ where: { order_item_id: itemId } });
        const rows: any[] = [];
        for (let i = 0; i < shares.length; i++) {
          const s = shares[i];
          rows.push(
            await (tx as any).order_item_seat_shares.create({
              data: {
                outlet_id: outletId,
                order_item_id: itemId,
                seat_number: s.seatNumber,
                share_numerator: s.shareNumerator,
                share_denominator: s.shareDenominator,
                allocated_subtotal: allocatedSubtotals[i],
              },
            })
          );
        }
        await (tx.orderItem.update as any)({ where: { id: itemId }, data: { isShared: true } });
        return rows;
      });

      res.status(200).json({
        ok: true,
        itemId,
        shares: created.map((r: any) => ({
          seatNumber: r.seat_number,
          shareNumerator: r.share_numerator,
          shareDenominator: r.share_denominator,
          allocatedSubtotalMinor: r.allocated_subtotal.toString(),
        })),
      });
    } catch (err: any) {
      console.error("Error recording seat shares:", err);
      res.status(400).json({ error: err.message || "Failed to record seat shares" });
    }
  }
);

// POST /orders/:id/split-by-seat - compute and PERSIST per-seat bills.
//
// Idempotency choice: split-by-seat is RE-RUNNABLE, not one-shot. If
// order_seat_bills rows already exist for this order they are updated in
// place (upsert on the (outlet_id, order_id, seat_number) unique key) rather
// than 409ing, so re-running after items move between seats (or after a
// void) recomputes cleanly. Rows for seat numbers that no longer have items
// are left untouched but zeroed out for subtotal/tax/etc — paidTotal is
// never reset by this endpoint, only settle writes to it.
ordersRouter.post(
  "/orders/:id/split-by-seat",
  requireAuth,
  requirePermission("order.update"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const orderId = req.params.id;

      const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Reuse the same per-seat subtotal/paid grouping logic as the
      // read-only GET /orders/:id/bill/by-seat reporting endpoint.
      const bySeat = await orderRepo.getBillBySeat(outletId, orderId);
      const namedSeats = bySeat.filter((s) => s.seatNumber != null) as { seatNumber: number; subtotalMinor: string; paidMinor: string }[];

      if (namedSeats.length === 0) {
        return res.status(400).json({ error: "Order has no items assigned to a seat yet" });
      }

      const seatNumbers = namedSeats.map((s) => s.seatNumber).sort((a, b) => a - b);
      const subtotalsBySeat = new Map(namedSeats.map((s) => [s.seatNumber, BigInt(s.subtotalMinor)]));
      const itemSubtotalSum = namedSeats.reduce((sum, s) => sum + BigInt(s.subtotalMinor), 0n);

      // Allocate order-level discount/tax/service-charge/tip proportionally
      // to each seat's share of item subtotal, using largest-remainder
      // rounding so the per-seat components sum exactly to the order totals.
      const discountTotal = order.discountTotal ?? 0n;
      const taxTotal = order.taxTotal ?? 0n;
      const serviceChargeTotal = order.serviceChargeTotal ?? 0n;
      const tipTotal = order.tipTotal ?? 0n;

      function allocateProportional(total: bigint): Map<number, bigint> {
        if (itemSubtotalSum === 0n || total === 0n) {
          return new Map(seatNumbers.map((n) => [n, 0n]));
        }
        // Proportional shares first (floor), then hand out the remainder
        // (total - sum of floors) one unit at a time, largest-fraction-first,
        // to the seats — deterministic tie-break by seat number ascending.
        const raw = seatNumbers.map((n) => {
          const subtotal = subtotalsBySeat.get(n)!;
          return (subtotal * total) / itemSubtotalSum;
        });
        let allocated = raw.reduce((sum, v) => sum + v, 0n);
        let leftover = total - allocated;
        const result = new Map<number, bigint>();
        seatNumbers.forEach((n, i) => result.set(n, raw[i]));
        let i = 0;
        while (leftover > 0n && seatNumbers.length > 0) {
          const n = seatNumbers[i % seatNumbers.length];
          result.set(n, result.get(n)! + 1n);
          leftover -= 1n;
          i++;
        }
        return result;
      }

      const discountBySeat = allocateProportional(discountTotal);
      const taxBySeat = allocateProportional(taxTotal);
      const serviceChargeBySeat = allocateProportional(serviceChargeTotal);
      const tipBySeat = allocateProportional(tipTotal);

      const results = await prisma.$transaction(async (tx) => {
        const rows: any[] = [];
        for (const seatNumber of seatNumbers) {
          const subtotal = subtotalsBySeat.get(seatNumber)!;
          const discount = discountBySeat.get(seatNumber)!;
          const tax = taxBySeat.get(seatNumber)!;
          const serviceCharge = serviceChargeBySeat.get(seatNumber)!;
          const tip = tipBySeat.get(seatNumber)!;
          const grandTotal = subtotal - discount + tax + serviceCharge + tip;

          const existing = await (tx as any).order_seat_bills.findFirst({
            where: { outlet_id: outletId, order_id: orderId, seat_number: seatNumber },
          });

          const row = existing
            ? await (tx as any).order_seat_bills.update({
                where: { id: existing.id },
                data: {
                  subtotal,
                  discount_total: discount,
                  tax_total: tax,
                  service_charge_total: serviceCharge,
                  tip_total: tip,
                  grand_total: grandTotal,
                  updated_at: new Date(),
                },
              })
            : await (tx as any).order_seat_bills.create({
                data: {
                  outlet_id: outletId,
                  order_id: orderId,
                  seat_number: seatNumber,
                  subtotal,
                  discount_total: discount,
                  tax_total: tax,
                  service_charge_total: serviceCharge,
                  tip_total: tip,
                  grand_total: grandTotal,
                  paid_total: 0n,
                  status: "PENDING",
                },
              });
          rows.push(row);
        }
        await (tx.order.update as any)({ where: { id: orderId }, data: { splitMode: "BY_SEAT" } });
        return rows;
      });

      res.status(200).json({
        ok: true,
        orderId,
        seats: results.map((r: any) => ({
          seatNumber: r.seat_number,
          subtotalMinor: r.subtotal.toString(),
          discountTotalMinor: r.discount_total.toString(),
          taxTotalMinor: r.tax_total.toString(),
          serviceChargeTotalMinor: r.service_charge_total.toString(),
          tipTotalMinor: r.tip_total.toString(),
          grandTotalMinor: r.grand_total.toString(),
          paidTotalMinor: r.paid_total.toString(),
          status: r.status,
        })),
      });
    } catch (err: any) {
      console.error("Error splitting bill by seat:", err);
      res.status(400).json({ error: err.message || "Failed to split bill by seat" });
    }
  }
);

// POST /orders/:id/seats/:seatNumber/settle - record a payment against one seat's bill
ordersRouter.post(
  "/orders/:id/seats/:seatNumber/settle",
  requireAuth,
  requirePermission("order.update"),
  async (req: AuthedRequest, res) => {
    try {
      const outletId = req.auth!.outletId;
      const userId = req.auth!.userId;
      const orderId = req.params.id;
      const seatNumber = Number(req.params.seatNumber);
      const method = req.body?.method || "CASH";

      const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const seatBill = await (prisma as any).order_seat_bills.findFirst({
        where: { outlet_id: outletId, order_id: orderId, seat_number: seatNumber },
      });
      if (!seatBill) {
        return res.status(404).json({ error: "No seat bill found — run split-by-seat first" });
      }

      const dueMinor = (seatBill.grand_total as bigint) - (seatBill.paid_total as bigint);
      const amountMinor: bigint = req.body?.amountMinor != null ? BigInt(req.body.amountMinor) : dueMinor;
      if (amountMinor <= 0n) {
        return res.status(400).json({ error: "amountMinor must be positive" });
      }

      let seatId: string | null = null;
      if (order.diningTableId) {
        const seatRow = await (prisma as any).table_seats.findFirst({
          where: { outlet_id: outletId, dining_table_id: order.diningTableId, seat_number: seatNumber },
        });
        seatId = seatRow?.id ?? null;
      }

      const { updatedSeatBill, allSettled } = await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            outletId,
            orderId,
            amount: amountMinor,
            method,
            status: "CAPTURED",
            seatNumber,
            seatId,
            orderSeatBillId: seatBill.id,
          } as any,
        });

        const newPaidTotal = (seatBill.paid_total as bigint) + amountMinor;
        const newStatus = newPaidTotal >= (seatBill.grand_total as bigint) ? "SETTLED" : "PENDING";
        const updated = await (tx as any).order_seat_bills.update({
          where: { id: seatBill.id },
          data: {
            paid_total: newPaidTotal,
            status: newStatus,
            settled_at: newStatus === "SETTLED" ? new Date() : seatBill.settled_at,
          },
        });

        const allBills = await (tx as any).order_seat_bills.findMany({
          where: { outlet_id: outletId, order_id: orderId },
        });
        const settled = allBills.length > 0 && allBills.every((b: any) => b.status === "SETTLED");
        return { updatedSeatBill: updated, allSettled: settled };
      });

      let settleResult: Awaited<ReturnType<typeof settleOrderCommand>> | null = null;
      if (allSettled) {
        // Converge with the existing all-at-once settlement path instead of
        // diverging into a separate "order fully paid via seats" code path:
        // per-seat Payment rows already sum to grandTotal, so this call
        // records no additional payment — it only advances order status,
        // writes the invoice, dissolves the merge group and deducts stock.
        settleResult = await settleOrderCommand(prisma, { outletId, orderId, userId });
      }

      res.status(200).json({
        ok: true,
        seatNumber,
        paidTotalMinor: updatedSeatBill.paid_total.toString(),
        grandTotalMinor: updatedSeatBill.grand_total.toString(),
        status: updatedSeatBill.status,
        orderSettled: allSettled,
        orderStatus: settleResult?.status ?? order.status,
      });
    } catch (err: any) {
      console.error("Error settling seat:", err);
      res.status(400).json({ error: err.message || "Failed to settle seat" });
    }
  }
);
