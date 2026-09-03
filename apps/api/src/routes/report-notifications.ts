import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";

export const reportNotificationsRouter = Router();

// report_notifications (migration 0052 in db/migrations) is a table this
// session added -- it has no Prisma model in the checked-in generated
// client yet (regenerating it requires downloading a query-engine binary,
// which this sandbox has no network path to: `npx prisma generate` here
// fails with a 403 fetching https://binaries.prisma.sh/...). Routes below
// use $queryRaw/$executeRaw against the real table instead of a
// prisma.report_notifications delegate, so they work today and keep
// working once someone with network access runs `prisma generate` for
// real later (nothing here depends on the delegate existing).
//
// IMPORTANT: this table stores subscription *intent* only -- there is no
// notification-sending mechanism anywhere in this codebase (no email/SMS
// worker, no cron, no queue consumer) that reads these rows and actually
// delivers a report. Nothing here writes or implies a "sent" status; that
// is real infrastructure work, out of scope for this route.

interface ReportNotificationRow {
  id: string;
  outlet_id: string;
  report_key: string;
  frequency: string;
  recipients: string;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
}

function serialize(row: ReportNotificationRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    reportKey: row.report_key,
    frequency: row.frequency,
    recipients: row.recipients,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

// Loose validation: comma-separated list, each entry must look like an
// email address (contains "@" with something on both sides). Not a full
// RFC 5322 validator -- just enough to reject obviously-wrong input before
// it lands as someone's "recipients" list.
function invalidRecipients(recipients: string): string[] {
  return recipients
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
}

// GET /report-notifications -- list this outlet's report subscriptions.
reportNotificationsRouter.get("/report-notifications", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const rows = await prisma.$queryRaw<ReportNotificationRow[]>`
      SELECT id, outlet_id, report_key, frequency, recipients, is_active, created_by, created_at
      FROM report_notifications
      WHERE outlet_id = ${outletId}
      ORDER BY created_at DESC
    `;
    res.status(200).json(rows.map(serialize));
  } catch (error: any) {
    console.error("Error in GET /report-notifications:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /report-notifications -- subscribe to a report on a schedule.
reportNotificationsRouter.post("/report-notifications", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { reportKey, frequency, recipients, isActive } = req.body ?? {};

    if (typeof reportKey !== "string" || reportKey.trim().length === 0) {
      return res.status(400).json({ error: "reportKey is required" });
    }
    if (typeof frequency !== "string" || frequency.trim().length === 0) {
      return res.status(400).json({ error: "frequency is required" });
    }
    if (typeof recipients !== "string" || recipients.trim().length === 0) {
      return res.status(400).json({ error: "recipients is required (comma-separated emails)" });
    }
    const bad = invalidRecipients(recipients);
    if (bad.length > 0) {
      return res.status(400).json({ error: `invalid recipient email(s): ${bad.join(", ")}` });
    }

    const active = isActive === undefined ? true : Boolean(isActive);

    const rows = await prisma.$queryRaw<ReportNotificationRow[]>`
      INSERT INTO report_notifications (outlet_id, report_key, frequency, recipients, is_active, created_by)
      VALUES (${outletId}, ${reportKey.trim()}, ${frequency.trim()}, ${recipients.trim()}, ${active}, ${userId})
      RETURNING id, outlet_id, report_key, frequency, recipients, is_active, created_by, created_at
    `;

    res.status(201).json(serialize(rows[0]));
  } catch (error: any) {
    console.error("Error in POST /report-notifications:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /report-notifications/:id -- unsubscribe. Scoped to the caller's
// outlet so one outlet can't delete another's subscription by id.
reportNotificationsRouter.delete("/report-notifications/:id", requireAuth, requirePermission("report.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM report_notifications WHERE id = ${id} AND outlet_id = ${outletId}
    `;
    if (existing.length === 0) {
      return res.status(404).json({ error: "report notification not found" });
    }

    await prisma.$executeRaw`
      DELETE FROM report_notifications WHERE id = ${id} AND outlet_id = ${outletId}
    `;

    res.status(200).json({ deleted: true, id });
  } catch (error: any) {
    console.error("Error in DELETE /report-notifications/:id:", error);
    res.status(500).json({ error: error.message });
  }
});
