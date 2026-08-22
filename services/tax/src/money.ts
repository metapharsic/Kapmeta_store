// services/tax/src/money.ts
//
// Shared rounding helper. Round-half-up to 2 decimals, done at every
// intermediate step (not just once at the end) because real GST filings
// care about per-line rounding, not just the final total.

export function roundMoney(value: number): number {
  // Use a tiny epsilon nudge to avoid floating point representation issues
  // (e.g. 1.005 sometimes represents as 1.00499999...) before rounding half-up.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
