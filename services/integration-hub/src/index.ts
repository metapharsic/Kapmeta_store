export { AdapterRegistry } from "./adapter-registry";
export { receiveWebhook } from "./webhook-receiver";
export type { InboundEventStore, CredentialsResolver, WebhookOutcome } from "./webhook-receiver";
export { mapInboundOrderItems, checkTotalMismatch } from "./mapping-engine";
export type { ChannelItemMappingLookup, MappedLine, MappingResult } from "./mapping-engine";
export { nextBackoffMs, shouldDeadLetter, handleSyncJobFailure } from "./retry-dlq";
export type { RetryableJob, SyncJobStore } from "./retry-dlq";
export { SwiggyAdapter } from "./adapters/swiggy";
export { ZomatoAdapter } from "./adapters/zomato";
export { PrismaInboundEventStore } from "./stores/prisma-inbound-event-store";
export { PrismaChannelItemMappingLookup } from "./stores/prisma-channel-item-mapping-lookup";
export { PrismaSyncJobStore } from "./stores/prisma-sync-job-store";
export { runReconciliation } from "./reconciliation-service";
export type { ChannelOrderRecord, ReconciliationRepository, ReconciliationReport } from "./reconciliation-service";
export { PrismaReconciliationRepository } from "./stores/prisma-reconciliation-repository";
export { MenuSyncWorker } from "./menu-sync-worker";
export type { ChannelSyncResult } from "./menu-sync-worker";
export { listChannelItemStatus, setChannelItemAvailability, computeOverallStatus } from "./channel-item-status";
export type {
  ChannelOverallStatus,
  ChannelItemMappingRow,
  ChannelItemStatusRow,
  ChannelItemStatusRepository,
  SetChannelItemAvailabilityResult,
} from "./channel-item-status";
export { PrismaChannelItemStatusRepository } from "./stores/prisma-channel-item-status-repository";

// Boot-time registration. Callers (apps/api, once it exists) import this
// instead of constructing a registry by hand, so registration stays in one place.
import { AdapterRegistry } from "./adapter-registry";
import { SwiggyAdapter } from "./adapters/swiggy";
import { ZomatoAdapter } from "./adapters/zomato";

export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new SwiggyAdapter());
  registry.register(new ZomatoAdapter());
  return registry;
}
