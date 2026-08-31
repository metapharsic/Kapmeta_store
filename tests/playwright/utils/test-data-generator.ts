import { CustomerTestData, ProductTestData, TableTestData } from "../config/test-data";

/**
 * Dynamic Test Data Generator (Zero Hardcoding Compliant)
 */
export class TestDataGenerator {
  /**
   * Generates a unique random string prefix/suffix
   */
  static uniqueId(prefix: string = "test"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generates a dynamic customer profile
   */
  static generateCustomer(overrides?: Partial<CustomerTestData>): CustomerTestData {
    const id = this.uniqueId("cust");
    const randomPhone = "9" + Math.floor(100000000 + Math.random() * 900000000).toString();
    return {
      name: `Customer ${id}`,
      phone: randomPhone,
      email: `${id}@test-domain.com`,
      gstin: "27AABCU9603R1ZM",
      address: "123 Test Street, Suite 400",
      ...overrides,
    };
  }

  /**
   * Generates a dynamic menu item/product
   */
  static generateProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    const id = this.uniqueId("item");
    const prices = [15000, 22000, 35000, 48000, 12000]; // in paise (₹150 - ₹480)
    const randomPrice = prices[Math.floor(Math.random() * prices.length)];
    const categories = ["Starters", "Main Course", "Beverages", "Desserts"];

    return {
      name: `Dish ${id}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      priceMinor: randomPrice,
      isVeg: Math.random() > 0.4,
      taxRatePercent: 5.0,
      sku: `SKU-${id.toUpperCase()}`,
      ...overrides,
    };
  }

  /**
   * Generates a dynamic table configuration
   */
  static generateTable(overrides?: Partial<TableTestData>): TableTestData {
    const tableNum = "T-" + Math.floor(10 + Math.random() * 90);
    const sections: Array<"AC" | "Non AC" | "Outdoor" | "Bar"> = ["AC", "Non AC", "Outdoor"];
    return {
      tableNumber: tableNum,
      capacity: [2, 4, 6, 8][Math.floor(Math.random() * 4)],
      section: sections[Math.floor(Math.random() * sections.length)],
      ...overrides,
    };
  }
}
