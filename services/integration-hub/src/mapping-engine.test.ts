import { describe, it, expect } from "vitest";
import { mapInboundOrderItems, checkTotalMismatch, type ChannelItemMappingLookup } from "./mapping-engine";
import type { NormalizedInboundOrder } from "@kapmeta/shared-types/channel";

function makeOrder(items: NormalizedInboundOrder["items"]): NormalizedInboundOrder {
  return {
    externalOrderId: "order-1",
    externalOutletId: "outlet-1",
    placedAt: new Date().toISOString(),
    items,
    partnerStatedTotalMinor: 0n,
  };
}

function makeLookup(entries: Record<string, { menuItemId: string; channelPriceMinor: bigint | null }>): ChannelItemMappingLookup {
  const map = new Map(Object.entries(entries));
  return {
    async findByExternalItemId(_channelAccountId: string, externalItemId: string) {
      return map.get(externalItemId) ?? null;
    },
  };
}

describe("checkTotalMismatch", () => {
  it("returns not mismatched with zero delta when totals equal", () => {
    const result = checkTotalMismatch(1000n, 1000n);
    expect(result).toEqual({ mismatched: false, deltaMinor: 0n });
  });

  it("returns mismatched with positive delta when partner total is higher", () => {
    const result = checkTotalMismatch(1200n, 1000n);
    expect(result.mismatched).toBe(true);
    expect(result.deltaMinor).toBe(200n);
  });

  it("returns mismatched with negative delta when partner total is lower", () => {
    const result = checkTotalMismatch(800n, 1000n);
    expect(result.mismatched).toBe(true);
    expect(result.deltaMinor).toBe(-200n);
  });
});

describe("mapInboundOrderItems", () => {
  it("returns ok with correctly mapped lines when all items resolve", async () => {
    const lookup = makeLookup({
      "ext-1": { menuItemId: "menu-1", channelPriceMinor: null },
      "ext-2": { menuItemId: "menu-2", channelPriceMinor: null },
    });
    const order = makeOrder([
      { externalItemId: "ext-1", quantity: 2, unitPriceMinor: 500n },
      { externalItemId: "ext-2", quantity: 1, unitPriceMinor: 300n },
    ]);

    const result = await mapInboundOrderItems("channel-1", order, lookup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toEqual([
        { externalItemId: "ext-1", menuItemId: "menu-1", quantity: 2, unitPriceMinor: 500n },
        { externalItemId: "ext-2", menuItemId: "menu-2", quantity: 1, unitPriceMinor: 300n },
      ]);
    }
  });

  it("returns ok false listing every unmapped external item id, not just the first", async () => {
    const lookup = makeLookup({
      "ext-mapped": { menuItemId: "menu-1", channelPriceMinor: null },
    });
    const order = makeOrder([
      { externalItemId: "ext-mapped", quantity: 1, unitPriceMinor: 500n },
      { externalItemId: "ext-unmapped-1", quantity: 1, unitPriceMinor: 300n },
      { externalItemId: "ext-unmapped-2", quantity: 3, unitPriceMinor: 100n },
    ]);

    const result = await mapInboundOrderItems("channel-1", order, lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unmappedExternalItemIds).toEqual(["ext-unmapped-1", "ext-unmapped-2"]);
    }
  });
});
