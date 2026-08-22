// Contract for services/finance. Maps to kapmeta/schema.prisma Invoice,
// Refund, LedgerEntry. Per WF-BIL-01/04: invoice generation is atomic with
// tax-rule stamping; refunds always reference the original payment.

export interface GenerateInvoiceInput {
  outletId: string;
  orderId: string;
  amountMinor: bigint;
  taxAmountMinor: bigint;
}

export interface RefundInput {
  outletId: string;
  paymentId: string;
  amountMinor: bigint;
  reasonCode: string;
  isPartial: boolean;
}

export type RefundStatus = "INITIATED" | "PENDING" | "SUCCESS" | "FAILED";

export type RefundResult =
  | { ok: true; refundId: string; status: RefundStatus }
  | { ok: false; reason: "EXCEEDS_CAPTURED_AMOUNT" | "MISSING_REASON_CODE" };

export interface LedgerPostingInput {
  outletId: string;
  sourceType: "ORDER" | "PAYMENT" | "REFUND" | "SETTLEMENT";
  sourceId: string;
  account: string;
  debitMinor: bigint;
  creditMinor: bigint;
}
