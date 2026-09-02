// apps/api/src/routes/menu-scheduling.ts
//
// Backs the "Menu Scheduling" screen -- day-of-week/time-window availability
// windows for menu items, optionally tagged with a category. Reuses the
// existing `availability_schedules` table, now (as of this session's schema
// change) carrying `is_active` and `category_id` columns in addition to its
// original item_id/day_of_week/start_time/end_time shape. Neither the
// migration nor `prisma generate` have been run yet, so every query here
// goes through `(prisma as any)` -- exactly the pattern
// PrismaMenuCatalogRepository.linkModifierToItem uses for
// item_modifier_groups -- even though `availability_schedules` itself is not
// a brand-new model, because the stale generated client's copy of it is
// missing is_active/category_id.

import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { sendServerError } from "../errors";

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/** Parses an "HH:MM" or "HH:MM:SS" string into a Date usable for a
 * Postgres TIME column (Prisma represents Time fields as a Date with a
 * fixed epoch date). Returns undefined for anything unparseable. */
function parseTimeOfDay(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const match = TIME_RE.exec(value.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[4] ?? 0);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
}

function formatTimeOfDay(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function serialize(row: any) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    itemId: row.item_id,
    categoryId: row.category_id ?? null,
    dayOfWeek: row.day_of_week,
    startTime: formatTimeOfDay(row.start_time),
    endTime: formatTimeOfDay(row.end_time),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /menu-scheduling/schedules?itemId=&categoryId=
router.get("/schedules", requireAuth, requirePermission("menu.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { itemId, categoryId } = req.query;

    const where: any = { outlet_id: outletId };
    if (typeof itemId === "string" && itemId) where.item_id = itemId;
    if (typeof categoryId === "string" && categoryId) where.category_id = categoryId;

    const rows = await (prisma as any).availability_schedules.findMany({
      where,
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
    });

    res.status(200).json(rows.map(serialize));
  } catch (err) {
    sendServerError(res, err, "GET /menu-scheduling/schedules");
  }
});

// POST /menu-scheduling/schedules
router.post("/schedules", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { itemId, categoryId, dayOfWeek, startTime, endTime, isActive } = req.body ?? {};

    if (!itemId || typeof itemId !== "string") {
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    const item = await prisma.menuItem.findFirst({ where: { id: itemId, outletId } });
    if (!item) {
      res.status(404).json({ error: "menu item not found" });
      return;
    }

    if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
      if (typeof categoryId !== "string") {
        res.status(400).json({ error: "categoryId must be a string" });
        return;
      }
      const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, outletId } });
      if (!category) {
        res.status(404).json({ error: "category not found" });
        return;
      }
    }

    const dayOfWeekNum = Number(dayOfWeek);
    if (!Number.isInteger(dayOfWeekNum) || dayOfWeekNum < 0 || dayOfWeekNum > 6) {
      res.status(400).json({ error: "dayOfWeek must be an integer between 0 and 6" });
      return;
    }

    const startTimeValue = parseTimeOfDay(startTime);
    if (!startTimeValue) {
      res.status(400).json({ error: "startTime must be an HH:MM or HH:MM:SS string" });
      return;
    }
    const endTimeValue = parseTimeOfDay(endTime);
    if (!endTimeValue) {
      res.status(400).json({ error: "endTime must be an HH:MM or HH:MM:SS string" });
      return;
    }
    if (endTimeValue.getTime() <= startTimeValue.getTime()) {
      res.status(400).json({ error: "endTime must be after startTime" });
      return;
    }

    const row = await (prisma as any).availability_schedules.create({
      data: {
        outlet_id: outletId,
        item_id: itemId,
        category_id: categoryId || null,
        day_of_week: dayOfWeekNum,
        start_time: startTimeValue,
        end_time: endTimeValue,
        is_active: typeof isActive === "boolean" ? isActive : true,
        created_by: userId,
        updated_by: userId,
      },
    });

    res.status(201).json(serialize(row));
  } catch (err) {
    sendServerError(res, err, "POST /menu-scheduling/schedules");
  }
});

// PATCH /menu-scheduling/schedules/:id
router.patch("/schedules/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;

    const existing = await (prisma as any).availability_schedules.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });
    if (!existing) {
      res.status(404).json({ error: "menu schedule not found" });
      return;
    }

    const { categoryId, dayOfWeek, startTime, endTime, isActive } = req.body ?? {};
    const data: any = { updated_at: new Date(), updated_by: userId };

    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === "") {
        data.category_id = null;
      } else if (typeof categoryId === "string") {
        const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, outletId } });
        if (!category) {
          res.status(404).json({ error: "category not found" });
          return;
        }
        data.category_id = categoryId;
      } else {
        res.status(400).json({ error: "categoryId must be a string or null" });
        return;
      }
    }

    if (dayOfWeek !== undefined) {
      const dayOfWeekNum = Number(dayOfWeek);
      if (!Number.isInteger(dayOfWeekNum) || dayOfWeekNum < 0 || dayOfWeekNum > 6) {
        res.status(400).json({ error: "dayOfWeek must be an integer between 0 and 6" });
        return;
      }
      data.day_of_week = dayOfWeekNum;
    }

    if (startTime !== undefined) {
      const startTimeValue = parseTimeOfDay(startTime);
      if (!startTimeValue) {
        res.status(400).json({ error: "startTime must be an HH:MM or HH:MM:SS string" });
        return;
      }
      data.start_time = startTimeValue;
    }

    if (endTime !== undefined) {
      const endTimeValue = parseTimeOfDay(endTime);
      if (!endTimeValue) {
        res.status(400).json({ error: "endTime must be an HH:MM or HH:MM:SS string" });
        return;
      }
      data.end_time = endTimeValue;
    }

    const nextStart = data.start_time ?? existing.start_time;
    const nextEnd = data.end_time ?? existing.end_time;
    if (nextEnd.getTime() <= nextStart.getTime()) {
      res.status(400).json({ error: "endTime must be after startTime" });
      return;
    }

    if (typeof isActive === "boolean") {
      data.is_active = isActive;
    }

    const row = await (prisma as any).availability_schedules.update({
      where: { id: existing.id },
      data,
    });

    res.status(200).json(serialize(row));
  } catch (err) {
    sendServerError(res, err, "PATCH /menu-scheduling/schedules/:id");
  }
});

// DELETE /menu-scheduling/schedules/:id
router.delete("/schedules/:id", requireAuth, requirePermission("menu.item.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const existing = await (prisma as any).availability_schedules.findFirst({
      where: { id: req.params.id, outlet_id: outletId },
    });
    if (!existing) {
      res.status(404).json({ error: "menu schedule not found" });
      return;
    }

    await (prisma as any).availability_schedules.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err, "DELETE /menu-scheduling/schedules/:id");
  }
});

export const menuSchedulingRouter = router;
