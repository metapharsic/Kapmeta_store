/**
 * Inventory domain types.
 *
 * NOTE: This service is a PROPOSAL — there is no screenshot or spec evidence
 * from the product for inventory/stock behavior. Shapes and business rules
 * below are a reasonable best guess following the Orders/Tax services'
 * conventions, not a confirmed requirement. See README.md.
 */

export type Money = number;

/** Rounds to 2 decimal places, guarding against binary float noise. */
export function roundMoney(value: number): Money {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface RawMaterial {
  id: string;
  outletId: string;
  name: string;
  unit: string; // e.g. 'kg', 'g', 'l', 'ml', 'pcs'
  currentStock: number;
}

export interface RecipeLine {
  rawMaterialId: string;
  /** Quantity of the raw material (in RawMaterial.unit) consumed per one
   * unit of the menu item. */
  qty: number;
}

export interface Recipe {
  menuItemId: string;
  lines: RecipeLine[];
}

export type PurchaseOrderStatus = 'draft' | 'received';

export interface PurchaseOrderLine {
  rawMaterialId: string;
  qty: number;
  unitCost?: Money;
}

export interface PurchaseOrder {
  id: string;
  outletId: string;
  supplierId: string;
  lines: PurchaseOrderLine[];
  status: PurchaseOrderStatus;
  createdAt: string;
  receivedAt?: string;
}

export type StockMovementReason = 'purchase' | 'sale' | 'wastage' | 'adjustment';

export interface StockMovement {
  id: string;
  rawMaterialId: string;
  /** Positive = stock increase (purchase), negative = stock decrease
   * (sale/wastage), either sign for a manual adjustment. */
  delta: number;
  reason: StockMovementReason;
  refOrderId?: string | null;
  actorId?: string | null;
  at: string;
}

/** Line item consumed as part of deducting stock for a sold order — the
 * menu item and quantity sold, as OrdersService would report it. */
export interface OrderItemForDeduction {
  menuItemId: string;
  quantity: number;
}
