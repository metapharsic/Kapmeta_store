import { describe, it, expect } from "vitest";
import { createKot, transitionKot } from "./kot-service";
import type { KotRepository } from "./kot-service";
import { isKotTransitionLegal } from "@kapmeta/shared-types/kitchen";
import type { KotStatus, CreateKotInput, KotLineInput } from "@kapmeta/shared-types/kitchen";

describe("isKotTransitionLegal", () => {
  it("QUEUED -> PREPARING is legal", () => {
    expect(isKotTransitionLegal("QUEUED", "PREPARING")).toBe(true);
  });

  it("PREPARING -> READY is legal", () => {
    expect(isKotTransitionLegal("PREPARING", "READY")).toBe(true);
  });

  it("READY -> SERVED is legal", () => {
    expect(isKotTransitionLegal("READY", "SERVED")).toBe(true);
  });

  it("QUEUED -> READY is illegal (no skipping)", () => {
    expect(isKotTransitionLegal("QUEUED", "READY")).toBe(false);
  });

  it("SERVED -> anything is illegal (terminal)", () => {
    expect(isKotTransitionLegal("SERVED", "QUEUED")).toBe(false);
    expect(isKotTransitionLegal("SERVED", "PREPARING")).toBe(false);
    expect(isKotTransitionLegal("SERVED", "READY")).toBe(false);
    expect(isKotTransitionLegal("SERVED", "SERVED")).toBe(false);
  });

  it("a status transitioning to itself is illegal", () => {
    expect(isKotTransitionLegal("READY", "READY")).toBe(false);
    expect(isKotTransitionLegal("QUEUED", "QUEUED")).toBe(false);
    expect(isKotTransitionLegal("PREPARING", "PREPARING")).toBe(false);
  });
});

function makeMockRepo(): KotRepository & { tickets: Map<string, KotStatus> } {
  const tickets = new Map<string, KotStatus>();
  return {
    tickets,
    async getMenuStationIds(menuItemIds: string[]) {
      const map = new Map<string, string | null>();
      for (const id of menuItemIds) map.set(id, "mock-station");
      return map;
    },
    async getStationPrinterIps(stationIds: string[]) {
      const map = new Map<string, string | null>();
      for (const id of stationIds) map.set(id, null);
      return map;
    },
    async createTickets(outletId, orderId, groups) {
      const results: { id: string; status: KotStatus }[] = [];
      for (const group of groups) {
        const id = crypto.randomUUID();
        tickets.set(id, "QUEUED");
        results.push({ id, status: "QUEUED" });
      }
      return results;
    },
    async getStatus(kotTicketId: string) {
      return tickets.get(kotTicketId) ?? null;
    },
    async recordTransition(kotTicketId: string, newStatus: KotStatus, userId: string, reasonCode?: string) {
      if (tickets.has(kotTicketId)) {
        tickets.set(kotTicketId, newStatus);
      }
    },
    async recallTicket(kotTicketId: string) {
      if (!tickets.has(kotTicketId)) return { ok: false as const, reason: "NOT_FOUND" as const };
      tickets.set(kotTicketId, "READY");
      return { ok: true as const };
    },
  };
}

describe("createKot", () => {
  it("calls repo with the right outletId/orderId/lines and returns the created ticket", async () => {
    const repo = makeMockRepo();
    const lines: KotLineInput[] = [{ menuItemId: "a", quantity: 2 }];
    const input: CreateKotInput = {
      outletId: "outlet-1",
      orderId: "order-1",
      lines,
    };

    const results = await createKot(input, repo);

    expect(results.length).toBe(1);
    expect(results[0].status).toBe("QUEUED");
  });
});

describe("transitionKot", () => {
  it("succeeds on a legal transition", async () => {
    const repo = makeMockRepo();
    const created = await createKot({ outletId: "outlet-1", orderId: "order-1", lines: [{ menuItemId: "a", quantity: 1 }] }, repo);

    const result = await transitionKot(created[0].id, "PREPARING", repo, "user-1");

    expect(result).toEqual({ ok: true, newStatus: "PREPARING" });
  });

  it("returns ILLEGAL_TRANSITION for an illegal transition", async () => {
    const repo = makeMockRepo();
    const created = await createKot({ outletId: "outlet-1", orderId: "order-1", lines: [{ menuItemId: "a", quantity: 1 }] }, repo);

    const result = await transitionKot(created[0].id, "SERVED", repo, "user-1");

    expect(result).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION", from: "QUEUED", to: "SERVED" });
  });

  it("returns NOT_FOUND for a nonexistent kotTicketId", async () => {
    const repo = makeMockRepo();

    const result = await transitionKot("nonexistent-id", "PREPARING", repo, "user-1");

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND", to: "PREPARING" });
  });
});
