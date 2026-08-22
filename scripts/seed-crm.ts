import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function seedCRM() {
  console.log("Loading CRM data from template...");
  const dataPath = path.resolve(__dirname, "../data/crm-template.json");
  
  if (!fs.existsSync(dataPath)) {
    console.error("crm-template.json not found!");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  
  // Hardcode the first outlet for seeding purposes
  const outlet = await prisma.outlet.findFirst();
  if (!outlet) {
    console.error("No outlet found! Please run the main kapmeta/seed.ts first.");
    process.exit(1);
  }
  const outletId = outlet.id;

  console.log(`Seeding CRM for Outlet ID: ${outletId}`);

  // Seed Customers
  for (const cust of data.customers) {
    const existing = await prisma.customer.findUnique({
      where: { phone: cust.phone }
    });

    if (!existing) {
      await prisma.customer.create({
        data: {
          outletId,
          firstName: cust.firstName,
          lastName: cust.lastName,
          phone: cust.phone,
          email: cust.email,
          loyaltyPoints: cust.loyaltyPoints
        }
      });
      console.log(`Created customer: ${cust.firstName} ${cust.lastName}`);
    } else {
      console.log(`Customer ${cust.phone} already exists.`);
    }
  }

  console.log("CRM seeding completed successfully!");
}

seedCRM()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
