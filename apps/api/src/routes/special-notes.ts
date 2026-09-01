import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";

const router = Router();

router.get("/", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const notes = await prisma.special_notes.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: { sort_order: "asc" },
    });
    res.status(200).json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { text, sortOrder } = req.body;

    if (!text || !String(text).trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const note = await prisma.special_notes.create({
      data: {
        outlet_id: outletId,
        text: String(text).trim(),
        sort_order: typeof sortOrder === "number" ? sortOrder : 0,
      },
    });

    res.status(201).json(note);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

router.patch("/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await prisma.special_notes.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "special note not found" });
      return;
    }

    const { text, sortOrder, isActive } = req.body;

    const note = await prisma.special_notes.update({
      where: { id: existing.id },
      data: {
        text: text !== undefined ? String(text).trim() : undefined,
        sort_order: typeof sortOrder === "number" ? sortOrder : undefined,
        is_active: typeof isActive === "boolean" ? isActive : undefined,
        updated_at: new Date(),
      },
    });

    res.status(200).json(note);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

router.delete("/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await prisma.special_notes.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });

    if (!existing) {
      res.status(404).json({ error: "special note not found" });
      return;
    }

    await prisma.special_notes.update({
      where: { id: existing.id },
      data: { is_active: false, updated_at: new Date() },
    });

    res.status(204).send();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "internal error" });
  }
});

export const specialNotesRouter = router;
