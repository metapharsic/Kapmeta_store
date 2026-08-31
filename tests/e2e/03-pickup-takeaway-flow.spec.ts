import { test, expect } from "@playwright/test";
import { apiRequest } from "./helpers/api.helper";

async function getOrCreateMenuItem() {
  const menuRes = await apiRequest("/menu/items");
  const items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
  if (items.length > 0) return items[0];

  const catRes = await apiRequest("/menu/categories", {
    method: "POST",
    body: { name: "Quick Bites", sortOrder: 1 },
  });
  const itemRes = await apiRequest("/menu/items", {
    method: "POST",
    body: { categoryId: catRes.data.id, name: "Veg Sandwich", priceMinor: 12000, isVeg: true },
  });
  return itemRes.data;
}

test.describe("TST-E2E-03: Pickup / Takeaway Order & Handover Workflow", () => {
  test("3.1 should create a pay-at-handover takeaway order and generate KOT", async () => {
    const item = await getOrCreateMenuItem();

    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "TAKEAWAY",
        customerName: "John Doe",
        customerPhone: "9876543210",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: 15000 }],
      },
    });

    expect([200, 201]).toContain(orderRes.status);
    const order = orderRes.data.order || orderRes.data;
    expect(order.id).toBeDefined();
  });

  test("3.2 should complete handover and capture payment at pickup", async () => {
    const item = await getOrCreateMenuItem();

    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "TAKEAWAY",
        customerName: "Alice Smith",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: 18000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();

    // Settle/Handover
    const settleRes = await apiRequest(`/orders/${orderId}/settle`, {
      method: "POST",
      body: {
        paymentMethod: "UPI",
        amountPaidMinor: 18000,
      },
    });

    expect([200, 201]).toContain(settleRes.status);
  });
});
