import { isKotTransitionLegal } from "@kapmeta/shared-types/kitchen";
import type {
  KotStatus,
  CreateKotInput,
  KotLineInput,
  KotTransitionResult,
} from "@kapmeta/shared-types/kitchen";

import { printKotTicket } from "./printer-service";

export interface KotRepository {
  getMenuStationIds(menuItemIds: string[]): Promise<Map<string, string | null>>;
  getStationPrinterIps(stationIds: string[]): Promise<Map<string, string | null>>;
  createTickets(
    outletId: string,
    orderId: string,
    groups: { stationId: string | null; ticketNumber: string; lines: KotLineInput[] }[]
  ): Promise<{ id: string; status: KotStatus }[]>;
  getStatus(kotTicketId: string): Promise<KotStatus | null>;
  recordTransition(kotTicketId: string, newStatus: KotStatus, userId: string, reasonCode?: string): Promise<void>;
  recallTicket(
    kotTicketId: string,
    userId: string,
    graceWindowMs: number
  ): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" | "NOT_SERVED" }>;
}

// How long after "Complete & Serve" a recall/undo is still allowed.
export const RECALL_GRACE_WINDOW_MS = 2 * 60 * 1000;

export async function createKot(
  input: CreateKotInput,
  repo: KotRepository
): Promise<{ id: string; status: KotStatus }[]> {
  const menuItemIds = Array.from(new Set(input.lines.map((l) => l.menuItemId)));
  const stationMap = await repo.getMenuStationIds(menuItemIds);

  const linesByStation = new Map<string | null, KotLineInput[]>();
  for (const line of input.lines) {
    const stationId = stationMap.get(line.menuItemId) ?? null;
    let group = linesByStation.get(stationId);
    if (!group) {
      group = [];
      linesByStation.set(stationId, group);
    }
    group.push(line);
  }

  const groups: { stationId: string | null; ticketNumber: string; lines: KotLineInput[] }[] = [];
  const activeStationIds = Array.from(linesByStation.keys()).filter((s): s is string => s !== null);
  const printerIps = await repo.getStationPrinterIps(activeStationIds);

  for (const [stationId, lines] of linesByStation.entries()) {
    const ticketNumber = `KOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    groups.push({ stationId, ticketNumber, lines });

    if (stationId) {
      const printerIp = printerIps.get(stationId);
      if (printerIp) {
        // Fire and forget LAN printing to avoid blocking the request
        printKotTicket(printerIp, ticketNumber, lines).catch((e) => {
          console.error(`[kitchen] Failed to print ticket ${ticketNumber} at ${printerIp}:`, e);
        });
      }
    }
  }

  return repo.createTickets(input.outletId, input.orderId, groups);
}

export async function transitionKot(
  kotTicketId: string,
  toStatus: KotStatus,
  repo: KotRepository,
  userId: string,
  reasonCode?: string
): Promise<KotTransitionResult> {
  const currentStatus = await repo.getStatus(kotTicketId);
  if (currentStatus === null) {
    return { ok: false, reason: "NOT_FOUND", to: toStatus };
  }
  if (!isKotTransitionLegal(currentStatus, toStatus)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION", from: currentStatus, to: toStatus };
  }
  await repo.recordTransition(kotTicketId, toStatus, userId, reasonCode);
  return { ok: true, newStatus: toStatus };
}

export async function recallKot(
  kotTicketId: string,
  userId: string,
  repo: KotRepository
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" | "NOT_SERVED" }> {
  return repo.recallTicket(kotTicketId, userId, RECALL_GRACE_WINDOW_MS);
}
