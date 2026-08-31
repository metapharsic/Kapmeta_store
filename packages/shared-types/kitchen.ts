// Contract for services/kitchen. Maps to kapmeta/schema.prisma KOTTicket,
// KOTItem, KOTStatusHistory. Per WF-KOT: a KOT must be traceable to one
// order and its items; status changes are auditable; no duplicate transitions.

export type KotStatus = "QUEUED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED" | "MODIFIED" | "SHIFTED";

// CANCELLED/MODIFIED/SHIFTED are leakage-tracking terminal-ish statuses: any
// active ticket (QUEUED/PREPARING/READY) can be diverted into one of them
// (kitchen mistake, guest change, station reassignment). SERVED remains a
// true terminal status with no further transitions.
export const KOT_TRANSITIONS: Record<KotStatus, KotStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED", "MODIFIED", "SHIFTED"],
  PREPARING: ["READY", "CANCELLED", "MODIFIED", "SHIFTED"],
  READY: ["SERVED", "CANCELLED", "MODIFIED", "SHIFTED"],
  SERVED: [],
  CANCELLED: [],
  MODIFIED: [],
  SHIFTED: [],
};

export function isKotTransitionLegal(from: KotStatus, to: KotStatus): boolean {
  return KOT_TRANSITIONS[from].includes(to);
}

export interface KotLineInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
  course?: string;
  orderItemId?: string;
}

export interface CreateKotInput {
  outletId: string;
  orderId: string;
  lines: KotLineInput[];
}

export type KotTransitionResult =
  | { ok: true; newStatus: KotStatus }
  | { ok: false; reason: "ILLEGAL_TRANSITION" | "NOT_FOUND"; from?: KotStatus; to: KotStatus };
