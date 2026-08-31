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
      await (tx as any).purchase_orders.create({
        data: {
          id,
          outlet_id: input.outletId,
          vendor_id: input.vendorId,
          po_number: poNumber,
          status: "DRAFT",
          total_cost_minor: totalAmountMinor,
        },
      });
      await (tx as any).purchase_order_items.createMany({
        data: input.lines.map((line) => ({
          po_id: id,
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          unit_cost_minor: line.unitCostMinor,
          total_cost_minor: BigInt(line.quantity) * line.unitCostMinor,
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
      await (tx as any).goods_received_notes?.create?.({
        data: {
          id,
          outlet_id: input.outletId,
          purchase_order_id: input.purchaseOrderId,
          vendor_id: input.vendorId,
          grn_number: grnNumber,
          invoice_number: input.invoiceNumber,
          status,
        },
      });
      await (tx as any).goods_received_note_items?.createMany?.({
        data: input.lines.map((line) => ({
          grn_id: id,
          ingredient_id: line.ingredientId,
          ordered_quantity: line.orderedQuantity,
          received_quantity: line.receivedQuantity,
          unit_cost_minor: line.unitCostMinor,
        })),
      });
    });

    return { id, status };
  }

  async getPoStatus(poId: string): Promise<PoStatus | null> {
    const row = await (this.prisma as any).purchase_orders.findUnique({
      where: { id: poId },
      select: { status: true },
    });
    return (row?.status as PoStatus) ?? null;
  }

  async recordPoTransition(poId: string, newStatus: PoStatus, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await (tx as any).purchase_orders.findUniqueOrThrow({
        where: { id: poId },
        select: { status: true },
      });

      const po = await (tx as any).purchase_orders.update({
        where: { id: poId },
        data: { status: newStatus },
        select: { outlet_id: true },
      });

      if (newStatus === "APPROVED" || newStatus === "CANCELLED") {
        await writeAuditLog(tx, {
          outletId: po.outlet_id,
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
          outletId: po.outlet_id,
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
