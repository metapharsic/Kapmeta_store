import type { NormalizedInboundOrder } from "@kapmeta/shared-types/channel";

export interface ChannelItemMappingLookup {
  findByExternalItemId(channelAccountId: string, externalItemId: string): Promise<{ menuItemId: string; channelPriceMinor: bigint | null } | null>;
}

export type MappedLine = {
  externalItemId: string;
  menuItemId: string;
  quantity: number;
  unitPriceMinor: bigint;
};

export type MappingResult =
  | { ok: true; lines: MappedLine[] }
  | { ok: false; unmappedExternalItemIds: string[] };

// Maps every line of a NormalizedInboundOrder to internal menu items.
// Recommendation from DEC-007 packet: "unknown item mapping -> quarantine
// event and alert operator" (source doc 11.3 / 39.2) — this function returns
// the unmapped list rather than throwing, so the caller decides quarantine
// vs partial-accept per business policy (not yet decided, hence explicit).
export async function mapInboundOrderItems(
  channelAccountId: string,
  order: NormalizedInboundOrder,
  lookup: ChannelItemMappingLookup,
): Promise<MappingResult> {
  const lines: MappedLine[] = [];
  const unmapped: string[] = [];

  for (const item of order.items) {
    const mapping = await lookup.findByExternalItemId(channelAccountId, item.externalItemId);
    if (!mapping) {
      unmapped.push(item.externalItemId);
      continue;
    }
    lines.push({
      externalItemId: item.externalItemId,
      menuItemId: mapping.menuItemId,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    });
  }

  if (unmapped.length > 0) {
    return { ok: false, unmappedExternalItemIds: unmapped };
  }
  return { ok: true, lines };
}

// Follow-up item from DEC-007 packet, required alongside whichever option is
// chosen: partner-stated total vs our computed total must both be recorded,
// and a mismatch raises an integration_errors row rather than silently
// accepting the partner figure.
export function checkTotalMismatch(
  partnerStatedTotalMinor: bigint,
  computedTotalMinor: bigint,
): { mismatched: boolean; deltaMinor: bigint } {
  const delta = partnerStatedTotalMinor - computedTotalMinor;
  return { mismatched: delta !== 0n, deltaMinor: delta };
}
