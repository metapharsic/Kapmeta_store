// DEC-007 (UNSIGNED — Business decision pending): channel-neutral integration model.
// Contract shared by services/integration-hub core and every channel adapter
// (Swiggy, Zomato, future channels). Adapters implement ChannelAdapter only —
// they never touch Prisma models directly.

export type ChannelCode = "SWIGGY" | "ZOMATO";

export interface ChannelCredentials {
  channelAccountId: string;
  externalOutletId: string;
  credentialsRef: string; // secret-manager pointer, never raw secret
}

export interface InboundWebhookPayload {
  channel: ChannelCode;
  externalEventId: string; // idempotency key source
  eventType: string;
  receivedAt: string; // ISO timestamp
  raw: unknown; // persisted verbatim before processing (protocol rule)
}

export interface NormalizedInboundOrder {
  externalOrderId: string;
  externalOutletId: string;
  placedAt: string;
  items: Array<{
    externalItemId: string;
    quantity: number;
    unitPriceMinor: bigint; // minor units, as stated by partner
    notes?: string;
  }>;
  partnerStatedTotalMinor: bigint;
  customer?: { name?: string; phone?: string };
}

export interface NormalizedInboundEventResult {
  status: "ORDER" | "STATUS_UPDATE" | "CANCELLATION" | "UNKNOWN";
  order?: NormalizedInboundOrder;
  externalOrderId?: string;
  note?: string;
}

export interface OutboundMenuSyncItem {
  externalItemId: string;
  name: string;
  channelPriceMinor: bigint;
  isAvailable: boolean;
  version: number;
}

export interface AdapterSendResult {
  ok: boolean;
  externalRef?: string;
  errorCode?: string;
  errorMessage?: string;
}

// Every channel plugs into the hub through this interface only. The hub core,
// webhook receiver, retry/DLQ and reconciliation are channel-agnostic by
// construction (DEC-007 Option B) — adapters carry all partner-specific shape.
export interface ChannelAdapter {
  readonly channel: ChannelCode;

  verifySignature(rawBody: string, headers: Record<string, string>, credentials: ChannelCredentials): boolean;

  normalizeInboundEvent(payload: InboundWebhookPayload): Promise<NormalizedInboundEventResult>;

  acknowledgeOrder(externalOrderId: string, internalOrderId: string, credentials: ChannelCredentials): Promise<AdapterSendResult>;

  pushMenuSync(items: OutboundMenuSyncItem[], credentials: ChannelCredentials): Promise<AdapterSendResult>;

  pushAvailabilityUpdate(externalItemId: string, isAvailable: boolean, credentials: ChannelCredentials): Promise<AdapterSendResult>;
}
