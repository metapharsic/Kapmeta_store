/**
 * T-010: Rate limiting integration tests.
 * Requires running API on port 4001.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_API_URL ?? "http://localhost:4001";

describe("T-010: PIN login rate limiting", () => {
  it("11th attempt in rapid succession returns 429", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const r = await fetch(`${BASE}/auth/pin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: "nonexistent", pin: "0000" }),
      });
      lastStatus = r.status;
      if (r.status === 429) break;
    }
    expect(lastStatus).toBe(429);
  }, 30_000);

  it("/healthz is never rate limited", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${BASE}/healthz`);
      expect(r.status).toBe(200);
    }
  });
});
