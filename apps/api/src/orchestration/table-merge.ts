import { randomUUID } from "crypto";

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

export function formatMergedTableLabel(numbers: string[]): string {
  return [...new Set(numbers.filter(Boolean))].join(" + ");
}

function isLiveFloorSession(order: any): boolean {
  const kots = order.kotTickets || [];
  const items = order.orderItems || [];
  if (kots.some((k: any) => k.status !== "CANCELLED")) return true;
  if (items.length > 0 && ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY", "SERVED", "HANDED_OVER"].includes(order.status)) return true;
  return false;
}

export async function expandMergeMemberIds(
  prisma: any,
  outletId: string,
  tableIds: string[]
): Promise<string[]> {
  const seed = [...new Set(tableIds.filter(Boolean))];
  if (seed.length === 0) return [];
  const seedRows = await prisma.diningTable.findMany({
    where: { outletId, id: { in: seed } },
    select: { id: true, mergeGroupId: true },
  });
  const groupIds = [
    ...new Set(
      seedRows.map((t: any) => t.mergeGroupId).filter((id: string | null) => Boolean(id))
    ),
  ];
  if (groupIds.length === 0) return seed;
  const extra = await prisma.diningTable.findMany({
    where: { outletId, mergeGroupId: { in: groupIds } },
    select: { id: true },
  });
  return [...new Set([...seed, ...extra.map((t: any) => t.id)])];
}

export async function applyMergeGroup(
  prisma: any,
  opts: { outletId: string; memberIds: string[]; primaryTableId: string; groupId?: string }
): Promise<{ mergeGroupId: string; memberIds: string[] }> {
  const mergeGroupId = opts.groupId || randomUUID();
  await prisma.diningTable.updateMany({
    where: { outletId: opts.outletId, id: { in: opts.memberIds } },
    data: {
      mergeGroupId,
      mergePrimaryTableId: opts.primaryTableId,
      status: "OCCUPIED",
    },
  });
  return { mergeGroupId, memberIds: opts.memberIds };
}

export async function dissolveMergeGroupForTable(
  prisma: any,
  outletId: string,
  tableId: string | null | undefined
): Promise<{ ids: string[]; numbers: string[] }> {
  if (!tableId) return { ids: [], numbers: [] };
  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, outletId },
    select: { id: true, mergeGroupId: true, tableNumber: true },
  });
  if (!table) return { ids: [], numbers: [] };
  const where = table.mergeGroupId
    ? { outletId, mergeGroupId: table.mergeGroupId }
    : { id: table.id, outletId };
  const members = await prisma.diningTable.findMany({
    where,
    select: { id: true, tableNumber: true },
  });
  const ids = members.map((m: any) => m.id);
  const numbers = members.map((m: any) => m.tableNumber);
  if (ids.length === 0) return { ids: [], numbers: [] };
  await prisma.diningTable.updateMany({
    where: { id: { in: ids } },
    data: { status: "VACANT", mergeGroupId: null, mergePrimaryTableId: null },
  });
  return { ids, numbers };
}

export async function resolveAnchorTable(
  prisma: any,
  outletId: string,
  tableId: string | null | undefined
): Promise<{
  id: string;
  tableNumber: string;
  mergeGroupId: string | null;
  mergePrimaryTableId: string | null;
} | null> {
  if (!tableId) return null;
  let table = (await prisma.diningTable.findFirst({
    where: { id: tableId, outletId },
    select: {
      id: true,
      tableNumber: true,
      mergeGroupId: true,
      mergePrimaryTableId: true,
    },
  }).catch(() => null)) || (await prisma.diningTable.findFirst({
    where: { tableNumber: tableId, outletId },
    select: {
      id: true,
      tableNumber: true,
      mergeGroupId: true,
      mergePrimaryTableId: true,
    },
  }).catch(() => null));

  if (!table) {
    const aliasNumber = tableId === "tbl-07" ? "B1" : (tableId === "B1" ? "tbl-07" : tableId);
    table = await prisma.diningTable.findFirst({
      where: { tableNumber: aliasNumber, outletId },
      select: {
        id: true,
        tableNumber: true,
        mergeGroupId: true,
        mergePrimaryTableId: true,
      },
    }).catch(() => null);
  }

  if (!table) {
    try {
      const num = tableId === "tbl-07" ? "B1" : tableId;
      const created = await prisma.diningTable.create({
        data: {
          id: randomUUID(),
          outletId,
          tableNumber: num,
          capacity: 4,
          section: "Main Floor",
          status: "VACANT",
        },
      });
      table = {
        id: created.id,
        tableNumber: created.tableNumber,
        mergeGroupId: null,
        mergePrimaryTableId: null,
      };
    } catch (e: any) {
      table = await prisma.diningTable.findFirst({
        where: { outletId, tableNumber: tableId },
      }).catch(() => null);
    }
  }

  if (!table) return null;
  const primaryId = table.mergePrimaryTableId;
  if (primaryId && primaryId !== table.id) {
    const primary = await prisma.diningTable.findFirst({
      where: { id: primaryId, outletId },
      select: {
        id: true,
        tableNumber: true,
        mergeGroupId: true,
        mergePrimaryTableId: true,
      },
    }).catch(() => null);
    if (primary) return primary;
  }
  return table;
}

export async function findLiveOrdersOnTables(
  prisma: any,
  outletId: string,
  tableIds: string[]
): Promise<any[]> {
  if (tableIds.length === 0) return [];
  const orders = await prisma.order.findMany({
    where: {
      outletId,
      diningTableId: { in: tableIds },
      status: { in: [...OPEN_ORDER_STATUSES] },
    },
    include: {
      orderItems: { where: { isVoided: false } },
      kotTickets: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return orders.filter((o: any) => isLiveFloorSession(o));
}

export async function foldOrdersInto(
  tx: any,
  survivor: any,
  others: any[],
  primaryTable: { id: string; tableNumber: string }
): Promise<void> {
  for (const ord of others) {
    if (!ord || ord.id === survivor.id) continue;
    await tx.orderItem.updateMany({
      where: { orderId: ord.id },
      data: { orderId: survivor.id },
    });
    await tx.kOTTicket.updateMany({
      where: { orderId: ord.id },
      data: { orderId: survivor.id },
    });
    await tx.order.update({
      where: { id: survivor.id },
      data: {
        subtotal: { increment: ord.subtotal || 0n },
        taxTotal: { increment: ord.taxTotal || 0n },
        grandTotal: { increment: ord.grandTotal || 0n },
        tipTotal: { increment: ord.tipTotal || 0n },
        serviceChargeTotal: { increment: ord.serviceChargeTotal || 0n },
      },
    });
    await tx.order.update({
      where: { id: ord.id },
      data: { status: "CANCELLED" },
    });
  }
  await tx.order.update({
    where: { id: survivor.id },
    data: {
      diningTableId: primaryTable.id,
      table_number: primaryTable.tableNumber,
    },
  });
}

export async function mergeGroupLabelMap(
  prisma: any,
  outletId: string,
  groupIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(groupIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const members = await prisma.diningTable.findMany({
    where: { outletId, mergeGroupId: { in: ids } },
    select: { mergeGroupId: true, tableNumber: true },
    orderBy: { tableNumber: "asc" },
  });
  const byGroup = new Map<string, string[]>();
  for (const m of members) {
    if (!m.mergeGroupId) continue;
    const arr = byGroup.get(m.mergeGroupId) || [];
    arr.push(m.tableNumber);
    byGroup.set(m.mergeGroupId, arr);
  }
  for (const [gid, nums] of byGroup) {
    map.set(gid, formatMergedTableLabel(nums));
  }
  return map;
}

export async function stampOrderMergeLabel(
  prisma: any,
  outletId: string,
  orderId: string,
  tableId: string | null | undefined
): Promise<{ ids: string[]; label: string }> {
  if (!orderId || !tableId) return { ids: [], label: "" };
  const ids = await expandMergeMemberIds(prisma, outletId, [tableId]);
  const target = ids.length > 0 ? ids : [tableId];
  const rows = await prisma.diningTable.findMany({
    where: { outletId, id: { in: target } },
    select: { id: true, tableNumber: true },
  });
  const label = formatMergedTableLabel(rows.map((r: any) => r.tableNumber));
  if (label) {
    await prisma.order.update({
      where: { id: orderId },
      data: { table_number: label },
    }).catch(() => {});
  }
  return { ids: rows.map((r: any) => r.id), label };
}

export async function occupyMergeMembers(
  prisma: any,
  outletId: string,
  tableId: string | null | undefined
): Promise<string[]> {
  if (!tableId) return [];
  const ids = await expandMergeMemberIds(prisma, outletId, [tableId]);
  const target = ids.length > 0 ? ids : [tableId];
  await prisma.diningTable.updateMany({
    where: { outletId, id: { in: target } },
    data: { status: "OCCUPIED" },
  }).catch(() => {});
  return target;
}

export async function dissolvePaidEmptyMergeGroups(
  prisma: any,
  outletId: string
): Promise<string[]> {
  const grouped = await prisma.diningTable.findMany({
    where: { outletId, mergeGroupId: { not: null } },
    select: { id: true, mergeGroupId: true },
  });
  const byGroup = new Map<string, string[]>();
  for (const t of grouped) {
    if (!t.mergeGroupId) continue;
    const arr = byGroup.get(t.mergeGroupId) || [];
    arr.push(t.id);
    byGroup.set(t.mergeGroupId, arr);
  }
  const dissolved: string[] = [];
  for (const [, memberIds] of byGroup) {
    const live = await findLiveOrdersOnTables(prisma, outletId, memberIds);
    if (live.length > 0) continue;
    const paid = await prisma.order.findFirst({
      where: { outletId, diningTableId: { in: memberIds }, status: "COMPLETED" },
      select: { id: true },
    });
    if (!paid) continue;
    const result = await dissolveMergeGroupForTable(prisma, outletId, memberIds[0]);
    dissolved.push(...result.ids);
  }
  return dissolved;
}
