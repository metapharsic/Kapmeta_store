import { Router } from "express";
import { PrismaNotificationRepository } from "@kapmeta/notifications";
import { requireAuth, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
const repo = new PrismaNotificationRepository(prisma);

export const notificationsRouter = Router();

// Every authenticated user sees only their own outlet's notifications
// (personal + outlet-wide broadcasts) — no special permission needed since
// scoping is already by userId/outletId, same as requireAuth's contract.
notificationsRouter.get("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rows = await repo.listForUser(req.auth!.outletId, req.auth!.userId);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

notificationsRouter.patch("/notifications/:id/read", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const updated = await repo.markRead(req.params.id, req.auth!.userId);
    if (!updated) {
      res.status(404).json({ error: "notification not found" });
      return;
    }
    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

notificationsRouter.post("/notifications/read-all", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const count = await repo.markAllRead(req.auth!.outletId, req.auth!.userId);
    res.status(200).json({ markedRead: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});
