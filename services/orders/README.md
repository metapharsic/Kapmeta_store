# orders

Order lifecycle + state machine + status history. Publishes order.placed, order.status_changed, order.cancelled.

## What's built

- `src/order-service.ts` — `createOrder` (idempotency-key guarded, atomic pricing), `transitionOrder` (validated against `ORDER_TRANSITIONS` state machine), `priceOrder` (pure, tax deferred to DEC-004 pricing engine — currently 0).
- `src/stores/prisma-order-repository.ts` — `PrismaOrderRepository` (atomic order+items+status-history creation), `PrismaMenuPriceLookup`.

## What's NOT built

- Real tax/discount pricing engine (DEC-004/DEC-008 approved decisions, not yet implemented as code — `priceOrder` always returns 0 tax).
- Gapless outlet-scoped order numbering (`orderNumber` is currently `ORD-${Date.now()}`, flagged as placeholder in code).
- KOT generation on order confirmation (needs `services/kitchen`, being built next).
- HTTP entrypoint into `apps/api`.
- Cancellation/refund workflow (WF-ORD-04) — `transitionOrder` allows CANCELLED from any non-terminal state per the state table, but reason-code/permission checks aren't implemented here — that's `services/auth`'s `requirePermission` composed at the API layer, not yet wired.

See docs/03-architecture/high-level-design.md for module boundaries.
