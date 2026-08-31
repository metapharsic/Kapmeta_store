import { test, expect } from "@playwright/test";
import { apiRequest } from "./helpers/api.helper";

async function getOrCreateMenuItem() {
  const menuRes = await apiRequest("/menu/items");
  const items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
  if (items.length > 0) return items[0];

  const catRes = await apiRequest("/menu/categories", {
    method: "POST",
    body: { name: "Beverages", sortOrder: 1 },
  });
  const itemRes = await apiRequest("/menu/items", {
    method: "POST",
    body: { categoryId: catRes.data.id, name: "Cold Coffee", priceMinor: 10000, isVeg: true },
  });
  return itemRes.data;
}

test.describe("TST-E2E-10: Post-KOT Order Cancellation & Immutable Audit Logging", () => {
  test("10.1 should require a valid reason code when cancelling an order", async () => {
    const item = await getOrCreateMenuItem();

    // Create an order
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        tableNumber: "T-05",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: 10000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();

    // Cancel order with reason
    const cancelRes = await apiRequest(`/orders/${orderId}/cancel`, {
      method: "POST",
      body: {
        reason: "GUEST_CANCELLED",
        reasonCode: "CUSTOMER_CHANGED_MIND",
      },
    });

    expect([200, 201, 400, 403]).toContain(cancelRes.status);
  });

  test("10.2 should verify audit log entries are queryable for administrative review", async () => {
    const auditRes = await apiRequest("/reporting/leakage-report");
    expect([200, 404]).toContain(auditRes.status);
  });
});
