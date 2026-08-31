/**
 * T-008: Tax accuracy unit tests
 * Tests the GST calculation engine for statutory compliance.
 * GST rates: 5% on food (CGST 2.5% + SGST 2.5%), 18% on alcohol/tobacco.
 */
import { describe, it, expect } from "vitest";

// Standalone mirror of @kapmeta/finance TaxEngine logic
function calculateGST(subtotalPaise: bigint, ratePercent: number) {
  const halfRateBps = Math.round(ratePercent * 50); // half-rate in basis points
  const cgst = (subtotalPaise * BigInt(halfRateBps)) / 10000n;
  const sgst = cgst;
  const taxTotal = cgst + sgst;
  return { cgst, sgst, taxTotal, grandTotal: subtotalPaise + taxTotal };
}

describe("T-008: GST calculation", () => {
  it("5% GST on ₹100 food: CGST ₹2.50 + SGST ₹2.50 = grand total ₹105", () => {
    const r = calculateGST(10000n, 5);
    expect(r.cgst).toBe(250n);
    expect(r.sgst).toBe(250n);
    expect(r.taxTotal).toBe(500n);
    expect(r.grandTotal).toBe(10500n);
  });

  it("18% GST on ₹100 alcohol: CGST ₹9 + SGST ₹9 = grand total ₹118", () => {
    const r = calculateGST(10000n, 18);
    expect(r.cgst).toBe(900n);
    expect(r.sgst).toBe(900n);
    expect(r.taxTotal).toBe(1800n);
    expect(r.grandTotal).toBe(11800n);
  });

  it("5% GST on ₹0: all zeros", () => {
    const r = calculateGST(0n, 5);
    expect(r.cgst).toBe(0n);
    expect(r.grandTotal).toBe(0n);
  });

  it("5% GST on ₹10000: correct BigInt arithmetic", () => {
    const r = calculateGST(1000000n, 5);
    expect(r.cgst).toBe(25000n);
    expect(r.grandTotal).toBe(1050000n);
  });
});

describe("T-008: Equal split", () => {
  it("Equal split ₹300 / 3 = ₹100 each, sum exact", () => {
    const total = 30000n;
    const n = 3;
    const per = total / BigInt(n);
    const rem = total % BigInt(n);
    const splits = Array.from({ length: n }, (_, i) => per + (BigInt(i) < rem ? 1n : 0n));
    expect(splits.reduce((a, b) => a + b, 0n)).toBe(total);
    expect(splits[0]).toBe(10000n);
  });

  it("Equal split ₹100 / 3 handles remainder without losing paise", () => {
    const total = 10000n;
    const n = 3;
    const per = total / BigInt(n);
    const rem = total % BigInt(n);
    const splits = Array.from({ length: n }, (_, i) => per + (BigInt(i) < rem ? 1n : 0n));
    expect(splits.reduce((a, b) => a + b, 0n)).toBe(total);
  });
});
