import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import {
  PrismaAvailabilityRepository,
  PrismaMenuCatalogRepository,
  setAvailability,
  listAvailability,
} from "@kapmeta/menu";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const prisma = new PrismaClient();

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

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const item = await catalogRepository.createMenuItem({
      outletId,
      categoryId,
      name,
      description,
      priceMinor: BigInt(priceMinor),
      isVeg: typeof isVeg === "boolean" ? isVeg : undefined,
      taxRate: typeof taxRate === "number" ? taxRate : undefined,
    });

    res.status(201).json({ ...item, price: String(item.price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
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
    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const link = await catalogRepository.linkModifierToItem(req.params.menuItemId, req.params.modifierGroupId);

    res.status(201).json(link);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
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

    const availabilityRepository = new PrismaAvailabilityRepository(prisma);
    const items = await listAvailability(outletId, availabilityRepository);

    res.status(200).json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.patch("/items/:menuItemId/availability", requireAuth, requirePermission("menu.86.toggle"), async (req: AuthedRequest, res) => {
  try {
    const { isStocked, stockQty, expectedVersion } = req.body;
    const outletId = req.auth!.outletId;

    const availabilityRepository = new PrismaAvailabilityRepository(prisma);
    const result = await setAvailability(
      req.params.menuItemId,
      outletId,
      isStocked,
      stockQty,
      expectedVersion,
      availabilityRepository,
      req.auth!.userId
    );

    if (!result.ok) {
      res.status(409).json({ error: "stale version", currentVersion: result.currentVersion });
      return;
    }

    import("../websockets").then(({ broadcast }) => {
      broadcast("menu.availability.updated", {
        menuItemId: req.params.menuItemId,
        outletId,
        isStocked,
        stockQty,
        version: result.newVersion
      });
    });

    res.status(200).json({ newVersion: result.newVersion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export const menuRouter = router;
