import type { AvailabilityState, AvailabilityUpdateResult } from "@kapmeta/shared-types/menu";

export interface AvailabilityListItem extends AvailabilityState {
  categoryName: string;
  name: string;
  priceMinor: string; // BigInt serialized to string for JSON transport
  isVeg: boolean;
}

export interface AvailabilityRepository {
  get(menuItemId: string, outletId: string): Promise<AvailabilityState | null>;
  updateIfVersionMatches(menuItemId: string, outletId: string, expectedVersion: number, isStocked: boolean, stockQty: number, userId: string): Promise<boolean>; // true if the update applied, false if expectedVersion was stale
  listByOutlet(outletId: string): Promise<AvailabilityListItem[]>;
}

export async function setAvailability(
  menuItemId: string,
  outletId: string,
  isStocked: boolean,
  stockQty: number,
  expectedVersion: number,
  repo: AvailabilityRepository,
  userId: string,
): Promise<AvailabilityUpdateResult> {
  const applied = await repo.updateIfVersionMatches(menuItemId, outletId, expectedVersion, isStocked, stockQty, userId);

  if (applied) {
    return { ok: true, newVersion: expectedVersion + 1 };
  }

  const current = await repo.get(menuItemId, outletId);
  return {
    ok: false,
    reason: "STALE_VERSION",
    // Defensive fallback: repo.get returning null after a failed update shouldn't
    // normally happen, but avoid throwing and report expectedVersion instead.
    currentVersion: current?.version ?? expectedVersion,
  };
}

export async function listAvailability(
  outletId: string,
  repo: AvailabilityRepository,
): Promise<AvailabilityListItem[]> {
  return repo.listByOutlet(outletId);
}
