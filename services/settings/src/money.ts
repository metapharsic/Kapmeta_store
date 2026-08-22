// services/settings/src/money.ts
// Same round-half-up-to-2-decimals helper as services/tax/src/money.ts.
// Duplicated (not imported cross-package) so this service has no build-time
// dependency on the tax package -- keeps the services independently deployable.

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
