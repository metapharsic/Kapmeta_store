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
