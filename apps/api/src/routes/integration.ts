import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { encryptCredential, maskCredential } from "@kapmeta/integration";
import {
  listChannelItemStatus,
  setChannelItemAvailability,
  PrismaChannelItemStatusRepository,
} from "@kapmeta/integration-hub";

const prisma = new PrismaClient();
const router = Router();

// =====================================
// CHANNEL MAPPING MANAGEMENT
// =====================================

// Create a new channel account mapping (No Hardcoding Rule)
router.post(["/channels", "/integrations/channels", "/integration/channels", "/integration/integrations/channels"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { channel, externalOutletId, credentialsRef } = req.body;

    const account = await prisma.channelAccount.create({
      data: {
        outletId: req.auth!.outletId,
        integration_id: req.auth!.outletId,
        channel,
        externalOutletId,
        credentialsRef,
        is_active: true,
      } as any
    });

    res.status(201).json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// "Easy connect" flow — list all delivery-app connections for this outlet.
router.get(["/channels", "/integrations/channels", "/integration/channels", "/integration/integrations/channels"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const accounts = await prisma.channelAccount.findMany({
      where: { outletId: req.auth!.outletId },
    });
    res.status(200).json(
      accounts.map((a: any) => ({
        id: a.id,
        channel: a.channel || a.credentialsRef || "SWIGGY",
        externalOutletId: a.externalOutletId || "EXT-001",
        status: a.is_active ? "ACTIVE" : "PAUSED",
        connectedAt: a.createdAt,
        hasCredentials: true,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connect (or update) one channel's credentials.
router.put(["/channels/:channel/connect", "/integrations/channels/:channel/connect", "/integration/integrations/channels/:channel/connect"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const channel = req.params.channel.toUpperCase();
    if (!["SWIGGY", "ZOMATO"].includes(channel)) {
      res.status(400).json({ error: "unsupported channel — only SWIGGY and ZOMATO have adapters today" });
      return;
    }
    const { externalOutletId, apiKey, apiSecret } = req.body;
    if (!externalOutletId || !apiKey || !apiSecret) {
      res.status(400).json({ error: "externalOutletId, apiKey, apiSecret required" });
      return;
    }

    const outletId = req.auth!.outletId;
    const account = await prisma.channelAccount.create({
      data: {
        outletId,
        integration_id: outletId,
        externalOutletId,
        credentialsRef: channel,
        is_active: true,
      } as any
    });

    res.status(200).json({
      id: account.id,
      channel,
      externalOutletId: account.externalOutletId,
      status: "ACTIVE",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect channel
router.post(["/channels/:accountId/disconnect", "/integrations/channels/:accountId/disconnect", "/integration/integrations/channels/:accountId/disconnect"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    await prisma.channelAccount.updateMany({
      where: { id: req.params.accountId, outletId: req.auth!.outletId },
      data: { is_active: false } as any,
    });
    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create item mappings for a channel
router.post("/integrations/mappings", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { channelAccountId, mappings } = req.body; 
    // mappings: Array<{ menuItemId, externalItemId, channelPrice }>

    const results = await prisma.$transaction(
      mappings.map((m: any) => prisma.channelItemMapping.upsert({
        where: {
          channelAccountId_menuItemId: {
            channelAccountId,
            menuItemId: m.menuItemId
          }
        },
        create: {
          channelAccountId,
          menuItemId: m.menuItemId,
          externalItemId: m.externalItemId,
          channelPrice: m.channelPrice,
          syncStatus: "SYNCED"
        },
        update: {
          externalItemId: m.externalItemId,
          channelPrice: m.channelPrice,
          syncStatus: "SYNCED"
        }
      }))
    );

    res.status(201).json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// PER-CHANNEL ITEM AVAILABILITY (Online Item Status)
// =====================================

router.get(["/channel-items", "/integration/channel-items"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const channel = typeof req.query.channel === "string" && req.query.channel !== "All" ? req.query.channel : undefined;

    const repo = new PrismaChannelItemStatusRepository(prisma);
    const items = await listChannelItemStatus(outletId, repo, channel);

    res.status(200).json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(["/channel-items/:mappingId/availability", "/integration/channel-items/:mappingId/availability"], requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { isAvailable, expectedVersion } = req.body;

    const repo = new PrismaChannelItemStatusRepository(prisma);
    const result = await setChannelItemAvailability(req.params.mappingId, isAvailable, expectedVersion, repo);

    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        res.status(404).json({ error: "mapping not found" });
        return;
      }
      res.status(409).json({ error: "stale version", currentVersion: result.currentVersion });
      return;
    }

    res.status(200).json({ newVersion: result.newVersion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Inbound webhooks live at POST /webhooks/:channel (apps/api/src/routes/webhooks.ts,
// mounted at '/') — that's the one real path, resolved per-outlet via
// ChannelAccount and verified through the per-channel adapter. A second
// "/webhooks/swiggy" handler used to live here with a hardcoded mock secret
// and no real channel resolution; removed rather than left as a dead,
// insecure duplicate entry point.

export { router as integrationRouter };
