# Order Management — Functional Spec

**Source:** pages 1-5 · **Coverage:** 60% · **Status:** DRAFT

## Order State Machine

```
DRAFT → PLACED → CONFIRMED → KOT_CREATED → IN_PREPARATION →
READY → ASSIGNED → OUT_FOR_DELIVERY → SERVED/HANDED_OVER → COMPLETED

              ↓ (any pre-COMPLETED state)
          CANCELLED → FAILED
```

### Transition Rules

| From | To | Guard |
|------|----|-------|
| DRAFT | PLACED | All items available, totals computed, outlet open |
| PLACED | CONFIRMED | Payment policy satisfied (prepaid channels require captured payment) |
| CONFIRMED | KOT_CREATED | KOT routed to at least one station |
| IN_PREPARATION | READY | All KOT items marked done |
| READY | ASSIGNED | Delivery orders only |
| ASSIGNED | OUT_FOR_DELIVERY | Rider assigned |
| any | CANCELLED | Permission check + mandatory reason + audit entry |
| CANCELLED post-KOT | — | Requires elevated role; wastage entry if inventory automated (DEC-003) |

Transitions are validated server-side. Every transition appends to `order_status_history` — statuses are never overwritten in place.

## Order Types

`DINE_IN` · `PICKUP` · `DELIVERY` — each with its own required fields (table for dine-in, address+rider for delivery).

## Processing Flow

1. Capture order from POS terminal or channel webhook
2. Validate availability against menu status
3. Calculate pricing + tax + charges (centralized pricing engine)
4. Apply discounts / promotions (DEC-008)
5. Create order transaction — **atomic**
6. Generate KOT, route to kitchen station
7. Kitchen preparation workflow
8. Fulfillment per order type
9. Payment capture / reconciliation
10. Inventory consumption if automated (DEC-003)
11. Invoice generation
12. Analytics / reporting update
13. Audit log completion

Steps 5-6 share one DB transaction. Steps 9-12 are event-driven and idempotent.

## Cancellation & Refund

- Cancellation requires role permission, a reason code, and writes an audit row.
- Post-payment cancellation triggers a refund record; refund reconciles against the original payment and adjusts reports for the original business day.
- Partial refunds allowed at line-item granularity.

## Open Decisions

DEC-002 (offline capture), DEC-004 (tax), DEC-005 (payment capture timing), DEC-008 (discount stacking).
