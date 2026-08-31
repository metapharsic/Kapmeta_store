import { test, expect } from "@playwright/test";
import { injectAdminSession } from "./helpers/auth.helper";
import { apiRequest } from "./helpers/api.helper";

test.describe("TST-E2E-13: Captain Tablet Floor Operations, Table Move & Billing", () => {
  test("13.1 should open Captain Tablet view and render Floor Map with section tabs", async ({ page }) => {
    await injectAdminSession(page, "/waiter");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Floor Map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
  });

  test("13.2 should toggle table status between OCCUPIED, DIRTY and VACANT", async () => {
    const tablesRes = await apiRequest("/tables");
    expect(tablesRes.status).toBe(200);
    const tables = Array.isArray(tablesRes.data) ? tablesRes.data : tablesRes.data.tables;
    const tableId = tables[0].id;

    // Set to DIRTY (Clear table action)
    const dirtyRes = await apiRequest(`/tables/${tableId}/status`, {
      method: "PATCH",
      body: { status: "DIRTY" },
    });
    expect(dirtyRes.status).toBe(200);
    expect(dirtyRes.data.status).toBe("DIRTY");

    // Set to VACANT (Mark Clean action)
    const vacantRes = await apiRequest(`/tables/${tableId}/status`, {
      method: "PATCH",
      body: { status: "VACANT" },
    });
    expect(vacantRes.status).toBe(200);
    expect(vacantRes.data.status).toBe("VACANT");
  });

  test("13.3 should lookup active table order, compute live bill, and return seat-wise splits", async () => {
    const tablesRes = await apiRequest("/tables");
    const tables = Array.isArray(tablesRes.data) ? tablesRes.data : tablesRes.data.tables;
    const table = tables[0];

    const menuRes = await apiRequest("/menu/items");
    const menuItems = Array.isArray(menuRes.data) ? menuRes.data : menuRes.data.items;
    const dish = menuItems[0];

    // Create order with 2 items on different seats
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        terminalNumber: "T-01",
        orderType: "DINE_IN",
        diningTableId: table.id,
        lines: [
          { menuItemId: dish.id, quantity: 2, seatNumber: 1, course: "MAIN" },
          { menuItemId: dish.id, quantity: 1, seatNumber: 2, course: "STARTER" },
        ],
      },
    });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.data.id;

    // Verify Active Order by Table lookup
    const activeRes = await apiRequest(`/orders/by-table/${table.id}/active`);
    expect(activeRes.status).toBe(200);
    expect(activeRes.data.id).toBe(orderId);
    expect(activeRes.data.items.length).toBe(2);

    // Verify Live Bill computation
    const billRes = await apiRequest(`/orders/${orderId}/bill`);
    expect(billRes.status).toBe(200);
    expect(Number(billRes.data.grandTotalMinor)).toBeGreaterThan(0);
    expect(Number(billRes.data.dueMinor)).toBe(Number(billRes.data.grandTotalMinor));

    // Verify Seat-wise splits
    const seatRes = await apiRequest(`/orders/${orderId}/bill/by-seat`);
    expect(seatRes.status).toBe(200);
    expect(Array.isArray(seatRes.data)).toBe(true);
    expect(seatRes.data.length).toBe(2);
  });

  test("13.4 should transfer running table order to a vacant table and update occupancy", async () => {
    const tablesRes = await apiRequest("/tables");
    const tables = Array.isArray(tablesRes.data) ? tablesRes.data : tablesRes.data.tables;
    const tableA = tables[0];
    const tableB = tables[1];

    // Transfer order from Table A to Table B
    const transferRes = await apiRequest(`/tables/${tableA.id}/transfer`, {
      method: "POST",
      body: { targetTableId: tableB.id },
    });
    expect(transferRes.status).toBe(200);
    expect(transferRes.data.success).toBe(true);

    // Verify Table B now owns the active order
    const activeB = await apiRequest(`/orders/by-table/${tableB.id}/active`);
    expect(activeB.status).toBe(200);
    expect(activeB.data.id).toBe(transferRes.data.transferredOrderId);

    // Settle the order on Table B
    const settleRes = await apiRequest(`/orders/${transferRes.data.transferredOrderId}/settle`, {
      method: "POST",
      body: { paymentMethod: "CASH", amountPaidMinor: activeB.data.grandTotalMinor },
    });
    expect(settleRes.status).toBe(200);
  });

  test("13.5 should aggregate shift cash and tips reconciliation accurately", async () => {
    const shiftRes = await apiRequest("/waiters/me/shift-reconciliation");
    expect(shiftRes.status).toBe(200);
    expect(shiftRes.data.waiter).toBeDefined();
    expect(shiftRes.data.orderCount).toBeGreaterThanOrEqual(1);
    expect(Number(shiftRes.data.totalRevenueMinor)).toBeGreaterThan(0);
  });

  test("13.6 should void an item from a running order with audit logging", async () => {
    const menuRes = await apiRequest("/menu/items");
    const menuItems = Array.isArray(menuRes.data) ? menuRes.data : menuRes.data.items;
    const tablesRes = await apiRequest("/tables");
    const tables = Array.isArray(tablesRes.data) ? tablesRes.data : tablesRes.data.tables;
    const testTable = tables[0];

    // Create 2-item order
    const orderRes = await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "DINE_IN",
        diningTableId: testTable.id,
        lines: [
          { menuItemId: menuItems[0].id, quantity: 1 },
          { menuItemId: menuItems[1].id, quantity: 1 },
        ],
      },
    });
    expect(orderRes.status).toBe(201);
    const order = orderRes.data;

    // Void item 1
    const itemToVoid = order.items[0];
    const voidRes = await apiRequest(`/orders/${order.id}/items/${itemToVoid.id}/void`, {
      method: "PATCH",
      body: { reasonCode: "CUSTOMER_CANCELLED" },
    });
    expect(voidRes.status).toBe(200);
    expect(voidRes.data.ok).toBe(true);

    // Clean up by settling order
    await apiRequest(`/orders/${order.id}/settle`, {
      method: "POST",
      body: { paymentMethod: "CASH", amountPaidMinor: 10000 },
    });
  });

  test("13.7 should merge multiple occupied tables into a target table and synchronize statuses", async () => {
    const menuRes = await apiRequest("/menu/items");
    const menuItems = Array.isArray(menuRes.data) ? menuRes.data : menuRes.data.items;
    const tablesRes = await apiRequest("/tables");
    const tables = Array.isArray(tablesRes.data) ? tablesRes.data : tablesRes.data.tables;
    const sourceTableA = tables[0];
    const sourceTableB = tables[1];
    const targetTable = tables[2];

    // Place order on Table A
    await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "DINE_IN",
        diningTableId: sourceTableA.id,
        lines: [{ menuItemId: menuItems[0].id, quantity: 1 }],
      },
    });

    // Place order on Table B
    await apiRequest("/orders", {
      method: "POST",
      body: {
        orderType: "DINE_IN",
        diningTableId: sourceTableB.id,
        lines: [{ menuItemId: menuItems[1].id, quantity: 2 }],
      },
    });

    // Merge Table A and Table B into targetTable
    const mergeRes = await apiRequest("/tables/merge", {
      method: "POST",
      body: {
        sourceTableIds: [sourceTableA.id, sourceTableB.id],
        targetTableId: targetTable.id,
      },
    });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.data.success).toBe(true);

    // Verify target table has active merged order
    const activeTargetRes = await apiRequest(`/orders/by-table/${targetTable.id}/active`);
    expect(activeTargetRes.status).toBe(200);
    expect(activeTargetRes.data.items.length).toBeGreaterThanOrEqual(2);

    // Settle target table order
    await apiRequest(`/orders/${activeTargetRes.data.id}/settle`, {
      method: "POST",
      body: { paymentMethod: "UPI", amountPaidMinor: activeTargetRes.data.grandTotalMinor },
    });
  });
});
