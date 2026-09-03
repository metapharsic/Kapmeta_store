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
    if ((patch as any).shortCode !== undefined) data.shortCode = (patch as any).shortCode;

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

  // item_availability has no Prisma relation onto menuItem (see schema.prisma
  // note on that model), so "live" availability/86-status has to be fetched
  // and merged in manually rather than via `include`. A prior version of this
  // file referenced a non-existent `row.availabilities` relation and always
  // fell back to a hardcoded { isStocked: true, stockQty: 100 } stub -- every
  // consumer of listAllItems/listByCategory (waiter app, public QR ordering)
  // therefore always saw items as in-stock regardless of real 86 state. Mirror
  // the same version-max-wins logic used by GET /menu/availability so all
  // surfaces agree.
  private async loadAvailabilityByItem(outletId: string): Promise<Map<string, { isStocked: boolean; stockQty: number; version: number }>> {
    const rows = await (this.prisma as any).item_availability.findMany({
      where: { outlet_id: outletId },
    });
    const byItem = new Map<string, { isStocked: boolean; stockQty: number; version: number }>();
    for (const row of rows) {
      const prev = byItem.get(row.item_id);
      if (!prev || row.version >= prev.version) {
        byItem.set(row.item_id, {
          isStocked: row.state !== "OFF",
          stockQty: row.stock_qty ?? 100,
          version: row.version,
        });
      }
    }
    return byItem;
  }

  async listAllItems(outletId: string): Promise<MenuItemView[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { outletId, isActive: true },
      include: { category: true },
      orderBy: { name: "asc" },
    });
    const availByItem = await this.loadAvailabilityByItem(outletId);
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
      availability: availByItem.get(row.id) ?? {
        isStocked: row.isActive !== false,
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
    const outletId = rows[0]?.outletId;
    const availByItem = outletId ? await this.loadAvailabilityByItem(outletId) : new Map();
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
      availability: availByItem.get(row.id) ?? {
        isStocked: row.isActive !== false,
        stockQty: 100,
        version: 1,
      },
    }));
  }
}
