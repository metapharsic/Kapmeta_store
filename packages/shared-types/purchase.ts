// Contract for services/purchase (Phase 8, R2). DEC-015 (approved, placeholder
// bands): three-tier approval thresholds. DEC-016 (approved, Option C):
// variance tolerance observe-only for R2, quantity mismatch always flagged.
// DEC-017 (approved, Option B): retrospective PO permitted, capped, reason
// mandatory. DEC-018 (approved, Option A): Purchase owns vendor invoice
// through match approval; Finance owns payment/ledger.

export type PoStatus = "DRAFT" | "APPROVED" | "SENT" | "PARTIALLY_RECEIVED" | "COMPLETED" | "CANCELLED";

// Placeholder bands per DEC-015 — real values pending Finance retuning from
// actual PO value distribution (none exists pre-launch).
export const PO_APPROVAL_THRESHOLDS_MINOR = {
  autoApproveUnder: 500000n, // ₹5,000
  dualApprovalOver: 2500000n, // ₹25,000
};

export interface PoLineInput {
  ingredientId: string;
  quantity: number;
  unitCostMinor: bigint;
}

export interface CreatePurchaseOrderInput {
  outletId: string;
  vendorId: string;
  lines: PoLineInput[];
  isRetrospective?: boolean; // DEC-017: goods already received, PO raised after the fact
  retrospectiveReasonCode?: string; // mandatory when isRetrospective is true
}

export type PoApprovalTier = "AUTO" | "SINGLE" | "DUAL";

export function approvalTierFor(totalAmountMinor: bigint): PoApprovalTier {
  if (totalAmountMinor < PO_APPROVAL_THRESHOLDS_MINOR.autoApproveUnder) return "AUTO";
  if (totalAmountMinor >= PO_APPROVAL_THRESHOLDS_MINOR.dualApprovalOver) return "DUAL";
  return "SINGLE";
}

export interface GrnLineInput {
  ingredientId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCostMinor: bigint;
}

export interface CreateGrnInput {
  outletId: string;
  vendorId: string;
  purchaseOrderId?: string; // absent for a retrospective/no-PO receipt
  invoiceNumber?: string;
  lines: GrnLineInput[];
}

// DEC-016 (Option C, R2 observe-only): quantity mismatch is a fact, always
// flagged at any nonzero delta. Price variance bands are NOT enforced yet
// (observe-only) — this returns the deltas, caller decides whether to hold.
export interface GrnLineVariance {
  ingredientId: string;
  quantityDeltaAbs: number; // |ordered - received|, always flagged if nonzero
  quantityMismatch: boolean;
}

export function computeGrnVariance(lines: GrnLineInput[]): GrnLineVariance[] {
  return lines.map((line) => {
    const delta = Math.abs(line.orderedQuantity - line.receivedQuantity);
    return { ingredientId: line.ingredientId, quantityDeltaAbs: delta, quantityMismatch: delta !== 0 };
  });
}
