// Mirrors the writeAuditLog pattern in packages/shared-types/audit-log.ts:
// a small, DB-shape-agnostic writer function plus a repository interface,
// meant to be called inside the same transaction as the business mutation
// (and usually right alongside a writeAuditLog call) it is notifying about.

export type NotificationType =
  | "PO_APPROVED"
  | "PO_CANCELLED"
  | "STOCK_ADJUSTMENT_UNUSUAL"
  | "REFUND_ISSUED";

export interface CreateNotificationInput {
  outletId: string;
  userId?: string; // omitted/undefined = broadcast to the whole outlet
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationRecord {
  id: string;
  outletId: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  listForUser(outletId: string, userId: string): Promise<NotificationRecord[]>;
  markRead(id: string, userId: string): Promise<NotificationRecord | null>;
  markAllRead(outletId: string, userId: string): Promise<number>;
}

/**
 * Creates one notification row. Call inside the same transaction as the
 * business-event mutation that triggered it (PO approval/cancellation,
 * an unusual stock adjustment, a refund) — same convention as
 * writeAuditLog, so the notification and the audit trail commit atomically.
 */
export async function createNotification(
  input: CreateNotificationInput,
  repo: NotificationRepository,
): Promise<NotificationRecord> {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("title is mandatory for a notification");
  }
  if (!input.message || input.message.trim().length === 0) {
    throw new Error("message is mandatory for a notification");
  }
  return repo.create(input);
}

/** Minimal shape any Prisma client (or tx) exposes for notification writes — mirrors AuditLogWriter. */
export interface NotificationWriter {
  notification: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * Low-level write for call sites that already hold an open transaction (e.g.
 * alongside writeAuditLog inside PrismaInventoryRepository.postManualAdjustment,
 * PrismaFinanceRepository.createRefund, PrismaPurchaseRepository.recordPoTransition).
 * Does not go through the createNotification() validation above — call sites
 * that build their own title/message strings are trusted to pass non-empty ones.
 */
export async function writeNotification(client: NotificationWriter, input: CreateNotificationInput): Promise<void> {
  await client.notification.create({
    data: {
      outletId: input.outletId,
      userId: input.userId ?? undefined,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? undefined,
      entityId: input.entityId ?? undefined,
    },
  });
}
