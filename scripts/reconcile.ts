import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();
const exceptionLog = "logs/audit/recon-exception.log";

async function main() {
  console.log("[RECON] Querying payments and invoices from database...");

  // 1. Fetch invoices and payments
  const invoices = await prisma.invoice.findMany({
    include: {
      order: {
        include: {
          payments: true,
        },
      },
    },
  });

  let totalInvoiced = 0;
  let totalPaid = 0;
  let discrepanciesCount = 0;

  // Ensure log directory exists
  if (!fs.existsSync("logs/audit")) {
    fs.mkdirSync("logs/audit", { recursive: true });
  }

  for (const inv of invoices) {
    const invAmount = Number(inv.amount);
    totalInvoiced += invAmount;

    // Sum captured payments for this order
    const paidAmount = inv.order.payments
      .filter((p) => p.status === "CAPTURED")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    totalPaid += paidAmount;

    if (invAmount !== paidAmount) {
      discrepanciesCount++;
      const utcTimestamp = new Date().toISOString();
      const logEntry = JSON.stringify({
        timestamp: utcTimestamp,
        level: "error",
        action: "financial.discrepancy",
        invoiceNo: inv.invoiceNo,
        orderId: inv.orderId,
        invoiceAmount: invAmount,
        paymentCaptured: paidAmount,
        difference: invAmount - paidAmount,
      });

      fs.appendFileSync(exceptionLog, logEntry + "\n", "utf8");
      console.log(`[DISCREPANCY] Invoice ${inv.invoiceNo} amount (${invAmount}) != payment (${paidAmount})`);
    }
  }

  console.log("=========================================");
  console.log("[RECON] Reconciliation completed.");
  console.log(`- Total Invoiced  : ${totalInvoiced} paise`);
  console.log(`- Total Payments  : ${totalPaid} paise`);
  console.log(`- Discrepancies   : ${discrepanciesCount}`);
  console.log(`- Logs exported to: ${exceptionLog}`);
  console.log("=========================================");
}

main()
  .catch((e) => {
    console.error("[RECON] Execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
