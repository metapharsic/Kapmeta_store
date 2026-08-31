import { Router } from "express";
import { prisma } from "../db";
import { PrismaMenuCatalogRepository } from "@kapmeta/menu";
import {
  createOrder,
  PrismaMenuPriceLookup,
  PrismaModifierPriceLookup,
  PrismaOrderRepository,
} from "@kapmeta/orders";
import type { OrderLineInput } from "@kapmeta/shared-types/orders";

const router = Router();

router.get("/public/tables/:tableId/menu", async (req, res) => {
  try {
    const table = await prisma.diningTable.findFirst({
      where: { id: req.params.tableId, isActive: true },
    });
    if (!table) {
      res.status(404).json({ error: "table not found" });
      return;
    }

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const [categories, items] = await Promise.all([
      catalogRepository.listCategories(table.outletId),
      catalogRepository.listAllItems(table.outletId),
    ]);

    res.status(200).json({
      table: { id: table.id, tableNumber: table.tableNumber, section: table.section },
      categories,
      items: items
        // Don't let customers order items the kitchen has 86'd or run out of.
        .filter((item) => !item.availability || item.availability.isStocked)
        .map((item) => ({ ...item, priceMinor: String(item.priceMinor) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/public/tables/:tableId/order", async (req, res) => {
  try {
    const table = await prisma.diningTable.findFirst({
      where: { id: req.params.tableId, isActive: true },
    });
    if (!table) {
      res.status(404).json({ error: "table not found" });
      return;
    }

    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (rawLines.length === 0) {
      res.status(400).json({ error: "lines required" });
      return;
    }

    // Only pull through the fields a customer legitimately controls
    // (item, quantity, modifiers, notes) — price is intentionally never
    // accepted from the client; it's resolved server-side by createOrder via
    // PrismaMenuPriceLookup, exactly like the staff-side flow in orders.ts.
    const lines: OrderLineInput[] = rawLines.map((line: any) => ({
      menuItemId: String(line.menuItemId),
      quantity: Number(line.quantity) || 0,
      modifierOptionIds: Array.isArray(line.modifierOptionIds) ? line.modifierOptionIds.map(String) : [],
      notes: typeof line.notes === "string" ? line.notes : undefined,
    }));

    if (lines.some((line) => !line.menuItemId || line.quantity <= 0)) {
      res.status(400).json({ error: "each line requires a valid menuItemId and quantity" });
      return;
    }

    // idempotencyKey is client-generated (per DEC-002) so a flaky connection
    // retrying a submit doesn't double-fire the order into the kitchen.
    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey
        ? req.body.idempotencyKey
        : `qr-${table.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const result = await createOrder(
      {
        outletId: table.outletId,
        terminalNumber: "QR-SELF-ORDER",
        orderType: "DINE_IN",
        idempotencyKey,
        lines,
        diningTableId: table.id,
      },
      new PrismaMenuPriceLookup(prisma),
      new PrismaOrderRepository(prisma),
      new PrismaModifierPriceLookup(prisma)
    );

    const detail = await prisma.order.findUnique({
      where: { id: result.id },
      select: { orderNumber: true },
    });

    res
      .status(result.alreadyExisted ? 200 : 201)
      .json({ orderId: result.id, orderNumber: detail?.orderNumber ?? null, status: result.status });
  } catch (err) {
    if (err instanceof Error && /no price found for (menu item|modifier option)/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export const publicOrderRouter = router;
