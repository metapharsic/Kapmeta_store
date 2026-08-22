// Per-aggregator-channel item availability sync status. This is distinct
// from services/menu/src/availability-service.ts's outlet-wide
// ItemAvailability.isStocked "86-list" toggle: that one controls whether an
// item is sellable at the outlet at all (POS + every channel). This module
// controls whether one already-sellable item is turned ON/OFF on a specific
// aggregator channel (Swiggy, Zomato, ...) via ChannelItemMapping.isAvailable.

export type ChannelOverallStatus = "ALL_ON" | "ALL_OFF" | "PARTIAL";

export interface ChannelItemMappingRow {
  mappingId: string;
  channelAccountId: string;
  channel: string; // SWIGGY, ZOMATO, ONDC, ...
  menuItemId: string;
  isAvailable: boolean;
  version: number;
}

export interface ChannelItemStatusRow {
  menuItemId: string;
  name: string;
  onlineDisplayName: string | null;
  categoryName: string;
  overallStatus: ChannelOverallStatus;
  channels: ChannelItemMappingRow[];
}

export interface ChannelItemStatusRepository {
  // Every ChannelItemMapping row for the outlet's connected channel accounts,
  // joined with menu item name/category, optionally filtered to one channel.
  listMappings(outletId: string, channel?: string): Promise<
    Array<{
      mappingId: string;
      channelAccountId: string;
      channel: string;
      menuItemId: string;
      name: string;
      onlineDisplayName: string | null;
      categoryName: string;
      isAvailable: boolean;
      version: number;
    }>
  >;
  // Applies the toggle only if the row's current version matches
  // expectedVersion (optimistic locking), returning whether it applied.
  updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean): Promise<boolean>;
  getMapping(mappingId: string): Promise<{ version: number } | null>;
}

/**
 * Computes the 3-state overall status for a menu item from its per-channel
 * mapping rows:
 *   - ALL_ON  when every connected channel mapping has isAvailable === true
 *   - ALL_OFF when every connected channel mapping has isAvailable === false
 *   - PARTIAL when the item has at least one channel ON and at least one OFF
 * An item with zero channel mappings is treated as ALL_OFF (nothing synced
 * anywhere yet is equivalent to "off everywhere").
 */
export function computeOverallStatus(channels: Array<{ isAvailable: boolean }>): ChannelOverallStatus {
  if (channels.length === 0) return "ALL_OFF";
  const onCount = channels.filter((c) => c.isAvailable).length;
  if (onCount === channels.length) return "ALL_ON";
  if (onCount === 0) return "ALL_OFF";
  return "PARTIAL";
}

export async function listChannelItemStatus(
  outletId: string,
  repo: ChannelItemStatusRepository,
  channel?: string,
): Promise<ChannelItemStatusRow[]> {
  const rows = await repo.listMappings(outletId, channel);

  const byItem = new Map<string, ChannelItemStatusRow>();
  for (const row of rows) {
    let entry = byItem.get(row.menuItemId);
    if (!entry) {
      entry = {
        menuItemId: row.menuItemId,
        name: row.name,
        onlineDisplayName: row.onlineDisplayName,
        categoryName: row.categoryName,
        overallStatus: "ALL_OFF",
        channels: [],
      };
      byItem.set(row.menuItemId, entry);
    }
    entry.channels.push({
      mappingId: row.mappingId,
      channelAccountId: row.channelAccountId,
      channel: row.channel,
      menuItemId: row.menuItemId,
      isAvailable: row.isAvailable,
      version: row.version,
    });
  }

  const result = Array.from(byItem.values());
  for (const item of result) {
    item.overallStatus = computeOverallStatus(item.channels);
  }
  return result;
}

export type SetChannelItemAvailabilityResult =
  | { ok: true; newVersion: number }
  | { ok: false; reason: "STALE_VERSION"; currentVersion: number }
  | { ok: false; reason: "NOT_FOUND" };

export async function setChannelItemAvailability(
  mappingId: string,
  isAvailable: boolean,
  expectedVersion: number,
  repo: ChannelItemStatusRepository,
): Promise<SetChannelItemAvailabilityResult> {
  const applied = await repo.updateIfVersionMatches(mappingId, expectedVersion, isAvailable);

  if (applied) {
    return { ok: true, newVersion: expectedVersion + 1 };
  }

  const current = await repo.getMapping(mappingId);
  if (!current) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  return { ok: false, reason: "STALE_VERSION", currentVersion: current.version };
}
