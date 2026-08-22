import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function seedLedgerCoA(filePath?: string) {
  const targetPath = filePath
    ? path.resolve(process.cwd(), filePath)
    : path.resolve(process.cwd(), "data/ledger-template.json");

  console.log(`\n======================================================`);
  console.log(`[DYNAMIC LEDGER INGESTION] Reading Chart of Accounts from:\n${targetPath}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`CoA file not found at: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, "utf-8");
  const data = JSON.parse(raw);

  const outlet = await prisma.outlet.findFirst();
  if (!outlet) {
    throw new Error("No outlet found. Run primary seed first.");
  }

  console.log(`Ingesting CoA for Outlet: ${outlet.name} (${outlet.id})`);

  let totalOpeningDebit = 0n;
  for (const account of data.chartOfAccounts) {
    const debitMinor = BigInt(account.openingBalanceDebitPaise || 0);
    totalOpeningDebit += debitMinor;

    if (debitMinor > 0n) {
      await prisma.ledgerEntry.create({
        data: {
          outletId: outlet.id,
          sourceType: "SETTLEMENT",
          sourceId: "OPENING-BAL-" + account.code,
          account: account.code,
          debitMinor: debitMinor,
          creditMinor: 0n,
          externalRef: `OPENING-VOUCHER-${account.code}`,
          status: "POSTED",
          postedAt: new Date(),
        },
      });
      console.log(`  ✓ Seeded Opening Balance: ${account.code} (${account.name}) -> ₹${(Number(debitMinor) / 100).toFixed(2)} [DEBIT]`);
    }
  }

  // Create balanced offset equity row if opening balances existed
  if (totalOpeningDebit > 0n) {
    await prisma.ledgerEntry.create({
      data: {
        outletId: outlet.id,
        sourceType: "SETTLEMENT",
        sourceId: "OPENING-BAL-EQUITY",
        account: "3010-OWNERS-CAPITAL",
        debitMinor: 0n,
        creditMinor: totalOpeningDebit,
        externalRef: "OPENING-VOUCHER-EQUITY",
        status: "POSTED",
        postedAt: new Date(),
      },
    });
    console.log(`  ✓ Balanced Equity Offset: 3010-OWNERS-CAPITAL -> ₹${(Number(totalOpeningDebit) / 100).toFixed(2)} [CREDIT]`);
  }

  console.log(`\n======================================================`);
  console.log(`[DYNAMIC LEDGER INGESTION] Balanced CoA initialized! ⚖️`);
  console.log(`======================================================\n`);
}

seedLedgerCoA()
  .catch((err) => {
    console.error("[DYNAMIC LEDGER INGESTION ERROR]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
