import { PrismaClient } from "@prisma/client";

export class ProcurementManager {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async listVendors(outletId: string) {
    return await (this.prisma as any).vendors?.findMany?.({
      where: { outlet_id: outletId },
      orderBy: { name: "asc" },
    }) || [];
  }

  async createVendor(outletId: string, name: string, phone: string, email?: string, taxNumber?: string) {
    return await (this.prisma as any).vendors?.create?.({
      data: {
        outlet_id: outletId,
        name,
        phone,
        email,
        tax_number: taxNumber,
      },
    });
  }

  async listPurchaseOrders(outletId: string) {
    return await (this.prisma as any).purchase_orders?.findMany?.({
      where: { outlet_id: outletId },
      orderBy: { created_at: "desc" },
    }) || [];
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
      const po = await (tx as any).purchase_orders?.create?.({
        data: {
          outlet_id: outletId,
          vendor_id: vendorId,
          po_number: poNumber,
          status: "DRAFT",
          total_cost_minor: BigInt(Math.round(totalAmount * 100)), // Minor units
        },
      });

      for (const item of poItems) {
        await (tx as any).purchase_order_items?.create?.({
          data: {
            po_id: po?.id,
            ingredient_id: item.ingredientId,
            quantity: item.quantity,
            unit_cost_minor: BigInt(Math.round(item.unitCost * 100)),
            total_cost_minor: BigInt(Math.round(item.quantity * item.unitCost * 100)),
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
      const grn = await (tx as any).goods_received_notes?.create?.({
        data: {
          outlet_id: outletId,
          purchase_order_id: purchaseOrderId || null,
          vendor_id: vendorId,
          grn_number: grnNumber,
          status: "VERIFIED",
        },
      });

      for (const item of grnItems) {
        // Update ingredient current stock and unit cost
        const existing = await (tx as any).ingredients.findUnique({ where: { id: item.ingredientId } });
        if (existing) {
          await (tx as any).ingredients.update({
            where: { id: item.ingredientId },
            data: {
              current_stock_qty: Number(existing.current_stock_qty) + Number(item.receivedQuantity),
              unit_cost_minor: Math.round(item.unitCost * 100),
            },
          });
        }
      }

      // Update PO status
      if (purchaseOrderId) {
        await (tx as any).purchase_orders?.update?.({
          where: { id: purchaseOrderId },
          data: { status: "COMPLETED" },
        }).catch(() => {});
      }

      return grn;
    });
  }
}
