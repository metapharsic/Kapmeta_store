// apps/api/src/routes/menu-channel-pricing.ts
//
// Backs the "Menu Management -- <Channel>" screens (Base Menu / Home
// Delivery / Parcel / Dine In AC / Dine In Non AC / Zomato / Swiggy).
// menu_items carries exactly one item-wide price; item_channel_prices (new
// this session, see db/migrations/0041_channel_pricing_and_virtual_outlets.sql)
// is a per-(outlet, item, channel) override on top of it. Absence of a row
// for a given channel means the item's own base menu_items.price is the
// effective price for that channel -- never zero, never null -- until
// someone explicitly overrides it via PUT here.
//
// Neither item_channel_prices (a brand-new table/model) nor menu_items'
// new short_code column have been picked up by `prisma generate` yet, so
// every access to either goes through `(prisma as any)` / `(x as any)`,
// exactly the pattern menu-scheduling.ts and physical-menu.ts use for their
// own new-this-session tables/columns.

import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { sendServerError } from "../errors";

const router = Router();

// Must match the CHECK constraint on item_channel_prices.channel exactly
// (0041_channel_pricing_and_virtual_outlets.sql).
const CHANNELS = [
  "BASE",
  "HOME_DELIVERY",
  "PARCEL",
  "DINE_IN_AC",
  "DINE_IN_NON_AC",
  "ZOMATO",
  "SWIGGY",
] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}

// Base (unmodified) price for an item, in minor units -- same conversion
// PrismaMenuCatalogRepository.listAllItems and GET /menu/availability use:
// menu_items.price is stored as decimal rupees, not minor units.
function basePriceMinor(item: { price: unknown }): bigint {
  return BigInt(Math.round(Number((item as any).price || 0) * 100));
}

// GET /menu/channel-prices?channel=BASE&categoryId=&search=
// Every menu item for the caller's outlet (optionally filtered by category
// and/or a name search), each with the effective price/name/availability
// for the requested channel -- the item_channel_prices override if one
// exists, else the item's own base price (never null/0) and honest
// defaults (isAvailable: true, onlineDisplayName: null) for the rest.
router.get("/channel-prices", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { channel, categoryId, search } = req.query;

    if (!isChannel(channel)) {
      res.status(400).json({
        error: `channel must be one of: ${CHANNELS.join(", ")}`,
      });
      return;
    }

    const where: Record<string, unknown> = { outletId, isActive: true };
    if (typeof categoryId === "string" && categoryId) {
      where.categoryId = categoryId;
    }
    if (typeof search === "string" && search.trim()) {
      where.name = { contains: search.trim(), mode: "insensitive" };
    }

    const items = await prisma.menuItem.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
    });

    const overrides = items.length
      ? await (prisma as any).itemChannelPrice.findMany({
          where: {
            outletId,
            channel,
            itemId: { in: items.map((item) => item.id) },
          },
        })
      : [];
    const overrideByItemId = new Map<string, any>(
      overrides.map((row: any) => [row.itemId, row])
    );

    res.status(200).json(
      items.map((item) => {
        const override = overrideByItemId.get(item.id);
        return {
          id: item.id,
          name: item.name,
          shortCode: (item as any).shortCode ?? null,
          description: item.description ?? null,
          categoryName: item.category?.name ?? "General",
          priceMinor: override ? String(override.priceMinor) : String(basePriceMinor(item)),
          onlineDisplayName: override ? override.onlineDisplayName ?? null : null,
          isAvailable: override ? override.isAvailable : true,
          hasOverride: Boolean(override),
        };
      })
    );
  } catch (err) {
    sendServerError(res, err, "GET /menu/channel-prices");
  }
});

// PUT /menu/channel-prices/:itemId
// body: { channel, priceMinor, onlineDisplayName?, isAvailable? }
// Upserts the per-channel override row for this item. Validates the item
// belongs to the caller's outlet before writing anything.
router.put("/channel-prices/:itemId", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { itemId } = req.params;
    const { channel, priceMinor, onlineDisplayName, isAvailable } = req.body ?? {};

    if (!isChannel(channel)) {
      res.status(400).json({
        error: `channel must be one of: ${CHANNELS.join(", ")}`,
      });
      return;
    }

    const priceMinorNum = Number(priceMinor);
    if (priceMinor === undefined || priceMinor === null || !Number.isFinite(priceMinorNum) || priceMinorNum < 0) {
      res.status(400).json({ error: "priceMinor is required and must be a non-negative number" });
      return;
    }

    if (onlineDisplayName !== undefined && onlineDisplayName !== null && typeof onlineDisplayName !== "string") {
      res.status(400).json({ error: "onlineDisplayName must be a string" });
      return;
    }

    if (isAvailable !== undefined && typeof isAvailable !== "boolean") {
      res.status(400).json({ error: "isAvailable must be a boolean" });
      return;
    }

    const item = await prisma.menuItem.findFirst({ where: { id: itemId, outletId } });
    if (!item) {
      res.status(404).json({ error: "menu item not found" });
      return;
    }

    const priceMinorValue = BigInt(Math.round(priceMinorNum));

    const existing = await (prisma as any).itemChannelPrice.findFirst({
      where: { outletId, itemId, channel },
    });

    let row;
    if (existing) {
      row = await (prisma as any).itemChannelPrice.update({
        where: { id: existing.id },
        data: {
          priceMinor: priceMinorValue,
          ...(onlineDisplayName !== undefined ? { onlineDisplayName: onlineDisplayName || null } : {}),
          ...(isAvailable !== undefined ? { isAvailable } : {}),
        },
      });
    } else {
      row = await (prisma as any).itemChannelPrice.create({
        data: {
          outletId,
          itemId,
          channel,
          priceMinor: priceMinorValue,
          onlineDisplayName: onlineDisplayName || null,
          isAvailable: typeof isAvailable === "boolean" ? isAvailable : true,
        },
      });
    }

    res.status(200).json({
      id: item.id,
      name: item.name,
      shortCode: (item as any).shortCode ?? null,
      description: item.description ?? null,
      categoryName: null,
      priceMinor: String(row.priceMinor),
      onlineDisplayName: row.onlineDisplayName ?? null,
      isAvailable: row.isAvailable,
      hasOverride: true,
    });
  } catch (err) {
    sendServerError(res, err, "PUT /menu/channel-prices/:itemId");
  }
});

export const menuChannelPricingRouter = router;
