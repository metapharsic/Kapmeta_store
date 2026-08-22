// Contract for services/menu. Maps to kapmeta/schema.prisma MenuCategory,
// MenuItem, ModifierGroup, ModifierOption, ItemAvailability.

export interface MenuCategoryInput {
  outletId: string;
  name: string;
  description?: string;
}

export interface MenuItemInput {
  outletId: string;
  categoryId: string;
  name: string;
  description?: string;
  priceMinor: bigint; // minor units (paise), matches schema's BigInt price column
  isVeg?: boolean; // matches schema's MenuItem.isVeg (defaults true in DB if omitted)
  taxRate?: number; // matches schema's MenuItem.taxRate (defaults 5.0 in DB if omitted)
}

export interface AvailabilityState {
  menuItemId: string;
  outletId: string;
  isStocked: boolean;
  stockQty: number;
  version: number; // sync ordering — never decremented, always incremented on change
}

export type AvailabilityUpdateResult =
  | { ok: true; newVersion: number }
  | { ok: false; reason: "STALE_VERSION"; currentVersion: number }; // optimistic-concurrency conflict

export interface MenuItemView {
  id: string;
  outletId: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  priceMinor: bigint;
  isVeg: boolean;
  taxRate: string;
  isActive: boolean;
  availability: { isStocked: boolean; stockQty: number; version: number } | null;
}
