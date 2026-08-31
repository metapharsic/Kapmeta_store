/**
 * Structured Test Data Template Schemas & Presets
 */
export interface ProductTestData {
  name: string;
  category: string;
  priceMinor: number;
  isVeg: boolean;
  taxRatePercent: number;
  sku?: string;
}

export interface CustomerTestData {
  name: string;
  phone: string;
  email: string;
  gstin?: string;
  address?: string;
}

export interface TableTestData {
  tableNumber: string;
  capacity: number;
  section: "AC" | "Non AC" | "Outdoor" | "Bar";
}

export const TEST_DATA_PRESETS = {
  sampleCategories: ["Beverages", "Starters", "Main Course", "Breads", "Desserts"],
  defaultTables: [
    { tableNumber: "T-01", capacity: 4, section: "AC" },
    { tableNumber: "T-02", capacity: 2, section: "AC" },
    { tableNumber: "T-11", capacity: 6, section: "Non AC" },
    { tableNumber: "OUT-01", capacity: 4, section: "Outdoor" },
  ] as TableTestData[],
  paymentMethods: ["CASH", "CARD", "UPI", "DUE"] as const,
};
