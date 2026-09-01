import { Router } from "express";

import { requireAuth, requirePermission, AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";
import {
  createCampaign,
  listCampaigns,
  queueCampaign,
  listRecipients,
  PrismaMarketingRepository,
  type CampaignTriggerType,
} from "@kapmeta/marketing";

export const marketingRouter = Router();
const marketingRepo = new PrismaMarketingRepository(prisma);

const VALID_TRIGGER_TYPES: CampaignTriggerType[] = ["MANUAL", "INACTIVE_CUSTOMER", "BIRTHDAY"];

// Create Campaign
marketingRouter.post("/campaigns", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  const { name, triggerType, segmentFilter, discountId, messageTemplate } = req.body;
  if (!name || !triggerType || !messageTemplate) {
    return res.status(400).json({ error: "Missing required fields: name, triggerType, messageTemplate" });
  }
  if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
    return res.status(400).json({ error: `Invalid triggerType. Must be one of: ${VALID_TRIGGER_TYPES.join(", ")}` });
  }

  try {
    const campaign = await createCampaign(
      {
        outletId: req.auth!.outletId,
        name,
        triggerType,
        segmentFilter: segmentFilter ?? undefined,
        discountId: discountId ?? undefined,
        messageTemplate,
        createdBy: req.auth!.userId,
      },
      marketingRepo,
    );
    res.status(201).json(campaign);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List Campaigns (with real recipient counts, no delivery stats since nothing sends yet)
marketingRouter.get("/campaigns", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  try {
    const campaigns = await listCampaigns(req.auth!.outletId, marketingRepo);
    res.status(200).json(campaigns);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Queue Campaign — computes the real segment and inserts PENDING
// CampaignRecipient rows. This is the honest end of the pipeline: no
// SMS/push/email gateway is configured anywhere in this repo, so nothing
// here (or anywhere downstream) marks a recipient SENT.
marketingRouter.post("/campaigns/:id/queue", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  try {
    const result = await queueCampaign(req.auth!.outletId, req.params.id, marketingRepo);
    res.status(200).json({
      ...result,
      dispatchNote:
        "Recipients are queued with status PENDING. No SMS/push/email gateway is configured in this deployment, so delivery cannot happen automatically — connecting a gateway integration is required before these can be sent.",
    });
  } catch (error: any) {
    if (error.message === "Campaign not found") {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Update a DRAFT campaign — once queued (ACTIVE/PAUSED/COMPLETED) its
// segment has already been computed and recipients may exist, so editing
// name/trigger/segment/message after that point would silently desync the
// campaign from what was actually queued. Only DRAFT campaigns are editable.
marketingRouter.patch("/campaigns/:id", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  const { name, triggerType, segmentFilter, discountId, messageTemplate } = req.body;

  try {
    const outletId = req.auth!.outletId;
    const existing = await marketingRepo.getCampaign(outletId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: `Cannot edit a campaign with status ${existing.status}. Only DRAFT campaigns can be edited.` });
    }
    if (triggerType !== undefined && !VALID_TRIGGER_TYPES.includes(triggerType)) {
      return res.status(400).json({ error: `Invalid triggerType. Must be one of: ${VALID_TRIGGER_TYPES.join(", ")}` });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (triggerType !== undefined) data.triggerType = triggerType;
    if (segmentFilter !== undefined) data.segmentFilter = segmentFilter;
    if (discountId !== undefined) data.discountId = discountId;
    if (messageTemplate !== undefined) data.messageTemplate = messageTemplate;

    const updated = await prisma.marketingCampaign.update({
      where: { id: req.params.id },
      data,
    });
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a DRAFT campaign. Hard delete is safe here because a DRAFT campaign
// has never been queued, so it has zero CampaignRecipient rows (queueCampaign
// is the only thing that creates them) — nothing else references it.
marketingRouter.delete("/campaigns/:id", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await marketingRepo.getCampaign(outletId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: `Cannot delete a campaign with status ${existing.status}. Only DRAFT campaigns can be deleted.` });
    }

    await prisma.marketingCampaign.delete({ where: { id: req.params.id } });
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Pause an in-flight (ACTIVE) campaign.
//
// Honesty check: queueCampaign already did the one-time, irreversible part
// of "sending" — it computed the segment and inserted PENDING
// CampaignRecipient rows. There is no SMS/push/email gateway anywhere in
// this repo (see queue's dispatchNote above), so nothing is currently
// mid-flight in an external sender that this could actually interrupt.
// What pause CAN honestly do today: flip the campaign to PAUSED so that if
// a dispatch worker is added later, it knows to skip this campaign's
// remaining PENDING recipients instead of sending them. It does not (and
// cannot yet) stop anything already "sent", because nothing has a working
// path to SENT yet. Resuming (PAUSED -> ACTIVE) is left to the same
// /queue endpoint, which is already idempotent for re-queueing.
marketingRouter.post("/campaigns/:id/pause", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await marketingRepo.getCampaign(outletId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (existing.status !== "ACTIVE") {
      return res.status(400).json({ error: `Cannot pause a campaign with status ${existing.status}. Only ACTIVE campaigns can be paused.` });
    }

    await marketingRepo.setCampaignStatus(req.params.id, "PAUSED");
    res.status(200).json({
      id: req.params.id,
      status: "PAUSED",
      note: "Campaign marked PAUSED. No SMS/push/email gateway is configured in this deployment, so this stops future dispatch of remaining PENDING recipients once a gateway integration exists — it does not recall anything already sent.",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List Recipients for a campaign
marketingRouter.get("/campaigns/:id/recipients", requireAuth, requirePermission("crm.write"), async (req: AuthedRequest, res) => {
  try {
    const campaigns = await listCampaigns(req.auth!.outletId, marketingRepo);
    const exists = campaigns.some((c) => c.id === req.params.id);
    if (!exists) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const recipients = await listRecipients(req.params.id, marketingRepo);
    res.status(200).json(recipients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
