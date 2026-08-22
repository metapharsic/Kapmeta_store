import { approvalTierFor, computeGrnVariance } from "@kapmeta/shared-types/purchase";
import type {
  PoStatus,
  CreatePurchaseOrderInput,
  PoApprovalTier,
  CreateGrnInput,
  GrnLineVariance,
} from "@kapmeta/shared-types/purchase";

export interface IngredientCost {
  ingredientId: string;
  unitCostMinor: bigint;
}

export interface PurchaseRepository {
  createPurchaseOrder(
    id: string,
    poNumber: string,
    input: CreatePurchaseOrderInput,
    totalAmountMinor: bigint,
    tier: PoApprovalTier,
  ): Promise<{ id: string; status: PoStatus }>;
  createGrn(
    id: string,
    grnNumber: string,
    input: CreateGrnInput,
    variances: GrnLineVariance[],
  ): Promise<{ id: string; status: string }>;
  getPoStatus(poId: string): Promise<PoStatus | null>;
  recordPoTransition(poId: string, newStatus: PoStatus, userId: string): Promise<void>;
}

// PO lifecycle legal-transition map, mirrored on
// services/orders/src/order-service.ts's isTransitionLegal pattern, adapted
// to the PO states in @kapmeta/shared-types/purchase.
export const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["PARTIALLY_RECEIVED", "COMPLETED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isPoTransitionLegal(from: PoStatus, to: PoStatus): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PoTransitionResult {
  ok: boolean;
  reason?: "ILLEGAL_TRANSITION";
  from: PoStatus;
  to: PoStatus;
  newStatus?: PoStatus;
}

// TODO: real numbering needs a DB sequence, this is illustrative per the same
// pattern already used in services/finance/src/refund-service.ts's generateInvoiceNumber.
export function generatePoNumber(sequence: number): string {
  return `PO-2026-${String(sequence).padStart(4, "0")}`;
}

// TODO: real numbering needs a DB sequence, this is illustrative per the same
// pattern already used in services/finance/src/refund-service.ts's generateInvoiceNumber.
function generateGrnNumber(sequence: number): string {
  return `GRN-2026-${String(sequence).padStart(4, "0")}`;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  sequence: number,
  repo: PurchaseRepository,
): Promise<{ id: string; status: PoStatus; tier: PoApprovalTier }> {
  if (input.isRetrospective) {
    if (!input.retrospectiveReasonCode || input.retrospectiveReasonCode.trim().length === 0) {
      throw new Error("retrospectiveReasonCode is mandatory for retrospective POs");
    }
  }

  const totalAmountMinor = input.lines.reduce(
    (sum, line) => sum + BigInt(line.quantity) * line.unitCostMinor,
    0n,
  );
  const tier = approvalTierFor(totalAmountMinor);

  const id = crypto.randomUUID();
  const poNumber = generatePoNumber(sequence);

  const result = await repo.createPurchaseOrder(id, poNumber, input, totalAmountMinor, tier);

  return { id: result.id, status: result.status, tier };
}

export async function receiveGoods(
  input: CreateGrnInput,
  sequence: number,
  repo: PurchaseRepository,
): Promise<{ id: string; status: string; variances: GrnLineVariance[] }> {
  const variances = computeGrnVariance(input.lines);

  const id = crypto.randomUUID();
  const grnNumber = generateGrnNumber(sequence);

  const result = await repo.createGrn(id, grnNumber, input, variances);

  return { id: result.id, status: result.status, variances };
}

export async function transitionPurchaseOrder(
  poId: string,
  toStatus: PoStatus,
  repo: PurchaseRepository,
  userId: string,
): Promise<PoTransitionResult> {
  const currentStatus = await repo.getPoStatus(poId);
  if (currentStatus === null) {
    // Known shape limitation, matching transitionOrder's convention: no
    // NOT_FOUND variant, so a missing PO reuses ILLEGAL_TRANSITION.
    return { ok: false, reason: "ILLEGAL_TRANSITION", from: "DRAFT", to: toStatus };
  }

  if (!isPoTransitionLegal(currentStatus, toStatus)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION", from: currentStatus, to: toStatus };
  }

  await repo.recordPoTransition(poId, toStatus, userId);
  return { ok: true, from: currentStatus, to: toStatus, newStatus: toStatus };
}
