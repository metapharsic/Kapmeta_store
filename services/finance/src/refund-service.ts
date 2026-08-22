import type {
  GenerateInvoiceInput,
  RefundInput,
  RefundStatus,
  RefundResult,
} from "@kapmeta/shared-types/finance";

export interface PaymentInfo {
  id: string;
  amountMinor: bigint;
  alreadyRefundedMinor: bigint; // sum of prior successful refunds against this payment
}

export interface RefundListFilter {
  fromDate?: Date;
  toDate?: Date;
  status?: RefundStatus;
}

export interface RefundListItem {
  id: string;
  orderId: string;
  paymentId: string;
  amountMinor: bigint;
  reasonCode: string;
  status: RefundStatus;
  isPartial: boolean;
  createdAt: Date;
}

export interface FinanceRepository {
  getPayment(paymentId: string): Promise<PaymentInfo | null>;
  createRefund(input: RefundInput, userId: string): Promise<{ id: string; status: RefundStatus }>;
  createInvoice(input: GenerateInvoiceInput, invoiceNo: string): Promise<{ id: string; invoiceNo: string }>;
  listRefunds(outletId: string, filter: RefundListFilter): Promise<RefundListItem[]>;
}

export async function requestRefund(input: RefundInput, repo: FinanceRepository, userId: string): Promise<RefundResult> {
  if (input.reasonCode.trim().length === 0) {
    return { ok: false, reason: "MISSING_REASON_CODE" };
  }

  const payment = await repo.getPayment(input.paymentId);
  if (payment === null) {
    // Genuine caller error (unknown payment), not a business-rule rejection — throw, don't return a RefundResult.
    throw new Error("payment not found");
  }

  // Per WF-BIL-04: the real guard is the DB constraint (sum of refunds <= captured amount);
  // this is the same check duplicated at the application layer as defense-in-depth only.
  if (input.amountMinor + payment.alreadyRefundedMinor > payment.amountMinor) {
    return { ok: false, reason: "EXCEEDS_CAPTURED_AMOUNT" };
  }

  const result = await repo.createRefund(input, userId);
  return { ok: true, refundId: result.id, status: result.status };
}

// TODO: real gapless sequencing needs a DB-level sequence per outlet; the gaplessness
// guarantee must come from wherever `sequence` is sourced, not from this function.
export function generateInvoiceNumber(outletId: string, sequence: number): string {
  return `INV-${outletId.slice(0, 8)}-${String(sequence).padStart(6, "0")}`;
}

export async function generateInvoice(
  input: GenerateInvoiceInput,
  sequence: number,
  repo: FinanceRepository,
): Promise<{ id: string; invoiceNo: string }> {
  const invoiceNo = generateInvoiceNumber(input.outletId, sequence);
  return repo.createInvoice(input, invoiceNo);
}

export async function listRefunds(
  outletId: string,
  filter: RefundListFilter,
  repo: FinanceRepository,
): Promise<RefundListItem[]> {
  if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate) {
    throw new Error("fromDate must be before or equal to toDate");
  }
  return repo.listRefunds(outletId, filter);
}
