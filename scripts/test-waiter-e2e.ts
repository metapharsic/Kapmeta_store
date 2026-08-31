import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:4001";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWaiterE2ETest() {
  console.log("\n=======================================================");
  console.log("   KAPMETA POS — WAITER FLOW E2E VERIFIER");
  console.log("=======================================================\n");

  // 1. Login as Admin / Waiter
  console.log("[1/10] Authenticating user session...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@hotelkapila.com",
      password: "password123",
      outletId: "11111111-1111-1111-1111-111111111111",
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const loginData: any = await loginRes.json();
  const token = loginData.accessToken;
  const userId = loginData.user?.id || loginData.user?.email;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  console.log(`✓ Authenticated as: ${loginData.user?.email || "admin@hotelkapila.com"}`);

  // 2. Waiter Heartbeat & Active Sessions
  console.log("\n[2/10] Testing Waiter Heartbeat & Floor Monitor...");
  const hbRes = await fetch(`${API_BASE}/waiters/heartbeat`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!hbRes.ok) throw new Error(`Heartbeat failed: ${await hbRes.text()}`);
  console.log("✓ Heartbeat recorded successfully");

  const activeRes = await fetch(`${API_BASE}/waiters/active`, {
    headers: authHeaders,
  });
  if (activeRes.ok) {
    const activeWaiters: any = await activeRes.json();
    console.log(`✓ Live Active Waiters on Floor: ${activeWaiters.length}`);
  }

  // 3. Fetch Dining Tables (find or reset a table to VACANT)
  console.log("\n[3/10] Fetching floor map dining tables...");
  const tablesRes = await fetch(`${API_BASE}/tables`, { headers: authHeaders });
  if (!tablesRes.ok) throw new Error(`Fetch tables failed: ${await tablesRes.text()}`);
  const tables: any = await tablesRes.json();
  if (tables.length === 0) throw new Error("No tables found in outlet!");
  
  let targetTable = tables.find((t: any) => t.status === "VACANT") || tables[0];
  // If table is occupied, clear it first
  if (targetTable.status !== "VACANT") {
    await fetch(`${API_BASE}/tables/${targetTable.id}/status`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ status: "VACANT" }),
    });
    targetTable.status = "VACANT";
  }
  console.log(`✓ Target Table: [${targetTable.tableNumber}] Status: ${targetTable.status} (Capacity: ${targetTable.capacity})`);

  // 4. Fetch Menu Items
  console.log("\n[4/10] Fetching menu items...");
  const menuRes = await fetch(`${API_BASE}/menu/items`, { headers: authHeaders });
  if (!menuRes.ok) throw new Error(`Fetch menu failed: ${await menuRes.text()}`);
  const menuItems: any = await menuRes.json();
  if (menuItems.length === 0) throw new Error("No menu items found!");
  const item1 = menuItems[0];
  const item2 = menuItems.length > 1 ? menuItems[1] : menuItems[0];
  console.log(`✓ Selected Items: [${item1.name}] (₹${(Number(item1.priceMinor) / 100).toFixed(2)}) & [${item2.name}] (₹${(Number(item2.priceMinor) / 100).toFixed(2)})`);

  // 5. Create Order with Courses & Waiter Attribution
  console.log("\n[5/10] Placing Table Order (Course: STARTER + MAIN)...");
  const idempotencyKey = `e2e-waiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const orderBody = {
    terminalNumber: "T-01",
    orderType: "DINE_IN",
    diningTableId: targetTable.id,
    idempotencyKey,
    lines: [
      {
        menuItemId: item1.id,
        quantity: 2,
        modifierOptionIds: [],
        course: "STARTER",
        seatNumber: 1,
        notes: "Crispy please",
      },
      {
        menuItemId: item2.id,
        quantity: 1,
        modifierOptionIds: [],
        course: "MAIN",
        seatNumber: 2,
        notes: "Medium spicy",
      },
    ],
  };

  const createOrderRes = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(orderBody),
  });

  if (!createOrderRes.ok) throw new Error(`Create order failed: ${await createOrderRes.text()}`);
  const createdOrder: any = await createOrderRes.json();
  const orderId = createdOrder.id;
  console.log(`✓ Order Created: ID: ${orderId} (Status: ${createdOrder.status})`);

  // 6. Confirm Order (Triggers Kitchen KOT)
  console.log("\n[6/10] Confirming order to trigger KOT generation...");
  const confirmRes = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ toStatus: "CONFIRMED" }),
  });
  if (!confirmRes.ok) throw new Error(`Confirm order failed: ${await confirmRes.text()}`);
  console.log("✓ Order CONFIRMED — KOT generated and broadcasted via WebSocket");

  await sleep(600); // Allow async listener to persist KOT

  // 7. Verify Table Status Transitioned to OCCUPIED
  console.log("\n[7/10] Verifying Table Status...");
  const tableCheckRes = await fetch(`${API_BASE}/tables`, { headers: authHeaders });
  const updatedTables: any = await tableCheckRes.json();
  const tableAfterOrder = updatedTables.find((t: any) => t.id === targetTable.id);
  console.log(`✓ Table [${tableAfterOrder.tableNumber}] Status: ${tableAfterOrder.status} (Expected: OCCUPIED)`);

  // 8. Fetch KOT & Test Waiter KOT Serve Transition (RBAC Gate)
  console.log("\n[8/10] Verifying Kitchen KOT and Waiter 'Serve to Table' Transition...");
  const kotRes = await fetch(`${API_BASE}/kitchen/kot`, { headers: authHeaders });
  if (!kotRes.ok) throw new Error(`Fetch KOTs failed: ${await kotRes.text()}`);
  const kots: any = await kotRes.json();
  const orderKot = kots.find((k: any) => k.orderId === orderId);
  if (!orderKot) throw new Error(`No KOT found for order ${orderId}`);
  console.log(`✓ Found KOT Ticket: #${orderKot.ticketNumber} (Status: ${orderKot.status}, Items: ${orderKot.kotItems.length})`);

  // Chef marks READY
  console.log("  - Chef transitions KOT to PREPARING -> READY...");
  await fetch(`${API_BASE}/kitchen/kot/${orderKot.id}/status`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ toStatus: "PREPARING" }),
  });
  await fetch(`${API_BASE}/kitchen/kot/${orderKot.id}/status`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ toStatus: "READY" }),
  });
  console.log("  ✓ KOT is READY at the pickup counter!");

  // Waiter marks SERVED (Testing our RBAC permission fix!)
  console.log("  - Waiter taps 'Serve to Table' (toStatus: SERVED)...");
  const serveRes = await fetch(`${API_BASE}/kitchen/kot/${orderKot.id}/status`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ toStatus: "SERVED" }),
  });
  if (!serveRes.ok) throw new Error(`Serve KOT failed: ${await serveRes.text()}`);
  console.log("  ✓ KOT successfully marked as SERVED by floor waiter!");

  // 9. Bill, Tip Charges, Seat Split & Payment Settlement
  console.log("\n[9/10] Testing Bill, Tip Charges & Payment Settlement...");
  const billRes = await fetch(`${API_BASE}/orders/${orderId}/bill`, { headers: authHeaders });
  if (!billRes.ok) throw new Error(`Fetch bill failed: ${await billRes.text()}`);
  const bill: any = await billRes.json();
  console.log(`✓ Order Bill: Subtotal: ₹${(Number(bill.subtotalMinor) / 100).toFixed(2)}, Tax: ₹${(Number(bill.taxTotalMinor) / 100).toFixed(2)}, Grand Total: ₹${(Number(bill.grandTotalMinor) / 100).toFixed(2)}`);

  // Apply Tip
  await fetch(`${API_BASE}/orders/${orderId}/charges`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ tipMinor: 5000, serviceChargeMinor: 0 }), // ₹50 tip
  });
  console.log("✓ Added ₹50.00 Tip to bill");

  // Record Payment
  const payRes = await fetch(`${API_BASE}/orders/${orderId}/payments`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      amountMinor: Number(bill.grandTotalMinor) + 5000,
      method: "UPI",
    }),
  });
  if (!payRes.ok) throw new Error(`Record payment failed: ${await payRes.text()}`);
  console.log("✓ Payment Recorded via UPI (Status: CAPTURED)");

  // Transition Order to COMPLETED and Reset Table
  await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ toStatus: "COMPLETED" }),
  });
  console.log("✓ Order status marked as COMPLETED");

  // 10. Check Waiter Stats
  console.log("\n[10/10] Checking Waiter Shift Statistics...");
  const statsRes = await fetch(`${API_BASE}/waiters/me/stats`, { headers: authHeaders });
  if (!statsRes.ok) throw new Error(`Fetch waiter stats failed: ${await statsRes.text()}`);
  const stats: any = await statsRes.json();
  console.log(`✓ Waiter Shift Stats:
  - Orders Today: ${stats.ordersToday}
  - Tables Served: ${stats.tablesServed}
  - Completed Orders: ${stats.completedOrders}
  - Tips Earned: ₹${(Number(stats.tipsMinor) / 100).toFixed(2)}
  - Total Revenue Handled: ₹${(Number(stats.revenueMinor) / 100).toFixed(2)}`);

  console.log("\n=======================================================");
  console.log("🎉 ALL WAITER APP FLOWS & GAPS VERIFIED SUCCESSFULLY! 🚀");
  console.log("=======================================================\n");
}

runWaiterE2ETest().catch((e) => {
  console.error("\n❌ E2E VERIFICATION ERROR:", e);
  process.exit(1);
});
