/**
 * Order status state machine tests — validates legal/illegal transitions.
 * Based on WF-ORD-01 state diagram.
 */
import { describe, it, expect } from "vitest";

type OrderStatus = "DRAFT" | "PLACED" | "CONFIRMED" | "KOT_CREATED" | "IN_PREPARATION" | "READY" | "COMPLETED" | "CANCELLED";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PLACED", "CANCELLED"],
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["KOT_CREATED", "CANCELLED"],
  KOT_CREATED: ["IN_PREPARATION", "CANCELLED"],
  IN_PREPARATION: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const can = (from: OrderStatus, to: OrderStatus) => VALID_TRANSITIONS[from].includes(to);

describe("Order state machine — valid transitions", () => {
  it("DRAFT → PLACED", () => expect(can("DRAFT", "PLACED")).toBe(true));
  it("PLACED → CONFIRMED", () => expect(can("PLACED", "CONFIRMED")).toBe(true));
  it("CONFIRMED → KOT_CREATED", () => expect(can("CONFIRMED", "KOT_CREATED")).toBe(true));
  it("KOT_CREATED → IN_PREPARATION", () => expect(can("KOT_CREATED", "IN_PREPARATION")).toBe(true));
  it("IN_PREPARATION → READY", () => expect(can("IN_PREPARATION", "READY")).toBe(true));
  it("READY → COMPLETED", () => expect(can("READY", "COMPLETED")).toBe(true));
  it("all pre-COMPLETED statuses can → CANCELLED", () => {
    const cancellable: OrderStatus[] = ["DRAFT", "PLACED", "CONFIRMED", "KOT_CREATED", "IN_PREPARATION", "READY"];
    cancellable.forEach((s) => expect(can(s, "CANCELLED")).toBe(true));
  });
});

describe("Order state machine — invalid transitions", () => {
  it("COMPLETED → PLACED (no backwards)", () => expect(can("COMPLETED", "PLACED")).toBe(false));
  it("COMPLETED → CANCELLED (terminal)", () => expect(can("COMPLETED", "CANCELLED")).toBe(false));
  it("CANCELLED → anything (terminal)", () => {
    (["DRAFT", "PLACED", "CONFIRMED", "COMPLETED"] as OrderStatus[]).forEach((t) => {
      expect(can("CANCELLED", t)).toBe(false);
    });
  });
  it("DRAFT → COMPLETED (skipping steps)", () => expect(can("DRAFT", "COMPLETED")).toBe(false));
  it("READY → PLACED (backwards)", () => expect(can("READY", "PLACED")).toBe(false));
});
