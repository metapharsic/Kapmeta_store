import { PrismaClient } from "@prisma/client";

export class ProcurementManager {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async listVendors(outletId: string) {
    return await this.prisma.vendor.findMany({
      where: { outletId },
      orderBy: { name: "asc" },
    });
  }

  async createVendor(outletId: string, name: string, phone: string, email?: string, taxNumber?: string) {
    return await this.prisma.vendor.create({
      data: {
        outletId,
        name,
        phone,
        email,
        taxNumber,
      },
    });
  }

  async listPurchaseOrders(outletId: string) {
    return await this.prisma.purchaseOrder.findMany({
      where: { outletId },
      include: {
        vendor: true,
        poItems: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPurchaseOrder(
    outletId: string,
    vendorId: string,
    poItems: { ingredientId: string; quantity: number; unitCost: number }[]
  ) {
    // Generate PO number
    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0")}`;
    let totalAmount = 0;

    // Calculate total cost
    poItems.forEach((item) => {
      totalAmount += item.quantity * item.unitCost;
    });

    return await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          outletId,
          vendorId,
          poNumber,
          status: "DRAFT",
          totalAmount: BigInt(Math.round(totalAmount * 100)), // Minor units
        },
      });

      for (const item of poItems) {
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unitCost: BigInt(Math.round(item.unitCost * 100)),
            totalCost: BigInt(Math.round(item.quantity * item.unitCost * 100)),
          },
        });
      }
      return po;
    });
  }

  async processGoodsReceivedNote(
    outletId: string,
    purchaseOrderId: string,
    vendorId: string,
    grnItems: { ingredientId: string; receivedQuantity: number; unitCost: number }[]
  ) {
    const grnNumber = `GRN-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0")}`;

    return await this.prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceivedNote.create({
        data: {
          outletId,
          purchaseOrderId: purchaseOrderId || null,
          vendorId,
          grnNumber,
          status: "VERIFIED",
        },
      });

      for (const item of grnItems) {
        // Create GRN item
        await tx.goodsReceivedNoteItem.create({
          data: {
            goodsReceivedNoteId: grn.id,
            ingredientId: item.ingredientId,
            orderedQuantity: 0,
            receivedQuantity: item.receivedQuantity,
            unitCost: BigInt(Math.round(item.unitCost * 100)),
          },
        });

        // Update ingredient current stock and unit cost
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            currentStock: { increment: item.receivedQuantity },
            unitCost: item.unitCost,
          },
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            outletId,
            ingredientId: item.ingredientId,
            movementType: "RECEIPT",
            quantity: item.receivedQuantity,
            referenceType: "GRN",
            referenceId: grn.id,
            reasonCode: "PO_RECEIPT",
          },
        });
      }

      // Update PO status
      if (purchaseOrderId) {
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: "COMPLETED" },
        });
      }

      return grn;
    });
  }
}
