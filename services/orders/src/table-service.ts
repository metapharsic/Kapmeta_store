import { PrismaClient } from "@prisma/client";
import { TERMINAL_ORDER_STATUSES } from "./order-service";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

export class PrismaTableRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTable(outletId: string, tableNumber: string, capacity: number, section?: string) {
    return this.prisma.diningTable.create({
      data: {
        outletId,
        tableNumber,
        capacity,
        section,
      },
    });
  }

  async listTables(outletId: string) {
    return this.prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      orderBy: { tableNumber: "asc" },
    });
  }

  async updateTable(
    outletId: string,
    tableId: string,
    updates: { tableNumber?: string; capacity?: number; section?: string; isActive?: boolean }
  ) {
    return this.prisma.diningTable.update({
      where: { id: tableId, outletId },
      data: updates,
    });
  }

  async deleteTable(outletId: string, tableId: string) {
    // Soft delete only — a table with order history can't be hard-deleted
    // without breaking Order.diningTableId's FK. isActive:false is what
    // listTables already filters on, so this just removes it from the floor.
    return this.prisma.diningTable.update({
      where: { id: tableId, outletId },
      data: { isActive: false },
    });
  }

  // Moves the active (non-terminal) order off fromTable onto toTable —
  // e.g. guest asked to move seats mid-meal. toTable must be VACANT.
  async transferTable(outletId: string, fromTableId: string, toTableId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const toTable = await tx.diningTable.findFirst({ where: { id: toTableId, outletId } });
      if (!toTable) {
        throw new Error("destination table not found");
      }
      if (toTable.status !== "VACANT") {
        throw new Error("destination table is not vacant");
      }

      const order = await tx.order.findFirst({
        where: { outletId, diningTableId: fromTableId, status: { notIn: TERMINAL_ORDER_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (!order) {
        throw new Error("no active order on source table");
      }

      await tx.order.update({ where: { id: order.id }, data: { diningTableId: toTableId } });
      await tx.diningTable.update({ where: { id: toTableId }, data: { status: "OCCUPIED" } });
      await tx.diningTable.update({ where: { id: fromTableId }, data: { status: "VACANT" } });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "TABLE_TRANSFERRED",
        entityType: "ORDER",
        entityId: order.id,
        beforeState: { diningTableId: fromTableId },
        afterState: { diningTableId: toTableId },
      });

      return { orderId: order.id, fromTableId, toTableId };
    });
  }

  // Combines multiple occupied tables (e.g. two tables pushed together for a
  // bigger party) onto one target table/bill. All source tables' active
  // orders get reassigned to targetTableId; sources go VACANT.
  async mergeTables(outletId: string, sourceTableIds: string[], targetTableId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.diningTable.findFirst({ where: { id: targetTableId, outletId } });
      if (!target) {
        throw new Error("target table not found");
      }

      const movedOrderIds: string[] = [];
      for (const sourceTableId of sourceTableIds) {
        if (sourceTableId === targetTableId) continue;
        const orders = await tx.order.findMany({
          where: { outletId, diningTableId: sourceTableId, status: { notIn: TERMINAL_ORDER_STATUSES } },
        });
        for (const order of orders) {
          await tx.order.update({ where: { id: order.id }, data: { diningTableId: targetTableId } });
          movedOrderIds.push(order.id);
        }
        await tx.diningTable.update({ where: { id: sourceTableId }, data: { status: "VACANT" } });
      }

      await tx.diningTable.update({ where: { id: targetTableId }, data: { status: "OCCUPIED" } });

      await writeAuditLog(tx, {
        outletId,
        userId,
        action: "TABLES_MERGED",
        entityType: "ORDER",
        entityId: targetTableId,
        beforeState: { sourceTableIds },
        afterState: { targetTableId, movedOrderIds },
      });

      return { targetTableId, movedOrderIds };
    });
  }
}
