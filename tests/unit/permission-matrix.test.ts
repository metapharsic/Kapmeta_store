/**
 * T-009: RBAC permission matrix unit tests.
 */
import { describe, it, expect } from "vitest";

type Role = "OUTLET_MANAGER" | "CASHIER" | "WAITER" | "KITCHEN_USER" | "AGGREGATOR_OPERATOR";
type Permission =
  | "order.create"
  | "order.read"
  | "finance.settle"
  | "finance.read"
  | "kot.read"
  | "kot.status.update"
  | "report.read"
  | "settings.manage"
  | "integration.manage"
  | "user.manage";

const ROLES: Record<Role, Permission[]> = {
  OUTLET_MANAGER: [
    "order.create",
    "order.read",
    "finance.settle",
    "finance.read",
    "kot.read",
    "kot.status.update",
    "report.read",
    "settings.manage",
    "integration.manage",
    "user.manage",
  ],
  CASHIER: ["order.read", "finance.settle", "finance.read"],
  WAITER: ["order.create", "order.read", "kot.read"],
  KITCHEN_USER: ["kot.read", "kot.status.update"],
  AGGREGATOR_OPERATOR: ["order.create", "order.read", "integration.manage"],
};

const has = (role: Role, perm: Permission) => ROLES[role].includes(perm);

describe("T-009: RBAC permission matrix", () => {
  describe("OUTLET_MANAGER", () => {
    it("can manage settings", () => expect(has("OUTLET_MANAGER", "settings.manage")).toBe(true));
    it("can read reports", () => expect(has("OUTLET_MANAGER", "report.read")).toBe(true));
    it("can manage users", () => expect(has("OUTLET_MANAGER", "user.manage")).toBe(true));
  });

  describe("KITCHEN_USER restricted to KOT", () => {
    it("cannot settle finance", () => expect(has("KITCHEN_USER", "finance.settle")).toBe(false));
    it("cannot create orders", () => expect(has("KITCHEN_USER", "order.create")).toBe(false));
    it("can update KOT status", () => expect(has("KITCHEN_USER", "kot.status.update")).toBe(true));
  });

  describe("WAITER restricted to order ops", () => {
    it("cannot settle finance", () => expect(has("WAITER", "finance.settle")).toBe(false));
    it("cannot manage settings", () => expect(has("WAITER", "settings.manage")).toBe(false));
    it("can create orders", () => expect(has("WAITER", "order.create")).toBe(true));
  });

  describe("CASHIER restricted to billing", () => {
    it("cannot create orders", () => expect(has("CASHIER", "order.create")).toBe(false));
    it("can settle finance", () => expect(has("CASHIER", "finance.settle")).toBe(true));
  });
});
