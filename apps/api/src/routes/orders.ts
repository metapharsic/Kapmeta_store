import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import {
  createOrder,
  transitionOrder,
  listOrders,
  getOrderDetail,
  addOrderItems,
  PrismaOrderRepository,
  PrismaMenuPriceLookup,
  PrismaModifierPriceLookup,
} from "@kapmeta/orders";
import type { OrderStatus, CreateOrderInput } from "@kapmeta/shared-types/orders";
import { onOrderConfirmed, onOrderCompleted } from "../orchestration/order-lifecycle";

const prisma = new PrismaClient();
const orderRepo = new PrismaOrderRepository(prisma);
const menuPriceLookup = new PrismaMenuPriceLookup(prisma);
const modifierPriceLookup = new PrismaModifierPriceLookup(prisma);

export const ordersRouter = Router();

// GET /orders - List orders with optional filters
ordersRouter.get("/orders", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { status, channel, orderType, page, limit, fromDate, toDate } = req.query;

    const filter: any = {};
    if (status) filter.status = status as OrderStatus;
    if (channel) filter.channel = channel as any;
    if (orderType) filter.orderType = orderType as any;
    if (page) filter.page = Number(page);
    if (limit) filter.limit = Number(limit);
    if (fromDate) filter.fromDate = new Date(String(fromDate));
    if (toDate) filter.toDate = new Date(String(toDate));

    const orders = await listOrders(outletId, filter, orderRepo);
    res.status(200).json(orders);
  } catch (err) {
    console.error("Error listing orders:", err);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// POST /orders - Create order
ordersRouter.post("/orders", requireAuth, async (req: AuthedRequest, res) => {
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

    // Auto-resolve diningTableId if tableNumber is provided but diningTableId is missing
    let diningTableId = body.diningTableId || undefined;
    if (!diningTableId && body.tableNumber) {
      const table = await prisma.diningTable.findFirst({
        where: {
          outletId,
          tableNumber: String(body.tableNumber),
        },
      });
      if (table) {
        diningTableId = table.id;
      }
    }

    const orderType = body.orderType === "PICKUP" ? "TAKEAWAY" : (body.orderType || "DINE_IN");
    const idempotencyKey = body.idempotencyKey || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const input: CreateOrderInput = {
      outletId,
      terminalNumber: body.terminalNumber || "POS-01",
      orderType,
      idempotencyKey,
      lines,
      diningTableId,
      customerId: body.customerId || undefined,
      waiterId: body.waiterId || undefined,
    };

    const result = await createOrder(input, menuPriceLookup, orderRepo, modifierPriceLookup);

    // If KOT creation requested (action: "KOT" or status: "ACTIVE" or "KOT_CREATED"):
    if (body.action === "KOT" || body.status === "ACTIVE" || body.status === "KOT_CREATED") {
      await transitionOrder(result.id, "CONFIRMED", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "KOT_CREATED", orderRepo, req.auth!.userId);
    }
    // If Bill / Immediate Settlement requested (action: "BILL" or isPaid: true or status: "COMPLETED"):
    else if (body.action === "BILL" || body.isPaid || body.status === "COMPLETED") {
      await transitionOrder(result.id, "CONFIRMED", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "KOT_CREATED", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "IN_PREPARATION", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "READY", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "HANDED_OVER", orderRepo, req.auth!.userId);
      await transitionOrder(result.id, "COMPLETED", orderRepo, req.auth!.userId);

      // Record payment
      if (body.paymentMethod) {
        const orderDetail = await getOrderDetail(outletId, result.id, orderRepo);
        if (orderDetail) {
          await orderRepo.recordPayment(
            outletId,
            result.id,
            orderDetail.grandTotalMinor,
            body.paymentMethod,
            req.auth!.userId
          );
        }
      }

      // Free table if dine-in
      if (diningTableId) {
        await prisma.diningTable.update({
          where: { id: diningTableId },
          data: { status: "AVAILABLE" },
        });
      }
    }

    const orderDetail = await getOrderDetail(outletId, result.id, orderRepo);

    res.status(201).json({
      id: result.id,
      orderNumber: orderDetail?.orderNumber || "NEW",
      status: orderDetail?.status || result.status,
      grandTotalMinor: orderDetail ? String(orderDetail.grandTotalMinor) : "0",
      taxTotalMinor: orderDetail ? String(orderDetail.taxTotalMinor) : "0",
      subtotalMinor: orderDetail ? String(orderDetail.subtotalMinor) : "0",
      diningTableId,
      items: orderDetail?.items || [],
      ...result,
    });
  } catch (err: any) {
    console.error("Error creating order:", err);
    if (err.message && err.message.includes("Idempotency conflict")) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || "Failed to create order" });
  }
});

// GET /orders/live - Get all active/live orders in preparation or on tables
ordersRouter.get("/orders/live", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const activeOrders = await prisma.order.findMany({
      where: {
        outletId,
        status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"] },
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

// GET /orders/:id - Get order detail
ordersRouter.get("/orders/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    if (req.params.id.length < 30) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = await getOrderDetail(outletId, req.params.id, orderRepo);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(200).json(order);
  } catch (err) {
    console.error("Error fetching order detail:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// PATCH /orders/:id/status - Status transition
ordersRouter.patch("/orders/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.auth!.userId;
    const { toStatus, reasonCode, approverUserId } = req.body;

    if (!toStatus) {
      return res.status(400).json({ error: "toStatus is required" });
    }

    const result = await transitionOrder(
      req.params.id,
      toStatus as OrderStatus,
      orderRepo,
      userId,
      reasonCode,
      approverUserId
    );

    if (!result.ok) {
      return res.status(400).json({ error: `Illegal transition: ${result.reason}` });
    }

    // Lifecycle triggers
    if (toStatus === "CONFIRMED") {
      await onOrderConfirmed(req.params.id, prisma);
    } else if (toStatus === "COMPLETED") {
      await onOrderCompleted(req.params.id, prisma);
      // Reset table to VACANT if Dine-In
      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (order?.diningTableId) {
        await prisma.diningTable.update({
          where: { id: order.diningTableId },
          data: { status: "VACANT" },
        }).catch(() => {});
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
    res.status(200).json(bill);
  } catch (err) {
    console.error("Error fetching bill:", err);
    res.status(500).json({ error: "Failed to fetch bill" });
  }
});

// POST /orders/:id/payments - Record payment
ordersRouter.post("/orders/:id/payments", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { amountMinor, method, seatNumber } = req.body;

    if (!amountMinor || !method) {
      return res.status(400).json({ error: "amountMinor and method are required" });
    }

    const payment = await orderRepo.recordPayment(
      outletId,
      req.params.id,
      BigInt(amountMinor),
      method,
      userId,
      seatNumber
    );

    res.status(201).json(payment);
  } catch (err: any) {
    console.error("Error recording payment:", err);
    res.status(400).json({ error: err.message || "Failed to record payment" });
  }
});

// POST /orders/:id/items - Add items to existing running order
ordersRouter.post("/orders/:id/items", requireAuth, async (req: AuthedRequest, res) => {
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
    res.status(200).json(added);
  } catch (err: any) {
    console.error("Error adding items to order:", err);
    res.status(400).json({ error: err.message || "Failed to add items" });
  }
});

// POST /orders/:id/items/:itemId/void - Void an item from order
ordersRouter.post("/orders/:id/items/:itemId/void", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { reasonCode } = req.body;

    if (!reasonCode) {
      return res.status(400).json({ error: "reasonCode is required to void item" });
    }

    const result = await orderRepo.voidItem(
      outletId,
      req.params.id,
      req.params.itemId,
      reasonCode,
      userId
    );
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error voiding order item:", err);
    res.status(400).json({ error: err.message || "Failed to void item" });
  }
});

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
    res.status(200).json(updated);
  } catch (err: any) {
    console.error("Error applying charges:", err);
    res.status(400).json({ error: err.message || "Failed to apply charges" });
  }
};

ordersRouter.post("/orders/:id/charges", requireAuth, handleCharges);
ordersRouter.patch("/orders/:id/charges", requireAuth, handleCharges);
