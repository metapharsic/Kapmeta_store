// apps/api/src/aggregator-contracts.ts
//
// PENDING RECONCILIATION: services/aggregator/ is being built concurrently
// by a sibling agent (AggregatorOrderMapper, OosFanoutService,
// MarkFoodReadyBulk, WebhookVerifier). Its final code/exports were not
// available at the time these routes were written, so this file defines
// the minimal shape apps/api needs from that service. Once the real
// package lands, replace these local types/stubs with imports from
// services/aggregator/src/* and delete the stub implementations below.

export interface CreateOrderInput {
  id?: string;
  outlet_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  channel: string;
  items?: any[];
  subtotal_amount?: number;
  tax_amount?: number;
  discount_amount?: number;
  grand_total_amount?: number;
  [key: string]: any;
}

export type AggregatorProvider = 'swiggy' | 'zomato';

/** Verifies an inbound webhook signature. Real impl: WebhookVerifier. */
export interface WebhookVerifier {
  verify(provider: AggregatorProvider, headers: Record<string, string | undefined>, rawBody: unknown): boolean;
}

/** Maps a provider-specific webhook payload to our CreateOrderInput shape.
 * Real impl: AggregatorOrderMapper. */
export interface AggregatorOrderMapper {
  mapToCreateOrderInput(provider: AggregatorProvider, payload: unknown): CreateOrderInput;
}

export interface MarkFoodReadyResult {
  orderId: string;
  ok: boolean;
  error?: string;
}

/** Marks one or more orders food-ready with aggregators. Real impl:
 * MarkFoodReadyBulk. */
export interface MarkFoodReadyBulk {
  markOne(orderId: string): Promise<MarkFoodReadyResult>;
  markBulk(orderIds: string[]): Promise<MarkFoodReadyResult[]>;
}

export interface OosAvailabilityInput {
  itemId: string;
  altItemAllowed: boolean;
  propagateToOtherChannels: boolean;
}

export interface OosAvailabilityResult {
  itemId: string;
  markedOutOfStock: boolean;
  propagatedTo: string[];
}

/** Fans out an out-of-stock marking across channels. Real impl:
 * OosFanoutService. */
export interface OosFanoutService {
  markOutOfStock(input: OosAvailabilityInput): Promise<OosAvailabilityResult>;
}

// ---------------------------------------------------------------------------
// Stand-in implementations, used only until services/aggregator/ lands.
// Header-based stub signature check: header must equal 'valid-signature'.
// ---------------------------------------------------------------------------

export class StubWebhookVerifier implements WebhookVerifier {
  verify(_provider: AggregatorProvider, headers: Record<string, string | undefined>, _rawBody?: unknown): boolean {
    const sig = headers['x-webhook-signature'];
    return sig === 'valid-signature';
  }
}

export class StubAggregatorOrderMapper implements AggregatorOrderMapper {
  mapToCreateOrderInput(provider: AggregatorProvider, payload: unknown): CreateOrderInput {
    const body = (payload ?? {}) as Record<string, unknown>;
    return {
      outlet_id: String(body.outlet_id ?? 'unknown-outlet'),
      channel: provider,
      customer_name: (body.customer_name as string | undefined) ?? null,
      customer_phone: (body.customer_phone as string | undefined) ?? null,
    };
  }
}

export class StubMarkFoodReadyBulk implements MarkFoodReadyBulk {
  async markOne(orderId: string): Promise<MarkFoodReadyResult> {
    return { orderId, ok: true };
  }

  async markBulk(orderIds: string[]): Promise<MarkFoodReadyResult[]> {
    return Promise.all(orderIds.map((id) => this.markOne(id)));
  }
}

export class StubOosFanoutService implements OosFanoutService {
  async markOutOfStock(input: OosAvailabilityInput): Promise<OosAvailabilityResult> {
    return {
      itemId: input.itemId,
      markedOutOfStock: true,
      propagatedTo: input.propagateToOtherChannels ? ['swiggy', 'zomato'] : [],
    };
  }
}
