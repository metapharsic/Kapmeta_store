# reporting

Read-only aggregates and summary refresh jobs. DEC-009 approved (Option D: minimal signed KPI set).

## What's built

- `src/reporting-service.ts` — `computeSalesSummary`, `computeItemPerformance` (pure, versioned via `KPI_FORMULA_VERSION`, both filter to `COMPLETED` orders only), `getSalesSummary`/`getItemPerformance` wrappers.
- `src/stores/prisma-reporting-repository.ts` — `PrismaReportingRepository`, queries `Order`/`OrderItem` directly — no pre-aggregated summary tables, per DEC-009's "retain order-level detail at sufficient grain to recompute any summary."

## What's NOT built

- No other R1 KPIs beyond sales summary + item performance (Option D was deliberately minimal — five trustworthy numbers over twelve provisional ones).
- No async/pre-aggregation for large date ranges (source doc: "large reports run asynchronously where required") — every call recomputes from raw rows.
- HTTP entrypoint into `apps/api`.
- Payment-method-wise, discount-rate, channel-dimension reports (all reference other services' data DEC-009 explicitly deferred past the minimal R1 set).

See docs/03-architecture/high-level-design.md for module boundaries.
