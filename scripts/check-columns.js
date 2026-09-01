const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invoiceCols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices';
  `);
  console.log("invoices table columns:", invoiceCols);
}

main().catch(console.error).finally(() => prisma.$disconnect());
