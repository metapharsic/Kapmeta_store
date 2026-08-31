import { Page } from '@playwright/test';

export interface MockUserConfig {
  email?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  outletId?: string;
  outletName?: string;
}

export const DEFAULT_OUTLET = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Hotel Kapila",
  code: "R327038",
  address: "Pragathi Nagar, Central Nizamabad, Telangana 503001",
  fssaiNumber: "13621014000123",
  upiVpa: "hotelkapila@icici",
  taxNumber: "36AAACH7412K1Z9",
};

export const ALL_PERMISSIONS = [
  "order.create",
  "order.read",
  "order.cancel",
  "kot.read",
  "kot.update",
  "payment.capture",
  "refund.issue",
  "tables.read",
  "tables.update",
  "menu.category.manage",
  "menu.item.manage",
  "menu.item.toggle86",
  "inventory.stock.adjust",
  "finance.zreport",
  "crm.customer.manage",
  "marketing.campaign.manage",
  "rbac.user.manage",
  "waiters.heartbeat",
];

export const MOCK_TABLES = [
  { id: "tbl-a1", tableNumber: "A1", capacity: 4, section: "AC", status: "VACANT", activeKotCount: 0, currentOrderId: null, totalMinor: 0 },
  { id: "tbl-a2", tableNumber: "A2", capacity: 4, section: "AC", status: "OCCUPIED", activeKotCount: 1, currentOrderId: "ord-101", totalMinor: 68000 },
  { id: "tbl-a3", tableNumber: "A3", capacity: 6, section: "AC", status: "BILLED", activeKotCount: 2, currentOrderId: "ord-102", totalMinor: 125000 },
  { id: "tbl-a4", tableNumber: "A4", capacity: 2, section: "AC", status: "VACANT", activeKotCount: 0, currentOrderId: null, totalMinor: 0 },
  { id: "tbl-b1", tableNumber: "B1", capacity: 4, section: "Non AC", status: "VACANT", activeKotCount: 0, currentOrderId: null, totalMinor: 0 },
  { id: "tbl-b2", tableNumber: "B2", capacity: 4, section: "Non AC", status: "OCCUPIED", activeKotCount: 1, currentOrderId: "ord-103", totalMinor: 45000 },
  { id: "tbl-t1", tableNumber: "T-01", capacity: 4, section: "Terrace Lounge", status: "VACANT", activeKotCount: 0, currentOrderId: null, totalMinor: 0 },
];

export const MOCK_CATEGORIES = [
  { id: "cat-1", name: "Biryani (Non-Veg)", sortOrder: 1, isAvailable: true },
  { id: "cat-2", name: "Biryani (Veg)", sortOrder: 2, isAvailable: true },
  { id: "cat-3", name: "Tandoori Starters (Non-Veg)", sortOrder: 3, isAvailable: true },
  { id: "cat-4", name: "Chinese Starters (Veg)", sortOrder: 4, isAvailable: true },
  { id: "cat-5", name: "Curries (Non-Veg)", sortOrder: 5, isAvailable: true },
  { id: "cat-6", name: "Roti & Breads", sortOrder: 6, isAvailable: true },
  { id: "cat-7", name: "MOCKTAILS", sortOrder: 7, isAvailable: true },
];

export const MOCK_MENU_ITEMS = [
  {
    id: "item-1",
    name: "Hotel Kapila Special Chicken Biryani (Boneless)",
    categoryId: "cat-1",
    categoryName: "Biryani (Non-Veg)",
    priceMinor: 34000,
    price: 34000,
    isVeg: false,
    taxRate: 5.0,
    isAvailable: true,
    station: "GRILL",
    description: "Nizamabad signature boneless fried chicken masala over dum basmati rice.",
    modifierGroups: [
      {
        id: "modg-1",
        name: "Portion Size",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: "opt-1", name: "Single Portion", priceDeltaMinor: 0 },
          { id: "opt-2", name: "Family Pack (+₹200)", priceDeltaMinor: 20000 },
        ],
      },
    ],
  },
  {
    id: "item-2",
    name: "Hyderabadi Paneer Dum Biryani",
    categoryId: "cat-2",
    categoryName: "Biryani (Veg)",
    priceMinor: 28000,
    price: 28000,
    isVeg: true,
    taxRate: 5.0,
    isAvailable: true,
    station: "PANTRY",
    description: "Fragrant saffron basmati rice layered with spiced paneer cubes.",
  },
  {
    id: "item-3",
    name: "Murgh Malai Tikka",
    categoryId: "cat-3",
    categoryName: "Tandoori Starters (Non-Veg)",
    priceMinor: 32000,
    price: 32000,
    isVeg: false,
    taxRate: 5.0,
    isAvailable: true,
    station: "GRILL",
    description: "Creamy cashew and cardamom marinated chicken morsels grilled in tandoor.",
  },
  {
    id: "item-4",
    name: "Kapila Electric Blue Lagoon",
    categoryId: "cat-7",
    categoryName: "MOCKTAILS",
    priceMinor: 16000,
    price: 16000,
    isVeg: true,
    taxRate: 5.0,
    isAvailable: true,
    station: "BAR",
    description: "Blue curacao, fresh lime, sprite and crushed ice.",
  },
];

export const MOCK_KOTS = [
  {
    id: "kot-001",
    kotNumber: "KOT-101-1",
    orderId: "ord-101",
    tableNumber: "A2",
    serverName: "Ramesh Captain",
    status: "PENDING",
    station: "GRILL",
    course: "STARTER",
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(), // 8 mins ago
    items: [
      { id: "koti-1", name: "Murgh Malai Tikka", quantity: 2, notes: "Well done, extra lemon", done: false },
    ],
  },
  {
    id: "kot-002",
    kotNumber: "KOT-101-2",
    orderId: "ord-101",
    tableNumber: "A2",
    serverName: "Ramesh Captain",
    status: "PREPARING",
    station: "BAR",
    course: "BEVERAGE",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    items: [
      { id: "koti-2", name: "Kapila Electric Blue Lagoon", quantity: 2, notes: "Less ice", done: true },
    ],
  },
  {
    id: "kot-003",
    kotNumber: "KOT-102-1",
    orderId: "ord-102",
    tableNumber: "A3",
    serverName: "Suresh",
    status: "DONE",
    station: "GRILL",
    course: "MAIN",
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    items: [
      { id: "koti-3", name: "Hotel Kapila Special Chicken Biryani", quantity: 3, notes: "Spicy", done: true },
    ],
  },
];

export const MOCK_ORDERS = [
  {
    id: "ord-101",
    orderNumber: "ORD-20260828-001",
    orderType: "DINE_IN",
    tableNumber: "A2",
    status: "RUNNING",
    subtotalMinor: 64000,
    taxMinor: 3200,
    discountMinor: 0,
    grandTotalMinor: 67200,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    customer: { name: "Rajesh Kumar", phone: "9876543210" },
    items: [
      { id: "oi-1", name: "Murgh Malai Tikka", quantity: 2, unitPriceMinor: 32000, totalMinor: 64000 },
    ],
  },
  {
    id: "ord-102",
    orderNumber: "ORD-20260828-002",
    orderType: "DINE_IN",
    tableNumber: "A3",
    status: "BILLED",
    subtotalMinor: 102000,
    taxMinor: 5100,
    discountMinor: 5000,
    grandTotalMinor: 102100,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    customer: { name: "Anand Verma", phone: "9123456789" },
    items: [
      { id: "oi-2", name: "Hotel Kapila Special Chicken Biryani", quantity: 3, unitPriceMinor: 34000, totalMinor: 102000 },
    ],
  },
  {
    id: "ord-100",
    orderNumber: "ORD-20260828-000",
    orderType: "DELIVERY",
    tableNumber: "Direct",
    status: "SETTLED",
    subtotalMinor: 34000,
    taxMinor: 1700,
    discountMinor: 0,
    grandTotalMinor: 35700,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    customer: { name: "Pooja Reddy", phone: "9988776655" },
    items: [
      { id: "oi-3", name: "Hotel Kapila Special Chicken Biryani", quantity: 1, unitPriceMinor: 34000, totalMinor: 34000 },
    ],
  },
];

export const MOCK_INVENTORY = [
  { id: "ing-1", name: "Aged Basmati Rice", unit: "kg", currentStock: 145.5, reorderLevel: 30.0, unitCostPaise: 11000, status: "HEALTHY" },
  { id: "ing-2", name: "Fresh Chicken (Boneless)", unit: "kg", currentStock: 8.2, reorderLevel: 15.0, unitCostPaise: 24000, status: "LOW_STOCK" },
  { id: "ing-3", name: "Fresh Paneer", unit: "kg", currentStock: 18.0, reorderLevel: 5.0, unitCostPaise: 32000, status: "HEALTHY" },
  { id: "ing-4", name: "Pure Desi Ghee", unit: "l", currentStock: 22.0, reorderLevel: 5.0, unitCostPaise: 65000, status: "HEALTHY" },
];

export const MOCK_CUSTOMERS = [
  { id: "cust-1", firstName: "Rahul", lastName: "Sharma", phone: "9876543210", email: "rahul@example.com", loyaltyPoints: 450, totalVisits: 12, totalSpendPaise: 340000 },
  { id: "cust-2", firstName: "Priya", lastName: "Nair", phone: "9123456789", email: "priya@example.com", loyaltyPoints: 120, totalVisits: 3, totalSpendPaise: 98000 },
];

export const MOCK_CHANNELS = [
  { id: "chan-swiggy", channel: "SWIGGY", name: "Swiggy Online", isConnected: true, totalOrdersToday: 24, syncStatus: "SYNCHRONIZED", lastSyncTime: new Date().toISOString() },
  { id: "chan-zomato", channel: "ZOMATO", name: "Zomato Gold", isConnected: true, totalOrdersToday: 31, syncStatus: "SYNCHRONIZED", lastSyncTime: new Date().toISOString() },
];

export const MOCK_FINANCE_ZREPORT = {
  businessDate: new Date().toISOString().split("T")[0],
  openingFloatPaise: 500000,
  grossSalesPaise: 1245000,
  discountTotalPaise: 45000,
  taxTotalPaise: 60000,
  netSalesPaise: 1260000,
  paymentBreakdown: {
    CASH: 450000,
    UPI: 610000,
    CARD: 150000,
    DUES: 50000,
  },
  totalOrders: 38,
  totalCovers: 94,
  averageOrderValuePaise: 33157,
};

/**
 * Sets up Playwright route interceptions to simulate full Kapmeta POS backend API
 */
export async function setupMockPosServer(page: Page, userConfig: MockUserConfig = {}) {
  const email = userConfig.email || "admin@hotelkapila.com";
  const name = userConfig.name || "Abdul Mannan";
  const role = userConfig.role || "SUPER_ADMIN";
  const permissions = userConfig.permissions || ALL_PERMISSIONS;
  const outletId = userConfig.outletId || DEFAULT_OUTLET.id;

  const mockToken = "header." + btoa(JSON.stringify({
    userId: "usr-admin-01",
    email,
    roles: [role],
    outletId,
    sessionId: "sess-test-01",
  })) + ".signature";

  // 1. Intercept /auth/login
  await page.route("**/auth/login", async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.password === "wrongpassword") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "INVALID_CREDENTIALS" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: mockToken,
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        user: {
          userId: "usr-admin-01",
          email: postData?.email || email,
          name,
          outletId: postData?.outletId || outletId,
          roles: [role],
          permissions,
        },
      }),
    });
  });

  // 2. Intercept /auth/me
  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "usr-admin-01",
        email,
        name,
        outletId,
        roles: [role],
        permissions,
        outlet: DEFAULT_OUTLET,
      }),
    });
  });

  // 3. Intercept /auth/verify-pin
  await page.route("**/auth/verify-pin", async (route) => {
    const body = route.request().postDataJSON();
    const valid = body?.pin === "1234" || body?.pin === "0000";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ valid }),
    });
  });

  // 4. Intercept /auth/outlets/mine
  await page.route("**/auth/outlets/mine", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        DEFAULT_OUTLET,
        { id: "22222222-2222-2222-2222-222222222222", name: "Hotel Kapila - Highway Express", code: "NZB-02" },
      ]),
    });
  });

  // 5. Intercept /auth/switch-outlet
  await page.route("**/auth/switch-outlet", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: mockToken,
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        user: {
          userId: "usr-admin-01",
          email,
          name,
          outletId: body?.outletId || outletId,
          roles: [role],
          permissions,
        },
      }),
    });
  });

  // 6. Intercept /auth/logout
  await page.route("**/auth/logout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  // 7. Intercept /tables
  await page.route("**/tables**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TABLES),
      });
    } else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const newTable = {
        id: `tbl-${Date.now()}`,
        tableNumber: body.tableNumber || "T-99",
        capacity: body.capacity || 4,
        section: body.section || "AC",
        status: "VACANT",
        activeKotCount: 0,
        currentOrderId: null,
        totalMinor: 0,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newTable),
      });
    } else {
      await route.fulfill({ status: 200, json: { ok: true } });
    }
  });

  // 8. Intercept /menu/items and /menu/categories
  await page.route("**/menu/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_MENU_ITEMS),
    });
  });

  await page.route("**/menu/categories**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CATEGORIES),
    });
  });

  // 9. Intercept /orders and /kot
  await page.route("**/orders**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ORDERS),
      });
    } else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const createdOrder = {
        id: `ord-${Date.now()}`,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        orderType: body?.orderType || "DINE_IN",
        tableNumber: body?.diningTableId || "A1",
        status: "RUNNING",
        subtotalMinor: 68000,
        taxMinor: 3400,
        discountMinor: 0,
        grandTotalMinor: 71400,
        createdAt: new Date().toISOString(),
        items: body?.lines || [],
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdOrder),
      });
    }
  });

  await page.route("**/kot**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_KOTS),
    });
  });

  await page.route("**/kitchen**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ kots: MOCK_KOTS }),
    });
  });

  // 10. Intercept /finance endpoints
  await page.route("**/finance/z-report**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FINANCE_ZREPORT),
    });
  });

  await page.route("**/finance/payments**", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        paymentId: `pay-${Date.now()}`,
        status: "CAPTURED",
        invoiceNumber: "INV-20260828-0042",
      }),
    });
  });

  await page.route("**/finance/dues**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "due-1", customerName: "Rajesh Kumar", phone: "9876543210", amountPaise: 50000, dueDate: "2026-09-05" },
      ]),
    });
  });

  // 11. Intercept /inventory
  await page.route("**/inventory**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_INVENTORY),
    });
  });

  // 12. Intercept /crm
  await page.route("**/crm/customers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CUSTOMERS),
    });
  });

  // 13. Intercept /waiters
  await page.route("**/waiters/heartbeat**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, timestamp: Date.now() }),
    });
  });

  await page.route("**/waiters/active**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "w-1", name: "Ramesh Captain", terminal: "cp4", activeTables: ["A1", "A2"] },
      ]),
    });
  });

  // 14. Intercept /integration/channels
  await page.route("**/integration/channels**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CHANNELS),
    });
  });

  // 15. Intercept /notifications
  await page.route("**/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "notif-1", title: "KOT Prepared", message: "Table A2 - Starter Ready", time: "2m ago", read: false },
      ]),
    });
  });
}

/**
 * Injects a pre-authenticated session directly into localStorage to test authenticated pages without manual login
 */
export async function injectSession(page: Page, userConfig: MockUserConfig = {}) {
  const email = userConfig.email || "admin@hotelkapila.com";
  const role = userConfig.role || "SUPER_ADMIN";
  const outletId = userConfig.outletId || DEFAULT_OUTLET.id;

  const mockToken = "header." + btoa(JSON.stringify({
    userId: "usr-admin-01",
    email,
    roles: [role],
    outletId,
    sessionId: "sess-test-01",
  })) + ".signature";

  await page.addInitScript(({ token, email, outletId }) => {
    const session = {
      accessToken: token,
      refreshToken: "mock-refresh-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      userId: "usr-admin-01",
      email,
      outletId,
      sessionId: "sess-test-01",
    };
    window.localStorage.setItem("kapmeta_pos_session", JSON.stringify(session));
  }, { token: mockToken, email, outletId });
}
