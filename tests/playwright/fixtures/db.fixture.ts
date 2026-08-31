import { test as base } from "@playwright/test";
import { CustomerDb } from "../db/customer.db";
import { InventoryDb } from "../db/inventory.db";
import { InvoiceDb } from "../db/invoice.db";

export interface DbFixtures {
  db: {
    customer: typeof CustomerDb;
    inventory: typeof InventoryDb;
    invoice: typeof InvoiceDb;
  };
}

export const test = base.extend<DbFixtures>({
  db: async ({}, use) => {
    await use({
      customer: CustomerDb,
      inventory: InventoryDb,
      invoice: InvoiceDb,
    });
  },
});

export { expect } from "@playwright/test";
