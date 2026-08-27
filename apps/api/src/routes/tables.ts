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
            status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"] },
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
              grandTotalPaise: Number(activeOrder.grandTotal || (activeOrder as any).grandTotalMinor || 0),
              totalAmount: Number(activeOrder.grandTotal || (activeOrder as any).grandTotalMinor || 0) / 100,
              guestCount: (activeOrder as any).guestCount || null,
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

// GET /tables/occupancy - Real-time table occupancy & floor capacity metrics
tablesRouter.get("/tables/occupancy", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tables = await prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      include: {
        orders: {
          where: {
            status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"] },
          },
          take: 1,
        },
      },
      orderBy: { tableNumber: "asc" },
    });

    const totalTables = tables.length;
    let occupiedTables = 0;
    let totalCapacity = 0;
    let occupiedCapacity = 0;

    const sectionMap = new Map<string, {
      section: string;
      totalTables: number;
      occupiedTables: number;
      vacantTables: number;
      totalCapacity: number;
      occupiedCapacity: number;
    }>();

    for (const t of tables) {
      const isOccupied = t.orders.length > 0 || t.status === "OCCUPIED" || t.status === "RESERVED";
      const cap = t.capacity || 4;
      totalCapacity += cap;

      if (isOccupied) {
        occupiedTables += 1;
        occupiedCapacity += cap;
      }

      const secName = t.section || "Main Floor";
      if (!sectionMap.has(secName)) {
        sectionMap.set(secName, {
          section: secName,
          totalTables: 0,
          occupiedTables: 0,
          vacantTables: 0,
          totalCapacity: 0,
          occupiedCapacity: 0,
        });
      }

      const sec = sectionMap.get(secName)!;
      sec.totalTables += 1;
      sec.totalCapacity += cap;
      if (isOccupied) {
        sec.occupiedTables += 1;
        sec.occupiedCapacity += cap;
      } else {
        sec.vacantTables += 1;
      }
    }

    const vacantTables = totalTables - occupiedTables;
    const occupancyRatePercent = totalTables > 0 ? (occupiedTables / totalTables) * 100 : 0;
    const capacityUtilizationPercent = totalCapacity > 0 ? (occupiedCapacity / totalCapacity) * 100 : 0;

    const sections = Array.from(sectionMap.values()).map((s) => ({
      ...s,
      occupancyRatePercent: s.totalTables > 0 ? Number(((s.occupiedTables / s.totalTables) * 100).toFixed(1)) : 0,
    }));

    res.status(200).json({
      outletId,
      totalTables,
      occupiedTables,
      vacantTables,
      occupancyRatePercent: Number(occupancyRatePercent.toFixed(1)),
      totalCapacity,
      occupiedCapacity,
      capacityUtilizationPercent: Number(capacityUtilizationPercent.toFixed(1)),
      sections,
    });
  } catch (err) {
    console.error("Error computing table occupancy:", err);
    res.status(500).json({ error: "Failed to compute table occupancy" });
  }
});

// POST /tables - Create a new dining table
tablesRouter.post("/tables", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { tableNumber, name, capacity, section } = req.body;
    const num = tableNumber || name;
    if (!num) {
      return res.status(400).json({ error: "Table number is required" });
    }

    const existing = await prisma.diningTable.findFirst({
      where: {
        outletId,
        tableNumber: String(num).trim(),
      },
    });

    if (existing) {
      if (!existing.isActive) {
        // Reactivate existing table
        const reactivated = await prisma.diningTable.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            capacity: capacity ? Number(capacity) : existing.capacity,
            section: section || existing.section,
          },
        });
        return res.status(201).json({
          id: reactivated.id,
          outletId: reactivated.outletId,
          tableNumber: reactivated.tableNumber,
          name: reactivated.tableNumber,
          capacity: reactivated.capacity,
          section: reactivated.section,
          status: reactivated.status,
          isActive: reactivated.isActive,
        });
      }
      return res.status(409).json({ error: `Table "${num}" already exists in this outlet.` });
    }

    const table = await prisma.diningTable.create({
      data: {
        outletId,
        tableNumber: String(num).trim(),
        capacity: capacity ? Number(capacity) : 4,
        section: section ? String(section).trim() : "Main Dining",
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

// GET /tables/sections - List distinct sections for the outlet
tablesRouter.get("/tables/sections", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tables = await prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      select: { section: true },
    });
    const sections = Array.from(new Set(tables.map((t) => t.section || "Main Hall"))).filter(Boolean);
    if (sections.length === 0) {
      sections.push("AC Dining", "Main Hall", "Outdoor Garden", "First Floor");
    }
    res.status(200).json(sections);
  } catch (err) {
    console.error("Error listing table sections:", err);
    res.status(500).json({ error: "Failed to list table sections" });
  }
});

// GET /tables/:id - Get table details
tablesRouter.get("/tables/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    if (req.params.id.length < 30) {
      return res.status(404).json({ error: "Table not found" });
    }
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

// POST /tables/transfer & POST /tables/:id/transfer - Transfer or merge active table orders
const handleTableTransfer = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const sourceTableId = req.params.id || req.body.sourceTableId;
    const targetTableId = req.body.targetTableId;
    const transferMode = req.body.transferMode || "FULL_TABLE";

    if (!sourceTableId || !targetTableId) {
      return res.status(400).json({ error: "Both sourceTableId and targetTableId are required" });
    }
    if (sourceTableId === targetTableId) {
      return res.status(400).json({ error: "Source and target table cannot be the same" });
    }

    const [sourceTable, targetTable] = await Promise.all([
      prisma.diningTable.findFirst({ where: { id: sourceTableId, outletId } }),
      prisma.diningTable.findFirst({ where: { id: targetTableId, outletId } }),
    ]);

    if (!sourceTable) {
      return res.status(404).json({ error: "Source table not found" });
    }
    if (!targetTable) {
      return res.status(404).json({ error: "Target table not found" });
    }

    // Find active order on source table
    const sourceOrder = await prisma.order.findFirst({
      where: {
        outletId,
        diningTableId: sourceTableId,
        status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sourceOrder) {
      return res.status(400).json({ error: `Table ${sourceTable.tableNumber} has no active running order to transfer.` });
    }

    // Move order to target table
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: sourceOrder.id },
        data: {
          diningTableId: targetTableId,
          table_number: targetTable.tableNumber,
        },
      });

      await tx.diningTable.update({
        where: { id: sourceTableId },
        data: { status: "VACANT" },
      });

      await tx.diningTable.update({
        where: { id: targetTableId },
        data: { status: "OCCUPIED" },
      });
    });

    res.status(200).json({
      success: true,
      transferredOrderId: sourceOrder.id,
      fromTable: sourceTable.tableNumber,
      toTable: targetTable.tableNumber,
      transferMode,
    });
  } catch (err: any) {
    console.error("Error transferring table:", err);
    res.status(500).json({ error: err.message || "Failed to transfer table" });
  }
};

tablesRouter.post("/tables/transfer", requireAuth, handleTableTransfer);
tablesRouter.post("/tables/:id/transfer", requireAuth, handleTableTransfer);

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
