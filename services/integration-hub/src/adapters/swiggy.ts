// DEC-007 UNSIGNED — scaffold only. Swiggy partner API contract not yet available; endpoints are placeholders.

import * as crypto from "crypto";
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

// PLACEHOLDER URLs — no documented Swiggy partner API contract exists yet (DEC-007 pending).
const SWIGGY_API_BASE = "https://partner-api.swiggy.com";

export class SwiggyAdapter implements ChannelAdapter {
  readonly channel: ChannelCode = "SWIGGY";

  verifySignature(rawBody: string, headers: Record<string, string>, credentials: ChannelCredentials): boolean {
    // TODO(DEC-007): secret should be resolved from credentials.credentialsRef via
    // the secret manager once that wiring exists. Using an env var as a scaffold
    // placeholder in the meantime.
    void credentials;

    const secret = process.env.SWIGGY_WEBHOOK_SECRET;
    const provided = headers["x-swiggy-signature"];
    if (!secret || !provided) {
      return false;
    }

    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(provided, "hex");
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  async normalizeInboundEvent(payload: InboundWebhookPayload): Promise<NormalizedInboundEventResult> {
    try {
      // Runtime shape of payload.raw for Swiggy (unofficial, scaffold assumption):
      // ORDER_PLACED:     { order_id: string, outlet_id: string, placed_at: string,
      //                     items: Array<{ item_id: string, qty: number, price_minor: number, notes?: string }>,
      //                     total_minor: number, customer?: { name?: string, phone?: string } }
      // ORDER_CANCELLED:  { order_id: string }
      const raw: any = payload.raw;

      if (payload.eventType === "ORDER_PLACED") {
        if (!raw || typeof raw !== "object" || !raw.order_id || !Array.isArray(raw.items)) {
          throw new Error("malformed ORDER_PLACED payload: missing order_id or items");
        }

        const order: NormalizedInboundOrder = {
          externalOrderId: String(raw.order_id),
          externalOutletId: String(raw.outlet_id),
          placedAt: String(raw.placed_at),
          items: raw.items.map((it: any) => ({
            externalItemId: String(it.item_id),
            quantity: Number(it.qty),
            unitPriceMinor: BigInt(it.price_minor),
            notes: it.notes ? String(it.notes) : undefined,
          })),
          partnerStatedTotalMinor: BigInt(raw.total_minor),
          customer: raw.customer
            ? { name: raw.customer.name, phone: raw.customer.phone }
            : undefined,
        };

        return { status: "ORDER", order };
      }

      if (payload.eventType === "ORDER_CANCELLED") {
        if (!raw || typeof raw !== "object" || !raw.order_id) {
          throw new Error("malformed ORDER_CANCELLED payload: missing order_id");
        }
        return { status: "CANCELLATION", externalOrderId: String(raw.order_id) };
      }

      return { status: "UNKNOWN", note: `unhandled eventType: ${payload.eventType}` };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      throw new Error(`SwiggyAdapter.normalizeInboundEvent: malformed payload — ${reason}`);
    }
  }

  async acknowledgeOrder(
    externalOrderId: string,
    internalOrderId: string,
    credentials: ChannelCredentials,
  ): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER endpoint — not a real documented Swiggy partner API route.
      const res = await fetch(`${SWIGGY_API_BASE}/orders/${externalOrderId}/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalOrderId, outletId: credentials.externalOutletId }),
      });

      if (!res.ok) {
        return { ok: false, errorCode: "NETWORK_ERROR", errorMessage: `HTTP ${res.status}` };
      }

      return { ok: true, externalRef: externalOrderId };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown fetch error",
      };
    }
  }

  async pushMenuSync(items: OutboundMenuSyncItem[], credentials: ChannelCredentials): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER endpoint — not a real documented Swiggy partner API route.
      const res = await fetch(`${SWIGGY_API_BASE}/outlets/${credentials.externalOutletId}/menu/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            item_id: i.externalItemId,
            name: i.name,
            price_minor: i.channelPriceMinor.toString(),
            is_available: i.isAvailable,
            version: i.version,
          })),
        }),
      });

      if (!res.ok) {
        return { ok: false, errorCode: "NETWORK_ERROR", errorMessage: `HTTP ${res.status}` };
      }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown fetch error",
      };
    }
  }

  async pushAvailabilityUpdate(
    externalItemId: string,
    isAvailable: boolean,
    credentials: ChannelCredentials,
  ): Promise<AdapterSendResult> {
    try {
      // PLACEHOLDER endpoint — not a real documented Swiggy partner API route.
      const res = await fetch(
        `${SWIGGY_API_BASE}/outlets/${credentials.externalOutletId}/items/${externalItemId}/availability`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ is_available: isAvailable }),
        },
      );

      if (!res.ok) {
        return { ok: false, errorCode: "NETWORK_ERROR", errorMessage: `HTTP ${res.status}` };
      }

      return { ok: true, externalRef: externalItemId };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "unknown fetch error",
      };
    }
  }
}
