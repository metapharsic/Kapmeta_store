export type AuditEntityType = "ORDER" | "PAYMENT" | "MENU_ITEM" | "STOCK" | "KOT" | "PURCHASE_ORDER" | "REFUND" | "USER";

export interface AuditLogInput {
  outletId: string;
  userId: string;
  approverUserId?: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  beforeState?: unknown;
  afterState?: unknown;
  reasonCode?: string;
  ipAddress?: string;
}

/** Minimal shape any Prisma client (or tx) exposes for audit writes — avoids a hard @prisma/client dependency in shared-types. */
export interface AuditLogWriter {
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * Writes one immutable audit_logs row. Call inside the same transaction as the
 * privileged mutation it records (void, discount, refund, override, 86-toggle, etc).
 */
export async function writeAuditLog(client: AuditLogWriter, input: AuditLogInput): Promise<void> {
  await client.auditLog.create({
    data: {
      outletId: input.outletId,
      userId: input.userId,
      approverUserId: input.approverUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeState: input.beforeState ?? undefined,
      afterState: input.afterState ?? undefined,
      reasonCode: input.reasonCode,
      ipAddress: input.ipAddress,
    },
  });
}
