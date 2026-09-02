// apps/api/src/routes/commission.ts
//
// Backs the "Set Menu Commission" screen (Item Commission / Addon Item
// Commission tabs). Item rows come from the existing `menu_items` table,
// addon rows from `modifier_options` -- neither carries a commission by
// default, so each row is left-joined (in application code, not SQL) against
// the new `item_commissions` / `addon_commissions` tables. A menu item or
// addon with no matching commission row renders as "Not Configured" in the
// UI -- this API expresses that as commissionType/commissionValue: null.
//
// item_commissions, addon_commissions and the is_active/category_id columns
// on availability_schedules were added in the schema this session but the
// generated Prisma client has NOT been regenerated and the migration has NOT
// been applied to the live DB yet (see brain notes for this round). Every
// query touching those must go through `(prisma as any)` -- exactly the
// pattern PrismaMenuCatalogRepository.linkModifierToItem uses for
// item_modifier_groups -- and every handler is wrapped so a query against a
// not-yet-existing table degrades to a clean 503 SCHEMA_OUT_OF_SYNC via
// sendServerError, instead of an unhandled 500.

import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { sendServerError } from "../errors";

const router = Router();

const COMMISSION_TYPES = ["PERCENTAGE", "FLAT"];

function parsePagination(query: any): { page: number; limit: number; skip: number; take: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

function parseCommissionBody(body: any): { commissionType: string; commissionValue: number } | { error: string } {
  const commissionType = body?.commissionType;
  if (typeof commissionType !== "string" || !COMMISSION_TYPES.includes(commissionType)) {
    return { error: `commissionType must be one of: ${COMMISSION_TYPES.join(", ")}` };
  }
  const commissionValue = Number(body?.commissionValue);
  if (!Number.isFinite(commissionValue) || commissionValue < 0) {
    return { error: "commissionValue must be a non-negative number" };
  }
  return { commissionType, commissionValue };
}

// ---------------------------------------------------------------------------
// Item Commission tab
// ---------------------------------------------------------------------------

// GET /commission/items?page=&limit=&search=
// All menu items for the outlet (paginated), each carrying its category
// name, price, and commission type/value when configured.
router.get("/items", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { page, limit, skip, take } = parsePagination(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where: any = { outletId };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        include: { category: true },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
      prisma.menuItem.count({ where }),
    ]);

    const itemIds = items.map((item) => item.id);
    const commissions = itemIds.length
      ? await (prisma as any).itemCommission.findMany({
          where: { outletId, menuItemId: { in: itemIds } },
        })
      : [];
    const commissionByItemId = new Map<string, any>(
      commissions.map((row: any) => [row.menuItemId, row])
    );

    const rows = items.map((item) => {
      const commission = commissionByItemId.get(item.id);
      return {
        menuItemId: item.id,
        itemName: item.name,
        categoryId: item.categoryId,
        categoryName: item.category?.name ?? "General",
        itemPrice: item.price !== null && item.price !== undefined ? item.price.toString() : "0",
        commissionType: commission?.commissionType ?? null,
        commissionValue: commission?.commissionValue != null ? commission.commissionValue.toString() : null,
        configured: Boolean(commission),
      };
    });

    res.status(200).json({ items: rows, total, page, limit });
  } catch (err) {
    sendServerError(res, err, "GET /commission/items");
  }
});

// PUT /commission/items/:menuItemId
// Upserts the commission for one menu item. Validated against the caller's
// own outlet -- menu items belonging to another outlet 404 rather than leak
// existence.
router.put("/items/:menuItemId", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { menuItemId } = req.params;

    const parsed = parseCommissionBody(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, outletId } });
    if (!item) {
      res.status(404).json({ error: "menu item not found" });
      return;
    }

    const commission = await (prisma as any).itemCommission.upsert({
      where: { outletId_menuItemId: { outletId, menuItemId } },
      create: {
        outletId,
        menuItemId,
        commissionType: parsed.commissionType,
        commissionValue: parsed.commissionValue,
      },
      update: {
        commissionType: parsed.commissionType,
        commissionValue: parsed.commissionValue,
      },
    });

    res.status(200).json({
      menuItemId: commission.menuItemId,
      commissionType: commission.commissionType,
      commissionValue: commission.commissionValue != null ? commission.commissionValue.toString() : null,
    });
  } catch (err) {
    sendServerError(res, err, "PUT /commission/items/:menuItemId");
  }
});

// ---------------------------------------------------------------------------
// Addon Item Commission tab
// ---------------------------------------------------------------------------

// GET /commission/addons?page=&limit=&search=
// All modifier options ("addon items") for the outlet, each carrying its
// modifier group name (the "Category" column for this tab), price, and
// commission type/value when configured.
router.get("/addons", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { page, limit, skip, take } = parsePagination(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where: any = { outlet_id: outletId };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [addonItems, total] = await Promise.all([
      (prisma as any).modifier_options.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
      }),
      (prisma as any).modifier_options.count({ where }),
    ]);

    const addonIds: string[] = addonItems.map((row: any) => row.id);
    const groupIds: string[] = Array.from(
      new Set<string>(addonItems.map((row: any) => row.modifier_group_id))
    );

    const [commissions, groups] = await Promise.all([
      addonIds.length
        ? (prisma as any).addonCommission.findMany({
            where: { outletId, addonItemId: { in: addonIds } },
          })
        : Promise.resolve([]),
      groupIds.length
        ? prisma.modifierGroup.findMany({ where: { id: { in: groupIds } } })
        : Promise.resolve([]),
    ]);

    const commissionByAddonId = new Map<string, any>(
      commissions.map((row: any) => [row.addonItemId, row])
    );
    const groupNameById = new Map<string, string>(
      groups.map((group): [string, string] => [group.id, group.name])
    );

    const rows = addonItems.map((row: any) => {
      const commission = commissionByAddonId.get(row.id);
      return {
        addonItemId: row.id,
        itemName: row.name,
        categoryId: row.modifier_group_id,
        categoryName: groupNameById.get(row.modifier_group_id) ?? "General",
        itemPrice: row.price != null ? row.price.toString() : "0",
        commissionType: commission?.commissionType ?? null,
        commissionValue: commission?.commissionValue != null ? commission.commissionValue.toString() : null,
        configured: Boolean(commission),
      };
    });

    res.status(200).json({ items: rows, total, page, limit });
  } catch (err) {
    sendServerError(res, err, "GET /commission/addons");
  }
});

// PUT /commission/addons/:addonItemId
// Upserts the commission for one addon item (modifier option). Validated
// against the caller's own outlet.
router.put("/addons/:addonItemId", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { addonItemId } = req.params;

    const parsed = parseCommissionBody(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const addonItem = await (prisma as any).modifier_options.findFirst({
      where: { id: addonItemId, outlet_id: outletId },
    });
    if (!addonItem) {
      res.status(404).json({ error: "addon item not found" });
      return;
    }

    const commission = await (prisma as any).addonCommission.upsert({
      where: { outletId_addonItemId: { outletId, addonItemId } },
      create: {
        outletId,
        addonItemId,
        commissionType: parsed.commissionType,
        commissionValue: parsed.commissionValue,
      },
      update: {
        commissionType: parsed.commissionType,
        commissionValue: parsed.commissionValue,
      },
    });

    res.status(200).json({
      addonItemId: commission.addonItemId,
      commissionType: commission.commissionType,
      commissionValue: commission.commissionValue != null ? commission.commissionValue.toString() : null,
    });
  } catch (err) {
    sendServerError(res, err, "PUT /commission/addons/:addonItemId");
  }
});

export const commissionRouter = router;
