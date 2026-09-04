import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

interface DynamicRestaurantData {
  organization: { name: string; taxNumber?: string };
  outlet: {
    name: string;
    code: string;
    address?: string;
    timezone?: string;
    currency?: string;
    dayStartTime?: string;
  };
  terminals?: Array<{ name: string; terminalNumber: string }>;
  diningTables?: Array<{ tableNumber: string; capacity?: number; section?: string }>;
  stations?: Array<{ name: string; printerIp?: string }>;
  devices?: Array<{
    name: string;
    deviceCode?: string;
    deviceType?: string;
    ipAddress?: string;
    port?: number;
    stationName?: string;
    areaName?: string;
    printerIp?: string;
    paperWidth?: number;
    status?: string;
  }>;
  users?: Array<{
    email: string;
    password?: string;
    pin?: string;
    firstName: string;
    lastName?: string;
    role: string;
  }>;
  categories?: Array<{ name: string; sortOrder?: number; description?: string }>;
  menuItems?: Array<{
    categoryName: string;
    name: string;
    description?: string;
    pricePaise: number;
    isVeg?: boolean;
    taxRate?: number;
    stockQty?: number;
  }>;
  ingredients?: Array<{
    name: string;
    unitOfMeasure: string;
    currentStock: number;
    reorderLevel: number;
    unitCostPaise: number;
  }>;
}

async function runDynamicSeed(filePath?: string) {
  const targetPath = filePath
    ? path.resolve(process.cwd(), filePath)
    : path.resolve(process.cwd(), "data/user-restaurant-template.json");

  console.log(`\n======================================================`);
  console.log(`[DYNAMIC INGESTION] Reading input data from:\n${targetPath}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Data file not found at: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, "utf-8");
  const data: DynamicRestaurantData = JSON.parse(raw);

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000000" },
    update: {
      name: data.organization.name,
      taxNumber: data.organization.taxNumber,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000000",
      name: data.organization.name,
      taxNumber: data.organization.taxNumber,
    },
  });
  console.log(`✓ Organization: ${org.name}`);

  // 2. Outlet
  let outlet = await prisma.outlet.findFirst({
    where: { code: data.outlet.code },
  });
  if (outlet) {
    outlet = await prisma.outlet.update({
      where: { id: outlet.id },
      data: {
        name: data.outlet.name,
        address: data.outlet.address,
        timezone: data.outlet.timezone || "Asia/Kolkata",
        currency: data.outlet.currency || "INR",
        dayStartTime: data.outlet.dayStartTime || "06:00",
      },
    });
  } else {
    outlet = await prisma.outlet.create({
      data: {
        organizationId: org.id,
        name: data.outlet.name,
        code: data.outlet.code,
        address: data.outlet.address,
        timezone: data.outlet.timezone || "Asia/Kolkata",
        currency: data.outlet.currency || "INR",
        dayStartTime: data.outlet.dayStartTime || "06:00",
      },
    });
  }
  console.log(`✓ Outlet: ${outlet.name} (${outlet.code})`);

  // 3. Terminals
  if (data.terminals && (prisma as any).terminal) {
    for (const term of data.terminals) {
      await (prisma as any).terminal.upsert({
        where: {
          outletId_terminalNumber: {
            outletId: outlet.id,
            terminalNumber: term.terminalNumber,
          },
        },
        update: { name: term.name },
        create: {
          outletId: outlet.id,
          name: term.name,
          terminalNumber: term.terminalNumber,
          isActive: true,
        },
      });
      console.log(`  - Terminal: [${term.terminalNumber}] ${term.name}`);
    }
  }

  // 4. Dining Tables
  if (data.diningTables) {
    for (const dt of data.diningTables) {
      await prisma.diningTable.upsert({
        where: {
          outletId_tableNumber: {
            outletId: outlet.id,
            tableNumber: dt.tableNumber,
          },
        },
        update: {
          capacity: dt.capacity || 4,
          section: dt.section || "General",
        },
        create: {
          id: randomUUID(),
          outletId: outlet.id,
          tableNumber: dt.tableNumber,
          capacity: dt.capacity || 4,
          section: dt.section || "General",
        },
      });
    }
    console.log(`✓ Dining Tables: ${data.diningTables.length} tables configured.`);
  }

  // 5. Stations
  if (data.stations) {
    for (const st of data.stations) {
      const existing = await prisma.station.findFirst({
        where: { outletId: outlet.id, name: st.name },
      });
      if (existing) {
        await prisma.station.update({
          where: { id: existing.id },
          data: { printerIp: st.printerIp },
        });
      } else {
        await prisma.station.create({
          data: {
            outletId: outlet.id,
            name: st.name,
            printerIp: st.printerIp,
          },
        });
      }
      console.log(`  - Kitchen Station: ${st.name} (Printer IP: ${st.printerIp || "LAN default"})`);
    }
  }

  // 5b. Hardware Devices & Device Mapping
  if (data.devices) {
    for (const dev of data.devices) {
      const code = dev.deviceCode || `DEV-${randomUUID().slice(0, 8).toUpperCase()}`;
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM management_lists
        WHERE outlet_id = ${outlet.id} AND list_key = 'DEVICE_MAPPING' AND value = ${code}
      `;
      const extra = JSON.stringify({
        deviceType: dev.deviceType || "POS_TERMINAL",
        ipAddress: dev.ipAddress || null,
        port: dev.port || 9100,
        stationName: dev.stationName || null,
        areaName: dev.areaName || null,
        printerIp: dev.printerIp || null,
        paperWidth: dev.paperWidth || 80,
        status: dev.status || "ONLINE",
        latencyMs: 12,
        capabilities: {
          autoPrintKot: true,
          autoPrintBill: true,
          soundAlerts: true,
          allowCash: true,
        },
      });

      if (existing.length > 0) {
        await prisma.$executeRaw`
          UPDATE management_lists
          SET label = ${dev.name}, extra = ${extra}::jsonb, updated_at = now()
          WHERE id = ${existing[0].id}
        `;
      } else {
        const id = randomUUID();
        await prisma.$executeRaw`
          INSERT INTO management_lists (id, outlet_id, list_key, label, value, extra, is_active, sort_order)
          VALUES (${id}, ${outlet.id}, 'DEVICE_MAPPING', ${dev.name}, ${code}, ${extra}::jsonb, true, 0)
        `;
      }
      console.log(`  - Device Mapping: [${code}] ${dev.name} (${dev.deviceType || "POS_TERMINAL"})`);
    }
    console.log(`✓ Devices: ${data.devices.length} hardware terminals synchronized.`);
  }

  // 6. Users & Roles
  if (data.users) {
    const salt = await bcrypt.genSalt(10);
    for (const u of data.users) {
      const passwordHash = await bcrypt.hash(u.password || "password123", salt);
      const pinHash = u.pin ? await bcrypt.hash(u.pin, salt) : null;

      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          firstName: u.firstName,
          lastName: u.lastName || "",
          passwordHash,
          pinHash,
        },
        create: {
          id: randomUUID(),
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName || "",
          passwordHash,
          pinHash,
          isActive: true,
        },
      });

      let roleObj = await prisma.role.findFirst({
        where: { name: u.role },
      });

      if (!roleObj) {
        roleObj = await prisma.role.create({
          data: {
            id: randomUUID(),
            name: u.role,
            description: `${u.role} role`,
          },
        });
      }

      if (roleObj) {
        await prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: user.id,
              roleId: roleObj.id,
            },
          },
          update: { outletId: outlet.id },
          create: {
            userId: user.id,
            roleId: roleObj.id,
            outletId: outlet.id,
          },
        });
        console.log(`  - User: ${user.email} (Role: ${u.role}, PIN: ${u.pin || "N/A"})`);
      }
    }
  }

  // 7. Categories
  const categoryMap = new Map<string, string>();
  if (data.categories) {
    for (let i = 0; i < data.categories.length; i++) {
      const cat = data.categories[i];
      const existing = await prisma.menuCategory.findFirst({
        where: { outletId: outlet.id, name: cat.name },
      });
      if (existing) {
        await prisma.menuCategory.update({
          where: { id: existing.id },
          data: { sortOrder: cat.sortOrder || i + 1, description: cat.description },
        });
        categoryMap.set(cat.name, existing.id);
      } else {
        const created = await prisma.menuCategory.create({
          data: {
            id: randomUUID(),
            outletId: outlet.id,
            name: cat.name,
            sortOrder: cat.sortOrder || i + 1,
            description: cat.description,
            isActive: true,
          },
        });
        categoryMap.set(cat.name, created.id);
      }
    }
    console.log(`✓ Menu Categories: ${data.categories.length} categories synchronized.`);
  }

  // 8. Menu Items
  if (data.menuItems) {
    for (const item of data.menuItems) {
      let catId = categoryMap.get(item.categoryName);
      if (!catId) {
        const foundCat = await prisma.menuCategory.findFirst({
          where: { outletId: outlet.id, name: item.categoryName },
        });
        if (foundCat) catId = foundCat.id;
      }

      if (!catId) {
        console.warn(`[WARN] Category '${item.categoryName}' not found for item '${item.name}', skipping.`);
        continue;
      }

      const existingItem = await prisma.menuItem.findFirst({
        where: { outletId: outlet.id, name: item.name },
      });

      let menuItemId = "";
      if (existingItem) {
        await prisma.menuItem.update({
          where: { id: existingItem.id },
          data: {
            categoryId: catId,
            description: item.description,
            price: BigInt(item.pricePaise),
            isVeg: item.isVeg ?? true,
            taxRate: item.taxRate ?? 5.0,
          },
        });
        menuItemId = existingItem.id;
      } else {
        const created = await prisma.menuItem.create({
          data: {
            id: randomUUID(),
            outletId: outlet.id,
            categoryId: catId,
            name: item.name,
            description: item.description,
            price: BigInt(item.pricePaise),
            isVeg: item.isVeg ?? true,
            taxRate: item.taxRate ?? 5.0,
            isActive: true,
          },
        });
        menuItemId = created.id;
      }

      const availModel = (prisma as any).item_availability || (prisma as any).itemAvailability;
      if (availModel) {
        try {
          const existingAvail = await availModel.findFirst({
            where: { outlet_id: outlet.id, item_id: menuItemId },
          });
          if (existingAvail) {
            await availModel.update({
              where: { id: existingAvail.id },
              data: { stock_qty: item.stockQty ?? 50, state: "AVAILABLE" },
            });
          } else {
            await availModel.create({
              data: {
                id: randomUUID(),
                outlet_id: outlet.id,
                item_id: menuItemId,
                channel_id: "dine_in",
                state: "AVAILABLE",
                stock_qty: item.stockQty ?? 50,
                version: 1,
              },
            });
          }
        } catch (err) {
          // Non-blocking for availability
        }
      }
      console.log(`  - Menu Item: ${item.name} (₹${(item.pricePaise / 100).toFixed(2)}, Stock: ${item.stockQty ?? 50})`);
    }
  }

  // 9. Ingredients
  if (data.ingredients) {
    const ingModel = (prisma as any).ingredients || (prisma as any).ingredient;
    if (ingModel) {
      for (const ing of data.ingredients) {
        try {
          const existing = await ingModel.findFirst({
            where: {
              OR: [
                { outlet_id: outlet.id, name: ing.name },
                { outletId: outlet.id, name: ing.name },
              ],
            },
          });
          if (existing) {
            await ingModel.update({
              where: { id: existing.id },
              data: {
                unit_of_measure: ing.unitOfMeasure,
                current_stock: ing.currentStock,
                reorder_level: ing.reorderLevel,
                unit_cost_minor: BigInt(ing.unitCostPaise),
              },
            });
          } else {
            await ingModel.create({
              data: {
                id: randomUUID(),
                outlet_id: outlet.id,
                name: ing.name,
                unit_of_measure: ing.unitOfMeasure,
                current_stock: ing.currentStock,
                reorder_level: ing.reorderLevel,
                unit_cost_minor: BigInt(ing.unitCostPaise),
                is_active: true,
              },
            });
          }
          console.log(`  - Ingredient: ${ing.name} (${ing.currentStock} ${ing.unitOfMeasure}, Unit Cost: ₹${(ing.unitCostPaise / 100).toFixed(2)})`);
        } catch (err) {
          // Continue if schema field variance
        }
      }
      console.log(`✓ Ingredients: ${data.ingredients.length} raw inventory items synchronized.`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[DYNAMIC INGESTION] Dynamic data insertion complete! 🚀`);
  console.log(`======================================================\n`);
}

const customFile = process.argv[2];
runDynamicSeed(customFile)
  .catch((e) => {
    console.error("[DYNAMIC INGESTION ERROR]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
