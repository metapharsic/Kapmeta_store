import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import { PgSettingsRepository } from "../../../../services/settings/src/PgSettingsRepository";
import { getPool } from "../../../../services/shared/src/db/Pool";
import type { OutletBillingSettings, OutletPrintSettings } from "../../../../services/settings/src/types";

export const settingsRouter = Router();

// GET /settings/outlet-status & GET /settings/store-status
const handleGetOutletStatus = async (req: AuthedRequest, res: any) => {
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
};

settingsRouter.get("/settings/outlet-status", requireAuth, handleGetOutletStatus);
settingsRouter.get("/settings/store-status", requireAuth, handleGetOutletStatus);

// POST & PATCH /settings/outlet-status & /settings/store-status
const handleUpdateOutletStatus = async (req: AuthedRequest, res: any) => {
  const isOnline = req.body.isOnline ?? req.body.isOpen ?? req.body.active;

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

    import("../websockets").then(({ broadcast }) => {
      broadcast(outletId, "outlet.store_status_updated", {
        outletId,
        isOnline: status.is_online,
      });
    }).catch(() => {});

    res.status(200).json({
      isOnline: status.is_online,
      updatedAt: status.updated_at.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
};

settingsRouter.post("/settings/outlet-status", requireAuth, requirePermission("settings.manage"), handleUpdateOutletStatus);
settingsRouter.patch("/settings/outlet-status", requireAuth, requirePermission("settings.manage"), handleUpdateOutletStatus);
settingsRouter.post("/settings/store-status", requireAuth, requirePermission("settings.manage"), handleUpdateOutletStatus);
settingsRouter.patch("/settings/store-status", requireAuth, requirePermission("settings.manage"), handleUpdateOutletStatus);

// ---- Print & billing settings CRUD (TSK-008c) ----
// Backed by the real Postgres-backed PgSettingsRepository (outlet_billing_settings
// / outlet_print_settings). Always scoped by req.auth!.outletId from the JWT —
// never a client-supplied outlet id.
const settingsRepo = new PgSettingsRepository(getPool());

settingsRouter.get("/settings/print", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const settings = await settingsRepo.getPrintSettings(outletId);
    res.status(200).json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

settingsRouter.put("/settings/print", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const { outlet_id, updated_at, ...patch } = (req.body ?? {}) as Partial<OutletPrintSettings>;
    const current = await settingsRepo.getPrintSettings(outletId);
    const updated: OutletPrintSettings = {
      ...current,
      ...patch,
      outlet_id: outletId,
      updated_at: new Date().toISOString(),
    };
    const saved = await settingsRepo.savePrintSettings(updated);
    res.status(200).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

settingsRouter.get("/settings/billing", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const settings = await settingsRepo.getBillingSettings(outletId);
    res.status(200).json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

settingsRouter.put("/settings/billing", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res: any) => {
  try {
    const outletId = req.auth!.outletId;
    const { outlet_id, updated_at, ...patch } = (req.body ?? {}) as Partial<OutletBillingSettings>;
    const current = await settingsRepo.getBillingSettings(outletId);
    const updated: OutletBillingSettings = {
      ...current,
      ...patch,
      outlet_id: outletId,
      updated_at: new Date().toISOString(),
    };
    const saved = await settingsRepo.saveBillingSettings(updated);
    res.status(200).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});
