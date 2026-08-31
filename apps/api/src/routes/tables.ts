import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

export const tablesRouter = Router();

// GET /tables - List all dining tables for the active outlet
tablesRouter.get("/tables", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tables = await prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      include: {
        orders: {
          where: {
            status: { notIn: ["COMPLETED", "CANCELLED", "VOIDED"] },
          },
          include: {
            kotTickets: true,
            orderItems: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { tableNumber: "asc" },
    });

    const mapped = tables.map((t) => {
      const activeOrder = t.orders[0];
      const hasKot = Boolean(
        (activeOrder?.kotTickets && activeOrder.kotTickets.length > 0) ||
        (activeOrder && ["CONFIRMED", "IN_KITCHEN", "READY", "KOT_CREATED", "IN_PREPARATION"].includes(activeOrder.status))
      );

      return {
        id: t.id,
        outletId: t.outletId,
        tableNumber: t.tableNumber,
        name: t.tableNumber,
        capacity: t.capacity,
        section: t.section,
        status: activeOrder ? (t.status === "VACANT" ? "OCCUPIED" : t.status) : t.status,
        isActive: t.isActive,
        activeOrderId: activeOrder?.id || null,
        active_order_id: activeOrder?.id || null,
        currentOrder: activeOrder
          ? {
              id: activeOrder.id,
              orderNumber: activeOrder.orderNumber,
              status: activeOrder.status,
              hasKot,
              kotSent: hasKot,
              grandTotalPaise: Number(activeOrder.grandTotalMinor),
              totalAmount: Number(activeOrder.grandTotalMinor) / 100,
              guestCount: activeOrder.guestCount,
              createdAt: activeOrder.createdAt,
              itemCount: activeOrder.orderItems?.length || 0,
            }
          : null,
      };
    });

    res.status(200).json(mapped);
  } catch (err) {
    console.error("Error listing tables:", err);
    res.status(500).json({ error: "Failed to list tables" });
  }
});

// POST /tables - Create a new dining table
tablesRouter.post("/tables", requireAuth, requirePermission("settings.manage", "order.create", "table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { tableNumber, name, capacity, section } = req.body;
    const num = tableNumber || name;
    if (!num) {
      return res.status(400).json({ error: "Table number is required" });
    }

    const trimmedNum = String(num).trim();

    const existing = await prisma.diningTable.findFirst({
      where: {
        outletId,
        tableNumber: { equals: trimmedNum, mode: "insensitive" },
      },
    });

    if (existing) {
      return res.status(409).json({ error: `Table "${trimmedNum}" already exists. Please choose a unique table number.` });
    }

    const table = await prisma.diningTable.create({
      data: {
        outletId,
        tableNumber: trimmedNum,
        capacity: capacity ? Number(capacity) : 4,
        section: section || "Main Dining",
        status: "VACANT",
      },
    });

    res.status(201).json({
      id: table.id,
      outletId: table.outletId,
      tableNumber: table.tableNumber,
      name: table.tableNumber,
      capacity: table.capacity,
      section: table.section,
      status: table.status,
      isActive: table.isActive,
    });
  } catch (err: any) {
    console.error("Error creating table:", err);
    res.status(500).json({ error: err.message || "Failed to create table" });
  }
});

// GET /tables/:id - Get table details
tablesRouter.get("/tables/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const table = await prisma.diningTable.findFirst({
      where: { id: req.params.id, outletId },
      include: {
        orders: {
          where: {
            status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "open", "running"] },
          },
          include: {
            items: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const activeOrder = table.orders[0];
    res.status(200).json({
      id: table.id,
      outletId: table.outletId,
      tableNumber: table.tableNumber,
      name: table.tableNumber,
      capacity: table.capacity,
      section: table.section,
      status: activeOrder ? (table.status === "VACANT" ? "OCCUPIED" : table.status) : table.status,
      isActive: table.isActive,
      activeOrderId: activeOrder?.id || null,
      active_order_id: activeOrder?.id || null,
      order: activeOrder || null,
    });
  } catch (err) {
    console.error("Error fetching table:", err);
    res.status(500).json({ error: "Failed to fetch table" });
  }
});

// PUT /tables/:id - Update table properties
tablesRouter.put("/tables/:id", requireAuth, requirePermission("settings.manage", "order.create", "table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;
    const { tableNumber, name, capacity, section, status } = req.body;
    const num = tableNumber || name;

    if (num) {
      const trimmed = String(num).trim();
      const existing = await prisma.diningTable.findFirst({
        where: {
          outletId,
          tableNumber: { equals: trimmed, mode: "insensitive" },
          NOT: { id },
        },
      });
      if (existing) {
        return res.status(409).json({ error: `Table "${trimmed}" already exists.` });
      }
    }

    const table = await prisma.diningTable.update({
      where: { id, outletId },
      data: {
        ...(num ? { tableNumber: String(num).trim() } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(section !== undefined ? { section } : {}),
        ...(status ? { status } : {}),
      },
    });

    res.status(200).json(table);
  } catch (err) {
    console.error("Error updating table:", err);
    res.status(500).json({ error: "Failed to update table" });
  }
});

// PATCH /tables/:id - Partial update table
tablesRouter.patch("/tables/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { tableNumber, name, capacity, section, status } = req.body;

    const table = await prisma.diningTable.update({
      where: { id: req.params.id, outletId },
      data: {
        ...(tableNumber || name ? { tableNumber: String(tableNumber || name) } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(section !== undefined ? { section } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    res.status(200).json(table);
  } catch (err) {
    console.error("Error patching table:", err);
    res.status(500).json({ error: "Failed to update table" });
  }
});

// POST & PATCH /tables/:id/status - Update table status
const handleTableStatus = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    const table = await prisma.diningTable.update({
      where: { id: req.params.id, outletId },
      data: { status },
    });

    res.status(200).json(table);
  } catch (err) {
    console.error("Error updating table status:", err);
    res.status(500).json({ error: "Failed to update table status" });
  }
};

tablesRouter.post("/tables/:id/status", requireAuth, handleTableStatus);
tablesRouter.patch("/tables/:id/status", requireAuth, handleTableStatus);

// POST /tables/:id/transfer - Transfer table
tablesRouter.post("/tables/:id/transfer", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const sourceTableId = req.params.id;
    const { targetTableId } = req.body;

    if (!targetTableId) {
      return res.status(400).json({ error: "targetTableId is required" });
    }

    // Find active order on source table
    const sourceOrder = await prisma.order.findFirst({
      where: {
        outletId,
        tableId: sourceTableId,
        status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "open", "running"] },
      },
    });

    if (!sourceOrder) {
      return res.status(400).json({ error: "Source table has no active order to transfer" });
    }

    // Move order to target table
    await prisma.$transaction([
      prisma.order.update({
        where: { id: sourceOrder.id },
        data: { tableId: targetTableId },
      }),
      prisma.diningTable.update({
        where: { id: sourceTableId },
        data: { status: "VACANT" },
      }),
      prisma.diningTable.update({
        where: { id: targetTableId },
        data: { status: "OCCUPIED" },
      }),
    ]);

    res.status(200).json({ success: true, transferredOrderId: sourceOrder.id });
  } catch (err) {
    console.error("Error transferring table:", err);
    res.status(500).json({ error: "Failed to transfer table" });
  }
});

// POST /tables/:id/vacate - Force clear/vacate a table and close any open orders
tablesRouter.post("/tables/:id/vacate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableParam = req.params.id;

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

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Complete any open non-completed orders on this table
    await prisma.order.updateMany({
      where: {
        outletId,
        diningTableId: table.id,
        status: { notIn: ["COMPLETED", "CANCELLED", "VOIDED"] },
      },
      data: { status: "COMPLETED" },
    });

    await prisma.diningTable.update({
      where: { id: table.id },
      data: { status: "VACANT" },
    });

    res.status(200).json({ success: true, tableId: table.id, status: "VACANT" });
  } catch (err: any) {
    console.error("Error vacating table:", err);
    res.status(500).json({ error: err.message || "Failed to vacate table" });
  }
});

// DELETE /tables/:id - Deactivate table
tablesRouter.delete("/tables/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    await prisma.diningTable.update({
      where: { id: req.params.id, outletId },
      data: { isActive: false },
    });
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting table:", err);
    res.status(500).json({ error: "Failed to delete table" });
  }
});

