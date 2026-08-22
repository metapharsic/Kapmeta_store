import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const prisma = new PrismaClient();
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
            status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "open", "running"] },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { tableNumber: "asc" },
    });

    const mapped = tables.map((t) => {
      const activeOrder = t.orders[0];
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
              grandTotalPaise: Number(activeOrder.grandTotalMinor),
              totalAmount: Number(activeOrder.grandTotalMinor) / 100,
              guestCount: activeOrder.guestCount,
              createdAt: activeOrder.createdAt,
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
tablesRouter.post("/tables", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { tableNumber, name, capacity, section } = req.body;
    const num = tableNumber || name;
    if (!num) {
      return res.status(400).json({ error: "tableNumber or name is required" });
    }

    const table = await prisma.diningTable.create({
      data: {
        outletId,
        tableNumber: String(num),
        capacity: capacity ? Number(capacity) : 4,
        section: section || "Main Hall",
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
  } catch (err) {
    console.error("Error creating table:", err);
    res.status(500).json({ error: "Failed to create table" });
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
tablesRouter.put("/tables/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
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
