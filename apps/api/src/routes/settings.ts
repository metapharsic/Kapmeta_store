import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "../middleware/require-auth";

const prisma = new PrismaClient();

export const settingsRouter = Router();

// GET /settings/outlet-status
settingsRouter.get("/settings/outlet-status", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const status = await (prisma as any).outlet_status.findUnique({
      where: { outlet_id: outletId },
    });

    res.status(200).json({
      isOnline: status?.is_online ?? true,
      updatedAt: status?.updated_at?.toISOString() ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// POST /settings/outlet-status
settingsRouter.post("/settings/outlet-status", requireAuth, async (req: AuthedRequest, res) => {
  const { isOnline } = req.body;

  if (typeof isOnline !== "boolean") {
    return res.status(400).json({ error: "isOnline must be boolean" });
  }

  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const status = await (prisma as any).outlet_status.upsert({
      where: { outlet_id: outletId },
      create: {
        outlet_id: outletId,
        is_online: isOnline,
        updated_by: userId,
      },
      update: {
        is_online: isOnline,
        updated_at: new Date(),
        updated_by: userId,
      },
    });

    res.status(200).json({
      isOnline: status.is_online,
      updatedAt: status.updated_at.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});
