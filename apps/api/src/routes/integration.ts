import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { encryptCredential, maskCredential } from "@kapmeta/integration";
import {
  listChannelItemStatus,
  setChannelItemAvailability,
  PrismaChannelItemStatusRepository,
} from "@kapmeta/integration-hub";

const router = Router();

// =====================================
// CHANNEL MAPPING MANAGEMENT
// =====================================

// Create a new channel account mapping (No Hardcoding Rule)
router.post("/integrations/channels", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const { channel, externalOutletId, credentialsRef } = req.body;

    const account = await prisma.channelAccount.create({
      data: {
        outletId: req.auth!.outletId,
        channel,
        externalOutletId,
        credentialsRef,
        status: "ACTIVE"
      }
    });

    res.status(201).json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// "Easy connect" flow — list all delivery-app connections for this outlet.
// Credentials are never returned in plaintext, only a masked hint + whether
// they're set, so the UI can show "Connected" without re-exposing the key.
router.get("/integrations/channels", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const accounts = await prisma.channelAccount.findMany({
      where: { outletId: req.auth!.outletId },
    });
    res.status(200).json(
      accounts.map((a) => ({
        id: a.id,
        channel: a.channel,
        externalOutletId: a.externalOutletId,
        status: a.status,
        connectedAt: a.connectedAt,
        hasCredentials: !!(a.apiKeyEncrypted && a.apiSecretEncrypted),
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connect (or update) one channel's credentials. Idempotent on (outletId,
// channel) — re-running with a new key rotates it without creating a
// duplicate account row.
router.put("/integrations/channels/:channel/connect", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
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

    const account = await prisma.channelAccount.upsert({
      where: { outletId_channel: { outletId: req.auth!.outletId, channel } },
      create: {
        outletId: req.auth!.outletId,
        channel,
        externalOutletId,
        apiKeyEncrypted: encryptCredential(apiKey),
        apiSecretEncrypted: encryptCredential(apiSecret),
        status: "ACTIVE",
        connectedAt: new Date(),
      },
      update: {
        externalOutletId,
        apiKeyEncrypted: encryptCredential(apiKey),
        apiSecretEncrypted: encryptCredential(apiSecret),
        status: "ACTIVE",
        connectedAt: new Date(),
      },
    });

    res.status(200).json({
      id: account.id,
      channel: account.channel,
      externalOutletId: account.externalOutletId,
      status: account.status,
      connectedAt: account.connectedAt,
      apiKeyHint: maskCredential(apiKey),
      webhookUrl: `/webhooks/${channel.toLowerCase()}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pause a connection without deleting it — its item mappings and order
// history stay intact, inbound webhooks for it are simply ignored (the
// worker checks status before processing) until reconnected.
router.post("/integrations/channels/:id/disconnect", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
  try {
    const account = await prisma.channelAccount.updateMany({
      where: { id: req.params.id, outletId: req.auth!.outletId },
      data: { status: "PAUSED" },
    });
    if (account.count === 0) {
      res.status(404).json({ error: "channel account not found" });
      return;
    }
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
// Distinct from menu.ts's /menu/availability (outlet-wide 86-list toggle).
// This is the per-Swiggy/Zomato/ONDC channel sync toggle on
// ChannelItemMapping.isAvailable, with a 3-state computed overall status
// (ALL_ON / ALL_OFF / PARTIAL) across the outlet's connected channels.

router.get("/channel-items", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
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

router.patch("/channel-items/:mappingId/availability", requireAuth, requirePermission("integration.manage"), async (req: AuthedRequest, res) => {
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
