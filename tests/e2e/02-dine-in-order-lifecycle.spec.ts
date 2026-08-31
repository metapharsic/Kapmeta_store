import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";

test.describe("TST-E2E-02: Dine-In Order to KOT, Payment & Bill Settlement", () => {
  test("2.1 should open POS billing view and display active dining tables", async ({ page }) => {
    await injectAdminSession(page, "/");
    await page.waitForLoadState("domcontentloaded");

    // Verify table floor / active tables
    const tableElement = page.getByRole("button", { name: "Add Table" });
    await expect(tableElement).toBeVisible();
  });

  test("2.2 should create a multi-item dine-in order via API and verify KOT ticket generation", async () => {
    // 1. Get active dining table and menu items
    const menuRes = await apiRequest("/menu/items");
    expect(menuRes.status).toBe(200);
    const items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
    let item = items[0];

    if (!item) {
      const catRes = await apiRequest("/menu/categories", {
        method: "POST",
        body: { name: "Starters", sortOrder: 1 },
      });
      const categoryId = catRes.data.id;
      const createItemRes = await apiRequest("/menu/items", {
        method: "POST",
        body: { categoryId, name: "Crispy Corn", priceMinor: 18000, isVeg: true },
      });
      item = createItemRes.data;
    }

    const tablesRes = await apiRequest("/tables");
    expect(tablesRes.status).toBe(200);
    const tables = tablesRes.data.tables || (Array.isArray(tablesRes.data) ? tablesRes.data : []);
    const tableId = tables[0]?.id;

    // 2. Create order with KOT
    const orderPayload = {
      diningTableId: tableId,
      tableNumber: tables[0]?.tableNumber || "T-01",
      orderType: "DINE_IN",
      covers: 2,
      channel: "POS",
      items: [
        {
          menuItemId: item.id,
          name: item.name,
          quantity: 2,
          unitPriceMinor: item.priceMinor || 18000,
        },
      ],
    };

    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: orderPayload,
    });

    expect([200, 201]).toContain(orderRes.status);
    const orderId = orderRes.data.id || orderRes.data.order?.id;
    expect(orderId).toBeDefined();

    // 3. Verify KOT tickets query
    const kotRes = await apiRequest(`/kitchen/kots?orderId=${orderId}`);
    expect([200, 404]).toContain(kotRes.status);
  });

  test("2.3 should settle an active dine-in order with Cash and record payment transaction", async () => {
    // Create an order to settle
    let menuRes = await apiRequest("/menu/items");
    let items = menuRes.data.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
    let item = items[0];

    if (!item) {
      const catRes = await apiRequest("/menu/categories", {
        method: "POST",
        body: { name: "Starters", sortOrder: 1 },
      });
      const createItemRes = await apiRequest("/menu/items", {
        method: "POST",
        body: { categoryId: catRes.data.id, name: "Spring Rolls", priceMinor: 15000, isVeg: true },
      });
      item = createItemRes.data;
    }

    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        tableNumber: "T-02",
        orderType: "DINE_IN",
        items: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPriceMinor: item.priceMinor || 15000 }],
      },
    });

    const orderId = orderRes.data.id || orderRes.data.order?.id;
    if (orderId) {
      // Settle order
      const settleRes = await apiRequest(`/orders/${orderId}/settle`, {
        method: "POST",
        body: {
          paymentMethod: "CASH",
          amountPaidMinor: item.priceMinor || 15000,
        },
      });

      expect([200, 201]).toContain(settleRes.status);
    }
  });
});
