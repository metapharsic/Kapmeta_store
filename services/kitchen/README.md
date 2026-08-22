# kitchen

KOT tickets, station routing, prep tracking. Publishes kot.created, kot.completed.

## What's built

- `src/kot-service.ts` — `createKot`, `transitionKot` validated against `KOT_TRANSITIONS` (QUEUED→PREPARING→READY→SERVED, no skips, no duplicates).
- `src/stores/prisma-kot-repository.ts` — `PrismaKotRepository`, atomic ticket+items+status-history creation.

## What's NOT built

- Station routing (schema has `Station` model, no assignment logic here yet).
- KDS multi-station panel view, expo/pass consolidation, SLA colour-coding, queue-capacity rerouting (all named in source doc §10.2) — none implemented, this is ticket lifecycle only.
## HTTP + RBAC

Wired into `apps/api`: `GET /kot` (`kot.read`), `POST /kot` (`order.create` — kitchen ticket creation happens via `apps/api/src/orchestration/order-lifecycle.ts` on order CONFIRMED, live-verified end-to-end), `PATCH /kot/:id/status` (`kot.status.update`). Permission-gated, seeded via `kapmeta/seed.ts`.

See docs/03-architecture/high-level-design.md for module boundaries.
