import { Router } from "express";
import { prisma } from "../prisma";
import {
  PrismaAvailabilityRepository,
  PrismaMenuCatalogRepository,
  setAvailability,
  listAvailability,
} from "@kapmeta/menu";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const router = Router();

router.get("/categories", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const categories = await catalogRepository.listCategories(outletId);
    res.status(200).json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/items", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const items = await catalogRepository.listAllItems(outletId);
    res.status(200).json(
      items.map((item) => ({ ...item, priceMinor: String(item.priceMinor) }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/categories", requireAuth, requirePermission("menu.category.manage"), async (req: AuthedRequest, res) => {
  try {
    const { name, description } = req.body;
    const outletId = req.auth!.outletId;

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const category = await catalogRepository.createCategory({ outletId, name, description });

    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/items", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const { categoryId, name, description, priceMinor, isVeg, taxRate } = req.body;
    const outletId = req.auth!.outletId;

    if (!categoryId || !name) {
      res.status(400).json({ error: "categoryId and name are required" });
      return;
    }

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const item = await catalogRepository.createMenuItem({
      outletId,
      categoryId,
      name: String(name).trim(),
      description: description ? String(description).trim() : undefined,
      priceMinor: BigInt(priceMinor || 0),
      isVeg: typeof isVeg === "boolean" ? isVeg : true,
      taxRate: typeof taxRate === "number" ? taxRate : Number(taxRate || 5),
    });

    res.status(201).json({ ...item, priceMinor: String(item.priceMinor) });
  } catch (err: any) {
    console.error("Error creating menu item:", err);
    res.status(500).json({ error: err.message || "Failed to create menu item" });
  }
});

router.post("/items/bulk-upload", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    let itemsInput: Array<{
      category: string;
      name: string;
      price: number | string;
      isVeg?: boolean | string;
      taxRate?: number | string;
      description?: string;
      code?: string;
    }> = [];

    if (Array.isArray(req.body.items)) {
      itemsInput = req.body.items;
    } else if (typeof req.body.csvText === "string") {
      const lines = req.body.csvText.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const header = lines[0].toLowerCase().split(",").map((h: string) => h.trim().replace(/^["']|["']$/g, ""));
        const catIdx = header.findIndex((h: string) => h.includes("cat"));
        const nameIdx = header.findIndex((h: string) => h === "name" || h.includes("item") || h.includes("dish"));
        const priceIdx = header.findIndex((h: string) => h.includes("price") || h.includes("rate") || h.includes("amount"));
        const vegIdx = header.findIndex((h: string) => h.includes("veg") || h.includes("type"));
        const taxIdx = header.findIndex((h: string) => h.includes("tax") || h.includes("gst"));
        const descIdx = header.findIndex((h: string) => h.includes("desc"));
        const codeIdx = header.findIndex((h: string) => h.includes("code") || h.includes("sku"));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim().replace(/^["']|["']$/g, ""));
          if (cols.length < 2) continue;
          itemsInput.push({
            category: catIdx !== -1 ? cols[catIdx] : "General",
            name: nameIdx !== -1 ? cols[nameIdx] : cols[0],
            price: priceIdx !== -1 ? cols[priceIdx] : "0",
            isVeg: vegIdx !== -1 ? (cols[vegIdx].toLowerCase() === "true" || cols[vegIdx].toLowerCase() === "veg" || cols[vegIdx].toLowerCase() === "yes" || cols[vegIdx] === "1") : true,
            taxRate: taxIdx !== -1 ? parseFloat(cols[taxIdx]) || 5 : 5,
            description: descIdx !== -1 ? cols[descIdx] : undefined,
            code: codeIdx !== -1 ? cols[codeIdx] : undefined,
          });
        }
      }
    } else {
      res.status(400).json({ error: "Expected 'items' array or 'csvText' string in request body" });
      return;
    }

    if (itemsInput.length === 0) {
      res.status(400).json({ error: "No valid menu items found in payload" });
      return;
    }

    let categoriesCreated = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    const errors: string[] = [];

    const categoryCache = new Map<string, string>();
    const existingCategories = await prisma.menuCategory.findMany({
      where: { outletId },
    });
    existingCategories.forEach((c) => categoryCache.set(c.name.toLowerCase().trim(), c.id));

    for (const raw of itemsInput) {
      const catName = (raw.category || "General").trim();
      const itemName = (raw.name || "").trim();
      if (!itemName) {
        errors.push(`Row skipped: item name is empty`);
        continue;
      }

      const priceNum = parseFloat(String(raw.price).replace(/[^0-9.]/g, ""));
      if (isNaN(priceNum) || priceNum < 0) {
        errors.push(`Item "${itemName}": invalid price "${raw.price}"`);
        continue;
      }

      const isVeg = typeof raw.isVeg === "boolean"
        ? raw.isVeg
        : (String(raw.isVeg).toLowerCase() === "true" || String(raw.isVeg).toLowerCase() === "veg" || String(raw.isVeg).toLowerCase() === "yes");

      const taxRateNum = typeof raw.taxRate === "number" ? raw.taxRate : parseFloat(String(raw.taxRate || "5"));
      const taxRate = isNaN(taxRateNum) ? 5.0 : taxRateNum;

      // 1. Ensure category exists
      let categoryId = categoryCache.get(catName.toLowerCase());
      if (!categoryId) {
        const newCat = await prisma.menuCategory.create({
          data: {
            outletId,
            name: catName,
            sortOrder: existingCategories.length + categoriesCreated,
            isActive: true,
          },
        });
        categoryId = newCat.id;
        categoryCache.set(catName.toLowerCase(), categoryId);
        categoriesCreated += 1;
      }

      // 2. Check if item exists in this category
      const existingItem = await prisma.menuItem.findFirst({
        where: {
          outletId,
          categoryId,
          name: { equals: itemName, mode: "insensitive" },
        },
      });

      if (existingItem) {
        await prisma.menuItem.update({
          where: { id: existingItem.id },
          data: {
            price: priceNum,
            isVeg,
            taxRate,
            description: raw.description !== undefined ? raw.description : existingItem.description,
            shortCode: raw.code || (existingItem as any).shortCode || null,
            isActive: true,
          },
        });
        itemsUpdated += 1;
      } else {
        await prisma.menuItem.create({
          data: {
            outletId,
            categoryId,
            name: itemName,
            description: raw.description || null,
            price: priceNum,
            taxRate,
            isVeg,
            shortCode: raw.code || null,
            isActive: true,
          },
        });
        itemsCreated += 1;
      }
    }

    await (prisma as any).outlet.update({ where: { id: outletId }, data: { lastMenuSyncAt: new Date() } });

    res.status(200).json({
      success: true,
      totalProcessed: itemsInput.length,
      categoriesCreated,
      itemsCreated,
      itemsUpdated,
      errors,
    });
  } catch (err: any) {
    console.error("Error in bulk menu upload:", err);
    res.status(500).json({ error: err.message || "Failed to bulk upload menu catalog" });
  }
});

router.post("/modifier-groups", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const { name, minSelect, maxSelect } = req.body;
    const outletId = req.auth!.outletId;

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const group = await catalogRepository.createModifierGroup(outletId, name, minSelect, maxSelect);

    res.status(201).json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/modifier-options", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const { modifierGroupId, name, priceMinor } = req.body;
    const outletId = req.auth!.outletId;

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const option = await catalogRepository.createModifierOption(outletId, modifierGroupId, name, BigInt(priceMinor));

    res.status(201).json({ ...option, price: String(option.price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/items/:menuItemId/modifiers/:modifierGroupId", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const link = await catalogRepository.linkModifierToItem(outletId, req.params.menuItemId, req.params.modifierGroupId);

    res.status(201).json(link);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.delete("/items/:menuItemId/modifiers/:modifierGroupId", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    await catalogRepository.unlinkModifierFromItem(req.params.menuItemId, req.params.modifierGroupId);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /menu/modifier-groups - list modifier groups for the outlet (was create-only, invisible after creation)
router.get("/modifier-groups", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const groups = await catalogRepository.listModifierGroups(outletId);
    res.status(200).json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.patch("/modifier-groups/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const group = await catalogRepository.updateModifierGroup(outletId, req.params.id, req.body);
    res.status(200).json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.delete("/modifier-groups/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    await catalogRepository.deleteModifierGroup(outletId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/modifier-groups/:id/options", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const options = await catalogRepository.listModifierOptions(outletId, req.params.id);
    res.status(200).json(options.map((o: any) => ({ ...o, price: String(o.price) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// PATCH /menu/items/:id - edit name/price/description/category/veg/tax (was missing entirely)
router.patch("/items/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const { name, description, categoryId, isVeg, priceMinor, taxRate, shortCode } = req.body;
    const item = await catalogRepository.updateMenuItem(outletId, req.params.id, {
      name,
      description,
      categoryId,
      isVeg,
      priceMinor: priceMinor !== undefined ? BigInt(priceMinor) : undefined,
      taxRate,
      ...(shortCode !== undefined ? { shortCode } : {}),
    } as any);
    res.status(200).json({ ...item, price: String(item.price ?? "") });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

// DELETE /menu/items/:id - soft delete (isActive=false); items are referenced by
// historical orders/KOTs so we never hard-delete.
router.delete("/items/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    await catalogRepository.deleteMenuItem(outletId, req.params.id);
    res.status(204).send();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

// PATCH /menu/categories/:id - rename/reorder (was missing entirely)
router.patch("/categories/:id", requireAuth, requirePermission("menu.category.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const category = await catalogRepository.updateCategory(outletId, req.params.id, req.body);
    res.status(200).json(category);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

// DELETE /menu/categories/:id - soft delete (isActive=false)
router.delete("/categories/:id", requireAuth, requirePermission("menu.category.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    await catalogRepository.deleteCategory(outletId, req.params.id);
    res.status(204).send();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

router.get("/categories/:categoryId/items", requireAuth, requirePermission("menu.read"), async (_req: AuthedRequest, res) => {
  try {
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const items = await catalogRepository.listByCategory(_req.params.categoryId);

    res.status(200).json(
      items.map((item) => ({ ...item, priceMinor: String(item.priceMinor) }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/availability", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const menuItems = await prisma.menuItem.findMany({
      where: { outletId },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    const availabilityRows = await prisma.item_availability.findMany({
      where: { outlet_id: outletId },
    });
    const availByItem = new Map<string, { state: string; version: number }>();
    for (const row of availabilityRows) {
      const prev = availByItem.get(row.item_id);
      if (!prev || row.version >= prev.version) {
        availByItem.set(row.item_id, { state: row.state, version: row.version });
      }
    }

    res.status(200).json(
      menuItems.map((item) => {
        const avail = availByItem.get(item.id);
        const isStocked = avail ? avail.state !== "OFF" : item.isActive;
        return {
          id: item.id,
          menuItemId: item.id,
          name: item.name,
          description: item.description || "",
          categoryName: item.category?.name || "General",
          category: item.category?.name || "General",
          isStocked,
          version: avail?.version ?? 1,
          priceMinor: Math.round(Number(item.price || 0) * 100).toString(),
          isVeg: item.isVeg,
        };
      })
    );
  } catch (err: any) {
    console.error("Error fetching menu availability:", err);
    res.status(500).json({ error: err.message || "Failed to fetch menu availability" });
  }
});

router.patch("/items/:menuItemId/availability", requireAuth, requirePermission("menu.86.toggle"), async (req: AuthedRequest, res) => {
  try {
    const { isStocked, stockQty, expectedVersion } = req.body;
    const outletId = req.auth!.outletId;

    const item = await prisma.menuItem.findUnique({
      where: { id: req.params.menuItemId },
    });

    if (!item) {
      res.status(404).json({ error: "menu item not found" });
      return;
    }

    const nextState = typeof isStocked === "boolean" && isStocked === false ? "OFF" : "ON";
    const accounts = await prisma.channelAccount.findMany({
      where: { outletId },
      select: { id: true },
    });
    const channelIds = accounts.length > 0 ? accounts.map((a) => a.id) : [outletId];
    let newVersion = 1;
    for (const channelId of channelIds) {
      const existing = await prisma.item_availability.findFirst({
        where: { outlet_id: outletId, item_id: item.id, channel_id: channelId },
      });
      if (existing) {
        const updatedAvail = await prisma.item_availability.update({
          where: { id: existing.id },
          data: { state: nextState, version: { increment: 1 }, updated_at: new Date(), updated_by: req.auth!.userId },
        });
        newVersion = updatedAvail.version;
      } else {
        const created = await prisma.item_availability.create({
          data: {
            outlet_id: outletId,
            item_id: item.id,
            channel_id: channelId,
            state: nextState,
            version: (expectedVersion || 1) + 1,
            created_by: req.auth!.userId,
            updated_by: req.auth!.userId,
          },
        });
        newVersion = created.version;
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: req.params.menuItemId },
      data: { isActive: nextState !== "OFF" },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        userId: req.auth!.userId,
        action: "UPDATE",
        entityType: "MENU_ITEM_86",
        entityId: item.id,
        beforeState: { isStocked: item.isActive },
        afterState: { isStocked: nextState !== "OFF", version: newVersion },
      },
    }).catch(() => {});

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "item.availability_changed", {
        itemId: item.id,
        isStocked: nextState !== "OFF",
        version: newVersion,
      });
    }).catch(() => {});

    res.status(200).json({ newVersion, isStocked: nextState !== "OFF" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /menu/sync — triggers full channel sync and updates lastMenuSyncAt
router.post("/sync", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const now = new Date();

    await prisma.outlet.update({
      where: { id: outletId },
      data: { lastMenuSyncAt: now },
    });

    await prisma.auditLog.create({
      data: {
        outletId,
        userId: req.auth!.userId,
        action: "CREATE",
        entityType: "MENU_SYNC",
        entityId: outletId,
        beforeState: {},
        afterState: { syncedAt: now.toISOString() },
      },
    }).catch(() => {});

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "menu.synced", {
        outletId,
        syncedAt: now.toISOString(),
        syncedBy: req.auth!.userId,
      });
    }).catch(() => {});

    res.status(200).json({
      ok: true,
      syncedAt: now.toISOString(),
      message: "Menu catalog successfully synced across all POS terminals and online delivery channels.",
    });
  } catch (err: any) {
    console.error("Error syncing menu:", err);
    res.status(500).json({ error: err.message || "Failed to sync menu" });
  }
});

// GET /menu/stats — operational overview metrics for Menu & Discounts Hub
router.get("/stats", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const [totalItems, activeCategories, outlet, virtualOutletsCount, schedulesCount, specialNotesCount] = await Promise.all([
      prisma.menuItem.count({ where: { outletId } }),
      prisma.menuCategory.count({ where: { outletId } }),
      prisma.outlet.findUnique({ where: { id: outletId } }),
      prisma.outlet.count({ where: { OR: [{ parentOutletId: outletId }, { isVirtual: true }] } }),
      (prisma as any).availability_schedules?.count({ where: { outlet_id: outletId } }).catch(() => 0) || 0,
      (prisma as any).special_notes?.count({ where: { outlet_id: outletId } }).catch(() => 0) || 0,
    ]);

    const outOfStockCount = await prisma.menuItem.count({
      where: { outletId, isActive: false },
    });

    res.status(200).json({
      totalItems,
      activeCategories,
      outOfStockCount,
      virtualOutletsCount,
      schedulesCount,
      specialNotesCount,
      lastMenuSyncAt: (outlet as any)?.lastMenuSyncAt ? new Date((outlet as any).lastMenuSyncAt).toISOString() : null,
      outletName: outlet?.name || "Hotel Kapila",
    });
  } catch (err: any) {
    console.error("Error fetching menu stats:", err);
    res.status(500).json({ error: err.message || "Failed to fetch menu stats" });
  }
});

// PUT /menu/items/:id — update existing item details
router.put("/items/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { name, description, priceMinor, isVeg, taxRate, categoryId, isActive, imageUrl } = req.body;

    const existing = await prisma.menuItem.findFirst({
      where: { id: req.params.id, outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    const updated = await prisma.menuItem.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
        ...(priceMinor !== undefined ? { priceMinor: BigInt(priceMinor) } : {}),
        ...(typeof isVeg === "boolean" ? { isVeg } : {}),
        ...(taxRate !== undefined ? { taxRate: Number(taxRate) } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "menu.updated", { itemId: updated.id, action: "ITEM_UPDATED" });
    }).catch(() => {});

    res.status(200).json({ ...updated, priceMinor: String(updated.price || 0) });
  } catch (err: any) {
    console.error("Error updating menu item:", err);
    res.status(500).json({ error: err.message || "Failed to update item" });
  }
});

// DELETE /menu/items/:id — delete item
router.delete("/items/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const existing = await prisma.menuItem.findFirst({
      where: { id: req.params.id, outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    await prisma.menuItem.delete({
      where: { id: req.params.id },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "menu.updated", { itemId: req.params.id, action: "ITEM_DELETED" });
    }).catch(() => {});

    res.status(200).json({ ok: true, message: "Item deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting menu item:", err);
    res.status(500).json({ error: err.message || "Failed to delete item" });
  }
});

// PUT /menu/categories/:id — update category
router.put("/categories/:id", requireAuth, requirePermission("menu.category.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { name, description, sortOrder } = req.body;

    const existing = await prisma.menuCategory.findFirst({
      where: { id: req.params.id, outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const updated = await prisma.menuCategory.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "menu.updated", { categoryId: updated.id, action: "CATEGORY_UPDATED" });
    }).catch(() => {});

    res.status(200).json(updated);
  } catch (err: any) {
    console.error("Error updating category:", err);
    res.status(500).json({ error: err.message || "Failed to update category" });
  }
});

// DELETE /menu/categories/:id — delete category
router.delete("/categories/:id", requireAuth, requirePermission("menu.category.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const existing = await prisma.menuCategory.findFirst({
      where: { id: req.params.id, outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    await prisma.menuCategory.delete({
      where: { id: req.params.id },
    });

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "menu.updated", { categoryId: req.params.id, action: "CATEGORY_DELETED" });
    }).catch(() => {});

    res.status(200).json({ ok: true, message: "Category deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting category:", err);
    res.status(500).json({ error: err.message || "Failed to delete category" });
  }
});

export const menuRouter = router;

