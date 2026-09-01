// @ts-nocheck
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
    const priceDecimal = (Number(input.priceMinor || 0) / 100).toFixed(2);
    const taxDecimal = input.taxRate !== undefined ? Number(input.taxRate).toFixed(2) : "5.00";

    const created = await this.prisma.menuItem.create({
      data: {
        outletId: input.outletId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        price: priceDecimal as any,
        isVeg: input.isVeg !== undefined ? input.isVeg : true,
        taxRate: taxDecimal as any,
      },
    });

    return {
      id: created.id,
      outletId: created.outletId,
      categoryId: created.categoryId,
      name: created.name,
      description: created.description,
      priceMinor: input.priceMinor,
      price: priceDecimal,
      isVeg: created.isVeg,
      taxRate: (created.taxRate ?? 5.0).toString(),
      isActive: created.isActive,
    };
  }

  async createModifierGroup(outletId: string, name: string, minSelect: number, maxSelect: number) {
    return this.prisma.modifierGroup.create({
      data: { outletId, name, minSelect, maxSelect },
    });
  }

  async createModifierOption(outletId: string, modifierGroupId: string, name: string, priceMinor: bigint) {
    return this.prisma.modifier_options.create({
      data: { outletId, modifierGroupId, name, price: priceMinor },
    });
  }

  async updateMenuItem(outletId: string, itemId: string, patch: Partial<MenuItemInput>) {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
    if (patch.isVeg !== undefined) data.isVeg = patch.isVeg;
    if (patch.priceMinor !== undefined) data.price = (Number(patch.priceMinor) / 100).toFixed(2);
    if (patch.taxRate !== undefined) data.taxRate = Number(patch.taxRate).toFixed(2);

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data,
    });
    return updated;
  }

  async deleteMenuItem(outletId: string, itemId: string) {
    // Soft delete: items may be referenced by historical orders/KOTs, so we
    // never hard-delete a menu item. isActive=false hides it from listAllItems.
    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }

  async updateCategory(outletId: string, categoryId: string, patch: { name?: string; description?: string; sortOrder?: number }) {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    return this.prisma.menuCategory.update({ where: { id: categoryId }, data });
  }

  async deleteCategory(outletId: string, categoryId: string) {
    // Soft delete: a category with existing items must not vanish from history.
    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    });
  }

  async listModifierGroups(outletId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { outletId, is_active: true },
      orderBy: { name: "asc" },
    });
  }

  async listModifierOptions(outletId: string, modifierGroupId: string) {
    return (this.prisma as any).modifier_options.findMany({
      where: { outlet_id: outletId, modifier_group_id: modifierGroupId, is_active: true },
      orderBy: { sort_order: "asc" },
    });
  }

  async updateModifierGroup(outletId: string, groupId: string, patch: { name?: string; minSelect?: number; maxSelect?: number }) {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.minSelect !== undefined) data.minSelect = patch.minSelect;
    if (patch.maxSelect !== undefined) data.maxSelect = patch.maxSelect;
    return this.prisma.modifierGroup.update({ where: { id: groupId }, data });
  }

  async deleteModifierGroup(outletId: string, groupId: string) {
    return this.prisma.modifierGroup.update({ where: { id: groupId }, data: { is_active: false } });
  }

  async unlinkModifierFromItem(menuItemId: string, modifierGroupId: string) {
    return (this.prisma as any).item_modifier_groups.deleteMany({
      where: { item_id: menuItemId, group_id: modifierGroupId },
    });
  }

  async linkModifierToItem(outletId: string, menuItemId: string, modifierGroupId: string) {
    return (this.prisma as any).item_modifier_groups.create({
      data: { outlet_id: outletId, item_id: menuItemId, group_id: modifierGroupId },
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
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row: any) => ({
      id: row.id,
      outletId: row.outletId,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? "General",
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor !== undefined ? BigInt(row.priceMinor) : BigInt(Math.round(Number(row.price || 0) * 100)),
      isVeg: Boolean(row.isVeg),
      taxRate: (row.taxRate ?? 5.0).toString(),
      isActive: row.isActive !== false,
      availability: row.availabilities && row.availabilities[0]
        ? {
            isStocked: row.availabilities[0].isStocked,
            stockQty: row.availabilities[0].stockQty,
            version: row.availabilities[0].version,
          }
        : {
            isStocked: true,
            stockQty: 100,
            version: 1,
          },
    }));
  }

  async listByCategory(categoryId: string): Promise<MenuItemView[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { categoryId },
      include: { category: true },
    });
    return rows.map((row: any) => ({
      id: row.id,
      outletId: row.outletId,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? "General",
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor !== undefined ? BigInt(row.priceMinor) : BigInt(Math.round(Number(row.price || 0) * 100)),
      isVeg: Boolean(row.isVeg),
      taxRate: (row.taxRate ?? 5.0).toString(),
      isActive: row.isActive !== false,
      availability: {
        isStocked: true,
        stockQty: 100,
        version: 1,
      },
    }));
  }
}
