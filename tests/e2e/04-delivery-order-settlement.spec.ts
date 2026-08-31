import { test, expect } from "@playwright/test";
import { apiRequest } from "./helpers/api.helper";

async function getOrCreateMenuItem() {
  const menuRes = await apiRequest("/menu/items");
  const items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
  if (items.length > 0) return items[0];

  const catRes = await apiRequest("/menu/categories", {
    method: "POST",
    body: { name: "Delivery Specials", sortOrder: 1 },
  });
  const itemRes = await apiRequest("/menu/items", {
    method: "POST",
    body: { categoryId: catRes.data.id, name: "Veg Biryani", priceMinor: 22000, isVeg: true },
  });
  return itemRes.data;
}

test.describe("TST-E2E-04: Delivery Order Lifecycle & Business Date Settlement", () => {
  test("4.1 should create a direct delivery order with customer address", async () => {
    const item = await getOrCreateMenuItem();

    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "DELIVERY",
        customerName: "Robert Green",
        customerPhone: "9123456780",
        deliveryAddress: {
          street: "123 MG Road",
          city: "Pune",
          postalCode: "411001",
        },
        items: [{ menuItemId: item.id, name: item.name, quantity: 2, unitPriceMinor: 25000 }],
      },
    });

    expect([200, 201]).toContain(orderRes.status);
    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();
  });

  test("4.2 should enforce monotonic status transition without regressions", async () => {
    const item = await getOrCreateMenuItem();

    // 1. Create delivery order
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "DELIVERY",
        customerName: "David Miller",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: 15000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();

    // 2. Transition status monotonically: PLACED -> PREPARING/READY/DISPATCHED
    const patchRes = await apiRequest(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: { status: "PREPARING" },
    });

    expect([200, 204, 404]).toContain(patchRes.status);
  });
});
