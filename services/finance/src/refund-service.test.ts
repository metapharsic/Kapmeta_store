import { describe, it, expect } from "vitest";
import {
  requestRefund,
  generateInvoiceNumber,
  generateInvoice,
  listRefunds,
  type FinanceRepository,
  type PaymentInfo,
  type RefundListItem,
  type RefundListFilter,
} from "./refund-service";
import type { RefundInput, GenerateInvoiceInput } from "@kapmeta/shared-types/finance";

function makeRepo(overrides: Partial<FinanceRepository> & { payment?: PaymentInfo | null } = {}): FinanceRepository & { getPaymentCallCount: number } {
  const { payment = null, ...rest } = overrides;
  const repo = {
    getPaymentCallCount: 0,
    async getPayment(_paymentId: string): Promise<PaymentInfo | null> {
      repo.getPaymentCallCount++;
      return payment;
    },
    async createRefund(_input: RefundInput) {
      return { id: "refund-1", status: "INITIATED" as const };
    },
    async createInvoice(_input: GenerateInvoiceInput, invoiceNo: string) {
      return { id: "invoice-1", invoiceNo };
    },
    async listRefunds(_outletId: string, _filter: RefundListFilter) {
      return [] as RefundListItem[];
    },
    ...rest,
  };
  return repo;
}

function makeRefundInput(overrides: Partial<RefundInput> = {}): RefundInput {
  return {
    outletId: "outlet-1",
    paymentId: "payment-1",
    amountMinor: 100n,
    reasonCode: "CUSTOMER_REQUEST",
    isPartial: false,
    ...overrides,
  };
}

describe("requestRefund", () => {
  it("returns MISSING_REASON_CODE for empty reasonCode without calling getPayment", async () => {
    const repo = makeRepo();
    const result = await requestRefund(makeRefundInput({ reasonCode: "" }), repo, "user-test");
    expect(result).toEqual({ ok: false, reason: "MISSING_REASON_CODE" });
    expect(repo.getPaymentCallCount).toBe(0);
  });

  it("returns MISSING_REASON_CODE for whitespace-only reasonCode without calling getPayment", async () => {
    const repo = makeRepo();
    const result = await requestRefund(makeRefundInput({ reasonCode: "   " }), repo, "user-test");
    expect(result).toEqual({ ok: false, reason: "MISSING_REASON_CODE" });
    expect(repo.getPaymentCallCount).toBe(0);
  });

  it("returns EXCEEDS_CAPTURED_AMOUNT when amount plus already refunded exceeds captured amount", async () => {
    const repo = makeRepo({
      payment: { id: "payment-1", amountMinor: 1000n, alreadyRefundedMinor: 950n },
    });
    const result = await requestRefund(makeRefundInput({ amountMinor: 100n }), repo, "user-test");
    expect(result).toEqual({ ok: false, reason: "EXCEEDS_CAPTURED_AMOUNT" });
  });

  it("calls createRefund and returns ok true for a valid refund within captured amount", async () => {
    let createRefundCalledWith: RefundInput | null = null;
    const repo = makeRepo({
      payment: { id: "payment-1", amountMinor: 1000n, alreadyRefundedMinor: 200n },
      async createRefund(input: RefundInput) {
        createRefundCalledWith = input;
        return { id: "refund-42", status: "SUCCESS" as const };
      },
    });
    const input = makeRefundInput({ amountMinor: 300n });
    const result = await requestRefund(input, repo, "user-test");

    expect(createRefundCalledWith).toEqual(input);
    expect(result).toEqual({ ok: true, refundId: "refund-42", status: "SUCCESS" });
  });

  it("throws when getPayment returns null", async () => {
    const repo = makeRepo({ payment: null });
    await expect(requestRefund(makeRefundInput(), repo, "user-test")).rejects.toThrow("payment not found");
  });
});

describe("generateInvoiceNumber", () => {
  it("formats as INV-<first 8 chars of outletId>-<sequence zero-padded to 6 digits>", () => {
    expect(generateInvoiceNumber("outlet-123456789", 42)).toBe("INV-outlet-1-000042");
    expect(generateInvoiceNumber("out", 7)).toBe("INV-out-000007");
    expect(generateInvoiceNumber("outlet-1", 1000000)).toBe("INV-outlet-1-1000000");
  });
});

describe("generateInvoice", () => {
  it("creates invoice with deterministic invoiceNo derived from outletId and sequence", async () => {
    const repo = makeRepo();
    const input: GenerateInvoiceInput = {
      outletId: "outlet-1",
      orderId: "order-1",
      amountMinor: 500n,
      taxAmountMinor: 25n,
    };
    const result = await generateInvoice(input, 3, repo);
    expect(result).toEqual({ id: "invoice-1", invoiceNo: "INV-outlet-1-000003" });
  });
});

describe("listRefunds", () => {
  function makeRefundListItem(overrides: Partial<RefundListItem> = {}): RefundListItem {
    return {
      id: "refund-1",
      orderId: "order-1",
      paymentId: "payment-1",
      amountMinor: 500n,
      reasonCode: "CUSTOMER_REQUEST",
      status: "SUCCESS",
      isPartial: false,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      ...overrides,
    };
  }

  it("delegates to repo.listRefunds with the given outletId and filter", async () => {
    let calledWith: { outletId: string; filter: RefundListFilter } | null = null;
    const items = [makeRefundListItem()];
    const repo = makeRepo({
      async listRefunds(outletId: string, filter: RefundListFilter) {
        calledWith = { outletId, filter };
        return items;
      },
    });

    const filter: RefundListFilter = { status: "SUCCESS" };
    const result = await listRefunds("outlet-1", filter, repo);

    expect(calledWith).toEqual({ outletId: "outlet-1", filter });
    expect(result).toBe(items);
  });

  it("throws when fromDate is after toDate", async () => {
    const repo = makeRepo();
    const filter: RefundListFilter = {
      fromDate: new Date("2026-08-10"),
      toDate: new Date("2026-08-01"),
    };
    await expect(listRefunds("outlet-1", filter, repo)).rejects.toThrow(
      "fromDate must be before or equal to toDate",
    );
  });

  it("allows fromDate equal to toDate", async () => {
    const sameDate = new Date("2026-08-05");
    const repo = makeRepo({
      async listRefunds() {
        return [makeRefundListItem()];
      },
    });
    const result = await listRefunds("outlet-1", { fromDate: sameDate, toDate: sameDate }, repo);
    expect(result).toHaveLength(1);
  });
});
