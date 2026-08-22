# Tests

**Owner:** QA Lead · **Status:** DRAFT · **Updated:** 2026-08-08
**Strategy:** [`../docs/09-testing/test-strategy.md`](../docs/09-testing/test-strategy.md) · **Scenarios:** [`../docs/09-testing/`](../docs/09-testing/)

Test code lives here. Test *specifications* live in `docs/09-testing/`. Every test file references the spec ID it implements (`TST-E2E-01`, `TST-SEC-04`).

---

## Layout

| Folder | Suite | Runs against | Speed | CI gate |
|--------|-------|-------------|-------|---------|
| [`unit/`](unit/) | Pure logic — pricing, tax, state transitions, validation | nothing external | ms | every PR |
| [`contract/`](contract/) | Implementation vs OpenAPI spec | in-process app | seconds | every PR |
| [`integration/`](integration/) | Module + real DB/queue/cache | docker services | seconds | every PR |
| [`e2e/`](e2e/) | Full user flows through the UI | full stack | minutes | pre-merge to `develop` |
| [`smoke/`](smoke/) | Post-deploy health | deployed env | seconds | every deploy |
| [`security/`](security/) | AuthZ, injection, idempotency abuse | full stack | minutes | nightly + pre-release |
| [`performance/`](performance/) | Load, stress, spike, endurance | staging | long | pre-release |
| [`fixtures/`](fixtures/) | Shared test data factories | — | — | — |

---

## Run

```bash
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:e2e
npm run test:security
npm run test:smoke -- --env=staging
npm run test:perf
```

```bash
npm run test:unit -- --coverage --watch
```

---

## Naming

```
tests/unit/orders/pricing.test.ts           → describe('TST-UNIT: order pricing')
tests/e2e/order-to-payment.spec.ts          → test('TST-E2E-01: dine-in order to payment')
tests/security/authz-outlet-scope.test.ts   → test('TST-SEC-04: outlet_id in body must not override session')
```

Test name starts with the spec ID. When a test fails in CI, the ID is what makes the spec findable in under ten seconds.

---

## Non-Negotiable Test Requirements

Per [`../docs/ENGINEERING-PROTOCOL.md`](../docs/ENGINEERING-PROTOCOL.md) §5:

| Change type | Required test |
|-------------|--------------|
| Pricing / tax / discount | Unit tests with boundary cases + a Finance reviewer |
| State transition | One test per legal **and** illegal transition |
| API endpoint | Contract test + authorization test (correct role, wrong role, **wrong outlet**) |
| Webhook handler | Duplicate-delivery test proving exactly one internal record |
| Migration | Applies to an empty DB **and** to a snapshot with existing data |
| UI component | All six states from `UX-STATE-CATALOGUE` |

---

## Rules

1. **No production data in any suite.** No real customer PII, ever, in any environment below production.
2. **Deterministic.** No `Date.now()` in assertions, no random data without a seed. A flaky money test is a warning, not noise.
3. **Isolated.** Each test creates and tears down its own data. Tests must pass in any order and in parallel.
4. **Money assertions in minor units.** Assert `24500`, never `"₹245.00"` — formatting is a separate concern.
5. **Business day, not calendar day.** Tests spanning midnight must use `fn_business_date` semantics or they will pass locally and fail at 1 a.m. in production.
6. **Never skip a failing test.** Fix it or flag it. `test.skip` requires a linked ticket in the same PR.

---

## Coverage Targets

| Suite | Target |
|-------|--------|
| Unit | 80%+ |
| Component | 70%+ |
| API | 90%+ |
| Integration | 100% of critical paths |

Coverage is a floor, not a goal. An untested illegal state transition is a defect at any percentage.

---

## Fixtures

`fixtures/` provides factories, not fixtures files. Build objects with overrides:

```ts
const order = buildOrder({ status: 'KOT_CREATED', total_minor: 24500 });
```

Fixed UUIDs for records that tests reference by ID. Seeded catalogue matches `db/seeds/` so E2E and manual QA see the same menu.
