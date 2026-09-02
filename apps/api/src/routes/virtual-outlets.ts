// apps/api/src/routes/virtual-outlets.ts
//
// Backs the "Add Virtual Outlet" / "Add Outlet" entry card. Per
// db/migrations/0041_channel_pricing_and_virtual_outlets.sql, a virtual
// outlet is kept minimal: an ordinary outlets row with is_virtual = true
// and a nullable self-referencing parent_outlet_id -- no deeper screen was
// in the reference material, so no update/delete here this round.
//
// outlets.is_virtual / outlets.parent_outlet_id are new this session and
// not yet picked up by `prisma generate`, so every access to them goes
// through `(x as any)`, exactly the pattern menu-channel-pricing.ts uses
// for menu_items.short_code.

import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { sendServerError } from "../errors";

const router = Router();

function serialize(outlet: any) {
  return {
    id: outlet.id,
    organizationId: outlet.organizationId,
    code: outlet.code,
    name: outlet.name,
    address: outlet.address ?? null,
    phone: outlet.phone ?? null,
    email: outlet.email ?? null,
    isActive: outlet.isActive,
    isVirtual: outlet.isVirtual ?? true,
    parentOutletId: outlet.parentOutletId ?? null,
    createdAt: outlet.createdAt,
    updatedAt: outlet.updatedAt,
  };
}

// GET /outlets/virtual
// Virtual outlets whose parent is the caller's current outlet.
router.get("/virtual", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;

    const virtualOutlets = await (prisma as any).outlet.findMany({
      where: { parentOutletId: outletId },
      orderBy: { name: "asc" },
    });

    res.status(200).json(virtualOutlets.map(serialize));
  } catch (err) {
    sendServerError(res, err, "GET /outlets/virtual");
  }
});

// POST /outlets/virtual
// body: { name }. Creates a virtual outlet under the caller's current
// outlet, inheriting organizationId/currency/timezone from the parent
// outlet's own row rather than hardcoding them. A short, unique-enough
// code is derived from the parent's code since outlets.code is required
// and no code is meaningful for a virtual outlet on its own.
router.post("/virtual", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { name } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const parentOutlet = await prisma.outlet.findUnique({ where: { id: outletId } });
    if (!parentOutlet) {
      res.status(404).json({ error: "outlet not found" });
      return;
    }

    const code = `${(parentOutlet as any).code}-VO-${Date.now().toString(36).toUpperCase()}`;

    const virtualOutlet = await (prisma as any).outlet.create({
      data: {
        organizationId: (parentOutlet as any).organizationId,
        code,
        name: name.trim(),
        timezone: (parentOutlet as any).timezone,
        currency: (parentOutlet as any).currency,
        isActive: true,
        isVirtual: true,
        parentOutletId: outletId,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    res.status(201).json(serialize(virtualOutlet));
  } catch (err) {
    sendServerError(res, err, "POST /outlets/virtual");
  }
});

export const virtualOutletsRouter = router;
