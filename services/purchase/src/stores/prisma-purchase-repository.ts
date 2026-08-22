import { PrismaClient } from "@prisma/client";
import type { PurchaseRepository } from "../purchase-service";
import type {
  CreatePurchaseOrderInput,
  PoApprovalTier,
  PoStatus,
  CreateGrnInput,
  GrnLineVariance,
} from "@kapmeta/shared-types/purchase";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";
import { writeNotification } from "@kapmeta/notifications";

export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPurchaseOrder(
    id: string,
    poNumber: string,
    input: CreatePurchaseOrderInput,
    totalAmountMinor: bigint,
    tier: PoApprovalTier,
  ): Promise<{ id: string; status: PoStatus }> {
    void tier;
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.create({
        data: {
          id,
          outletId: input.outletId,
          vendorId: input.vendorId,
          poNumber,
          status: "DRAFT",
          totalAmount: totalAmountMinor,
        },
      });
      await tx.purchaseOrderItem.createMany({
        data: input.lines.map((line) => ({
          purchaseOrderId: id,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unitCost: line.unitCostMinor,
          totalCost: BigInt(line.quantity) * line.unitCostMinor,
        })),
      });
    });

    return { id, status: "DRAFT" as PoStatus };
  }

  async createGrn(
    id: string,
    grnNumber: string,
    input: CreateGrnInput,
    variances: GrnLineVariance[],
  ): Promise<{ id: string; status: string }> {
    const status = variances.some((v) => v.quantityMismatch) ? "VARIANCE_FLAGGED" : "VERIFIED";

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceivedNote.create({
        data: {
          id,
          outletId: input.outletId,
          purchaseOrderId: input.purchaseOrderId,
          vendorId: input.vendorId,
          grnNumber,
          invoiceNumber: input.invoiceNumber,
          status,
        },
      });
      await tx.goodsReceivedNoteItem.createMany({
        data: input.lines.map((line) => ({
          goodsReceivedNoteId: id,
          ingredientId: line.ingredientId,
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: line.receivedQuantity,
          unitCost: line.unitCostMinor,
        })),
      });
    });

    return { id, status };
  }

  async getPoStatus(poId: string): Promise<PoStatus | null> {
    const row = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { status: true },
    });
    return (row?.status as PoStatus) ?? null;
  }

  async recordPoTransition(poId: string, newStatus: PoStatus, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId },
        select: { status: true },
      });

      const po = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: newStatus },
        select: { outletId: true },
      });

      if (newStatus === "APPROVED" || newStatus === "CANCELLED") {
        await writeAuditLog(tx, {
          outletId: po.outletId,
          userId,
          action: newStatus === "APPROVED" ? "PO_APPROVED" : "PO_CANCELLED",
          entityType: "PURCHASE_ORDER",
          entityId: poId,
          beforeState: { status: previous.status },
          afterState: { status: newStatus },
        });

        // Broadcast to the outlet (userId omitted) — every PO status change of
        // consequence should surface in the Action Center for whoever created
        // or is tracking it, not just the actor who flipped the status.
        await writeNotification(tx, {
          outletId: po.outletId,
          type: newStatus === "APPROVED" ? "PO_APPROVED" : "PO_CANCELLED",
          title: newStatus === "APPROVED" ? "Purchase order approved" : "Purchase order cancelled",
          message:
            newStatus === "APPROVED"
              ? `Purchase order ${poId} was approved and is ready to be sent to the vendor.`
              : `Purchase order ${poId} was cancelled.`,
          entityType: "PURCHASE_ORDER",
          entityId: poId,
        });
      }
    });
  }
}
