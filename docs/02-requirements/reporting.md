# Dashboard & Reporting — Functional Spec

**Source:** page 1 · **Coverage:** 50% · **Blocks on:** DEC-009 (KPI formulas)

## KPI Layer

| KPI | Calculation principle | Drill-down |
|-----|----------------------|-----------|
| Gross Sales | `SUM(order.grand_total) WHERE status = COMPLETED` | Orders / items |
| Net Sales | Gross − discounts − refunds (tax treatment to confirm) | Payment details |
| Order Count | `COUNT(orders) WHERE status IN (qualifying_states)` | Order list |
| AOV | Net Sales / Order Count | Distribution chart |
| Dine-in Sales | `SUM WHERE order_type = DINE_IN` | Dine-in orders |
| Pickup Sales | `SUM WHERE order_type = PICKUP` | Pickup orders |
| Delivery Sales | `SUM WHERE order_type = DELIVERY` | Delivery orders |
| Online Sales | `SUM WHERE channel IN (Swiggy, Zomato, …)` | Channel breakdown |
| Top Items | `RANK BY quantity OR revenue` (confirm which) | Item details |
| Payment Mix | `GROUP BY payment_method` | Payment transactions |
| KOT Duration | `AVG(completed_at − created_at)` | KOT details |

Every formula above is **proposed** until DEC-009 signs off. Two stakeholders disagreeing on "net sales" after go-live is a reconciliation incident, not a bug.

## Reporting Layers

1. **Operational (real-time)** — live orders, pending KOTs, integration failures
2. **Sales (historical)** — daily/hourly, by category/item/channel, trends
3. **Payment (reconciliation)** — method-wise, settlement status, gateway matching
4. **Inventory** — current stock, consumption, wastage, movement history
5. **Purchase** — vendor performance, PO/GRN tracking, price history
6. **Finance** — invoice register, tax summary, refunds, ledger export
7. **Customer (CRM)** — repeat rate, frequency, average spend, lifetime value
8. **Management** — outlet comparison, trends, forecasts, KPI scorecards

## Implementation

Real-time layer queries transactional tables with tight filters. Layers 2-8 read pre-aggregated summary tables (`daily_sales_summary`, `hourly_sales_summary`, `item_sales_summary`, `payment_summary`, `kot_performance`) refreshed by scheduled jobs — never ad-hoc aggregation over the full orders table.

Business day boundary is configurable per outlet, not calendar midnight. Refunds report against the **original** business day.
