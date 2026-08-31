import { Router } from "express";
import { prisma } from "../db";
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

const orderRepo = new PrismaOrderRepository(prisma);
const menuPriceLookup = new PrismaMenuPriceLookup(prisma);
const modifierPriceLookup = new PrismaModifierPriceLookup(prisma);

export const ordersRouter = Router();

// GET /orders - List orders with optional filters
ordersRouter.get("/orders", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { status, channel, orderType, page, limit, fromDate, toDate, search, orderNumber } = req.query;

    const filter: any = {};
    if (status) filter.status = status as OrderStatus;
    if (channel) filter.channel = channel as any;
    if (orderType) filter.orderType = orderType as any;
    if (page) filter.page = Number(page);
    if (limit) filter.limit = Number(limit);
    if (fromDate) filter.fromDate = new Date(String(fromDate));
    if (toDate) filter.toDate = new Date(String(toDate));
    if (search || orderNumber) {
      filter.orderNumberSearch = String(search || orderNumber).trim();
    }

    const orders = await listOrders(outletId, filter, orderRepo);
    const serialized = await Promise.all(
      orders.map(async (o: any) => {
        let customerPhone = null;
        let customerAddress = null;
        if (o.id) {
          try {
            const ord = await prisma.order.findUnique({
              where: { id: o.id },
              include: { customer: true },
            });
            if (ord?.customer) {
              customerPhone = ord.customer.phone || null;
              customerAddress = ord.customer.address || null;
            }
          } catch {}
        }
        return {
          ...o,
          customerPhone,
          customerAddress,
          grandTotalMinor: o.grandTotalMinor ? o.grandTotalMinor.toString() : "0",
          taxTotalMinor: o.taxTotalMinor ? o.taxTotalMinor.toString() : "0",
          discountTotalMinor: o.discountTotalMinor ? o.discountTotalMinor.toString() : "0",
        };
      })
    );
    res.status(200).json(serialized);
  } catch (err) {
    console.error("Error listing orders:", err);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// POST /orders - Create order
ordersRouter.post("/orders", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { isPaid, paymentMethod, diningTableId, tableNumber, ...rest } = req.body;

    // Resolve diningTableId from tableNumber if not directly provided
    let resolvedTableId = diningTableId;
    if (!resolvedTableId && tableNumber) {
      const foundTable = await prisma.diningTable.findFirst({
        where: {
          outletId,
          tableNumber: { equals: String(tableNumber).trim(), mode: "insensitive" },
        },
      });
      if (foundTable) {
        resolvedTableId = foundTable.id;
      }
    }

    const rawLines = req.body.lines || req.body.items || [];
    const lines = Array.isArray(rawLines)
      ? rawLines.map((it: any) => ({
          menuItemId: String(it.menuItemId || it.id || ""),
          quantity: Number(it.quantity || 1),
          notes: it.notes || null,
          course: it.course || undefined,
          seatNumber: it.seatNumber || undefined,
          modifierOptionIds: Array.isArray(it.modifierOptionIds) ? it.modifierOptionIds : [],
        }))
      : [];

    const input: CreateOrderInput = {
      outletId,
      terminalNumber: req.body.terminalNumber || "TERM-01",
      orderType: req.body.orderType || "DINE_IN",
      idempotencyKey: req.body.idempotencyKey || `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      lines,
      diningTableId: resolvedTableId || undefined,
      waiterId: req.body.waiterId || undefined,
      customerId: req.body.customerId || undefined,
    };

    const result = await createOrder(input, menuPriceLookup, orderRepo, modifierPriceLookup);

    // Link or create customer record if customer info provided
    if (result.id && (req.body.customerPhone || req.body.customerName)) {
      try {
        let customer = await prisma.customer.findFirst({
          where: {
            outletId,
            phone: req.body.customerPhone || "0000000000",
          },
        });
        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              outletId,
              firstName: req.body.customerName || "Customer",
              phone: req.body.customerPhone || null,
              address: [req.body.customerAddress, req.body.customerLocality].filter(Boolean).join(", ") || null,
            },
          });
        }
        await prisma.order.update({
          where: { id: result.id },
          data: { customerId: customer.id },
        });
      } catch (custErr) {
        console.warn("Customer linking failed:", custErr);
      }
    }

    // Automatically generate KOT tickets for the kitchen KDS
    if (result.id) {
      await onOrderConfirmed(result.id, prisma).catch(() => {});
      try {
        const { broadcast } = await import("../websockets");
        broadcast("kot.created", { orderId: result.id });
      } catch {}
    }

    // If order was created as immediately paid at POS counter (Print & EBill with It's Paid)
    if (isPaid && result.id) {
      try {
        const orderRecord = await prisma.order.findUnique({ where: { id: result.id } });
        const grandTotalPaise = orderRecord?.grandTotal || 0n;

        // Record payment
        await prisma.payment.create({
          data: {
            outletId,
            orderId: result.id,
            amount: grandTotalPaise,
            method: paymentMethod || "CASH",
            status: "CAPTURED",
          },
        }).catch(() => {});

        // Mark order as COMPLETED and vacate table
        await prisma.order.update({
          where: { id: result.id },
          data: { status: "COMPLETED" },
        });

        if (resolvedTableId) {
          await prisma.diningTable.update({
            where: { id: resolvedTableId },
            data: { status: "VACANT" },
          }).catch(() => {});
        }

        await onOrderCompleted(result.id, prisma).catch(() => {});
      } catch (payErr) {
        console.warn("Auto-settle on create encountered non-fatal error:", payErr);
      }
    }

    const finalOrder = await prisma.order.findUnique({
      where: { id: result.id },
      include: { kotTickets: true },
    }).catch(() => null);

    res.status(201).json({
      ...result,
      orderNumber: finalOrder?.orderNumber || "",
      kotTicketNumber: finalOrder?.kotTickets?.[0]?.ticketNumber || "",
    });
  } catch (err: any) {
    console.error("Error creating order:", err);
    if (err.message && err.message.includes("Idempotency conflict")) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || "Failed to create order" });
  }
});

// GET /orders/by-table/:tableId/active - Get live active order for table
ordersRouter.get("/orders/by-table/:tableId/active", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableParam = req.params.tableId;

    // First resolve the exact dining table record if exists
    const table = await prisma.diningTable.findFirst({
      where: {
        outletId,
        OR: [
          { id: tableParam },
          { id: tableParam.toLowerCase() },
          { tableNumber: tableParam },
          { tableNumber: tableParam.toUpperCase() },
          { tableNumber: tableParam.toLowerCase() },
        ],
      },
    });

    const targetTableId = table?.id || tableParam;
    const targetTableNumber = table?.tableNumber || tableParam;

    // Search by table ID or tableNumber
    const liveOrder = await prisma.order.findFirst({
      where: {
        outletId,
        OR: [
          { diningTableId: targetTableId },
          { diningTableId: targetTableId.toLowerCase() },
          { diningTableId: targetTableNumber },
          { diningTableId: targetTableNumber.toUpperCase() },
          { diningTableId: targetTableNumber.toLowerCase() },
          { diningTableId: `tbl_${targetTableNumber.toLowerCase()}` },
          { diningTable: { tableNumber: targetTableNumber } },
          { diningTable: { tableNumber: targetTableNumber.toUpperCase() } },
          { diningTable: { id: targetTableId } },
        ],
        status: { notIn: ["COMPLETED", "CANCELLED", "FAILED", "VOIDED", "SETTLED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!liveOrder) {
      return res.status(404).json({ error: "No active order for table" });
    }

    const detail = await getOrderDetail(outletId, liveOrder.id, orderRepo);
    res.status(200).json(detail);
  } catch (err) {
    console.error("Error fetching live order for table:", err);
    res.status(500).json({ error: "Failed to fetch live order" });
  }
});

// GET /orders/:id - Get order detail
ordersRouter.get("/orders/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
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

    let result = await transitionOrder(
      req.params.id,
      toStatus as OrderStatus,
      orderRepo,
      userId,
      reasonCode,
      approverUserId
    );

    // Direct Cashier POS bill settlement override:
    // If cashier settles/completes a bill directly from POS register, allow transition to COMPLETED
    if (!result.ok && (toStatus === "COMPLETED" || toStatus === "SETTLED")) {
      await prisma.order.update({
        where: { id: req.params.id },
        data: { status: "COMPLETED" },
      });
      await prisma.orderStatusHistory.create({
        data: {
          outletId: req.auth!.outletId,
          orderId: req.params.id,
          status: "COMPLETED",
        },
      }).catch(() => {});
      result = { ok: true, newStatus: "COMPLETED" };
    } else if (!result.ok) {
      return res.status(400).json({ error: `Illegal transition: ${result.reason}` });
    }

    // Lifecycle triggers
    if (toStatus === "CONFIRMED") {
      await onOrderConfirmed(req.params.id, prisma);
    } else if (toStatus === "COMPLETED" || toStatus === "SETTLED") {
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
