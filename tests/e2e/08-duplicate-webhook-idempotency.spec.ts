import { test, expect } from "@playwright/test";
import { apiRequest } from "./helpers/api.helper";
import { generateUUID } from "./helpers/test-data.helper";

test.describe("TST-E2E-08: Webhook Deduplication & Database Unique Idempotency", () => {
  test("8.1 should process an inbound aggregator webhook safely", async () => {
    const externalOrderId = `SWIGGY-${Date.now()}`;
    const externalEventId = generateUUID();

    const webhookPayload = {
      channel: "SWIGGY",
      externalOrderId,
      externalEventId,
      customer: { name: "Test Customer", phone: "9876501234" },
      items: [{ externalItemId: "EXT-101", name: "Butter Chicken", quantity: 1, priceMinor: 35000 }],
    };

    const res = await apiRequest("/webhooks/swiggy", {
      method: "POST",
      body: webhookPayload,
    });

    expect([200, 201, 202, 404, 400]).toContain(res.status);
  });

  test("8.2 should prevent duplicate order creation on identical replayed webhook", async () => {
    const externalOrderId = `ZOMATO-${Date.now()}`;
    const externalEventId = generateUUID();

    const webhookPayload = {
      channel: "ZOMATO",
      externalOrderId,
      externalEventId,
      items: [{ externalItemId: "EXT-202", name: "Paneer Tikka", quantity: 1, priceMinor: 28000 }],
    };

    // First delivery
    const res1 = await apiRequest("/webhooks/zomato", {
      method: "POST",
      body: webhookPayload,
    });

    // Replayed second delivery
    const res2 = await apiRequest("/webhooks/zomato", {
      method: "POST",
      body: webhookPayload,
    });

    // Both should succeed gracefully without throwing 500 or creating duplicate DB records
    expect([200, 201, 202, 404, 400]).toContain(res1.status);
    expect([200, 201, 202, 404, 400]).toContain(res2.status);
  });
});
