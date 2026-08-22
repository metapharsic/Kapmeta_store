import { describe, it, expect } from "vitest";
import { LedgerEngine, listLedgerEntries, type LedgerRepository, type LedgerEntryListFilter, type LedgerEntryListItem } from "./ledger-engine";

describe("LedgerEngine Double-Entry Balanced Posting", () => {
  it("verifies debit and credit equality on standard F&B invoice journal", async () => {
    const mockPrisma = {
      invoice: {
        findUnique: async () => ({
          id: "inv-101",
          invoiceNo: "INV-2026-001",
          amount: 34000n, // ₹340.00
          taxAmount: 1619n, // ~5% GST component
          orderId: "ord-101",
          order: {
            payments: [{ method: "CASH", amount: 34000n }],
            orderDiscounts: [],
          },
        }),
      },
      $transaction: async (fn: any) => fn({
        ledgerEntry: {
          create: async (data: any) => data,
        },
      }),
    } as any;

    const engine = new LedgerEngine(mockPrisma);
    const result = await engine.postInvoiceJournal("outlet-1", "inv-101");

    expect(result.voucherId).toBe("JV-INV-INV-2026-001");
    expect(result.lines).toBe(3); // Sales (Cr), Tax (Cr), Cash (Dr)
  });

  it("posts balanced journal with split payment and order discounts", async () => {
    const mockPrisma = {
      invoice: {
        findUnique: async () => ({
          id: "inv-102",
          invoiceNo: "INV-2026-002",
          amount: 50000n, // Net payable after ₹50 discount
          taxAmount: 2380n,
          orderId: "ord-102",
          order: {
            payments: [
              { method: "CASH", amount: 20000n },
              { method: "UPI", amount: 30000n },
            ],
            orderDiscounts: [{ amount: 5000n }],
          },
        }),
      },
      $transaction: async (fn: any) => fn({
        ledgerEntry: {
          create: async (data: any) => data,
        },
      }),
    } as any;

    const engine = new LedgerEngine(mockPrisma);
    const result = await engine.postInvoiceJournal("outlet-1", "inv-102");

    expect(result.voucherId).toBe("JV-INV-INV-2026-002");
    expect(result.lines).toBe(5); // Discount (Dr), Sales (Cr), Tax (Cr), Cash (Dr), UPI (Dr)
  });

  it("throws DOUBLE_ENTRY_IMBALANCE error if debit and credit do not balance", async () => {
    const mockPrisma = {
      invoice: {
        findUnique: async () => ({
          id: "inv-corrupt",
          invoiceNo: "INV-CORRUPT",
          amount: 50000n,
          taxAmount: 2000n,
          orderId: "ord-corrupt",
          order: {
            payments: [{ method: "CASH", amount: 40000n }], // ₹100 less than invoice amount
            orderDiscounts: [],
          },
        }),
      },
    } as any;

    const engine = new LedgerEngine(mockPrisma);
    await expect(engine.postInvoiceJournal("outlet-1", "inv-corrupt")).rejects.toThrow(
      "DOUBLE_ENTRY_IMBALANCE"
    );
  });
});

describe("listLedgerEntries", () => {
  function makeLedgerEntry(overrides: Partial<LedgerEntryListItem> = {}): LedgerEntryListItem {
    return {
      id: "entry-1",
      sourceType: "ORDER",
      sourceId: "order-1",
      account: "4010-SALES-FNB",
      debitMinor: 0n,
      creditMinor: 1000n,
      externalRef: "JV-INV-000001",
      status: "POSTED",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      postedAt: new Date("2026-08-01T00:00:00Z"),
      ...overrides,
    };
  }

  function makeRepo(overrides: Partial<LedgerRepository> = {}): LedgerRepository {
    return {
      async listLedgerEntries(_outletId: string, _filter: LedgerEntryListFilter) {
        return [];
      },
      ...overrides,
    };
  }

  it("delegates to repo.listLedgerEntries with the given outletId and filter", async () => {
    let calledWith: { outletId: string; filter: LedgerEntryListFilter } | null = null;
    const items = [makeLedgerEntry()];
    const repo = makeRepo({
      async listLedgerEntries(outletId: string, filter: LedgerEntryListFilter) {
        calledWith = { outletId, filter };
        return items;
      },
    });

    const filter: LedgerEntryListFilter = { account: "4010-SALES-FNB" };
    const result = await listLedgerEntries("outlet-1", filter, repo);

    expect(calledWith).toEqual({ outletId: "outlet-1", filter });
    expect(result).toBe(items);
  });

  it("throws when fromDate is after toDate", async () => {
    const repo = makeRepo();
    const filter: LedgerEntryListFilter = {
      fromDate: new Date("2026-08-10"),
      toDate: new Date("2026-08-01"),
    };
    await expect(listLedgerEntries("outlet-1", filter, repo)).rejects.toThrow(
      "fromDate must be before or equal to toDate",
    );
  });

  it("allows fromDate equal to toDate", async () => {
    const sameDate = new Date("2026-08-05");
    const repo = makeRepo({
      async listLedgerEntries() {
        return [makeLedgerEntry()];
      },
    });
    const result = await listLedgerEntries("outlet-1", { fromDate: sameDate, toDate: sameDate }, repo);
    expect(result).toHaveLength(1);
  });
});
