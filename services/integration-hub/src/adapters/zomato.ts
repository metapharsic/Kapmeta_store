// DEC-007 UNSIGNED — scaffold only. Zomato partner API contract not yet
// available; endpoints are placeholders.

import crypto from "crypto";
import type {
  ChannelAdapter,
  ChannelCode,
  ChannelCredentials,
  InboundWebhookPayload,
  NormalizedInboundEventResult,
  NormalizedInboundOrder,
  OutboundMenuSyncItem,
  AdapterSendResult,
} from "@kapmeta/shared-types/channel";

// PLACEHOLDER Zomato partner API base — no documented contract exists yet
// (DEC-007 pending). Replace once partner API docs/contract are available.
const ZOMATO_API_BASE = "https://api.zomato.com/partner";

export class ZomatoAdapter implements ChannelAdapter {
  readonly channel: ChannelCode = "ZOMATO";

  verifySignature(rawBody: string, headers: Record<string, string>, _credentials: ChannelCredentials): boolean {
    // TODO(DEC-007): secret should come from credentials.credentialsRef via
    // secret-manager once that wiring exists. Using env var directly for now
    // as an unsigned/pending scaffold.
    const secret = process.env.ZOMATO_WEBHOOK_SECRET ?? "";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const received = headers["x-zomato-signature"] ?? "";

    if (expected.length !== received.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    } catch {
      return false;
    }
  }

  async normalizeInboundEvent(payload: InboundWebhookPayload): Promise<NormalizedInboundEventResult> {
    try {
      // Runtime shape of payload.raw (Zomato webhook body), not formally
      // documented (DEC-007 pending). Expected roughly:
      // {
      //   eventType: "ORDER_PLACED" | "ORDER_CANCELLED" | string,
      //   order?: {
      //     id: string,
      //     outlet_id: string,
      //     placed_at: string,
      //     items: Array<{ item_id: string, quantity: number, unit_price_minor: string, notes?: string }>,
      //     total_minor: string,
      //     customer?: { name?: string; phone?: string },
      //   },
      //   order_id?: string, // present on ORDER_CANCELLED
      // }
      const raw: any = payload.raw;

      if (payload.eventType === "ORDER_PLACED") {
        const o = raw.order;
        if (!o || !o.id || !o.outlet_id || !Array.isArray(o.items)) {
          throw new Error("missing required order fields");
        }

        const order: NormalizedInboundOrder = {
          externalOrderId: o.id,
          externalOutletId: o.outlet_id,
          placedAt: o.placed_at,
          items: o.items.map((it: any) => ({
            externalItemId: it.item_id,
            quantity: it.quantity,
            unitPriceMinor: BigInt(it.unit_price_minor),
            notes: it.notes,
          })),
          partnerStatedTotalMinor: BigInt(o.total_minor),
          customer: o.customer ? { name: o.customer.name, phone: o.customer.phone } : undefined,
        };

        return { status: "ORDER", order };
      }

      if (payload.eventType === "ORDER_CANCELLED") {
        const externalOrderId = raw.order_id ?? raw.order?.id;
        if (!externalOrderId) {
          throw new Error("missing order_id for cancellation event");
        }
        return { status: "CANCELLATION", externalOrderId };
      }

      return { status: "UNKNOWN", note: `unhandled Zomato eventType: ${payload.eventType}` };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      throw new Error(`ZomatoAdapter.normalizeInboundEvent: malformed payload — ${reason}`);
    }
  }

  async acknowledgeOrder(
    externalOrderId: string,
    internalOrderId: string,
    _credentials: ChannelCredentials,
  ): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER URL — not a real documented Zomato partner endpoint.
      const res = await fetch(`${ZOMATO_API_BASE}/orders/${externalOrderId}/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalOrderId }),
      });

      if (!res.ok) {
        return { ok: false, errorCode: "HTTP_ERROR", errorMessage: `status ${res.status}` };
      }

      return { ok: true, externalRef: externalOrderId };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown network error",
      };
    }
  }

  async pushMenuSync(items: OutboundMenuSyncItem[], _credentials: ChannelCredentials): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER URL — not a real documented Zomato partner endpoint.
      const res = await fetch(`${ZOMATO_API_BASE}/menu/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
      });

      if (!res.ok) {
        return { ok: false, errorCode: "HTTP_ERROR", errorMessage: `status ${res.status}` };
      }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown network error",
      };
    }
  }

  async pushAvailabilityUpdate(
    externalItemId: string,
    isAvailable: boolean,
    _credentials: ChannelCredentials,
  ): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER URL — not a real documented Zomato partner endpoint.
      const res = await fetch(`${ZOMATO_API_BASE}/menu/items/${externalItemId}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isAvailable }),
      });

      if (!res.ok) {
        return { ok: false, errorCode: "HTTP_ERROR", errorMessage: `status ${res.status}` };
      }

      return { ok: true, externalRef: externalItemId };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown network error",
      };
    }
  }
}
