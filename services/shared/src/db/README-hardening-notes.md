# DB / Platform Hardening Notes (Phase 12-15 audit)

Flag-only findings from the Phase 12-15 hardening pass. Feature-freeze is in
effect, so nothing below has been fixed -- these are gaps for a follow-up
phase to address.

- **No rate-limiting on webhook routes.** `apps/api/src/routes/webhooks.ts`
  (`/webhooks/swiggy`, `/webhooks/zomato`) has no per-IP or per-provider
  request-rate limiting in front of `handleWebhook()`. A misbehaving or
  malicious caller can call these endpoints as fast as the network allows.

- **No idempotency key on aggregator webhook ingestion.** `handleWebhook()`
  calls `ordersService.createOrder(input)` directly on every verified
  request; there is no dedupe check (e.g. provider order id / delivery
  receipt id) before creating a new order, so a retried or replayed webhook
  (same signature, same payload, sent twice by the aggregator) creates a
  duplicate order rather than being recognized as the same event.

- **`services/shared/src/db/Pool.ts` has no visible connection-count /
  timeout ceiling documented alongside it.** Worth confirming the real
  Postgres pool config (max connections, statement/idle timeout) is set
  explicitly somewhere near this module rather than left to driver
  defaults, especially given multiple services (`orders`, `admin`,
  `aggregator`, etc.) all sit behind the same DB.

- **`AdminService.removeBackupFiles` / `removeAllOrdersAndKot` accept
  caller-supplied ID lists without an upper bound.** There's no cap on
  `backupIds.length` (or equivalent) before iterating and deleting, so a
  very large array in a single confirmed admin request is not rejected
  up front -- worth a sanity limit even though the action is admin-gated.

- **`OrderAuditLog` and `AdminAuditLog` are in-memory only (per the file's
  own doc comment: "In-memory placeholder for the real DB-backed
  `order_audit_log` table").** Until the real DB-backed table lands, every
  audit trail produced by destructive admin/order actions is lost on
  process restart -- there is currently no persistence guarantee for the
  very trail this hardening phase is meant to make trustworthy.
