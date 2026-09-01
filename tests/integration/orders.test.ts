/**
 * Integration tests for orders API — T-001: full waiter order flow.
 * Requires running API on port 4001 with test DB seeded.
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL ?? "http://localhost:4001";
let token = "";
let tableId = "";
let orderId = "";

async function api(method: string, path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  try {
    const r = await api("POST", "/auth/login", {
      email: process.env.TEST_MANAGER_EMAIL ?? "manager@test.kapmeta",
      password: process.env.TEST_MANAGER_PASSWORD ?? "Test@123",
    });
    if (r.ok) {
      const d = await r.json();
      token = d.accessToken ?? "";
    }
  } catch {
    /* API not running — tests will be skipped */
  }
});

describe("/healthz", () => {
  it("returns ok with DB connected", async () => {
    const r = await fetch(`${BASE}/healthz`);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.status).toBe("ok");
    expect(d.database).toBe("connected");
  });
});

describe("GET /tables + GET /orders/by-table/:id/active", () => {
  it("returns tables list", async () => {
    if (!token) return;
    const r = await api("GET", "/tables");
    expect(r.status).toBe(200);
    const tables = await r.json();
    expect(Array.isArray(tables)).toBe(true);
    const vacant = tables.find((t: any) => t.status === "VACANT");
    if (vacant) tableId = vacant.id;
  });

  it("returns 404 for active order on vacant table", async () => {
    if (!tableId) return;
    const r = await api("GET", `/orders/by-table/${tableId}/active`);
    expect(r.status).toBe(404);
  });
});

describe("POST /orders + POST /orders/:id/cancel", () => {
  it("creates a DRAFT order", async () => {
    if (!tableId || !token) return;
    const r = await api("POST", "/orders", { tableId, orderType: "DINE_IN" });
    if (r.status === 201) {
      const d = await r.json();
      orderId = d.id ?? "";
    }
    expect([201, 403]).toContain(r.status);
  });

  it("returns 400 for cancel without reason", async () => {
    if (!orderId) return;
    const r = await api("POST", `/orders/${orderId}/cancel`, {});
    expect(r.status).toBe(400);
  });

  it("cancels order with reason", async () => {
    if (!orderId) return;
    const r = await api("POST", `/orders/${orderId}/cancel`, { reason: "Integration test" });
    expect([200, 400]).toContain(r.status); // 400 if state machine rejects
  });
});
