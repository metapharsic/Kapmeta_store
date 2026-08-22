/**
 * services/shared/src/money.ts
 * Shared money-rounding helper. ALL money fields must pass through this
 * before being persisted or compared — never write raw floats.
 */
export function roundMoney(value: number): number {
  // Round-half-up to 2 decimal places, avoiding classic FP artifacts
  // (e.g. 1.005 -> 1.0) by nudging with a tiny epsilon before rounding.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
