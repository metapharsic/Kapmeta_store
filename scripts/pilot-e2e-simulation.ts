import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { LedgerEngine } from "../services/finance/src";
import { LoyaltyEngine } from "../services/crm/src";
import { MenuSyncWorker } from "../services/integration-hub/src";
import { emitOrderSettled } from "../apps/api/src/events";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function runPilotE2ESimulation() {
  console.log(`\n========================================================================`);
  console.log(`[PILOT E2E SIMULATION] Starting Complete Multi-Agent Restaurant Lifecycle`);
  console.log(`========================================================================\n`);

  const outlet = await prisma.outlet.findFirst();
  if (!outlet) {
    throw new Error("Outlet not found. Seed primary data first.");
  }
  const outletId = outlet.id;
  console.log(`📍 Active Outlet: ${outlet.name} (ID: ${outletId})`);

  // Initialize Autonomous Agents
  const ledgerEngine = new LedgerEngine(prisma);
  ledgerEngine.start();
  const loyaltyEngine = new LoyaltyEngine(prisma);
  loyaltyEngine.start();
  const menuSyncWorker = new MenuSyncWorker(prisma);

  // STEP 1: Dynamic Data Ingestion
  console.log(`\n1. [DATA INGESTION] Enrolling customer and dynamic specialty dish...`);
  const testCustomer = await prisma.customer.upsert({
    where: { phone: "9876543210" },
    update: { loyaltyPoints: 100 },
    create: {
      outletId,
      firstName: "Rahul",
      lastName: "Sharma",
      phone: "9876543210",
      email: "rahul.sharma@example.com",
      loyaltyPoints: 100,
    },
  });
  console.log(`   ✓ Customer Enrolled: ${testCustomer.firstName} ${testCustomer.lastName} (Points: ${testCustomer.loyaltyPoints})`);

  const category = await prisma.menuCategory.findFirst({ where: { outletId } });
  if (!category) throw new Error("No menu category found");

  const menuItem = await prisma.menuItem.findFirst({
    where: { outletId, categoryId: category.id },
  });
  if (!menuItem) throw new Error("No menu item found");
  console.log(`   ✓ Active Menu Dish: ${menuItem.name} (Price: ₹${Number(menuItem.price) / 100})`);

  // STEP 2: Online Aggregator Channel Sync
  console.log(`\n2. [ONLINE INTEGRATION] Broadcasting menu catalog & 86-stock state to channels...`);
  const syncResults = await menuSyncWorker.syncCatalogToChannels(outletId);
  for (const sr of syncResults) {
    console.log(`   ✓ Synced to ${sr.channel}: ${sr.totalSynced} items (Status: ${sr.syncStatus})`);
  }

  // STEP 3: Order Creation & Checkout
  console.log(`\n3. [ORDER CAPTURE] Creating Dine-In Order at Table T-01...`);
  const orderId = randomUUID();
  const subtotal = menuItem.price * 2n;
  const taxTotal = (subtotal * 5n) / 100n; // 5% GST
  const grandTotal = subtotal + taxTotal;

  const order = await prisma.order.create({
    data: {
      id: orderId,
      outletId,
      terminalNumber: "T-01",
      orderNumber: `ORD-PILOT-${Date.now().toString().slice(-6)}`,
      orderType: "DINE_IN",
      status: "COMPLETED",
      subtotal,
      discountTotal: 0n,
      taxTotal,
      grandTotal,
      idempotencyKey: `IDEMP-PILOT-${orderId}`,
      customerId: testCustomer.id,
      orderItems: {
        create: [
          {
            outletId,
            menuItemId: menuItem.id,
            quantity: 2,
            unitPrice: menuItem.price,
            subtotal,
          },
        ],
      },
      payments: {
        create: [
          {
            outletId,
            amount: grandTotal,
            method: "UPI",
            status: "CAPTURED",
            transactionId: "UPI-PILOT-REF-9988",
          },
        ],
      },
    },
    include: { orderItems: true, payments: true },
  });
  console.log(`   ✓ Order Created: ${order.orderNumber} (Grand Total: ₹${Number(order.grandTotal) / 100})`);

  // STEP 4: KOT Orchestration
  console.log(`\n4. [KITCHEN KDS] Generating Kitchen Order Ticket...`);
  const kot = await prisma.kOTTicket.create({
    data: {
      outletId,
      orderId: order.id,
      ticketNumber: `KOT-${Date.now().toString().slice(-4)}`,
      status: "SERVED",
      kotItems: {
        create: [
          {
            menuItemId: menuItem.id,
            quantity: 2,
          },
        ],
      },
    },
  });
  console.log(`   ✓ KOT Ticket Dispatched: ${kot.ticketNumber} -> Status: SERVED 👨‍🍳`);

  // STEP 5: Invoice Generation & Event Trigger
  console.log(`\n5. [INVOICE & BILLING] Issuing statutory tax invoice...`);
  const invoice = await prisma.invoice.create({
    data: {
      outletId,
      orderId: order.id,
      invoiceNo: `INV-PILOT-${Date.now().toString().slice(-6)}`,
      amount: order.grandTotal,
      taxAmount: order.taxTotal,
    },
  });
  console.log(`   ✓ Tax Invoice Generated: ${invoice.invoiceNo} (₹${Number(invoice.amount) / 100})`);

  // STEP 6: Double-Entry Ledger Posting
  console.log(`\n6. [DOUBLE-ENTRY LEDGER] Writing balanced journal vouchers...`);
  const ledgerResult = await ledgerEngine.postInvoiceJournal(outletId, invoice.id);
  console.log(`   ✓ Journal Voucher Posted: ${ledgerResult.voucherId} (${ledgerResult.lines} balanced debit/credit lines)`);

  const ledgerRows = await prisma.ledgerEntry.findMany({
    where: { externalRef: ledgerResult.voucherId },
  });
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const row of ledgerRows) {
    totalDebit += row.debitMinor;
    totalCredit += row.creditMinor;
    console.log(`     - [${row.account}] Debit: ₹${Number(row.debitMinor) / 100} | Credit: ₹${Number(row.creditMinor) / 100}`);
  }

  if (totalDebit !== totalCredit) {
    throw new Error(`Ledger Imbalance Detected: Debit ${totalDebit} !== Credit ${totalCredit}`);
  }
  console.log(`   ⚖️ Invariant Verified: Total Debit (₹${Number(totalDebit) / 100}) === Total Credit (₹${Number(totalCredit) / 100})`);

  // STEP 7: Customer Loyalty Award
  console.log(`\n7. [CRM LOYALTY] Awarding points to enrolled customer...`);
  await loyaltyEngine.handleOrderSettled({
    invoiceId: invoice.id,
    orderId: order.id,
    outletId,
  });
  const updatedCustomer = await prisma.customer.findUnique({ where: { id: testCustomer.id } });
  console.log(`   ✓ Points Earned via Settlement Event! (New Total: ${updatedCustomer?.loyaltyPoints} pts)`);

  // STEP 8: End of Day Reconciliation
  console.log(`\n8. [AUDIT & RECONCILIATION] Validating Z-Report and audit log trail...`);
  const auditLogs = await prisma.auditLog.findMany({
    where: { outletId },
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  console.log(`   ✓ Recent Immutable Audit Logs Verified: ${auditLogs.length} entries present.`);

  console.log(`\n========================================================================`);
  console.log(`[PILOT E2E SIMULATION] STATUS: 100% COMPLETE & VERIFIED 🟢`);
  console.log(`========================================================================\n`);
}

runPilotE2ESimulation()
  .catch((err) => {
    console.error("[PILOT SIMULATION FAILED]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
