import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import { transitionOrder, PrismaOrderRepository } from "@kapmeta/orders";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";
import {
  applyMergeGroup,
  dissolveMergeGroupForTable,
  dissolvePaidEmptyMergeGroups,
  expandMergeMemberIds,
  findLiveOrdersOnTables,
  foldOrdersInto,
  formatMergedTableLabel,
  resolveAnchorTable,
  stampOrderMergeLabel,
} from "../orchestration/table-merge";

const orderRepo = new PrismaOrderRepository(prisma);
export const tablesRouter = Router();

const OPEN_ORDER_STATUSES = [
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "KOT_CREATED",
  "IN_PREPARATION",
  "READY",
  "SERVED",
  "HANDED_OVER",
] as const;

const QUEUED_KOT_STATUSES = new Set(["QUEUED", "KOT_CREATED", "PENDING"]);
const COOKING_KOT_STATUSES = new Set(["PREPARING", "IN_PREPARATION", "COOKING"]);

function isLiveFloorSession(order: any): boolean {
  const kots = order.kotTickets || [];
  const items = order.orderItems || [];
  if (kots.some((k: any) => k.status !== "CANCELLED")) return true;
  if (order.status === "DRAFT" && items.length > 0) return true;
  if (order.status === "SERVED" || order.status === "HANDED_OVER") return true;
  return false;
}

function deriveKitchenStage(activeOrder: any): "QUEUED" | "COOKING" | "READY" | "SERVED" | null {
  const kots = activeOrder.kotTickets || [];
  if (kots.some((k: any) => k.status === "READY")) return "READY";
  if (kots.some((k: any) => COOKING_KOT_STATUSES.has(k.status))) return "COOKING";
  if (kots.some((k: any) => QUEUED_KOT_STATUSES.has(k.status))) return "QUEUED";
  if (
    (kots.some((k: any) => k.status === "SERVED") && kots.every((k: any) => k.status === "SERVED" || k.status === "CANCELLED")) ||
    activeOrder.status === "SERVED" ||
    activeOrder.status === "HANDED_OVER"
  ) {
    return "SERVED";
  }
  return null;
}

function deriveFloorStatus(activeOrder: any): "RUNNING" | "RUNNING_KOT" | "PRINTED" | "PAID" {
  const kots = activeOrder.kotTickets || [];
  if (activeOrder.status === "PAID" || activeOrder.status === "SETTLED") return "PAID";
  if (activeOrder.status === "PRINTED" || activeOrder.status === "BILLING") return "PRINTED";
  if (kots.some((k: any) => k.status !== "CANCELLED")) return "RUNNING_KOT";
  return "RUNNING";
}

function serializeCurrentOrder(activeOrder: any) {
  return {
    id: activeOrder.id,
    orderNumber: activeOrder.orderNumber,
    status: activeOrder.status,
    grandTotalPaise: Number(activeOrder.grandTotal || (activeOrder as any).grandTotalMinor || 0),
    totalAmount: Number(activeOrder.grandTotal || (activeOrder as any).grandTotalMinor || 0) / 100,
    guestCount: (activeOrder as any).guestCount || null,
    createdAt: activeOrder.createdAt,
    kots: (activeOrder.kotTickets || []).map((k: any) => ({
      id: k.id,
      ticketNumber: k.ticketNumber,
      status: k.status,
      createdAt: k.createdAt,
      items: (k.kotItems || []).map((ki: any) => ({
        id: ki.id,
        name: ki.menuItem?.name || ki.notes || "Item",
        quantity: ki.quantity,
        status: ki.status || k.status,
      })),
    })),
    items: (activeOrder.orderItems || []).map((oi: any) => ({
      id: oi.id,
      menuItemId: oi.menuItemId,
      menuItemName: oi.menuItem?.name || oi.item_name || "Item",
      quantity: oi.quantity,
      unitPriceMinor: Number(oi.unitPrice || oi.unitPriceMinor || 0),
      subtotalMinor: Number(oi.subtotal || oi.subtotalMinor || 0),
      notes: oi.notes,
    })),
  };
}

function mergeFieldsForTable(t: any, members: any[]) {
  const group = members.length > 0 ? members : [t];
  return {
    mergeGroupId: t.mergeGroupId || null,
    mergePrimaryTableId: t.mergePrimaryTableId || null,
    mergedWith: group.map((m: any) => m.tableNumber),
    isMergePrimary: Boolean(t.mergeGroupId) && t.id === t.mergePrimaryTableId,
    groupCapacity: group.reduce((sum: number, m: any) => sum + (m.capacity || 0), 0),
  };
}

// Returns one blocker entry per member table whose active order has a printed
// (PRINTED/BILLING status) or partially-paid (some captured payment, less than
// grandTotal) bill. Used to hard-block both /tables/merge and the preview.
async function findBillPrintedBlockers(
  prismaClient: any,
  outletId: string,
  tableIds: string[]
): Promise<{ tableId: string; orderId: string; reason: "BILL_PRINTED" | "PARTIALLY_PAID" }[]> {
  if (tableIds.length === 0) return [];
  const orders = await prismaClient.order.findMany({
    where: {
      outletId,
      diningTableId: { in: tableIds },
      status: { in: [...OPEN_ORDER_STATUSES, "PRINTED", "BILLING"] },
    },
    select: { id: true, diningTableId: true, status: true, grandTotal: true },
  });
  const blockers: { tableId: string; orderId: string; reason: "BILL_PRINTED" | "PARTIALLY_PAID" }[] = [];
  for (const o of orders) {
    if (o.status === "PRINTED" || o.status === "BILLING") {
      blockers.push({ tableId: o.diningTableId, orderId: o.id, reason: "BILL_PRINTED" });
      continue;
    }
    const paidAgg = await prismaClient.payment.aggregate({
      where: { outletId, orderId: o.id, status: "CAPTURED" },
      _sum: { amount: true },
    });
    const paidAmt = BigInt(paidAgg._sum?.amount || 0);
    const grand = BigInt(o.grandTotal || 0);
    if (paidAmt > 0n && paidAmt < grand) {
      blockers.push({ tableId: o.diningTableId, orderId: o.id, reason: "PARTIALLY_PAID" });
    }
  }
  return blockers;
}

// Idempotency-key dedupe (table_operation_idempotency, migration 0037). The model
// isn't in the generated Prisma client yet in this environment (no `prisma generate`
// run this session — see menu-catalog-repository.ts's linkModifierToItem for the
// same situation), so every call is cast through `as any`, matching that pattern.
async function findIdempotentResponse(
  prismaClient: any,
  outletId: string,
  endpoint: string,
  key: string | undefined | null
): Promise<any | null> {
  if (!key) return null;
  const row = await (prismaClient as any).table_operation_idempotency
    .findFirst({ where: { outlet_id: outletId, endpoint, idempotency_key: key } })
    .catch(() => null);
  return row ? row.response_json : null;
}

async function storeIdempotentResponse(
  prismaClient: any,
  outletId: string,
  endpoint: string,
  key: string | undefined | null,
  response: any
): Promise<void> {
  if (!key) return;
  await (prismaClient as any).table_operation_idempotency
    .create({ data: { outlet_id: outletId, endpoint, idempotency_key: key, response_json: response } })
    .catch(() => undefined);
}

// GET /tables/merge-groups - Reports merge groups; explicitly dissolves paid/empty ones (read+cleanup, not tied to the hot GET /tables poll)
tablesRouter.get("/tables/merge-groups", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const dissolvedOrphans = await dissolvePaidEmptyMergeGroups(prisma, outletId);
    const tables = await (prisma.diningTable as any).findMany({
      where: { outletId, isActive: true, mergeGroupId: { not: null } },
      orderBy: { tableNumber: "asc" },
    });
    const groups = new Map<string, any[]>();
    for (const t of tables) {
      if (!t.mergeGroupId) continue;
      const arr = groups.get(t.mergeGroupId) || [];
      arr.push(t);
      groups.set(t.mergeGroupId, arr);
    }
    res.status(200).json({
      dissolvedOrphans,
      mergeGroups: Array.from(groups.entries()).map(([mergeGroupId, members]) => ({
        mergeGroupId,
        primaryTableId: members.find((m: any) => m.id === m.mergePrimaryTableId)?.id || members[0]?.mergePrimaryTableId || null,
        memberTableIds: members.map((m: any) => m.id),
        memberTableNumbers: members.map((m: any) => m.tableNumber),
      })),
    });
  } catch (err: any) {
    console.error("Error fetching merge groups:", err);
    res.status(500).json({ error: err.message || "Failed to fetch merge groups" });
  }
});

// GET /tables - Occupancy is a projection of open orders, never stored dining_tables.status alone
tablesRouter.get("/tables", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tables = await (prisma.diningTable as any).findMany({
      where: { outletId, isActive: true },
      orderBy: { tableNumber: "asc" },
    });

    const tableIds = tables.map((t: any) => t.id);
    const activeOrders = await (prisma.order as any).findMany({
      where: {
        outletId,
        diningTableId: { in: tableIds },
        status: { in: [...OPEN_ORDER_STATUSES] },
      },
      include: {
        kotTickets: {
          include: {
            kotItems: {
              include: {
                menuItem: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        orderItems: {
          include: {
            menuItem: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const orderMap = new Map<string, any>();
    activeOrders.forEach((ord: any) => {
      if (ord.diningTableId && isLiveFloorSession(ord) && !orderMap.has(ord.diningTableId)) {
        orderMap.set(ord.diningTableId, ord);
      }
    });

    const groupMembers = new Map<string, any[]>();
    for (const t of tables) {
      if (!t.mergeGroupId) continue;
      const arr = groupMembers.get(t.mergeGroupId) || [];
      arr.push(t);
      groupMembers.set(t.mergeGroupId, arr);
    }

    const orderForTable = (t: any) => {
      const own = orderMap.get(t.id);
      if (own) return own;
      if (t.mergePrimaryTableId) return orderMap.get(t.mergePrimaryTableId) || null;
      if (t.mergeGroupId) {
        const members = groupMembers.get(t.mergeGroupId) || [];
        const primary = members.find((m: any) => m.id === t.mergePrimaryTableId) || members[0];
        if (primary) return orderMap.get(primary.id) || null;
      }
      return null;
    };

    const occupiedNoOrder = tables.filter(
      (t: any) => t.status !== "VACANT" && !orderForTable(t) && !t.mergeGroupId
    );
    const vacantWithOrder = tables.filter((t: any) => t.status === "VACANT" && orderMap.has(t.id));

    if (occupiedNoOrder.length > 0) {
      await prisma.diningTable.updateMany({
        where: { id: { in: occupiedNoOrder.map((t: any) => t.id) } },
        data: { status: "VACANT" },
      }).catch(() => {});
    }
    if (vacantWithOrder.length > 0) {
      await prisma.diningTable.updateMany({
        where: { id: { in: vacantWithOrder.map((t: any) => t.id) } },
        data: { status: "OCCUPIED" },
      }).catch(() => {});
    }

    const mapped = tables.map((t: any) => {
      const members = t.mergeGroupId ? groupMembers.get(t.mergeGroupId) || [t] : [t];
      const extra = mergeFieldsForTable(t, members);
      const activeOrder = orderForTable(t);
      if (!activeOrder) {
        return {
          id: t.id,
          outletId: t.outletId,
          tableNumber: t.tableNumber,
          name: t.tableNumber,
          capacity: extra.groupCapacity || t.capacity,
          section: t.section,
          status: t.mergeGroupId ? "RUNNING" : "VACANT",
          kitchenStage: null,
          isActive: t.isActive,
          activeOrderId: null,
          active_order_id: null,
          currentOrder: null,
          ...extra,
        };
      }

      const kitchenStage = deriveKitchenStage(activeOrder);
      const computedStatus = deriveFloorStatus(activeOrder);

      return {
        id: t.id,
        outletId: t.outletId,
        tableNumber: t.tableNumber,
        name: t.tableNumber,
        capacity: extra.groupCapacity || t.capacity,
        section: t.section,
        status: computedStatus,
        kitchenStage,
        isActive: t.isActive,
        activeOrderId: activeOrder.id,
        active_order_id: activeOrder.id,
        currentOrder: serializeCurrentOrder(activeOrder),
        ...extra,
      };
    });


    res.status(200).json(mapped);
  } catch (err) {
    console.error("Error listing tables:", err);
    res.status(500).json({ error: "Failed to list tables" });
  }
});

// POST /tables/:id/vacant - Explicitly release and mark table as VACANT
tablesRouter.post("/tables/:id/vacant", requireAuth, requirePermission("table.session.close"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;

    const table = await prisma.diningTable.findFirst({
      where: { id: tableId, outletId },
    });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const anchor = await resolveAnchorTable(prisma, outletId, tableId);
    const liveOrders = await findLiveOrdersOnTables(prisma, outletId, [anchor?.id || tableId]);
    const liveOrder = liveOrders[0];
    if (liveOrder) {
      const bill = await orderRepo.getBill(outletId, liveOrder.id).catch(() => null);
      const due = bill ? Number(bill.dueMinor || 0) : Number(liveOrder.grandTotal || 0);
      if (due > 0) {
        return res.status(409).json({
          error: "Table has an unpaid running order. Collect payment before vacating.",
        });
      }
    }

    const dissolved = await dissolveMergeGroupForTable(prisma, outletId, tableId);
    const vacatedIds = dissolved.ids.length > 0 ? dissolved.ids : [tableId];

    await (prisma.order as any).updateMany({
      where: {
        outletId,
        diningTableId: { in: vacatedIds },
        status: { in: ["SERVED", "HANDED_OVER", "COMPLETED", "SETTLED", "PAID"] },
      },
      data: {
        diningTableId: null,
      },
    }).catch(() => {});

    import("../websockets").then(({ broadcast }) => {
      for (const id of vacatedIds) {
        broadcast(outletId, "table.status_updated", {
          tableId: id,
          status: "VACANT",
          stage: null,
        });
      }
    }).catch(() => {});

    res.status(200).json({
      ok: true,
      message: `Table ${table.tableNumber} is now marked VACANT.`,
      tableId,
      vacatedTableIds: vacatedIds,
      status: "VACANT",
    });
  } catch (err: any) {
    console.error("Error vacating table:", err);
    res.status(500).json({ error: err.message || "Failed to vacate table" });
  }
});

// POST /tables/:id/serve - Mark all ready KOTs for a table as SERVED and deduct BOM stock
tablesRouter.post("/tables/:id/serve", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;
    const userId = req.auth!.userId;

    const table = await prisma.diningTable.findFirst({
      where: { id: tableId, outletId },
    });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const anchor = await resolveAnchorTable(prisma, outletId, tableId);
    const activeOrder = await (prisma.order as any).findFirst({
      where: {
        outletId,
        diningTableId: anchor?.id || tableId,
        status: { in: ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED"] },
      },
      include: {
        kotTickets: {
          where: { status: { notIn: ["CANCELLED", "SERVED"] } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeOrder) {
      return res.status(404).json({ error: "Active table order not found" });
    }

    const kotsToServe = (activeOrder.kotTickets || []).filter((k: any) => k.status === "READY");
    if (kotsToServe.length === 0) {
      return res.status(409).json({ error: "No READY tickets to serve. Wait until kitchen marks food ready." });
    }

    // Transition READY KOT tickets to SERVED only — queued/cooking stay live
    for (const kot of kotsToServe) {
      await prisma.kOTTicket.update({
        where: { id: kot.id },
        data: { status: "SERVED", servedAt: new Date() },
      }).catch(() => {});
    }

    // Update order status to SERVED only when no queued/cooking tickets remain
    const leftover = (activeOrder.kotTickets || []).filter(
      (k: any) => k.status !== "CANCELLED" && k.status !== "READY" && k.status !== "SERVED"
    );
    const stillCooking = leftover.length > 0;
    if (
      !stillCooking &&
      activeOrder.status !== "COMPLETED" &&
      activeOrder.status !== "SETTLED" &&
      activeOrder.status !== "PAID"
    ) {
      await transitionOrder(activeOrder.id, "SERVED" as any, orderRepo, userId).catch(() => {});
    }
    const stage = stillCooking
      ? deriveKitchenStage({ kotTickets: leftover, status: activeOrder.status }) || "QUEUED"
      : "SERVED";

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "kot.status_updated", {
        kotTicketIds: kotsToServe.map((k: any) => k.id),
        status: "SERVED",
        tableId,
        orderId: activeOrder.id,
      });
      broadcast(outletId, "table.status_updated", {
        tableId,
        orderId: activeOrder.id,
        stage,
      });
      broadcast(outletId, "order.status_updated", {
        orderId: activeOrder.id,
        tableId,
        stage,
      });
    }).catch(() => {});

    res.status(200).json({
      ok: true,
      message: stillCooking
        ? `Ready food for Table ${table.tableNumber} served. Other tickets still in kitchen.`
        : `All food for Table ${table.tableNumber} is marked SERVED.`,
      servedKotsCount: kotsToServe.length,
      stage,
    });
  } catch (err: any) {
    console.error("Error serving table food:", err);
    res.status(500).json({ error: err.message || "Failed to mark food served" });
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
            status: { in: [...OPEN_ORDER_STATUSES] },
          },
          include: {
            kotTickets: true,
            orderItems: true,
          },
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
      const isOccupied =
        Boolean((t as any).mergeGroupId) || t.orders.some((ord: any) => isLiveFloorSession(ord));
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
tablesRouter.post("/tables", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
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
            status: "VACANT",
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
          status: "VACANT",
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

// GET /tables/sections - List areas for the outlet.
// Response shape: kept as a plain array of strings (area names) for backward
// compatibility with existing callers that expect `string[]`. Areas are now a
// real entity backed by the `areas` table (see POST/PATCH/DELETE below); the
// no-longer-needed hardcoded fallback array has been removed per the
// "no hardcoded business data" invariant in .agents/AGENTS.md. If a caller
// needs ids too, use the new endpoints, which return full area objects.
tablesRouter.get("/tables/sections", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const areaRows = await prisma.areas.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    });
    const sections = areaRows.map((a) => a.name);
    res.status(200).json(sections);
  } catch (err) {
    console.error("Error listing table sections:", err);
    res.status(500).json({ error: "Failed to list table sections" });
  }
});

// POST /tables/sections - Create a new area
tablesRouter.post("/tables/sections", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { name, sortOrder } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Area name is required" });
    }

    const existing = await prisma.areas.findFirst({
      where: { outlet_id: outletId, name: String(name).trim() },
    });
    if (existing) {
      if (!existing.is_active) {
        const reactivated = await prisma.areas.update({
          where: { id: existing.id },
          data: { is_active: true },
        });
        return res.status(201).json({
          id: reactivated.id,
          outletId: reactivated.outlet_id,
          name: reactivated.name,
          sortOrder: reactivated.sort_order,
          isActive: reactivated.is_active,
        });
      }
      return res.status(409).json({ error: `Area "${name}" already exists in this outlet.` });
    }

    const area = await prisma.areas.create({
      data: {
        outlet_id: outletId,
        name: String(name).trim(),
        sort_order: sortOrder ? Number(sortOrder) : 0,
      },
    });

    res.status(201).json({
      id: area.id,
      outletId: area.outlet_id,
      name: area.name,
      sortOrder: area.sort_order,
      isActive: area.is_active,
    });
  } catch (err: any) {
    console.error("Error creating area:", err);
    res.status(500).json({ error: err.message || "Failed to create area" });
  }
});

// PATCH /tables/sections/:id - Rename an area
tablesRouter.patch("/tables/sections/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { name, sortOrder } = req.body;

    const existing = await prisma.areas.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Area not found" });
    }

    const data: any = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ error: "Area name cannot be empty" });
      }
      data.name = String(name).trim();
    }
    if (sortOrder !== undefined) {
      data.sort_order = Number(sortOrder);
    }

    const updated = await prisma.areas.update({
      where: { id: existing.id },
      data,
    });

    res.status(200).json({
      id: updated.id,
      outletId: updated.outlet_id,
      name: updated.name,
      sortOrder: updated.sort_order,
      isActive: updated.is_active,
    });
  } catch (err: any) {
    console.error("Error updating area:", err);
    res.status(500).json({ error: err.message || "Failed to update area" });
  }
});

// DELETE /tables/sections/:id - Soft delete an area
tablesRouter.delete("/tables/sections/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const existing = await prisma.areas.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Area not found" });
    }

    await prisma.areas.update({
      where: { id: existing.id },
      data: { is_active: false },
    });

    res.status(204).send();
  } catch (err: any) {
    console.error("Error deleting area:", err);
    res.status(500).json({ error: err.message || "Failed to delete area" });
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
            status: { in: [...OPEN_ORDER_STATUSES] },
          },
          include: {
            orderItems: true,
            kotTickets: true,
          },
          orderBy: { createdAt: "desc" },
        },
      } as any,
    });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const activeOrder = ((table as any).orders || []).find((ord: any) => isLiveFloorSession(ord)) || null;
    res.status(200).json({
      id: table.id,
      outletId: table.outletId,
      tableNumber: table.tableNumber,
      name: table.tableNumber,
      capacity: table.capacity,
      section: table.section,
      status: activeOrder ? deriveFloorStatus(activeOrder) : "VACANT",
      kitchenStage: activeOrder ? deriveKitchenStage(activeOrder) : null,
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
    const { tableNumber, name, capacity, section, status, isActive } = req.body;

    const table = await prisma.diningTable.update({
      where: { id: req.params.id, outletId },
      data: {
        ...(tableNumber || name ? { tableNumber: String(tableNumber || name) } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(section !== undefined ? { section } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    res.status(200).json(table);
  } catch (err) {
    console.error("Error updating table:", err);
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

    const existing = await prisma.diningTable.findFirst({
      where: { id: req.params.id, outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Table not found" });
    }

    if (status === "VACANT") {
      const liveOrders = await findLiveOrdersOnTables(prisma, outletId, [req.params.id]);
      const liveOrder = liveOrders[0];
      if (liveOrder) {
        const bill = await orderRepo.getBill(outletId, liveOrder.id).catch(() => null);
        const due = bill ? Number(bill.dueMinor || 0) : Number(liveOrder.grandTotal || 0);
        if (due > 0) {
          return res.status(409).json({
            error: "Table has an unpaid running order. Collect payment before vacating.",
          });
        }
        await (prisma.order as any).updateMany({
          where: {
            outletId,
            diningTableId: req.params.id,
            status: { in: ["SERVED", "HANDED_OVER", "COMPLETED", "SETTLED", "PAID"] },
          },
          data: { diningTableId: null },
        }).catch(() => {});
      }
    }

    const table = await prisma.diningTable.update({
      where: { id: req.params.id },
      data: { status },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.status_updated", { tableId: req.params.id, status });
    }).catch(() => {});

    res.status(200).json(table);
  } catch (err: any) {
    console.error("Error updating table status:", err);
    res.status(500).json({ error: err.message || "Failed to update table status" });
  }
};

tablesRouter.post("/tables/:id/status", requireAuth, requirePermission("table.manage"), handleTableStatus);
tablesRouter.patch("/tables/:id/status", requireAuth, requirePermission("table.manage"), handleTableStatus);

// POST /tables/transfer & POST /tables/:id/transfer - Transfer or merge active table orders
const handleTableTransfer = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const sourceTableId = req.params.id || req.body.sourceTableId || req.body.fromTableId;
    const targetTableId = req.body.targetTableId || req.body.toTableId;
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
        status: { notIn: ["COMPLETED", "CANCELLED", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sourceOrder) {
      return res.status(400).json({ error: `Table ${sourceTable.tableNumber} has no active running order to transfer.` });
    }

    const kotTicketId = typeof req.body.kotTicketId === "string" ? req.body.kotTicketId : "";
    let transferredOrderId = sourceOrder.id;
    let sourceVacated = true;

    if (transferMode === "KOT") {
      if (!kotTicketId) {
        return res.status(400).json({ error: "kotTicketId is required when transferMode is KOT" });
      }
      const ticket = await prisma.kOTTicket.findFirst({
        where: { id: kotTicketId, outletId },
        include: { kotItems: true },
      });
      if (!ticket || ticket.orderId !== sourceOrder.id) {
        return res.status(400).json({ error: "KOT ticket not found on the source table order" });
      }
      const orderItemIds = ticket.kotItems.map((ki) => ki.orderItemId).filter((id): id is string => !!id);
      if (orderItemIds.length === 0) {
        return res.status(400).json({ error: "That KOT has no linked order items to move" });
      }
      const movedItems = await prisma.orderItem.findMany({
        where: { id: { in: orderItemIds }, orderId: sourceOrder.id, isVoided: false },
      });
      if (movedItems.length === 0) {
        return res.status(400).json({ error: "No live order items remain on that KOT" });
      }
      const movedSubtotal = movedItems.reduce((sum, i) => sum + i.subtotal, 0n);
      const sourceSub = sourceOrder.subtotal || 0n;
      const originalTax = sourceOrder.taxTotal || 0n;
      // Remainder method: truncate the moved (target) side, then derive the
      // remaining (source) side by subtraction so sourceTax + targetTax always
      // equals originalTax exactly -- independent BigInt divisions on both
      // sides can each truncate down and lose paise.
      const movedTax = sourceSub > 0n ? (originalTax * movedSubtotal) / sourceSub : 0n;
      const remainingSourceTax = originalTax - movedTax;
      const movedGrand = movedSubtotal + movedTax;

      transferredOrderId = await prisma.$transaction(async (tx) => {
        let targetOrder = await tx.order.findFirst({
          where: {
            outletId,
            diningTableId: targetTableId,
            status: { notIn: ["COMPLETED", "CANCELLED", "FAILED"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!targetOrder) {
          const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const count = await tx.order.count({
            where: { outletId, orderNumber: { startsWith: dateKey } },
          });
          targetOrder = await tx.order.create({
            data: {
              outletId,
              orderNumber: `${dateKey}-${String(count + 1).padStart(4, "0")}`,
              orderType: sourceOrder.orderType,
              status: sourceOrder.status,
              business_date: sourceOrder.business_date,
              subtotal: movedSubtotal,
              taxTotal: movedTax,
              grandTotal: movedGrand,
              diningTableId: targetTableId,
              table_number: targetTable.tableNumber,
              created_by: sourceOrder.created_by,
            },
          });
        } else {
          await tx.order.update({
            where: { id: targetOrder.id },
            data: {
              subtotal: { increment: movedSubtotal },
              taxTotal: { increment: movedTax },
              grandTotal: { increment: movedGrand },
            },
          });
        }

        await tx.orderItem.updateMany({
          where: { id: { in: movedItems.map((i) => i.id) } },
          data: { orderId: targetOrder.id },
        });
        await tx.kOTTicket.update({
          where: { id: ticket.id },
          data: { orderId: targetOrder.id },
        });

        await tx.order.update({
          where: { id: sourceOrder.id },
          data: {
            subtotal: { decrement: movedSubtotal },
            taxTotal: remainingSourceTax,
            grandTotal: { decrement: movedGrand },
          },
        });

        const remaining = await tx.orderItem.count({
          where: { orderId: sourceOrder.id, isVoided: false },
        });
        if (remaining === 0) {
          await tx.order.update({
            where: { id: sourceOrder.id },
            data: { status: "CANCELLED" },
          });
          await tx.diningTable.update({
            where: { id: sourceTableId },
            data: { status: "VACANT" },
          });
        }
        await tx.diningTable.update({
          where: { id: targetTableId },
          data: { status: "OCCUPIED" },
        });
        return targetOrder.id;
      });
      const leftover = await prisma.orderItem.count({
        where: { orderId: sourceOrder.id, isVoided: false },
      });
      sourceVacated = leftover === 0;
    } else {
      const targetOrder = await prisma.order.findFirst({
        where: {
          outletId,
          diningTableId: targetTableId,
          status: { notIn: ["COMPLETED", "CANCELLED", "FAILED"] },
        },
        orderBy: { createdAt: "desc" },
      });

      await prisma.$transaction(async (tx) => {
        if (targetOrder && targetOrder.id !== sourceOrder.id) {
          await tx.orderItem.updateMany({
            where: { orderId: sourceOrder.id },
            data: { orderId: targetOrder.id },
          });
          await tx.kOTTicket.updateMany({
            where: { orderId: sourceOrder.id },
            data: { orderId: targetOrder.id },
          });
          await tx.order.update({
            where: { id: targetOrder.id },
            data: {
              subtotal: { increment: sourceOrder.subtotal },
              taxTotal: { increment: sourceOrder.taxTotal || 0n },
              grandTotal: { increment: sourceOrder.grandTotal },
              tipTotal: { increment: sourceOrder.tipTotal || 0n },
              serviceChargeTotal: { increment: sourceOrder.serviceChargeTotal || 0n },
            },
          });
          await tx.order.update({
            where: { id: sourceOrder.id },
            data: { status: "CANCELLED", diningTableId: null },
          });
          transferredOrderId = targetOrder.id;
        } else {
          await tx.order.update({
            where: { id: sourceOrder.id },
            data: {
              diningTableId: targetTableId,
              table_number: targetTable.tableNumber,
            },
          });
        }

        await tx.diningTable.update({
          where: { id: sourceTableId },
          data: { status: "VACANT" },
        });
        await tx.diningTable.update({
          where: { id: targetTableId },
          data: { status: "OCCUPIED" },
        });
      });
    }


    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.transferred", {
        fromTable: sourceTable.tableNumber,
        toTable: targetTable.tableNumber,
        fromTableId: sourceTableId,
        toTableId: targetTableId,
        orderId: transferredOrderId,
        transferMode,
        kotTicketId: kotTicketId || null,
        sourceVacated,
      });
      broadcast(outletId, "table.status_updated", { tableId: sourceTableId, status: sourceVacated ? "VACANT" : "OCCUPIED" });
      broadcast(outletId, "table.status_updated", { tableId: targetTableId, status: "OCCUPIED" });
      broadcast(outletId, "kot.status_updated", { orderId: transferredOrderId, tableNumber: targetTable.tableNumber });
    }).catch(() => {});

    res.status(200).json({
      success: true,
      transferredOrderId,
      fromTable: sourceTable.tableNumber,
      toTable: targetTable.tableNumber,
      transferMode,
      kotTicketId: kotTicketId || null,
      sourceVacated,
    });
  } catch (err: any) {
    console.error("Error transferring table:", err);
    res.status(500).json({ error: err.message || "Failed to transfer table" });
  }
};

tablesRouter.post("/tables/transfer", requireAuth, requirePermission("table.transfer"), handleTableTransfer);
tablesRouter.post("/tables/:id/transfer", requireAuth, requirePermission("table.transfer"), handleTableTransfer);

// POST /tables/merge/preview - Read-only: shows the captain conflicts before committing to a merge
tablesRouter.post("/tables/merge/preview", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const rawSourceIds = req.body.sourceTableIds || req.body.sourceIds || req.body.tableIds;
    const targetTableId = req.body.targetTableId || req.body.toTableId || req.body.destinationTableId;

    if (!Array.isArray(rawSourceIds) || rawSourceIds.length === 0 || !targetTableId) {
      return res.status(400).json({ error: "sourceTableIds array and targetTableId are required" });
    }
    const sourceTableIds = [...new Set(rawSourceIds.filter((id: string) => id && id !== targetTableId))];

    const blockers: string[] = [];

    const targetTable = await prisma.diningTable.findFirst({ where: { id: targetTableId, outletId } });
    if (!targetTable) {
      blockers.push(`Target table not found`);
    }

    const sourceTables = await prisma.diningTable.findMany({
      where: { outletId, id: { in: sourceTableIds } },
    });
    for (const sid of sourceTableIds) {
      if (!sourceTables.find((t: any) => t.id === sid)) {
        blockers.push(`Source table ${sid} not found (or belongs to a different outlet)`);
      }
    }

    const allTables = targetTable ? [targetTable, ...sourceTables] : sourceTables;
    const targetGroupId = targetTable?.mergeGroupId || null;
    for (const t of allTables) {
      if (t.mergeGroupId && t.mergeGroupId !== targetGroupId && !sourceTableIds.includes(t.id) && t.id !== targetTableId) {
        continue; // unreachable, kept for clarity of the loop's intent
      }
      if (t.id !== targetTableId && t.mergeGroupId && t.mergeGroupId !== targetGroupId) {
        blockers.push(`Table ${t.tableNumber} is already merged into a different group`);
      }
    }

    const memberIds = [...new Set([targetTableId, ...sourceTableIds])].filter(Boolean);
    const billBlockers = await findBillPrintedBlockers(prisma, outletId, memberIds);
    for (const b of billBlockers) {
      blockers.push(
        b.reason === "BILL_PRINTED"
          ? `Order ${b.orderId} has a printed bill and cannot be folded into a merge`
          : `Order ${b.orderId} is partially paid and cannot be folded into a merge`
      );
    }

    const liveOrders = await findLiveOrdersOnTables(prisma, outletId, memberIds);
    const resultingCapacity = allTables.reduce((sum: number, t: any) => sum + (t.capacity || 0), 0);
    const totalDueMinor = liveOrders.reduce((sum: bigint, o: any) => sum + BigInt(o.grandTotal || 0), 0n);

    res.status(200).json({
      blockers,
      resultingLabel: formatMergedTableLabel(allTables.map((t: any) => t.tableNumber)),
      resultingCapacity,
      ordersToFold: liveOrders.map((o: any) => o.id),
      totalDueMinor: totalDueMinor.toString(),
    });
  } catch (err: any) {
    console.error("Error previewing table merge:", err);
    res.status(500).json({ error: err.message || "Failed to preview table merge" });
  }
});

// POST /tables/merge - Merge multiple table orders into one table (supports pre-order and active running orders)
const handleTableMerge = async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const rawSourceIds = req.body.sourceTableIds || req.body.sourceIds || req.body.tableIds;
    const targetTableId = req.body.targetTableId || req.body.toTableId || req.body.destinationTableId;

    if (!Array.isArray(rawSourceIds) || rawSourceIds.length === 0 || !targetTableId) {
      return res.status(400).json({ error: "sourceTableIds array and targetTableId are required" });
    }

    const sourceTableIds = rawSourceIds.filter((id) => id !== targetTableId);
    if (sourceTableIds.length === 0) {
      return res.status(400).json({ error: "Source tables must be different from target table" });
    }

    const idempotencyKey: string | undefined = req.body.idempotencyKey;
    const reason: string | null = req.body.reason ? String(req.body.reason) : null;
    const expectedVersions: Record<string, number> | undefined = req.body.expectedVersions;

    if (idempotencyKey) {
      const prior = await findIdempotentResponse(prisma, outletId, "tables.merge", idempotencyKey);
      if (prior) return res.status(200).json(prior);
    }

    const targetTable = await prisma.diningTable.findFirst({
      where: { id: targetTableId, outletId },
    });
    if (!targetTable) {
      return res.status(404).json({ error: "Target table not found" });
    }

    if (expectedVersions && typeof expectedVersions === "object") {
      const checkIds = [...new Set([targetTableId, ...sourceTableIds])];
      const versionRows = await (prisma.diningTable as any).findMany({
        where: { outletId, id: { in: checkIds } },
        select: { id: true, version: true },
      });
      for (const row of versionRows) {
        const expected = (expectedVersions as any)[row.id];
        if (expected !== undefined && Number(expected) !== (row as any).version) {
          return res.status(409).json({
            error: "MERGE_CONFLICT",
            code: "MERGE_CONFLICT",
            tableId: row.id,
            expectedVersion: expected,
            actualVersion: (row as any).version,
          });
        }
      }
    }

    const memberIds = await expandMergeMemberIds(prisma, outletId, [
      ...sourceTableIds,
      targetTableId,
    ]);

    const billBlockers = await findBillPrintedBlockers(prisma, outletId, memberIds);
    if (billBlockers.length > 0) {
      return res.status(409).json({
        error: "BILL_PRINTED",
        code: "BILL_PRINTED",
        message: "One or more tables have a printed or partially-paid bill and cannot be merged",
        blockers: billBlockers,
      });
    }

    const memberTables = await prisma.diningTable.findMany({
      where: { outletId, id: { in: memberIds } },
    });
    const liveOrders = await findLiveOrdersOnTables(prisma, outletId, memberIds);
    const existingGroupId = memberTables.find((t: any) => t.mergeGroupId)?.mergeGroupId || undefined;
    let survivorOrderId: string | null = null;
    let applied!: { mergeGroupId: string; memberIds: string[] };

    if (liveOrders.length === 0) {
      applied = await applyMergeGroup(prisma, {
        outletId,
        memberIds,
        primaryTableId: targetTableId,
        groupId: existingGroupId,
      });
    } else {
      const survivor =
        liveOrders.find((o: any) => o.diningTableId === targetTableId) || liveOrders[0];
      survivorOrderId = survivor.id;
      const others = liveOrders.filter((o: any) => o.id !== survivor.id);
      const mergePath = survivor.diningTableId === targetTableId ? "group-keep-primary-order" : "group-promote-live-order";

      await prisma.$transaction(async (tx) => {
        await foldOrdersInto(tx, survivor, others, {
          id: targetTableId,
          tableNumber: targetTable.tableNumber,
        });
        applied = await applyMergeGroup(tx, {
          outletId,
          memberIds,
          primaryTableId: targetTableId,
          groupId: existingGroupId,
        });
        await stampOrderMergeLabel(tx, outletId, survivor.id, targetTableId);
      });
    }

    const afterMembers = await (prisma.diningTable as any).findMany({
      where: { outletId, id: { in: memberIds } },
      select: { id: true, tableNumber: true, status: true, mergeGroupId: true, mergePrimaryTableId: true, capacity: true, version: true },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.merged", {
        sourceTableIds,
        targetTableId,
        targetTableNumber: targetTable.tableNumber,
        targetOrderId: survivorOrderId,
        mergeGroupId: applied.mergeGroupId,
        memberIds,
        memberNumbers: afterMembers.map((t: any) => t.tableNumber),
        preOrder: liveOrders.length === 0,
      });
      for (const m of afterMembers) {
        broadcast(outletId, "table.status_updated", { tableId: m.id, status: "OCCUPIED" });
      }
    }).catch(() => {});

    await writeAuditLog(prisma, {
      outletId,
      userId: req.auth!.userId,
      action: "TABLE_MERGE",
      entityType: "DINING_TABLE",
      entityId: targetTableId,
      afterState: {
        sourceTableIds,
        targetTableId,
        mergeGroupId: applied.mergeGroupId,
        memberIds,
        mergedOrdersCount: liveOrders.length,
        targetOrderId: survivorOrderId,
        reason,
      },
    }).catch(() => undefined);

    // Persist to the target-schema table_merge_groups/table_merge_members rows
    // (not typed on PrismaClient yet in this environment, see findIdempotentResponse
    // above) so `reason` and group lifecycle have a durable home per the plan,
    // alongside the existing dining_tables.merge_group_id fields the rest of the
    // route still reads/writes.
    await (prisma as any).table_merge_groups.upsert({
      where: { id: applied.mergeGroupId },
      create: {
        id: applied.mergeGroupId,
        outlet_id: outletId,
        primary_table_id: targetTableId,
        status: "ACTIVE",
        total_capacity: afterMembers.reduce((sum: number, t: any) => sum + (t.capacity || 0), 0),
        reason,
        created_by: req.auth!.userId,
      },
      update: {
        primary_table_id: targetTableId,
        total_capacity: afterMembers.reduce((sum: number, t: any) => sum + (t.capacity || 0), 0),
        reason,
        status: "ACTIVE",
      },
    }).catch(() => undefined);
    for (const m of afterMembers) {
      await (prisma as any).table_merge_members.upsert({
        where: { dining_table_id: m.id, left_at: null } as any,
        create: {
          outlet_id: outletId,
          merge_group_id: applied.mergeGroupId,
          dining_table_id: m.id,
          is_primary: m.id === targetTableId,
        },
        update: { merge_group_id: applied.mergeGroupId, is_primary: m.id === targetTableId },
      }).catch(async () => {
        // Composite/partial-unique `where` above isn't a valid Prisma unique input on
        // this untyped model in every client version; fall back to find-then-write.
        const existingMember = await (prisma as any).table_merge_members.findFirst({
          where: { outlet_id: outletId, dining_table_id: m.id, left_at: null },
        });
        if (existingMember) {
          await (prisma as any).table_merge_members.update({
            where: { id: existingMember.id },
            data: { merge_group_id: applied.mergeGroupId, is_primary: m.id === targetTableId },
          });
        } else {
          await (prisma as any).table_merge_members.create({
            data: {
              outlet_id: outletId,
              merge_group_id: applied.mergeGroupId,
              dining_table_id: m.id,
              is_primary: m.id === targetTableId,
            },
          });
        }
      }).catch(() => undefined);
    }

    const responseBody = {
      success: true,
      mergedOrdersCount: liveOrders.length,
      mergedTablesCount: memberIds.length,
      preOrder: liveOrders.length === 0,
      targetTableId,
      targetTableNumber: targetTable.tableNumber,
      targetOrderId: survivorOrderId,
      survivorOrderId,
      foldedOrders: liveOrders.filter((o: any) => o.id !== survivorOrderId).map((o: any) => o.id),
      mergeGroupId: applied.mergeGroupId,
      memberIds,
      memberNumbers: afterMembers.map((t: any) => t.tableNumber),
      version: (afterMembers.find((t: any) => t.id === targetTableId) as any)?.version ?? null,
      sourcesVacated: false,
    };

    await storeIdempotentResponse(prisma, outletId, "tables.merge", idempotencyKey, responseBody);

    res.status(200).json(responseBody);
  } catch (err: any) {
    console.error("Error merging tables:", err);
    res.status(500).json({ error: err.message || "Failed to merge tables" });
  }
};

tablesRouter.post("/tables/merge", requireAuth, requirePermission("table.manage"), handleTableMerge);

tablesRouter.post("/tables/unmerge", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.body.tableId || req.body.id;
    const idempotencyKey: string | undefined = req.body.idempotencyKey;
    const requestedMode: string | undefined = req.body.mode;
    const unfold: boolean = Boolean(req.body.unfold);
    if (!tableId) {
      return res.status(400).json({ error: "tableId is required" });
    }
    if (requestedMode !== undefined && requestedMode !== "DISSOLVE" && requestedMode !== "DETACH") {
      return res.status(400).json({ error: "mode must be DISSOLVE or DETACH" });
    }

    if (idempotencyKey) {
      const prior = await findIdempotentResponse(prisma, outletId, "tables.unmerge", idempotencyKey);
      if (prior) return res.status(200).json(prior);
    }

    const table = await (prisma.diningTable as any).findFirst({
      where: { id: tableId, outletId },
    });
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    if (!table.mergeGroupId) {
      return res.status(409).json({ error: "Table is not in a merge group" });
    }

    const members = await (prisma.diningTable as any).findMany({
      where: { outletId, mergeGroupId: table.mergeGroupId },
    });
    const primaryId = table.mergePrimaryTableId || members.find((m: any) => m.id === table.mergePrimaryTableId)?.id;
    const isPrimary = table.id === primaryId;
    // Default mode mirrors the old implicit behaviour (primary unmerges => whole group
    // dissolves; satellite unmerges => it alone detaches) but an explicit mode overrides it.
    const mode: "DISSOLVE" | "DETACH" =
      requestedMode === "DISSOLVE" || requestedMode === "DETACH" ? requestedMode : isPrimary ? "DISSOLVE" : "DETACH";

    // D9 guard: block (409) rather than silently force-vacating a table that still
    // has a live/unpaid order (unfinished KOTs, or served-but-unbilled) tied to it.
    const satelliteIds = members.filter((m: any) => m.id !== table.id).map((m: any) => m.id);
    const idsToGuard = mode === "DISSOLVE" ? satelliteIds : [table.id];
    if (idsToGuard.length > 0) {
      const liveOnGuarded = await findLiveOrdersOnTables(prisma, outletId, idsToGuard);
      if (liveOnGuarded.length > 0 && !(mode === "DETACH" && unfold)) {
        return res.status(409).json({
          error: "Cannot unmerge: one or more tables have a live or unpaid order",
          tableIds: [...new Set(liveOnGuarded.map((o: any) => o.diningTableId))],
        });
      }
    }

    let newOrderId: string | null = null;

    await prisma.$transaction(async (tx) => {
      if (mode === "DISSOLVE") {
        if (satelliteIds.length > 0) {
          await (tx.diningTable as any).updateMany({
            where: { id: { in: satelliteIds } },
            data: { status: "VACANT", mergeGroupId: null, mergePrimaryTableId: null },
          });
        }
        await (tx.diningTable as any).update({
          where: { id: table.id },
          data: { mergeGroupId: null, mergePrimaryTableId: null },
        });
        await (tx as any).table_merge_groups.updateMany({
          where: { id: table.mergeGroupId, outlet_id: outletId },
          data: { status: "CLOSED", closed_at: new Date() },
        }).catch(() => undefined);
        await (tx as any).table_merge_members.updateMany({
          where: { merge_group_id: table.mergeGroupId, outlet_id: outletId, left_at: null },
          data: { left_at: new Date() },
        }).catch(() => undefined);
      } else {
        // DETACH: pull just `table` out of the group; the group stays ACTIVE for the rest.
        await (tx.diningTable as any).update({
          where: { id: table.id },
          data: { status: "VACANT", mergeGroupId: null, mergePrimaryTableId: null },
        });
        const remaining = members.filter((m: any) => m.id !== table.id);
        if (remaining.length <= 1) {
          // Fewer than 2 members left => the group can't stay a merge; collapse it too.
          const leftoverIds = remaining.map((m: any) => m.id);
          if (leftoverIds.length > 0) {
            await (tx.diningTable as any).updateMany({
              where: { id: { in: leftoverIds } },
              data: { mergeGroupId: null, mergePrimaryTableId: null },
            });
          }
          await (tx as any).table_merge_groups.updateMany({
            where: { id: table.mergeGroupId, outlet_id: outletId },
            data: { status: "CLOSED", closed_at: new Date() },
          }).catch(() => undefined);
        } else if (isPrimary) {
          const newPrimary = remaining[0];
          await (tx.diningTable as any).updateMany({
            where: { id: { in: remaining.map((m: any) => m.id) } },
            data: { mergePrimaryTableId: newPrimary.id },
          });
          await (tx as any).table_merge_groups.updateMany({
            where: { id: table.mergeGroupId, outlet_id: outletId },
            data: { primary_table_id: newPrimary.id },
          }).catch(() => undefined);
        }
        await (tx as any).table_merge_members.updateMany({
          where: { merge_group_id: table.mergeGroupId, outlet_id: outletId, dining_table_id: table.id, left_at: null },
          data: { left_at: new Date() },
        }).catch(() => undefined);

        if (unfold) {
          // Reverse the order-fold: find the survivor order still live on the remaining
          // group members and move back only the OrderItems whose originTableId is the
          // table now detaching. A reasonable version per the plan, not full tax/service
          // charge re-apportionment: subtotal and grandTotal move 1:1 with the items.
          const survivorOrder = await tx.order.findFirst({
            where: { outletId, diningTableId: { in: members.map((m: any) => m.id) }, status: { in: [...OPEN_ORDER_STATUSES] } },
            include: { orderItems: true },
          });
          if (survivorOrder) {
            const originItems = (survivorOrder.orderItems || []).filter((oi: any) => oi.originTableId === table.id);
            if (originItems.length > 0) {
              const movedSubtotal = originItems.reduce((sum: bigint, oi: any) => sum + BigInt(oi.subtotal || 0), 0n);
              const newOrder = await tx.order.create({
                data: {
                  outletId,
                  diningTableId: table.id,
                  orderType: survivorOrder.orderType,
                  orderNumber: `${survivorOrder.orderNumber}-D${Date.now().toString().slice(-5)}`,
                  status: "DRAFT",
                  table_number: table.tableNumber,
                  waiterId: (survivorOrder as any).waiterId,
                  subtotal: movedSubtotal,
                  grandTotal: movedSubtotal,
                } as any,
              });
              await (tx.orderItem as any).updateMany({
                where: { id: { in: originItems.map((oi: any) => oi.id) } },
                data: { orderId: newOrder.id, originTableId: null },
              });
              await tx.order.update({
                where: { id: survivorOrder.id },
                data: {
                  subtotal: { decrement: movedSubtotal },
                  grandTotal: { decrement: movedSubtotal },
                },
              });
              newOrderId = newOrder.id;
            }
          }
        }
      }

      await writeAuditLog(tx, {
        outletId,
        userId: req.auth!.userId,
        action: "TABLE_UNMERGE",
        entityType: "DINING_TABLE",
        entityId: table.id,
        afterState: {
          tableId: table.id,
          mergeGroupId: table.mergeGroupId,
          isPrimary,
          mode,
          unfold,
          newOrderId,
          memberIds: members.map((m: any) => m.id),
        },
      });
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.unmerged", { tableId, mergeGroupId: table.mergeGroupId, mode });
      for (const m of members) {
        broadcast(outletId, "table.status_updated", {
          tableId: m.id,
          status: m.id === tableId && !(mode === "DISSOLVE" && isPrimary) ? "VACANT" : m.status,
        });
      }
    }).catch(() => {});

    const responseBody = { ok: true, tableId, mode, dissolvedPrimary: mode === "DISSOLVE", newOrderId };
    await storeIdempotentResponse(prisma, outletId, "tables.unmerge", idempotencyKey, responseBody);

    res.status(200).json(responseBody);
  } catch (err: any) {
    console.error("Error unmerging table:", err);
    res.status(500).json({ error: err.message || "Failed to unmerge table" });
  }
});

// PATCH /tables/:id - Update table configuration (capacity, section, tableNumber, isActive)
tablesRouter.patch("/tables/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;
    const { tableNumber, capacity, section, isActive } = req.body;

    const existing = await prisma.diningTable.findFirst({
      where: { id: tableId, outletId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Guard: Cannot disable table with running orders/KOTs
    if (isActive === false) {
      const activeOrder = await prisma.order.findFirst({
        where: {
          outletId,
          diningTableId: tableId,
          status: { notIn: ["COMPLETED", "CANCELLED", "FAILED"] },
        },
      });
      if (activeOrder) {
        return res.status(400).json({
          error: `Cannot disable Table ${existing.tableNumber} while it has active running order #${activeOrder.orderNumber}. Settle or transfer the order first.`,
        });
      }
    }

    const data: any = {};
    if (tableNumber !== undefined) data.tableNumber = String(tableNumber).trim();
    if (capacity !== undefined) data.capacity = Number(capacity) || 4;
    if (section !== undefined) data.section = String(section).trim() || "General";
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.diningTable.update({
      where: { id: tableId },
      data,
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.updated", {
        tableId: updated.id,
        tableNumber: updated.tableNumber,
        isActive: updated.isActive,
        capacity: updated.capacity,
        section: updated.section,
      });
    }).catch(() => {});

    res.status(200).json(updated);
  } catch (err: any) {
    console.error("Error updating table:", err);
    res.status(500).json({ error: err.message || "Failed to update table" });
  }
});

// DELETE /tables/:id - Deactivate table
tablesRouter.delete("/tables/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await prisma.diningTable.findFirst({
      where: { id: req.params.id, outletId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Guard: Cannot disable table with running orders
    const activeOrder = await prisma.order.findFirst({
      where: {
        outletId,
        diningTableId: req.params.id,
        status: { notIn: ["COMPLETED", "CANCELLED", "FAILED"] },
      },
    });
    if (activeOrder) {
      return res.status(400).json({
        error: `Cannot disable Table ${existing.tableNumber} while it has active running order #${activeOrder.orderNumber}.`,
      });
    }

    await prisma.diningTable.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.status(204).end();
  } catch (err: any) {
    console.error("Error deleting table:", err);
    res.status(500).json({ error: err.message || "Failed to delete table" });
  }
});

// ---------------------------------------------------------------------------
// Seat / chair CRUD (table_seats) — artifact-02 plan S4 "Seat / chair" surface.
// The model isn't in the generated Prisma client yet (see findIdempotentResponse
// above for why), so every call goes through the same `(prisma as any)` cast
// pattern used at menu-catalog-repository.ts's linkModifierToItem.
// ---------------------------------------------------------------------------

// GET /tables/:id/seats - list a table's seats
tablesRouter.get("/tables/:id/seats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, outletId } });
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    const seats = await (prisma as any).table_seats.findMany({
      where: { outlet_id: outletId, dining_table_id: tableId },
      orderBy: { seat_number: "asc" },
    });
    res.status(200).json({ tableId, capacity: table.capacity, seats });
  } catch (err: any) {
    console.error("Error listing table seats:", err);
    res.status(500).json({ error: err.message || "Failed to list table seats" });
  }
});

// POST /tables/:id/seats/seed - generate seat_number 1..capacity rows for a table
// (no-hardcode invariant: N comes from DiningTable.capacity via CRUD, never a literal).
// Idempotent: only creates seats for numbers that don't already exist.
tablesRouter.post("/tables/:id/seats/seed", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, outletId } });
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    const count = Number(req.body.count) || table.capacity;
    if (!count || count < 1) {
      return res.status(400).json({ error: "table has no capacity to seed seats from" });
    }
    const existing = await (prisma as any).table_seats.findMany({
      where: { outlet_id: outletId, dining_table_id: tableId },
      select: { seat_number: true },
    });
    const existingNumbers = new Set(existing.map((s: any) => s.seat_number));
    const toCreate: { outlet_id: string; dining_table_id: string; seat_number: number; status: string }[] = [];
    for (let n = 1; n <= count; n++) {
      if (!existingNumbers.has(n)) {
        toCreate.push({ outlet_id: outletId, dining_table_id: tableId, seat_number: n, status: "EMPTY" });
      }
    }
    if (toCreate.length > 0) {
      await (prisma as any).table_seats.createMany({ data: toCreate }).catch(async () => {
        // createMany may not be supported for this untyped model on every client version.
        for (const row of toCreate) {
          await (prisma as any).table_seats.create({ data: row }).catch(() => undefined);
        }
      });
    }
    const seats = await (prisma as any).table_seats.findMany({
      where: { outlet_id: outletId, dining_table_id: tableId },
      orderBy: { seat_number: "asc" },
    });
    res.status(200).json({ tableId, seats, created: toCreate.length });
  } catch (err: any) {
    console.error("Error seeding table seats:", err);
    res.status(500).json({ error: err.message || "Failed to seed table seats" });
  }
});

// POST /tables/:id/seats - create one additional seat (e.g. an extra chair pulled up)
tablesRouter.post("/tables/:id/seats", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const tableId = req.params.id;
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, outletId } });
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    const existing = await (prisma as any).table_seats.findMany({
      where: { outlet_id: outletId, dining_table_id: tableId },
      select: { seat_number: true },
    });
    const nextNumber = req.body.seatNumber
      ? Number(req.body.seatNumber)
      : existing.reduce((max: number, s: any) => Math.max(max, s.seat_number), 0) + 1;
    if (existing.some((s: any) => s.seat_number === nextNumber)) {
      return res.status(409).json({ error: `Seat ${nextNumber} already exists on this table` });
    }
    const seat = await (prisma as any).table_seats.create({
      data: {
        outlet_id: outletId,
        dining_table_id: tableId,
        seat_number: nextNumber,
        label: req.body.label || null,
        status: req.body.status || "EMPTY",
        guest_name: req.body.guestName || null,
      },
    });
    res.status(201).json(seat);
  } catch (err: any) {
    console.error("Error creating table seat:", err);
    res.status(500).json({ error: err.message || "Failed to create table seat" });
  }
});

// PATCH /tables/:id/seats/:seatId - update seat status / guestName / label
tablesRouter.patch("/tables/:id/seats/:seatId", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id: tableId, seatId } = req.params;
    const seat = await (prisma as any).table_seats.findFirst({
      where: { id: seatId, outlet_id: outletId, dining_table_id: tableId },
    });
    if (!seat) {
      return res.status(404).json({ error: "Seat not found" });
    }
    const data: any = {};
    if (req.body.status !== undefined) {
      const validStatuses = ["EMPTY", "SEATED", "ORDERED", "BILLED", "SETTLED"];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: `status must be one of ${validStatuses.join(", ")}` });
      }
      data.status = req.body.status;
    }
    if (req.body.guestName !== undefined) data.guest_name = req.body.guestName || null;
    if (req.body.label !== undefined) data.label = req.body.label || null;

    const updated = await (prisma as any).table_seats.update({ where: { id: seatId }, data });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.seat_assigned", { tableId, seatId, seat: updated });
    }).catch(() => {});

    res.status(200).json(updated);
  } catch (err: any) {
    console.error("Error updating table seat:", err);
    res.status(500).json({ error: err.message || "Failed to update table seat" });
  }
});

// DELETE /tables/:id/seats/:seatId - deactivate/remove a seat
tablesRouter.delete("/tables/:id/seats/:seatId", requireAuth, requirePermission("table.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id: tableId, seatId } = req.params;
    const seat = await (prisma as any).table_seats.findFirst({
      where: { id: seatId, outlet_id: outletId, dining_table_id: tableId },
    });
    if (!seat) {
      return res.status(404).json({ error: "Seat not found" });
    }
    await (prisma as any).table_seats.delete({ where: { id: seatId } });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "table.seat_cleared", { tableId, seatId });
    }).catch(() => {});

    res.status(204).end();
  } catch (err: any) {
    console.error("Error deleting table seat:", err);
    res.status(500).json({ error: err.message || "Failed to delete table seat" });
  }
});
