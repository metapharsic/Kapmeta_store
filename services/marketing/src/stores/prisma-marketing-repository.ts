import { PrismaClient } from "@prisma/client";
import type {
  CampaignRecipientRecord,
  CampaignStatus,
  CampaignWithCounts,
  CreateCampaignInput,
  MarketingCampaignRecord,
  MarketingRepository,
  SegmentFilter,
} from "../marketing-service";

function toCampaignRecord(row: any): MarketingCampaignRecord {
  return {
    id: row.id,
    outletId: row.outletId,
    name: row.name,
    triggerType: row.triggerType,
    segmentFilter: (row.segmentFilter as SegmentFilter | null) ?? null,
    discountId: row.discountId,
    messageTemplate: row.messageTemplate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

export class PrismaMarketingRepository implements MarketingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCampaign(input: CreateCampaignInput): Promise<MarketingCampaignRecord> {
    const row = await this.prisma.marketingCampaign.create({
      data: {
        outletId: input.outletId,
        name: input.name,
        triggerType: input.triggerType,
        segmentFilter: (input.segmentFilter as any) ?? undefined,
        discountId: input.discountId ?? undefined,
        messageTemplate: input.messageTemplate,
        createdBy: input.createdBy ?? undefined,
      },
    });
    return toCampaignRecord(row);
  }

  async listCampaigns(outletId: string): Promise<CampaignWithCounts[]> {
    const rows = await this.prisma.marketingCampaign.findMany({
      where: { outletId },
      orderBy: { createdAt: "desc" },
      include: {
        recipients: {
          select: { status: true },
        },
      },
    });

    return rows.map((row: any) => {
      const recipients: { status: string }[] = row.recipients ?? [];
      const counts = {
        total: recipients.length,
        pending: recipients.filter((r) => r.status === "PENDING").length,
        sent: recipients.filter((r) => r.status === "SENT").length,
        failed: recipients.filter((r) => r.status === "FAILED").length,
      };
      const { recipients: _omit, ...rest } = row;
      return { ...toCampaignRecord(rest), recipientCounts: counts };
    });
  }

  async getCampaign(outletId: string, campaignId: string): Promise<MarketingCampaignRecord | null> {
    const row = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, outletId },
    });
    return row ? toCampaignRecord(row) : null;
  }

  // Real query: customers at this outlet with zero Order rows created within
  // the last `inactiveDays` days. Customers who have never ordered at all
  // also count as inactive (they have no order in the window either).
  async findInactiveCustomerIds(outletId: string, inactiveDays: number): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);

    const customers = await this.prisma.customer.findMany({
      where: {
        outletId,
        orders: {
          none: {
            createdAt: { gte: cutoff },
          },
        },
      },
      select: { id: true },
    });
    return customers.map((c) => c.id);
  }

  async filterExistingCustomerIds(outletId: string, customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return [];
    const customers = await this.prisma.customer.findMany({
      where: { outletId, id: { in: customerIds } },
      select: { id: true },
    });
    return customers.map((c) => c.id);
  }

  async createPendingRecipients(campaignId: string, customerIds: string[]): Promise<number> {
    if (customerIds.length === 0) return 0;
    const result = await this.prisma.campaignRecipient.createMany({
      data: customerIds.map((customerId) => ({ campaignId, customerId, status: "PENDING" })),
      skipDuplicates: true, // relies on @@unique([campaignId, customerId]) — idempotent re-queue
    });
    return result.count;
  }

  async listRecipients(campaignId: string): Promise<CampaignRecipientRecord[]> {
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { campaignId },
      orderBy: { queuedAt: "desc" },
    });
    return rows as CampaignRecipientRecord[];
  }

  async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status },
    });
  }
}
