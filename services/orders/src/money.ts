/**
 * Shared money-rounding helper. All money fields must be run through this
 * before being persisted — never write raw floating point sums directly.
 */
export function roundMoney(value: number): number {
  // Round-half-up to 2 decimal places, guarding against binary float noise
  // (e.g. 1.005 * 100 = 100.49999999999999).
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
