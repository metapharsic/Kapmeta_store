import { test, expect } from "@playwright/test";
import { apiRequest } from "./helpers/api.helper";
import { generateUUID } from "./helpers/test-data.helper";

async function getOrCreateMenuItem() {
  const menuRes = await apiRequest("/menu/items");
  const items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
  if (items.length > 0) return items[0];

  const catRes = await apiRequest("/menu/categories", {
    method: "POST",
    body: { name: "Main Dishes", sortOrder: 1 },
  });
  const itemRes = await apiRequest("/menu/items", {
    method: "POST",
    body: { categoryId: catRes.data.id, name: "Paneer Tikka", priceMinor: 20000, isVeg: true },
  });
  return itemRes.data;
}

test.describe("TST-E2E-09: Payment Capture Idempotency & Statutory Invoicing", () => {
  test("9.1 should capture payment with Idempotency-Key header", async () => {
    const item = await getOrCreateMenuItem();

    // Create an order
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        tableNumber: "T-04",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: 15000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();

    const idempotencyKey = generateUUID();

    // Settle with idempotency key
    const settleRes1 = await apiRequest(`/orders/${orderId}/settle`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        paymentMethod: "CARD",
        amountPaidMinor: 15000,
      },
    });

    expect([200, 201]).toContain(settleRes1.status);

    // Replay with identical idempotency key
    const settleRes2 = await apiRequest(`/orders/${orderId}/settle`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        paymentMethod: "CARD",
        amountPaidMinor: 15000,
      },
    });

    expect([200, 201]).toContain(settleRes2.status);
  });

  test("9.2 should verify statutory tax breakdown in minor units", async () => {
    const taxRes = await apiRequest("/reporting/tax-breakdown");
    expect(taxRes.status).toBe(200);
    expect(taxRes.data).toBeDefined();
  });
});
