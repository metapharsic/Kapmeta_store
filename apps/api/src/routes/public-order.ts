import { Router } from "express";
import { prisma } from "../prisma";
import { sendServerError } from "../errors";
import { PrismaMenuCatalogRepository } from "@kapmeta/menu";
import {
  createOrder,
  PrismaMenuPriceLookup,
  PrismaModifierPriceLookup,
  PrismaOrderRepository,
} from "@kapmeta/orders";
import type { OrderLineInput, OrderType } from "@kapmeta/shared-types/orders";

// PUBLIC, unauthenticated router — this is the customer-facing QR self-order
// flow (scan table QR -> browse menu -> place order), plus a tableless
// variant for Delivery/Pickup reached the same way "the app" reaches
// Dine In (no separate login). Unlike every other route in this API, there
// is deliberately no requireAuth here: the customer has no account. All
// trust boundaries instead hinge on:
//   1. either the tableId in the URL resolving to a real, active
//      DiningTable (table-scoped routes), or an outletId/code in the URL
//      resolving to a real, active Outlet (outlet-scoped routes) — never
//      trust an outletId from the request body, and
//   2. prices being re-resolved server-side from the menu catalog for every
//      line via the exact same PrismaMenuPriceLookup/createOrder pipeline the
//      staff-side POST /orders route uses (see routes/orders.ts) — a
//      malicious customer submitting an arbitrary priceMinor in the request
//      body has no effect, since it's never read.
const router = Router();

// Same normalization POS uses in routes/orders.ts (POST /orders) so both
// entry points store identical orderType values — TAKEAWAY and PICKUP both
// become the stored "PICKUP", DELIVERY stays DELIVERY, anything else (or a
// tableless request that doesn't specify one) falls back to DINE_IN.
function normalizeOrderType(raw: unknown, fallback: "DINE_IN" | "PICKUP" | "DELIVERY" = "DINE_IN"): OrderType {
  const t = String(raw ?? "").toUpperCase();
  if (t === "TAKEAWAY" || t === "PICKUP") return "PICKUP" as OrderType;
  if (t === "DELIVERY") return "DELIVERY" as OrderType;
  if (t === "DINE_IN") return "DINE_IN";
  return fallback as OrderType;
}

function serializeMenu(outletName: string | null, categories: unknown, items: any[]) {
  return {
    outletName,
    categories,
    items: items
      // Don't let customers order items the kitchen has 86'd or run out of.
      .filter((item) => !item.availability || item.availability.isStocked)
      .map((item) => ({ ...item, priceMinor: String(item.priceMinor) })),
  };
}

router.get("/public/tables/:tableId/menu", async (req, res) => {
  try {
    const table = await prisma.diningTable.findFirst({
      where: { id: req.params.tableId, isActive: true },
    });
    if (!table) {
      res.status(404).json({ error: "table not found" });
      return;
    }

    const outlet = await prisma.outlet.findUnique({
      where: { id: table.outletId },
      select: { name: true },
    });

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const [categories, items] = await Promise.all([
      catalogRepository.listCategories(table.outletId),
      catalogRepository.listAllItems(table.outletId),
    ]);

    res.status(200).json({
      ...serializeMenu(outlet?.name ?? null, categories, items),
      table: { id: table.id, tableNumber: table.tableNumber, section: table.section },
    });
  } catch (err) {
    sendServerError(res, err, "GET /public/tables/:tableId/menu");
  }
});

// Tableless variant for Delivery/Pickup, reached without ever scanning a
// table QR. There is no existing public outlet-slug mechanism in this repo
// (grepped for "slug" across apps/api and prisma/schema — none), so the
// smallest correct addition is to accept either the real Outlet id or its
// existing human-facing `code` column (schema.prisma Outlet.code) in the URL
// — no new field invented, no new table.
router.get("/public/outlets/:outletSlugOrId/menu", async (req, res) => {
  try {
    const key = req.params.outletSlugOrId;
    const outlet = await prisma.outlet.findFirst({
      where: { isActive: true, OR: [{ id: key }, { code: key }] },
      select: { id: true, name: true },
    });
    if (!outlet) {
      res.status(404).json({ error: "outlet not found" });
      return;
    }

    const catalogRepository = new PrismaMenuCatalogRepository(prisma);
    const [categories, items] = await Promise.all([
      catalogRepository.listCategories(outlet.id),
      catalogRepository.listAllItems(outlet.id),
    ]);

    res.status(200).json(serializeMenu(outlet.name, categories, items));
  } catch (err) {
    sendServerError(res, err, "GET /public/outlets/:outletSlugOrId/menu");
  }
});

function parseLines(body: any): OrderLineInput[] | null {
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  if (rawLines.length === 0) return null;

  // Only pull through the fields a customer legitimately controls (item,
  // quantity, modifiers, notes) — price is intentionally never accepted
  // from the client; it's resolved server-side by createOrder via
  // PrismaMenuPriceLookup, exactly like the staff-side flow in orders.ts.
  const lines: OrderLineInput[] = rawLines.map((line: any) => ({
    menuItemId: String(line.menuItemId),
    quantity: Number(line.quantity) || 0,
    modifierOptionIds: Array.isArray(line.modifierOptionIds) ? line.modifierOptionIds.map(String) : [],
    notes: typeof line.notes === "string" ? line.notes : undefined,
  }));

  if (lines.some((line) => !line.menuItemId || line.quantity <= 0)) return null;
  return lines;
}

router.post("/public/tables/:tableId/order", async (req, res) => {
  try {
    const table = await prisma.diningTable.findFirst({
      where: { id: req.params.tableId, isActive: true },
    });
    if (!table) {
      res.status(404).json({ error: "table not found" });
      return;
    }

    const lines = parseLines(req.body);
    if (!lines) {
      res.status(400).json({ error: "each line requires a valid menuItemId and quantity" });
      return;
    }

    // This route is reached only by scanning a physical table's QR, so it
    // preserves the original hardcoded behavior exactly: DINE_IN with the
    // table attached, regardless of what orderType (if anything) is sent —
    // a customer can't turn a table-scoped scan into a tableless Delivery
    // order from here. Ordering DELIVERY/PICKUP goes through the outlet-
    // scoped route below, mirroring how POS itself has no notion of a
    // "delivery order from table 4".
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
    sendServerError(res, err, "POST /public/tables/:tableId/order");
  }
});

// Tableless order submission for Delivery/Pickup (and, if the customer picks
// it, Dine In with no table attached yet). Mirrors POS's own POST /orders
// (routes/orders.ts) exactly for orderType handling and table linkage: for
// DELIVERY/PICKUP, POS never requires or sets a diningTableId — it's simply
// left undefined — and POS does not require customerName/customerPhone at
// the createOrder layer either (CreateOrderInput has no such fields; POS
// only ever passes customerId, which is likewise optional here). So no new
// required fields are invented for this endpoint.
router.post("/public/outlets/:outletSlugOrId/order", async (req, res) => {
  try {
    const key = req.params.outletSlugOrId;
    const outlet = await prisma.outlet.findFirst({
      where: { isActive: true, OR: [{ id: key }, { code: key }] },
      select: { id: true },
    });
    if (!outlet) {
      res.status(404).json({ error: "outlet not found" });
      return;
    }

    const lines = parseLines(req.body);
    if (!lines) {
      res.status(400).json({ error: "each line requires a valid menuItemId and quantity" });
      return;
    }

    const orderType = normalizeOrderType(req.body?.orderType, "DINE_IN");

    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey
        ? req.body.idempotencyKey
        : `qr-${outlet.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const result = await createOrder(
      {
        outletId: outlet.id,
        terminalNumber: "QR-SELF-ORDER",
        orderType,
        idempotencyKey,
        lines,
        // No table for a tableless Delivery/Pickup order — same convention
        // POS uses (diningTableId left undefined when there's no table).
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
    sendServerError(res, err, "POST /public/outlets/:outletSlugOrId/order");
  }
});

export const publicOrderRouter = router;
