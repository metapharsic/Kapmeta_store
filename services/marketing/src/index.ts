export {
  createCampaign,
  listCampaigns,
  computeSegment,
  queueCampaign,
  listRecipients,
  type CampaignTriggerType,
  type CampaignStatus,
  type RecipientStatus,
  type SegmentFilter,
  type CreateCampaignInput,
  type MarketingCampaignRecord,
  type CampaignWithCounts,
  type CampaignRecipientRecord,
  type SegmentResult,
  type QueueCampaignResult,
  type MarketingRepository,
} from "./marketing-service";
export { PrismaMarketingRepository } from "./stores/prisma-marketing-repository";
