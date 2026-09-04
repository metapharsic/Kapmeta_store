import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import type { KotRepository } from "../kot-service";
import type { KotStatus, KotLineInput } from "@kapmeta/shared-types/kitchen";
import { writeAuditLog } from "@kapmeta/shared-types/audit-log";

const LEAKAGE_STATUSES: KotStatus[] = ["CANCELLED", "MODIFIED", "SHIFTED"];

export class PrismaKotRepository implements KotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getMenuStationIds(menuItemIds: string[]): Promise<Map<string, string | null>> {
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: { category: true },
    });

    const firstOutletId = items[0]?.outletId;
    let defaultStationId: string | null = null;
    let stations: any[] = [];
    if (firstOutletId) {
      stations = await this.prisma.station.findMany({
        where: { outletId: firstOutletId },
      });
      defaultStationId = stations[0]?.id ?? null;
    }

    const map = new Map<string, string | null>();
    for (const item of items) {
      const catName = item.category?.name?.toLowerCase() || "";
      const matched = stations.find(
        (s) =>
          s.name.toLowerCase().includes(catName) ||
          (catName && catName.includes(s.name.toLowerCase()))
      );
      map.set(item.id, matched ? matched.id : defaultStationId);
    }
    return map;
  }

  async getStationPrinterIps(stationIds: string[]): Promise<Map<string, string | null>> {
    const stations = await this.prisma.station.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, printerIp: true },
    });
    const map = new Map<string, string | null>();
    for (const station of stations) {
      map.set(station.id, station.printerIp);
    }
    return map;
  }

  async createTickets(
    outletId: string,
    orderId: string,
    groups: { stationId: string | null; ticketNumber: string; lines: KotLineInput[] }[]
  ): Promise<{ id: string; status: KotStatus }[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: { id: string; status: KotStatus }[] = [];

      for (const group of groups) {
        const ticketId = randomUUID();
        const ticket = await tx.kOTTicket.create({
          data: {
            id: ticketId,
            outletId,
            orderId,
            ticketNumber: group.ticketNumber,
            stationId: group.stationId,
            status: "QUEUED",
          },
        });

        if (group.lines.length > 0) {
          await tx.kOTItem.createMany({
            data: group.lines.map((line) => ({
              id: randomUUID(),
              outletId,
              kotTicketId: ticket.id,
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              notes: line.notes,
              course: line.course,
              orderItemId: line.orderItemId ?? null,
            })),
          });
        }

        await tx.kOTStatusHistory.create({
          data: {
            id: randomUUID(),
            kotTicketId: ticket.id,
            status: "QUEUED",
          },
        });

        results.push({ id: ticket.id, status: "QUEUED" as KotStatus });
      }

      return results;
    });
  }

  async getStatus(kotTicketId: string): Promise<KotStatus | null> {
    const row = await this.prisma.kOTTicket.findUnique({
      where: { id: kotTicketId },
      select: { status: true },
    });
    return (row?.status as KotStatus) ?? null;
  }

  async recordTransition(kotTicketId: string, newStatus: KotStatus, userId: string, reasonCode?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.kOTTicket.findUniqueOrThrow({
        where: { id: kotTicketId },
        select: { status: true, outletId: true },
      });

      const now = new Date();
      await tx.kOTTicket.update({
        where: { id: kotTicketId },
        data: {
          status: newStatus,
          servedAt: newStatus === "SERVED" ? now : undefined,
          kotItems: newStatus === "SERVED" ? {
            updateMany: {
              where: {},
              data: { servedAt: now },
            }
          } : undefined,
        },
      });
      await tx.kOTStatusHistory.create({
        data: {
          id: randomUUID(),
          kotTicketId,
          status: newStatus,
          reasonCode: reasonCode ?? null,
        },
      });

      if (LEAKAGE_STATUSES.includes(newStatus)) {
        await writeAuditLog(tx, {
          outletId: previous.outletId,
          userId,
          action: `KOT_${newStatus}`,
          entityType: "KOT",
          entityId: kotTicketId,
          beforeState: { status: previous.status },
          afterState: { status: newStatus },
          reasonCode,
        });
      }
    });
  }

  // Undo an accidental "Complete & Serve" tap. Only legal within a short
  // grace window after servedAt, checked server-side (never trust a client
  // timer) — past that window the ticket is truly done and stays done.
  async recallTicket(
    kotTicketId: string,
    userId: string,
    graceWindowMs: number
  ): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" | "NOT_SERVED" }> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.kOTTicket.findUnique({ where: { id: kotTicketId } });
      if (!ticket) {
        return { ok: false, reason: "NOT_FOUND" };
      }
      if (ticket.status !== "SERVED") {
        return { ok: false, reason: "NOT_SERVED" };
      }
      if (!ticket.servedAt || Date.now() - ticket.servedAt.getTime() > graceWindowMs) {
        return { ok: false, reason: "TOO_LATE" };
      }

      await tx.kOTTicket.update({
        where: { id: kotTicketId },
        data: { status: "READY", servedAt: null, kotItems: { updateMany: { where: {}, data: { servedAt: null } } } },
      });
      await tx.kOTStatusHistory.create({
        data: {
          id: randomUUID(),
          kotTicketId,
          status: "READY",
          reasonCode: "RECALLED",
        },
      });
      await writeAuditLog(tx, {
        outletId: ticket.outletId,
        userId,
        action: "KOT_RECALLED",
        entityType: "KOT",
        entityId: kotTicketId,
        beforeState: { status: "SERVED" },
        afterState: { status: "READY" },
      });

      return { ok: true };
    });
  }
}
