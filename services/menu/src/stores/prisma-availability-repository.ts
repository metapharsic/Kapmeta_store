import { PrismaClient } from "@prisma/client";
import type { AvailabilityRepository, AvailabilityListItem } from "../availability-service";
import type { AvailabilityState } from "@kapmeta/shared-types/menu";

export class PrismaAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(menuItemId: string, outletId: string): Promise<AvailabilityState | null> {
    const row = await this.prisma.item_availability.findFirst({
      where: {
        item_id: menuItemId,
        outlet_id: outletId,
        channel_id: "POS",
      },
    });

    if (!row) {
      return {
        menuItemId,
        outletId,
        isStocked: true,
        stockQty: 100,
        version: 1,
      };
    }

    return {
      menuItemId,
      outletId,
      isStocked: row.state === "ON",
      stockQty: (row as any).stock_qty ?? 100,
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
    const result = await this.prisma.item_availability.updateMany({
      where: {
        item_id: menuItemId,
        outlet_id: outletId,
        channel_id: "POS",
        version: expectedVersion,
      },
      data: {
        state: isStocked ? "ON" : "OFF",
        version: { increment: 1 },
        updated_at: new Date(),
        updated_by: userId,
      } as any,
    });

    if (result.count === 0) {
      await this.prisma.item_availability.upsert({
        where: {
          item_id_channel_id: {
            item_id: menuItemId,
            channel_id: "POS",
          },
        } as any,
        update: {
          state: isStocked ? "ON" : "OFF",
          version: { increment: 1 },
          updated_at: new Date(),
          updated_by: userId,
        } as any,
        create: {
          outlet_id: outletId,
          item_id: menuItemId,
          channel_id: "POS",
          state: isStocked ? "ON" : "OFF",
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
          created_by: userId,
          updated_by: userId,
        } as any,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        outletId,
        userId,
        action: "UPDATE",
        entityType: "MENU_ITEM_86",
        entityId: menuItemId,
        beforeState: { isStocked: !isStocked },
        afterState: { isStocked, stockQty, version: expectedVersion + 1 },
        createdAt: new Date(),
      },
    });

    return true;
  }

  async listByOutlet(outletId: string): Promise<AvailabilityListItem[]> {
    const menuItems = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: {
        category: true,
      },
      orderBy: { name: "asc" },
    });

    const availRows = await this.prisma.item_availability.findMany({
      where: {
        outlet_id: outletId,
        channel_id: "POS",
      },
    });

    const availMap = new Map<string, any>();
    for (const row of availRows) {
      availMap.set(row.item_id, row);
    }

    return menuItems.map((item) => {
      const avail = availMap.get(item.id);
      const isStocked = avail ? avail.state === "ON" : true;
      const stockQty = avail ? ((avail as any).stock_qty ?? 100) : 100;
      const version = avail ? avail.version : 1;
      const priceMinor = Math.round(Number(item.price || 0) * 100).toString();

      return {
        menuItemId: item.id,
        outletId,
        isStocked,
        stockQty,
        version,
        categoryName: item.category?.name || "General",
        name: item.name,
        priceMinor,
        isVeg: item.isVeg,
      };
    });
  }
}


