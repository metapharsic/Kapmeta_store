import crypto from "crypto";

export function generateRandomName(prefix = "Test"): string {
  return `${prefix}_${crypto.randomBytes(3).toString("hex")}`;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a dynamic CSV string for bulk catalog imports
 */
export function generateSampleMenuCsv(itemsCount = 3): string {
  const categories = ["Special Beverages", "Chef Delights", "Artisan Bakery"];
  let csv = "Category,Item Name,Price,Is Veg,Tax Slab\n";

  for (let i = 0; i < itemsCount; i++) {
    const category = categories[i % categories.length];
    const name = generateRandomName("Item");
    const price = (120 + i * 25).toFixed(2);
    const isVeg = i % 2 === 0 ? "true" : "false";
    const taxSlab = "5%";
    csv += `${category},${name},${price},${isVeg},${taxSlab}\n`;
  }

  return csv;
}
