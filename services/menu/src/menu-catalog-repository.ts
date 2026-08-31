import { PrismaClient } from "@prisma/client";
import type { MenuCategoryInput, MenuItemInput, MenuItemView } from "@kapmeta/shared-types/menu";

export class PrismaMenuCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCategory(input: MenuCategoryInput) {
    return this.prisma.menuCategory.create({
      data: {
        outletId: input.outletId,
        name: input.name,
        description: input.description,
      },
    });
  }

  async createMenuItem(input: MenuItemInput) {
    return this.prisma.menuItem.create({
      data: {
        outletId: input.outletId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        price: input.priceMinor,
        ...(input.isVeg !== undefined ? { isVeg: input.isVeg } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      },
    });
  }

  async createModifierGroup(outletId: string, name: string, minSelect: number, maxSelect: number) {
    return this.prisma.modifierGroup.create({
      data: { outletId, name, minSelect, maxSelect },
    });
  }

  async createModifierOption(outletId: string, modifierGroupId: string, name: string, priceMinor: bigint) {
    return this.prisma.modifierOption.create({
      data: { outletId, modifierGroupId, name, price: priceMinor },
    });
  }

  async linkModifierToItem(menuItemId: string, modifierGroupId: string) {
    return this.prisma.menuItemModifierGroup.create({
      data: { menuItemId, modifierGroupId },
    });
  }

  async listCategories(outletId: string) {
    return this.prisma.menuCategory.findMany({
      where: { outletId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async listAllItems(outletId: string): Promise<MenuItemView[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: { availabilities: true, category: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row: any) => ({
      id: row.id,
      outletId: row.outletId,
      categoryId: row.categoryId,
      categoryName: row.category?.name || "General",
      name: row.name,
      description: row.description,
      priceMinor: BigInt(row.priceMinor || row.price || 0),
      isVeg: Boolean(row.isVeg),
      taxRate: (row.taxRate ?? 5.0).toString(),
      isActive: row.isActive !== false,
      availability: row.availabilities && row.availabilities[0]
        ? {
            isStocked: row.availabilities[0].isStocked,
            stockQty: row.availabilities[0].stockQty,
            version: row.availabilities[0].version,
          }
        : null,
    }));
  }

  async listByCategory(categoryId: string): Promise<MenuItemView[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { categoryId },
      include: { availabilities: true, category: true },
    });
    // Scaffold simplification: takes the first availability row per item since categoryId already implies outlet scope here.
    return rows.map((row) => ({
      id: row.id,
      outletId: row.outletId,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      name: row.name,
      description: row.description,
      priceMinor: row.price,
      isVeg: row.isVeg,
      taxRate: row.taxRate.toString(),
      isActive: row.isActive,
      availability: row.availabilities[0]
        ? {
            isStocked: row.availabilities[0].isStocked,
            stockQty: row.availabilities[0].stockQty,
            version: row.availabilities[0].version,
          }
        : null,
    }));
  }
}
