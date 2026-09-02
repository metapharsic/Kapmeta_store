// apps/api/src/routes/physical-menu.ts
//
// Backs the "Physical Menu" screen -- an outlet-scoped list of uploaded menu
// files, shown as "No Record Found" when empty and populated via "+ Add
// File". Rows live in the new `physical_menu_files` table (added this
// session; not yet applied to the live DB and not in the generated Prisma
// client, so every query here goes through `(prisma as any)`, exactly the
// pattern PrismaMenuCatalogRepository.linkModifierToItem uses).
//
// NOTE -- no upload path exists yet: this repo has no file-upload middleware
// or object-storage integration anywhere (grepped for multer/formidable/S3/
// blob-storage clients -- none found). Building real storage is out of scope
// for this round, so POST here only records `fileUrl` as a caller-supplied
// string (a pre-signed URL, a path an out-of-band process wrote to, etc.).
// Actually receiving a file upload and producing that URL is a follow-up.

import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { sendServerError } from "../errors";

const router = Router();

// GET /physical-menu/files
// Outlet's uploaded files, newest first.
router.get("/files", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const files = await (prisma as any).physicalMenuFile.findMany({
      where: { outletId },
      orderBy: { uploadedAt: "desc" },
    });
    res.status(200).json(files);
  } catch (err) {
    sendServerError(res, err, "GET /physical-menu/files");
  }
});

// POST /physical-menu/files
// Records a file the caller has already stored somewhere reachable via
// `fileUrl` (see NOTE above -- no upload/storage backend exists in this repo
// yet, so this endpoint cannot accept raw file bytes).
router.post("/files", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { fileName, fileUrl } = req.body ?? {};

    if (!fileName || !String(fileName).trim()) {
      res.status(400).json({ error: "fileName is required" });
      return;
    }
    if (!fileUrl || !String(fileUrl).trim()) {
      res.status(400).json({ error: "fileUrl is required" });
      return;
    }

    const file = await (prisma as any).physicalMenuFile.create({
      data: {
        outletId,
        fileName: String(fileName).trim(),
        fileUrl: String(fileUrl).trim(),
        uploadedByUserId: userId,
      },
    });

    res.status(201).json(file);
  } catch (err) {
    sendServerError(res, err, "POST /physical-menu/files");
  }
});

// DELETE /physical-menu/files/:id
router.delete("/files/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await (prisma as any).physicalMenuFile.findFirst({
      where: { id: req.params.id, outletId },
    });
    if (!existing) {
      res.status(404).json({ error: "physical menu file not found" });
      return;
    }

    await (prisma as any).physicalMenuFile.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err, "DELETE /physical-menu/files/:id");
  }
});

export const physicalMenuRouter = router;
