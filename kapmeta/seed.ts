import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEED] Starting Hotel Kapila Nizamabad database seeding...");

  // 1. Seed Organization
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000000" },
    update: {
      name: "Hotel Kapila Hospitality Group",
      taxNumber: "36AAACH7412K1Z9",
    },
    create: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Hotel Kapila Hospitality Group",
      taxNumber: "36AAACH7412K1Z9", // Nizamabad Telangana GSTIN
    },
  });
  console.log(`[SEED] Organization seeded: ${org.name}`);

  // 2. Seed Outlet
  const outlet = await prisma.outlet.upsert({
    where: { id: "11111111-1111-1111-1111-111111111111" },
    update: {
      name: "Hotel Kapila",
      code: "NZB-01",
      address: "Pragathi Nagar, Central Nizamabad, Telangana 503001",
      fssaiNumber: "13619014000382",
      upiVpa: "hotelkapila@hdfcbank",
    },
    create: {
      id: "11111111-1111-1111-1111-111111111111",
      organizationId: org.id,
      name: "Hotel Kapila",
      code: "NZB-01",
      address: "Pragathi Nagar, Central Nizamabad, Telangana 503001",
      fssaiNumber: "13619014000382",
      upiVpa: "hotelkapila@hdfcbank",
      timezone: "Asia/Kolkata",
      currency: "INR",
      dayStartTime: "06:00",
    },
  });
  console.log(`[SEED] Outlet seeded: ${outlet.name}`);

  // 3. Seed Dining Tables
  const tableNumbers = ["T-01", "T-02", "T-03", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-10", "T-11", "T-12"];
  for (const tNum of tableNumbers) {
    await prisma.diningTable.upsert({
      where: {
        outletId_tableNumber: {
          outletId: outlet.id,
          tableNumber: tNum,
        },
      },
      update: {},
      create: {
        outletId: outlet.id,
        tableNumber: tNum,
        capacity: 4,
        section: "Indoor AC",
      },
    });
  }
  console.log(`[SEED] Seeded 12 dining tables (T-01..T-12)`);

  // 4. Seed Terminal
  const terminal = await prisma.terminal.upsert({
    where: {
      outletId_terminalNumber: {
        outletId: outlet.id,
        terminalNumber: "T-01",
      },
    },
    update: {},
    create: {
      id: "22222222-2222-2222-2222-222222222222",
      outletId: outlet.id,
      name: "Main Cashier Register T-01",
      terminalNumber: "T-01",
      isActive: true,
    },
  });
  console.log(`[SEED] Terminal seeded: ${terminal.name}`);

  // 5. Seed Permissions
  const permissionsList = [
    { action: "order.create", desc: "Create and checkout orders" },
    { action: "order.read", desc: "View orders and history" },
    { action: "order.void", desc: "Void / cancel order with manager elevation" },
    { action: "menu.read", desc: "View menu categories and items" },
    { action: "menu.category.manage", desc: "Add, update, and sort menu categories" },
    { action: "menu.item.manage", desc: "Add and edit menu dishes and prices" },
    { action: "menu.86.toggle", desc: "86-list item out of stock toggle" },
    { action: "payment.capture", desc: "Capture Cash, Card, and UPI payments" },
    { action: "inventory.stock.adjust", desc: "Adjust portion stock levels" },
    { action: "report.read", desc: "View daily sales and financial reports" },
    { action: "kot.read", desc: "View kitchen order tickets" },
    { action: "kot.status.update", desc: "Transition KOT ticket status" },
    { action: "payment.refund", desc: "Issue refund against a captured payment" },
    { action: "inventory.po.create", desc: "Create purchase orders" },
    { action: "inventory.grn.create", desc: "Record goods received notes" },
    { action: "report.financial.read", desc: "View financial reports and ledger exports" },
    { action: "audit.log.read", desc: "Read-only inspection of audit trail records" },
    { action: "inventory.po.approve", desc: "Approve or cancel a purchase order" },
    { action: "inventory.write", desc: "Create/edit ingredients, recipes, and vendors" },
    { action: "finance.settle", desc: "Settle an order's payment/tax calculation" },
    { action: "finance.report", desc: "View Z-report and daily financial reconciliation" },
    { action: "crm.read", desc: "View customer profile and loyalty balance" },
    { action: "crm.write", desc: "Create customers and redeem loyalty points" },
    { action: "crm.anonymize", desc: "Anonymize customer PII per DPDP erasure request" },
    { action: "integration.manage", desc: "Manage channel accounts and item mappings" },
    { action: "finance.invoice.void", desc: "Reprint or waive off an invoice (leakage-tracked)" },
  ];

  for (const p of permissionsList) {
    await prisma.permission.upsert({
      where: { action: p.action },
      update: {},
      create: {
        action: p.action,
        description: p.desc,
      },
    });
  }

  // 6. Seed Roles
  const adminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: {
      name: "SUPER_ADMIN",
      description: "Platform owner with global access",
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "OUTLET_MANAGER" },
    update: {},
    create: {
      name: "OUTLET_MANAGER",
      description: "Branch manager with category and override permissions",
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: "CASHIER" },
    update: {},
    create: {
      name: "CASHIER",
      description: "Front-desk POS cashier",
    },
  });

  const waiterRole = await prisma.role.upsert({
    where: { name: "WAITER" },
    update: {},
    create: {
      name: "WAITER",
      description: "Floor staff — takes table orders, fires courses to kitchen, no billing/void authority",
    },
  });

  const kitchenRole = await prisma.role.upsert({
    where: { name: "KITCHEN_USER" },
    update: {},
    create: {
      name: "KITCHEN_USER",
      description: "Kitchen station staff working the KDS board",
    },
  });

  const financeRole = await prisma.role.upsert({
    where: { name: "FINANCE_USER" },
    update: {},
    create: {
      name: "FINANCE_USER",
      description: "Accountant/controller handling refunds, invoices and financial reports",
    },
  });

  const menuAdminRole = await prisma.role.upsert({
    where: { name: "MENU_ADMIN" },
    update: {},
    create: {
      name: "MENU_ADMIN",
      description: "Food & Beverage manager curating categories, items and pricing",
    },
  });

  const inventoryRole = await prisma.role.upsert({
    where: { name: "INVENTORY_USER" },
    update: {},
    create: {
      name: "INVENTORY_USER",
      description: "Store keeper handling stock, wastage and GRN",
    },
  });

  const auditorRole = await prisma.role.upsert({
    where: { name: "AUDITOR" },
    update: {},
    create: {
      name: "AUDITOR",
      description: "Read-only compliance and internal audit",
    },
  });

  // 6b. Map RolePermissions — without this, RBAC checks deny everyone
  // regardless of role (a role with no RolePermission rows grants nothing).
  // All 8 roles from user-management-rbac.md now seeded.
  const allPermissions = await prisma.permission.findMany();
  const permByAction = new Map(allPermissions.map((p) => [p.action, p]));

  async function grant(roleId: string, actions: string[]) {
    for (const action of actions) {
      const permission = permByAction.get(action);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: {},
        create: { roleId, permissionId: permission.id },
      });
    }
  }

  await grant(adminRole.id, allPermissions.map((p) => p.action));
  await grant(cashierRole.id, [
    "order.create",
    "order.read",
    "menu.read",
    "payment.capture",
    "report.read",
  ]);
  // menu.read so the Waiter App can actually show the menu to build a cart.
  // No order.void, no report.read, no integration/finance access — a waiter
  // takes orders and fires them to the kitchen, nothing more. Void requests
  // fall through to the existing manager-elevation path (routes/orders.ts:
  // checkPermissionDirect + approverUserId) rather than granting it directly.
  await grant(waiterRole.id, ["order.create", "order.read", "kot.read", "menu.read"]);
  await grant(managerRole.id, [
    "order.create",
    "order.read",
    "order.void",
    "menu.read",
    "menu.category.manage",
    "menu.item.manage",
    "menu.86.toggle",
    "payment.capture",
    "payment.refund",
    "inventory.stock.adjust",
    "inventory.po.create",
    "inventory.grn.create",
    "kot.read",
    "report.read",
    "report.financial.read",
    "inventory.po.approve",
    "inventory.write",
    "crm.read",
    "crm.write",
    "crm.anonymize",
    "integration.manage",
    "finance.invoice.void",
  ]);
  await grant(kitchenRole.id, ["kot.read", "kot.status.update"]);
  await grant(financeRole.id, [
    "payment.refund",
    "report.read",
    "report.financial.read",
    "inventory.grn.create",
    "finance.settle",
    "finance.report",
    "finance.invoice.void",
  ]);
  await grant(menuAdminRole.id, [
    "menu.read",
    "menu.category.manage",
    "menu.item.manage",
    "menu.86.toggle",
  ]);
  await grant(inventoryRole.id, [
    "inventory.stock.adjust",
    "inventory.po.create",
    "inventory.grn.create",
    "inventory.write",
    "menu.86.toggle",
    "report.read",
  ]);
  // Auditor is read-only everywhere per user-management-rbac.md §2.8 — only
  // *.read actions granted, deliberately no create/update/adjust/void/refund.
  await grant(
    auditorRole.id,
    allPermissions.map((p) => p.action).filter((a) => a.endsWith(".read")),
  );
  console.log("[SEED] Role permissions mapped (9 roles: SUPER_ADMIN, OUTLET_MANAGER, CASHIER, WAITER, KITCHEN_USER, FINANCE_USER, MENU_ADMIN, INVENTORY_USER, AUDITOR)");

  // 7. Seed Admin User & Cashier User
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("password123", salt);
  const pinHash = await bcrypt.hash("1234", salt);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@hotelkapila.com" },
    update: { passwordHash, pinHash },
    create: {
      email: "admin@hotelkapila.com",
      passwordHash,
      pinHash,
      firstName: "Abdul",
      lastName: "Mannan",
      isActive: true,
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { email: "cashier@hotelkapila.com" },
    update: { passwordHash, pinHash },
    create: {
      email: "cashier@hotelkapila.com",
      passwordHash,
      pinHash,
      firstName: "Kapila",
      lastName: "Cashier",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      outletId: outlet.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: cashierUser.id,
        roleId: cashierRole.id,
      },
    },
    update: {},
    create: {
      userId: cashierUser.id,
      roleId: cashierRole.id,
      outletId: outlet.id,
    },
  });

  // Seed Waiter user — floor staff account for the Waiter App
  const waiterUser = await prisma.user.upsert({
    where: { email: "waiter@hotelkapila.com" },
    update: { passwordHash, pinHash },
    create: {
      email: "waiter@hotelkapila.com",
      passwordHash,
      pinHash,
      firstName: "Ravi",
      lastName: "Waiter",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: waiterUser.id,
        roleId: waiterRole.id,
      },
    },
    update: {},
    create: {
      userId: waiterUser.id,
      roleId: waiterRole.id,
      outletId: outlet.id,
    },
  });

  // Seed Kitchen/Chef user (needed for Quick Access login on login.tsx)
  const chefUser = await prisma.user.upsert({
    where: { email: "chef@hotelkapila.com" },
    update: { passwordHash, pinHash },
    create: {
      email: "chef@hotelkapila.com",
      passwordHash,
      pinHash,
      firstName: "Head",
      lastName: "Chef",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: chefUser.id,
        roleId: kitchenRole.id,
      },
    },
    update: {},
    create: {
      userId: chefUser.id,
      roleId: kitchenRole.id,
      outletId: outlet.id,
    },
  });

  // 8. Seed 28 Hotel Kapila Categories and Items
  const kapilaCategories = [
    "Soup (Veg)",
    "Soup (Non-Veg)",
    "Chinese Starters (Veg)",
    "Chinese Starters (Non-Veg)",
    "Tandoori Starters (Veg)",
    "Tandoori Starters (Non-Veg)",
    "Curries (Veg)",
    "Curries (Non-Veg)",
    "Biryani (Veg)",
    "Biryani (Non-Veg)",
    "Flavour Rice (Veg)",
    "Flavour Rice (Non-Veg)",
    "Noodles (Veg)",
    "Noodles (Non-Veg)",
    "Roti & Breads",
    "Breakfast",
    "Meals & Thali",
    "Meals N.I (North Indian)",
    "Rice Bowls (Online)",
    "Meal Box (Online)",
    "Fresh Juice",
    "Milk Shakes",
    "Cold Beverage",
    "Hot Beverages",
    "Butter Milk & Lassi",
    "MOCKTAILS",
    "Dessert",
    "Extra items",
  ];

  for (let i = 0; i < kapilaCategories.length; i++) {
    const catName = kapilaCategories[i];
    await prisma.menuCategory.upsert({
      where: { id: `cat-kap-${i + 1}` },
      update: { name: catName },
      create: {
        id: `cat-kap-${i + 1}`,
        outletId: outlet.id,
        name: catName,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }
  console.log(`[SEED] Seeded 28 Hotel Kapila Categories`);

  // Seed Flagship Biryani Item
  const biryaniCategory = await prisma.menuCategory.findFirst({
    where: { name: "Biryani (Non-Veg)", outletId: outlet.id },
  });

  if (biryaniCategory) {
    const specialBiryani = await prisma.menuItem.upsert({
      where: { id: "item-kap-spl-biryani" },
      update: {},
      create: {
        id: "item-kap-spl-biryani",
        outletId: outlet.id,
        categoryId: biryaniCategory.id,
        name: "Hotel Kapila Special Chicken Biryani (Boneless)",
        description: "Nizamabad signature boneless fried chicken masala over dum basmati rice.",
        price: 34000n, // ₹340.00
        isVeg: false,
        taxRate: 5.0,
        isActive: true,
      },
    });

    await prisma.itemAvailability.upsert({
      where: {
        outletId_menuItemId: {
          outletId: outlet.id,
          menuItemId: specialBiryani.id,
        },
      },
      update: {},
      create: {
        outletId: outlet.id,
        menuItemId: specialBiryani.id,
        isStocked: true,
        stockQty: 50,
        version: 1,
      },
    });
    console.log(`[SEED] Seeded signature dish: ${specialBiryani.name}`);
  }

  // 9. Seed real Hotel Kapila Nizamabad menu items (sourced from magicpin.in
  // live listing, 2026-08-11) + ingredients + recipes so stock consumption
  // is data-driven, not hardcoded. Prices in minor units (paise).
  const realMenuItems = [
    {
      id: "item-kap-ghee-sambar-bowl",
      categoryName: "Rice Bowls (Online)",
      name: "Ghee Sambar Rice Bowl",
      description: "Hot and tangy sambar tempered with ghee, served over steamed rice.",
      price: 12900n,
      isVeg: true,
      stockQty: 40,
      ingredients: [
        { name: "Basmati Rice", uom: "kg", qtyPerPortion: 0.2, unitCost: 8000n, currentStock: 25, reorderLevel: 5 },
        { name: "Toor Dal", uom: "kg", qtyPerPortion: 0.08, unitCost: 12000n, currentStock: 15, reorderLevel: 3 },
        { name: "Ghee", uom: "kg", qtyPerPortion: 0.02, unitCost: 60000n, currentStock: 8, reorderLevel: 2 },
      ],
    },
    {
      id: "item-kap-steamed-rice-chicken-curry",
      categoryName: "Rice Bowls (Online)",
      name: "Steamed Rice With Telangana Chicken Curry",
      description: "Steamed rice packed with Telangana-style chicken curry.",
      price: 17800n,
      isVeg: false,
      stockQty: 35,
      ingredients: [
        { name: "Basmati Rice", uom: "kg", qtyPerPortion: 0.2, unitCost: 8000n, currentStock: 25, reorderLevel: 5 },
        { name: "Chicken (Curry Cut)", uom: "kg", qtyPerPortion: 0.25, unitCost: 22000n, currentStock: 20, reorderLevel: 5 },
        { name: "Cooking Oil", uom: "l", qtyPerPortion: 0.03, unitCost: 15000n, currentStock: 12, reorderLevel: 3 },
      ],
    },
    {
      id: "item-kap-mini-chicken-biryani",
      categoryName: "Biryani (Non-Veg)",
      name: "Mini Chicken Dum Biryani",
      description: "750ml dum biryani with 2 chicken pieces.",
      price: 17900n,
      isVeg: false,
      stockQty: 45,
      ingredients: [
        { name: "Basmati Rice", uom: "kg", qtyPerPortion: 0.25, unitCost: 8000n, currentStock: 25, reorderLevel: 5 },
        { name: "Chicken (Curry Cut)", uom: "kg", qtyPerPortion: 0.3, unitCost: 22000n, currentStock: 20, reorderLevel: 5 },
        { name: "Ghee", uom: "kg", qtyPerPortion: 0.015, unitCost: 60000n, currentStock: 8, reorderLevel: 2 },
      ],
    },
    {
      id: "item-kap-executive-egg-meal-box",
      categoryName: "Meal Box (Online)",
      name: "Executive Egg Meal Box",
      description: "Egg fried rice + egg snack + egg curry + sambar rice + curd rice.",
      price: 17900n,
      isVeg: false,
      stockQty: 30,
      ingredients: [
        { name: "Eggs", uom: "pcs", qtyPerPortion: 3, unitCost: 700n, currentStock: 120, reorderLevel: 24 },
        { name: "Basmati Rice", uom: "kg", qtyPerPortion: 0.3, unitCost: 8000n, currentStock: 25, reorderLevel: 5 },
        { name: "Toor Dal", uom: "kg", qtyPerPortion: 0.05, unitCost: 12000n, currentStock: 15, reorderLevel: 3 },
      ],
    },
    {
      id: "item-kap-north-indian-meal",
      categoryName: "Meals N.I (North Indian)",
      name: "North Indian Meal",
      description: "Veg biryani + wheat tandoor roti + veg curry + paneer curry.",
      price: 18900n,
      isVeg: true,
      stockQty: 30,
      ingredients: [
        { name: "Basmati Rice", uom: "kg", qtyPerPortion: 0.2, unitCost: 8000n, currentStock: 25, reorderLevel: 5 },
        { name: "Paneer", uom: "kg", qtyPerPortion: 0.1, unitCost: 32000n, currentStock: 10, reorderLevel: 2 },
        { name: "Wheat Flour", uom: "kg", qtyPerPortion: 0.08, unitCost: 5000n, currentStock: 18, reorderLevel: 4 },
        { name: "Mixed Vegetables", uom: "kg", qtyPerPortion: 0.15, unitCost: 6000n, currentStock: 14, reorderLevel: 3 },
      ],
    },
  ];

  const ingredientCache = new Map<string, { id: string }>();

  for (const mi of realMenuItems) {
    const category = await prisma.menuCategory.findFirst({
      where: { name: mi.categoryName, outletId: outlet.id },
    });
    if (!category) continue;

    const menuItem = await prisma.menuItem.upsert({
      where: { id: mi.id },
      update: { name: mi.name, price: mi.price, description: mi.description },
      create: {
        id: mi.id,
        outletId: outlet.id,
        categoryId: category.id,
        name: mi.name,
        description: mi.description,
        price: mi.price,
        isVeg: mi.isVeg,
        taxRate: 5.0,
        isActive: true,
      },
    });

    await prisma.itemAvailability.upsert({
      where: { outletId_menuItemId: { outletId: outlet.id, menuItemId: menuItem.id } },
      update: { stockQty: mi.stockQty, isStocked: true },
      create: {
        outletId: outlet.id,
        menuItemId: menuItem.id,
        isStocked: true,
        stockQty: mi.stockQty,
        version: 1,
      },
    });

    const recipe = await prisma.recipe.upsert({
      where: { id: `recipe-${mi.id}` },
      update: {},
      create: {
        id: `recipe-${mi.id}`,
        outletId: outlet.id,
        menuItemId: menuItem.id,
        version: 1,
        isActive: true,
      },
    });

    for (const ing of mi.ingredients) {
      let ingredient = ingredientCache.get(ing.name);
      if (!ingredient) {
        ingredient = await prisma.ingredient.upsert({
          where: { id: `ing-${ing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
          update: { currentStock: ing.currentStock, reorderLevel: ing.reorderLevel, unitCost: ing.unitCost },
          create: {
            id: `ing-${ing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            outletId: outlet.id,
            name: ing.name,
            unitOfMeasure: ing.uom,
            currentStock: ing.currentStock,
            reorderLevel: ing.reorderLevel,
            unitCost: ing.unitCost,
            isActive: true,
          },
        });
        ingredientCache.set(ing.name, ingredient);
      }

      await prisma.recipeIngredient.upsert({
        where: { recipeId_ingredientId: { recipeId: recipe.id, ingredientId: ingredient.id } },
        update: { quantity: ing.qtyPerPortion },
        create: {
          recipeId: recipe.id,
          ingredientId: ingredient.id,
          quantity: ing.qtyPerPortion,
          yieldPercent: 100,
        },
      });
    }

    console.log(`[SEED] Real menu item seeded: ${menuItem.name} (₹${Number(mi.price) / 100})`);
  }
  console.log(`[SEED] Seeded ${realMenuItems.length} real Hotel Kapila menu items (source: magicpin.in live listing) with ingredients, recipes and stock`);

  console.log("[SEED] Hotel Kapila Seeding successfully completed! 🎉");
  console.log(`  Outlet:      ${outlet.name} (Code: ${outlet.code})`);
  console.log(`  Terminal:    ${terminal.terminalNumber}`);
  console.log(`  Admin User:  admin@hotelkapila.com / password123 (PIN: 1234)`);
  console.log(`  Cashier:     cashier@hotelkapila.com / password123 (PIN: 1234)`);
  console.log(`  Waiter:      waiter@hotelkapila.com / password123 (PIN: 1234)`);
  console.log(`  Chef/KDS:    chef@hotelkapila.com / password123 (PIN: 1234)`);
}

main()
  .catch((e) => {
    console.error("[SEED] Error seeding data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
