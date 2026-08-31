/**
 * Test User Persona Profiles and Role Definitions
 */
export interface TestUser {
  id: string;
  name: string;
  email: string;
  pin: string;
  role: "SUPER_ADMIN" | "OUTLET_MANAGER" | "CASHIER" | "CAPTAIN" | "KITCHEN" | "INVENTORY_MANAGER" | "AUDITOR";
  outletId: string;
  permissions: string[];
}

export const TEST_USERS: Record<string, TestUser> = {
  admin: {
    id: "usr_admin_01",
    name: "Admin User",
    email: process.env.TEST_ADMIN_EMAIL || "admin@kapmeta.com",
    pin: process.env.TEST_ADMIN_PIN || "1234",
    role: "SUPER_ADMIN",
    outletId: "outlet_test_01",
    permissions: ["*"],
  },
  manager: {
    id: "usr_mgr_01",
    name: "Outlet Manager",
    email: process.env.TEST_MGR_EMAIL || "manager@kapmeta.com",
    pin: process.env.TEST_MGR_PIN || "2222",
    role: "OUTLET_MANAGER",
    outletId: "outlet_test_01",
    permissions: ["order.*", "menu.*", "table.*", "report.*", "inventory.*"],
  },
  cashier: {
    id: "usr_cashier_01",
    name: "Cashier Operator",
    email: process.env.TEST_CASHIER_EMAIL || "cashier@kapmeta.com",
    pin: process.env.TEST_CASHIER_PIN || "1111",
    role: "CASHIER",
    outletId: "outlet_test_01",
    permissions: ["order.create", "order.bill", "payment.capture"],
  },
  captain: {
    id: "usr_capt_01",
    name: "Captain Waiter",
    email: process.env.TEST_CAPTAIN_EMAIL || "captain@kapmeta.com",
    pin: process.env.TEST_CAPTAIN_PIN || "3333",
    role: "CAPTAIN",
    outletId: "outlet_test_01",
    permissions: ["order.create", "order.view", "table.view"],
  },
  kitchen: {
    id: "usr_kds_01",
    name: "Chef KDS User",
    email: process.env.TEST_KDS_EMAIL || "chef@kapmeta.com",
    pin: process.env.TEST_KDS_PIN || "4444",
    role: "KITCHEN",
    outletId: "outlet_test_01",
    permissions: ["kitchen.view", "kitchen.update"],
  },
};
