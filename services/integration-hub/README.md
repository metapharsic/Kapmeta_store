# integration-hub

Channel adapters, webhook receiver, mapping engine, retry/DLQ, reconciliation.

**DEC-007 is UNSIGNED.** `docs/decisions/DEC-007-aggregator-apis.md` "Decided:" field is blank — Business has not approved Option B (channel-neutral hub). Code below is a best-guess scaffold against the recommended shape, built at explicit user request ahead of sign-off. Treat as at-risk: schema tables (`channel_accounts`, `channel_item_mapping`, `channel_order_mapping`, `inbound_events`, `outbound_events`, `sync_jobs`, `integration_errors` in `kapmeta/schema.prisma`) and this hub core will need rework if Business picks Option A/C/D/E instead.

## What's built (scaffold, unsigned)

- `src/index.ts` — public exports.
- `src/adapter-registry.ts` — Channel Account Manager (adapter half): one `ChannelAdapter` per `ChannelCode`, no hub-core dependency on any specific partner.
- `src/webhook-receiver.ts` — Inbound Webhook Receiver: verify signature → persist raw event → idempotency check → hand off to adapter's `normalizeInboundEvent`. Never creates orders itself.
- `src/mapping-engine.ts` — maps external item IDs to internal `menuItemId`s; returns unmapped list rather than throwing (quarantine-vs-partial-accept policy not yet decided). `checkTotalMismatch` implements the DEC-007 packet's mandatory partner-total-vs-computed-total check.
- `src/retry-dlq.ts` — exponential backoff + dead-letter threshold for `SyncJob` rows.
- `src/adapters/swiggy.ts`, `src/adapters/zomato.ts` — partner adapters implementing `@kapmeta/shared-types/channel`'s `ChannelAdapter`. Partner API endpoints are placeholders — no real Swiggy/Zomato API contract is available yet.
- `src/stores/prisma-inbound-event-store.ts`, `src/stores/prisma-channel-item-mapping-lookup.ts`, `src/stores/prisma-sync-job-store.ts` — Prisma-backed implementations of `InboundEventStore`, `ChannelItemMappingLookup`, `SyncJobStore` against `kapmeta/schema.prisma`'s `InboundEvent`/`ChannelItemMapping`/`SyncJob`/`IntegrationError` models. Quarantine/dead-letter reasons are recorded as `IntegrationError` rows since those columns don't exist on the parent tables.
- `src/reconciliation-service.ts` + `src/stores/prisma-reconciliation-repository.ts` — Reconciliation Service. `runReconciliation` batches `ChannelOrderMapping` rows in a date range through `checkTotalMismatch` (from `mapping-engine.ts`), records every mismatch as an `IntegrationError` (`source: "PRICE_MISMATCH"`), returns a `ReconciliationReport`.

## What's NOT built

- `CredentialsResolver` Prisma implementation (needs secret-manager wiring, not just a DB read — `credentialsRef` is a pointer, never resolved to raw secret here).
- Sync Status Store UI surface.
- HTTP entrypoint (webhook route, auth middleware) — no `apps/api` wiring yet since that service is also unbuilt.
- Real Swiggy/Zomato certification, signatures, or API shapes — everything partner-specific is a documented placeholder pending partner contracts (RSK-11).

See docs/03-architecture/high-level-design.md for module boundaries.

