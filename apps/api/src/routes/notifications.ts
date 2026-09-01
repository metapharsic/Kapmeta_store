import { Router } from "express";
import crypto from "crypto";
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

// Dynamic User Ingestion: Allows users, staff, and multi-agent systems to post real-time alerts
notificationsRouter.post("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { title, message, type, entityType, entityId, broadcast: isBroadcast } = req.body;
    if (!title || !message) {
      res.status(400).json({ error: "title and message are required" });
      return;
    }
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const notification = await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        outletId,
        userId: isBroadcast ? null : userId,
        type: type || "INFO",
        title: String(title).trim(),
        message: String(message).trim(),
        entityType: entityType || null,
        entityId: entityId || null,
        isRead: false,
      },
    });

    import("../websockets")
      .then(({ broadcast }) => {
        broadcast(outletId, "outlet.notification_created", {
          outletId,
          notification,
        });
      })
      .catch(() => {});

    res.status(201).json(notification);
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ error: "internal error" });
  }
});

