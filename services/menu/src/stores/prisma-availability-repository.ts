import { PrismaClient } from "@prisma/client";
import type { AvailabilityRepository, AvailabilityListItem } from "../availability-service";
import type { AvailabilityState } from "@kapmeta/shared-types/menu";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

export class PrismaAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(menuItemId: string, outletId: string): Promise<AvailabilityState | null> {
    const row = await this.prisma.itemAvailability.findFirst({
      where: { menuItemId, outletId },
    });
    if (!row) return null;
    return {
      menuItemId: row.menuItemId,
      outletId: row.outletId,
      isStocked: row.isStocked,
      stockQty: row.stockQty,
      version: row.version,
    };
  }

  async updateIfVersionMatches(
    menuItemId: string,
    outletId: string,
    expectedVersion: number,
    isStocked: boolean,
    stockQty: number,
    userId: string
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.itemAvailability.findFirst({ where: { menuItemId, outletId } });

      const result = await tx.itemAvailability.updateMany({
        where: { menuItemId, outletId, version: expectedVersion },
        data: { isStocked, stockQty, version: { increment: 1 } },
      });

      if (result.count > 0) {
        await writeAuditLog(tx, {
          outletId,
          userId,
          action: "86_TOGGLED",
          entityType: "MENU_ITEM",
          entityId: menuItemId,
          beforeState: { state: before ? { isStocked: before.isStocked, stockQty: before.stockQty } : null },
          afterState: { state: { isStocked, stockQty } },
        });
      }

      return result.count > 0;
    });
  }

  async listByOutlet(outletId: string): Promise<AvailabilityListItem[]> {
    const rows = await this.prisma.itemAvailability.findMany({
      where: { outletId },
      include: { menuItem: { include: { category: true } } },
    });

    return rows.map((row) => ({
      menuItemId: row.menuItemId,
      outletId: row.outletId,
      isStocked: row.isStocked,
      stockQty: row.stockQty,
      version: row.version,
      categoryName: row.menuItem.category.name,
      name: row.menuItem.name,
      priceMinor: row.menuItem.price.toString(),
      isVeg: row.menuItem.isVeg,
    }));
  }
}
