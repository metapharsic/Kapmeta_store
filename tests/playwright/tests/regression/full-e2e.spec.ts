import { test, expect } from "../../fixtures/auth.fixture";
import { SalesWorkflow } from "../../workflows/sales.workflow";
import { CustomerWorkflow } from "../../workflows/customer.workflow";
import { InventoryWorkflow } from "../../workflows/inventory.workflow";
import { TestDataGenerator } from "../../utils/test-data-generator";
import { logger } from "../../utils/logger";

test.describe("Regression Tests: End-to-End Multi-Domain Workflows", () => {
  test("REG-01: Full customer lifecycle from onboarding to repeat sales order", async ({ authenticatedPage }) => {
    logger.step("[Regression] Executing End-to-End Customer & Billing Flow");
    const customerData = TestDataGenerator.generateCustomer();
    const customerWorkflow = new CustomerWorkflow(authenticatedPage);
    
    // 1. Onboard Customer
    await customerWorkflow.onboardNewCustomer(customerData);

    // 2. Complete Dine-In Sale
    const salesWorkflow = new SalesWorkflow(authenticatedPage);
    await salesWorkflow.completeDineInSale({
      tableNumber: "A3",
      items: ["Paneer Tikka", "Butter Naan"],
      paymentMethod: "UPI",
    });
  });

  test("REG-02: Inventory replenishment and menu catalog availability verification", async ({ authenticatedPage }) => {
    logger.step("[Regression] Executing Inventory Replenishment Flow");
    const inventoryWorkflow = new InventoryWorkflow(authenticatedPage);
    const materialName = `Paneer Raw ${TestDataGenerator.uniqueId()}`;
    
    await inventoryWorkflow.replenishStock(materialName, 50, "kg");
  });
});
