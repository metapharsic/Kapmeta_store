import type { ChannelCode, ChannelCredentials, InboundWebhookPayload } from "@kapmeta/shared-types/channel";
import type { AdapterRegistry } from "./adapter-registry";

// Persists every InboundEvent row this function touches — the store is the
// interface, not a concrete DB client, so this stays testable without Postgres.
export interface InboundEventStore {
  findByExternalEventId(channelAccountId: string, externalEventId: string): Promise<{ id: string } | null>;
  persistRaw(args: {
    channelAccountId: string;
    externalEventId: string;
    eventType: string;
    rawPayload: unknown;
  }): Promise<{ id: string }>;
  markProcessed(id: string): Promise<void>;
  markQuarantined(id: string, reason: string): Promise<void>;
}

export interface CredentialsResolver {
  resolve(channel: ChannelCode, externalOutletId: string): Promise<ChannelCredentials>;
}

export type WebhookOutcome =
  | { kind: "DUPLICATE"; externalEventId: string }
  | { kind: "QUARANTINED"; reason: string }
  | { kind: "ACCEPTED"; inboundEventId: string };

// Inbound Webhook Receiver. Steps per DEC-007 / source doc section 39.2:
// verify signature -> persist raw event (before business processing) ->
// idempotency check -> hand off to mapping engine. This function does not
// create orders itself — that is the mapping engine's job, kept separate so
// "receive and persist" can never be skipped on a code path that also maps.
export async function receiveWebhook(
  channel: ChannelCode,
  externalOutletId: string,
  rawBody: string,
  headers: Record<string, string>,
  externalEventId: string,
  eventType: string,
  registry: AdapterRegistry,
  credentialsResolver: CredentialsResolver,
  channelAccountId: string,
  store: InboundEventStore,
): Promise<WebhookOutcome> {
  const adapter = registry.get(channel);
  const credentials = await credentialsResolver.resolve(channel, externalOutletId);

  if (!adapter.verifySignature(rawBody, headers, credentials)) {
    return { kind: "QUARANTINED", reason: "signature verification failed" };
  }

  const existing = await store.findByExternalEventId(channelAccountId, externalEventId);
  if (existing) {
    return { kind: "DUPLICATE", externalEventId };
  }

  const persisted = await store.persistRaw({
    channelAccountId,
    externalEventId,
    eventType,
    rawPayload: JSON.parse(rawBody),
  });

  return { kind: "ACCEPTED", inboundEventId: persisted.id };
}
