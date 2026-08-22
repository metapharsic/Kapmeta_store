# Finance Service — PROPOSAL

**PROPOSAL, not confirmed spec.** No screenshot evidence exists for a
finance/dues module beyond "Due Payment" appearing as a payment type in one
screenshot. `services/orders/src/types.ts` has no `payment_type` field on
`Order` today. This package (dues ledger, chart of accounts, settlement +
audit) is a speculative design filling that gap, built in the same
in-memory-`Repository<T>` style as `services/orders` and
`services/settings` so it can be swapped for a real Postgres-backed
implementation later without changing `DuesService`.

## Contents

- `src/types.ts` — `DueLedgerEntry`, `ChartOfAccount`, `DueSettlementAudit`.
- `src/DuesRepository.ts` — `Repository<T>` interface + in-memory impl.
- `src/DuesService.ts` — `recordDue`, `settleDue` (partial settlement,
  audited, flips to `settled` only once fully paid), `listOutstandingByCustomer`.
- `test/DuesService.test.ts` — 8 tests, all passing.

## Verified

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 8/8 passing.
