import { describe, it, expect } from "vitest";
import {
  computeOverallStatus,
  listChannelItemStatus,
  setChannelItemAvailability,
  type ChannelItemStatusRepository,
} from "./channel-item-status";

describe("computeOverallStatus", () => {
  it("returns ALL_ON when every channel is available", () => {
    expect(computeOverallStatus([{ isAvailable: true }, { isAvailable: true }])).toBe("ALL_ON");
  });

  it("returns ALL_OFF when every channel is unavailable", () => {
    expect(computeOverallStatus([{ isAvailable: false }, { isAvailable: false }])).toBe("ALL_OFF");
  });

  it("returns ALL_OFF when there are no channel mappings", () => {
    expect(computeOverallStatus([])).toBe("ALL_OFF");
  });

  it("returns PARTIAL when channels are mixed", () => {
    expect(computeOverallStatus([{ isAvailable: true }, { isAvailable: false }])).toBe("PARTIAL");
  });

  it("returns PARTIAL with three channels, two on one off", () => {
    expect(
      computeOverallStatus([{ isAvailable: true }, { isAvailable: true }, { isAvailable: false }]),
    ).toBe("PARTIAL");
  });
});

function makeRepo(
  rows: Array<{
    mappingId: string;
    channelAccountId: string;
    channel: string;
    menuItemId: string;
    name: string;
    onlineDisplayName: string | null;
    categoryName: string;
    isAvailable: boolean;
    version: number;
  }>,
): ChannelItemStatusRepository {
  const store = new Map(rows.map((r) => [r.mappingId, { ...r }]));
  return {
    async listMappings(_outletId: string, channel?: string) {
      return Array.from(store.values()).filter((r) => !channel || r.channel === channel);
    },
    async updateIfVersionMatches(mappingId: string, expectedVersion: number, isAvailable: boolean) {
      const row = store.get(mappingId);
      if (!row || row.version !== expectedVersion) return false;
      row.isAvailable = isAvailable;
      row.version += 1;
      return true;
    },
    async getMapping(mappingId: string) {
      const row = store.get(mappingId);
      return row ? { version: row.version } : null;
    },
  };
}

describe("listChannelItemStatus", () => {
  it("groups mappings by menu item and computes overall status per item", async () => {
    const repo = makeRepo([
      {
        mappingId: "m1",
        channelAccountId: "ca-swiggy",
        channel: "SWIGGY",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: true,
        version: 1,
      },
      {
        mappingId: "m2",
        channelAccountId: "ca-zomato",
        channel: "ZOMATO",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: false,
        version: 1,
      },
      {
        mappingId: "m3",
        channelAccountId: "ca-swiggy",
        channel: "SWIGGY",
        menuItemId: "item-2",
        name: "Dal Makhani",
        onlineDisplayName: "Dal Makhani (Rich)",
        categoryName: "Mains",
        isAvailable: true,
        version: 2,
      },
    ]);

    const result = await listChannelItemStatus("outlet-1", repo);

    expect(result).toHaveLength(2);
    const item1 = result.find((r) => r.menuItemId === "item-1")!;
    expect(item1.overallStatus).toBe("PARTIAL");
    expect(item1.channels).toHaveLength(2);

    const item2 = result.find((r) => r.menuItemId === "item-2")!;
    expect(item2.overallStatus).toBe("ALL_ON");
    expect(item2.onlineDisplayName).toBe("Dal Makhani (Rich)");
  });

  it("filters to a single channel when requested", async () => {
    const repo = makeRepo([
      {
        mappingId: "m1",
        channelAccountId: "ca-swiggy",
        channel: "SWIGGY",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: true,
        version: 1,
      },
      {
        mappingId: "m2",
        channelAccountId: "ca-zomato",
        channel: "ZOMATO",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: false,
        version: 1,
      },
    ]);

    const result = await listChannelItemStatus("outlet-1", repo, "ZOMATO");

    expect(result).toHaveLength(1);
    expect(result[0].channels).toHaveLength(1);
    expect(result[0].channels[0].channel).toBe("ZOMATO");
    expect(result[0].overallStatus).toBe("ALL_OFF");
  });
});

describe("setChannelItemAvailability", () => {
  it("applies the toggle and increments the version when expectedVersion matches", async () => {
    const repo = makeRepo([
      {
        mappingId: "m1",
        channelAccountId: "ca-swiggy",
        channel: "SWIGGY",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: true,
        version: 1,
      },
    ]);

    const result = await setChannelItemAvailability("m1", false, 1, repo);

    expect(result).toEqual({ ok: true, newVersion: 2 });
  });

  it("returns STALE_VERSION and the current version when expectedVersion is stale", async () => {
    const repo = makeRepo([
      {
        mappingId: "m1",
        channelAccountId: "ca-swiggy",
        channel: "SWIGGY",
        menuItemId: "item-1",
        name: "Paneer Tikka",
        onlineDisplayName: null,
        categoryName: "Starters",
        isAvailable: true,
        version: 3,
      },
    ]);

    const result = await setChannelItemAvailability("m1", false, 1, repo);

    expect(result).toEqual({ ok: false, reason: "STALE_VERSION", currentVersion: 3 });
  });

  it("returns NOT_FOUND for an unknown mapping id", async () => {
    const repo = makeRepo([]);

    const result = await setChannelItemAvailability("missing", true, 1, repo);

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
