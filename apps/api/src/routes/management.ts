import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth, requirePermission, type AuthedRequest } from "../middleware/require-auth";
import { prisma } from "../prisma";

export const managementRouter = Router();

// management_lists / management_settings / management_activity_logs
// (migration 0053 in db/migrations) back the new "Management" nav section
// (Configuration / Accounting / User Management / User Logs screens). None
// of the three tables have Prisma models in the checked-in generated
// client yet -- same situation as report_notifications (see that route
// file's comment): `npx prisma generate` has no network path to
// binaries.prisma.sh in this sandbox. Routes below use
// $queryRaw/$executeRaw against the real tables instead of Prisma
// delegates; they work today and keep working once someone with network
// access runs `prisma generate` for real later.
//
// Reused existing seeded permissions (db/seeds/seed_permissions.sql) rather
// than inventing new "management.*" ones: 'settings.read'/'settings.manage'
// gate the generic lists/settings/logs CRUD below (this *is* outlet
// settings/configuration data), and 'users.manage' gates /biller-app since
// it's a user listing, same permission user-management.ts's GET /users
// uses.
//
// IMPORTANT -- like report_notifications, management_lists/_settings are
// storage only: no screen-specific business logic (e.g. actual delivery
// fee calculation, actual GST filing, actual wallet balance movement)
// lives here, only generic CRUD against caller-supplied keys. See
// management_activity_logs' write-point note on GET /logs below for the
// one place this session wired a real caller.

const LIST_KEY_RE = /^[A-Z0-9_]{1,64}$/;
const MAX_LOG_LIMIT = 200;
const DEFAULT_LOG_LIMIT = 50;

interface ListRow {
  id: string;
  outlet_id: string;
  list_key: string;
  label: string;
  value: string | null;
  extra: unknown;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

function serializeList(row: ListRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    listKey: row.list_key,
    label: row.label,
    value: row.value,
    extra: row.extra,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by,
  };
}

interface SettingsRow {
  id: string;
  outlet_id: string;
  settings_key: string;
  data: unknown;
  updated_at: Date;
  updated_by: string | null;
}

function serializeSettings(row: SettingsRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    settingsKey: row.settings_key,
    data: row.data,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

interface LogRow {
  id: string;
  outlet_id: string;
  log_type: string;
  actor_id: string | null;
  message: string;
  meta: unknown;
  created_at: Date;
}

function serializeLog(row: LogRow) {
  return {
    id: row.id,
    outletId: row.outlet_id,
    logType: row.log_type,
    actorId: row.actor_id,
    message: row.message,
    meta: row.meta,
    createdAt: row.created_at.toISOString(),
  };
}

// GET /management/lists?key=<list_key>
managementRouter.get("/management/lists", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }

    const rows = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists
      WHERE outlet_id = ${outletId} AND list_key = ${key}
      ORDER BY sort_order ASC, created_at ASC
    `;
    res.status(200).json(rows.map(serializeList));
  } catch (error: any) {
    console.error("Error in GET /management/lists:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /management/lists
managementRouter.post("/management/lists", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const { listKey, label, value, extra, isActive, sortOrder } = req.body ?? {};

    if (typeof listKey !== "string" || !LIST_KEY_RE.test(listKey.trim())) {
      return res.status(400).json({ error: "listKey is required and must match [A-Z0-9_]" });
    }
    if (typeof label !== "string" || label.trim().length === 0) {
      return res.status(400).json({ error: "label is required" });
    }

    const active = isActive === undefined ? true : Boolean(isActive);
    const order = Number.isFinite(sortOrder) ? Number(sortOrder) : 0;
    const extraJson = JSON.stringify(extra && typeof extra === "object" ? extra : {});

    const rows = await prisma.$queryRaw<ListRow[]>`
      INSERT INTO management_lists (outlet_id, list_key, label, value, extra, is_active, sort_order, created_by)
      VALUES (${outletId}, ${listKey.trim()}, ${label.trim()}, ${value ?? null}, ${extraJson}::jsonb, ${active}, ${order}, ${userId})
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    res.status(201).json(serializeList(rows[0]));
  } catch (error: any) {
    console.error("Error in POST /management/lists:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /management/lists/:id
managementRouter.put("/management/lists/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;
    const { label, value, extra, isActive, sortOrder } = req.body ?? {};

    const existing = await prisma.$queryRaw<ListRow[]>`
      SELECT id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
      FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;
    if (existing.length === 0) {
      return res.status(404).json({ error: "list item not found" });
    }
    const current = existing[0];

    const nextLabel = typeof label === "string" && label.trim().length > 0 ? label.trim() : current.label;
    const nextValue = value === undefined ? current.value : value;
    const nextExtra = JSON.stringify(extra && typeof extra === "object" ? extra : current.extra ?? {});
    const nextActive = isActive === undefined ? current.is_active : Boolean(isActive);
    const nextOrder = Number.isFinite(sortOrder) ? Number(sortOrder) : current.sort_order;

    const rows = await prisma.$queryRaw<ListRow[]>`
      UPDATE management_lists
      SET label = ${nextLabel}, value = ${nextValue}, extra = ${nextExtra}::jsonb, is_active = ${nextActive}, sort_order = ${nextOrder}, updated_at = now()
      WHERE id = ${id} AND outlet_id = ${outletId}
      RETURNING id, outlet_id, list_key, label, value, extra, is_active, sort_order, created_at, updated_at, created_by
    `;

    res.status(200).json(serializeList(rows[0]));
  } catch (error: any) {
    console.error("Error in PUT /management/lists/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /management/lists/:id
managementRouter.delete("/management/lists/:id", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { id } = req.params;

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;
    if (existing.length === 0) {
      return res.status(404).json({ error: "list item not found" });
    }

    await prisma.$executeRaw`
      DELETE FROM management_lists WHERE id = ${id} AND outlet_id = ${outletId}
    `;

    res.status(200).json({ deleted: true, id });
  } catch (error: any) {
    console.error("Error in DELETE /management/lists/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/settings/:key -- single row, or {} if none set yet.
managementRouter.get("/management/settings/:key", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const key = req.params.key;

    const rows = await prisma.$queryRaw<SettingsRow[]>`
      SELECT id, outlet_id, settings_key, data, updated_at, updated_by
      FROM management_settings
      WHERE outlet_id = ${outletId} AND settings_key = ${key}
    `;
    if (rows.length === 0) {
      return res.status(200).json({});
    }
    res.status(200).json(serializeSettings(rows[0]));
  } catch (error: any) {
    console.error("Error in GET /management/settings/:key:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /management/settings/:key -- upsert.
managementRouter.put("/management/settings/:key", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const userId = req.auth!.userId;
    const key = req.params.key;
    const { data } = req.body ?? {};

    if (data === undefined || typeof data !== "object" || data === null || Array.isArray(data)) {
      return res.status(400).json({ error: "data (object) is required" });
    }
    const dataJson = JSON.stringify(data);

    const rows = await prisma.$queryRaw<SettingsRow[]>`
      INSERT INTO management_settings (outlet_id, settings_key, data, updated_by)
      VALUES (${outletId}, ${key}, ${dataJson}::jsonb, ${userId})
      ON CONFLICT (outlet_id, settings_key)
      DO UPDATE SET data = ${dataJson}::jsonb, updated_at = now(), updated_by = ${userId}
      RETURNING id, outlet_id, settings_key, data, updated_at, updated_by
    `;

    res.status(200).json(serializeSettings(rows[0]));
  } catch (error: any) {
    console.error("Error in PUT /management/settings/:key:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/logs?type=<log_type>&limit=50
//
// Real write point: apps/api/src/routes/integration.ts's
// PATCH /channel-items/:mappingId/availability (the online channel item
// on/off toggle) inserts a row here with log_type='ONLINE_ITEM_ON_OFF'
// right after each successful toggle -- see that route's comment. A second
// candidate toggle exists (menu.ts's PATCH /menu/items/:menuItemId/availability,
// gated on 'menu.86.toggle') but that one flips per-item *stock* (86'ing an
// item kitchen-side) rather than per-channel *online visibility*, so it was
// left unwired -- it's a different concept from "Online Item On/Off Logs"
// in the reference screenshots. Every other log_type listed in migration
// 0053's header comment (ONLINE_STORE, AUTO_ACCEPT_CHANGE, etc.) has no
// caller writing to it yet; GET here will just return an empty array for
// those until something does.
managementRouter.get("/management/logs", requireAuth, requirePermission("settings.read"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
    if (!type) {
      return res.status(400).json({ error: "type is required" });
    }
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LOG_LIMIT) : DEFAULT_LOG_LIMIT;

    const rows = await prisma.$queryRaw<LogRow[]>`
      SELECT id, outlet_id, log_type, actor_id, message, meta, created_at
      FROM management_activity_logs
      WHERE outlet_id = ${outletId} AND log_type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    res.status(200).json(rows.map(serializeLog));
  } catch (error: any) {
    console.error("Error in GET /management/logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /management/biller-app?role=<role name>
//
// Backs the User Management > Biller App screen (5 tabs: Biller App,
// Captain App, Delivery Boy App, Waiter App, Order Acceptance App).
// Grepped db/migrations, db/seeds/seed_permissions.sql and
// kapmeta/schema.prisma's Role model for BILLER/CAPTAIN/DELIVERY_BOY/
// WAITER/ORDER_ACCEPTANCE role codes -- none exist. The real `roles` table
// (kapmeta/schema.prisma `Role`) only stores free-text `name` seeded by
// whoever creates roles for an outlet (migration 0002's comment: "Free-text
// role label for now, e.g. owner, manager, cashier, waiter"). Per the task
// spec, this does NOT invent BILLER/CAPTAIN/etc role codes: it returns the
// real user list for the caller's outlet (same query shape as
// user-management.ts's GET /users) including each user's actual assigned
// role name(s), and applies `role` as a case-insensitive substring filter
// against those real role names when provided. With no `role` query param,
// or one that matches no real role name, it returns the full outlet user
// list so a frontend can filter client-side against whatever role strings
// genuinely exist for this outlet's data.
managementRouter.get("/management/biller-app", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const roleFilter = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "";

    const users = await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            OR: [{ outletId }, { outletId: null }],
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        userRoles: {
          include: {
            role: true,
            outlet: true,
          },
        },
      },
    });

    // userCode (migration 0054) isn't on the checked-in generated Prisma
    // client (no network path to run `prisma generate` in this sandbox --
    // same situation as management_lists/_settings/_activity_logs below),
    // so it's fetched with a raw query and merged in rather than via the
    // `prisma.user` delegate.
    const userIds = users.map((u) => u.id);
    const codeRows = userIds.length
      ? await prisma.$queryRaw<{ id: string; user_code: string | null }[]>`
          SELECT id, user_code FROM users WHERE id = ANY(${userIds})
        `
      : [];
    const codeByUserId = new Map(codeRows.map((r) => [r.id, r.user_code]));

    const serialized = users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      isActive: user.isActive,
      userCode: codeByUserId.get(user.id) ?? null,
      userRoles: user.userRoles.map((ur) => ({
        roleId: ur.roleId,
        roleName: ur.role.name,
        outletId: ur.outletId,
        outletName: ur.outlet?.name ?? null,
      })),
    }));

    const filtered = roleFilter
      ? serialized.filter((u) => u.userRoles.some((ur) => ur.roleName.toLowerCase().includes(roleFilter)))
      : serialized;

    res.status(200).json(filtered);
  } catch (err: any) {
    console.error("Error in GET /management/biller-app:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generates a short random user_code, e.g. "K3F7QZ". Used at create time
// and by the "Sync Code" action below. Regenerated on collision (the
// partial-unique index from migration 0054 enforces uniqueness at the DB
// level; the loop just avoids a 500 on the rare collision instead of
// relying on that alone).
function generateUserCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

async function setUniqueUserCode(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateUserCode();
    try {
      await prisma.$executeRaw`UPDATE users SET user_code = ${code} WHERE id = ${userId}`;
      return code;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("could not generate a unique user code");
}

// Confirms `userId` is a real user genuinely tied to the caller's outlet
// (same outlet-scoping the GET list applies), returning the row or null.
// Shared by PUT and the sync-code route below so neither can act on a
// user from a different outlet just because they know its id.
async function findOutletScopedUser(userId: string, outletId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      userRoles: { some: { OR: [{ outletId }, { outletId: null }] } },
    },
    include: { userRoles: { include: { role: true, outlet: true } } },
  });
}

function serializeBillerUser(user: Awaited<ReturnType<typeof findOutletScopedUser>>, userCode: string | null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
    userCode,
    userRoles: user.userRoles.map((ur) => ({
      roleId: ur.roleId,
      roleName: ur.role.name,
      outletId: ur.outletId,
      outletName: ur.outlet?.name ?? null,
    })),
  };
}

// POST /management/biller-app -- create a real user for one of the Biller
// App tabs (Biller/Captain/Delivery Boy/Waiter/Order Acceptance App), via
// the exact same create-user mechanism as POST /users in
// user-management.ts (bcrypt password hashing, optional PIN hashing,
// UserRole assignment) rather than a parallel/fake path. `role` is a
// free-text role name (repo convention -- see the GET handler's comment
// above and migration 0002): if no Role row with that exact name exists
// yet, one is created, matching how roles work everywhere else in this
// schema.
managementRouter.post("/management/biller-app", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { role, name, username, password, userCode: requestedUserCode } = req.body ?? {};

    if (!role || typeof role !== "string" || !role.trim()) {
      res.status(400).json({ error: "role is required" });
      return;
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!username || typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "username is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "password is required (min 4 chars)" });
      return;
    }

    // user-management.ts's POST /users keys accounts by `email` (there is
    // no separate username column on `users` -- see migration 0054's
    // comment). The Biller App form's "User Name" field is stored here as
    // that same login-identifier field.
    const existing = await prisma.user.findUnique({ where: { email: username.trim() } });
    if (existing) {
      res.status(400).json({ error: "username already in use" });
      return;
    }

    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName;

    const roleName = role.trim();
    const existingRole = await prisma.role.findFirst({ where: { name: roleName } });
    const roleRow = existingRole ?? (await prisma.role.create({ data: { name: roleName, createdBy: req.auth!.userId } }));

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: username.trim(),
          passwordHash,
          firstName,
          lastName,
          isActive: true,
          createdBy: req.auth!.userId,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: roleRow.id,
          outletId: outletId ?? null,
        },
      });

      return user;
    });

    // user_code isn't on the generated client (see comment above the GET
    // handler) -- set via raw SQL right after create. Honors a
    // caller-supplied code if given (still enforced unique by the DB
    // index), otherwise generates one.
    let userCode: string;
    if (typeof requestedUserCode === "string" && requestedUserCode.trim()) {
      userCode = requestedUserCode.trim();
      await prisma.$executeRaw`UPDATE users SET user_code = ${userCode} WHERE id = ${newUser.id}`;
    } else {
      userCode = await setUniqueUserCode(newUser.id);
    }

    const full = await findOutletScopedUser(newUser.id, outletId);
    res.status(201).json(serializeBillerUser(full, userCode));
  } catch (err: any) {
    console.error("Error in POST /management/biller-app:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /management/biller-app/:userId -- edit an existing biller-app user.
// Outlet-scoped: a user not tied to the caller's outlet (via UserRole,
// same rule the GET list and POST above use) 404s rather than leaking
// cross-outlet edit access.
managementRouter.put("/management/biller-app/:userId", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { userId } = req.params;
    const { name, username, isActive } = req.body ?? {};

    const existing = await findOutletScopedUser(userId, outletId);
    if (!existing) {
      res.status(404).json({ error: "user not found" });
      return;
    }

    const updateData: any = { updatedBy: req.auth!.userId };

    if (typeof username === "string" && username.trim()) {
      const dupe = await prisma.user.findFirst({ where: { email: username.trim(), NOT: { id: userId } } });
      if (dupe) {
        res.status(400).json({ error: "username already in use" });
        return;
      }
      updateData.email = username.trim();
    }
    if (typeof name === "string" && name.trim()) {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      updateData.firstName = firstName;
      updateData.lastName = rest.join(" ") || firstName;
    }
    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    await prisma.user.update({ where: { id: userId }, data: updateData });

    const codeRows = await prisma.$queryRaw<{ user_code: string | null }[]>`SELECT user_code FROM users WHERE id = ${userId}`;
    const full = await findOutletScopedUser(userId, outletId);
    res.status(200).json(serializeBillerUser(full, codeRows[0]?.user_code ?? null));
  } catch (err: any) {
    console.error("Error in PUT /management/biller-app/:userId:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /management/biller-app/:userId/sync-code -- regenerates the user's
// user_code (migration 0054) and writes it for real. Honest caveat: there
// is no actual POS-device/app "sync" mechanism anywhere in this repo (no
// device registry, no push channel to a biller/captain/waiter terminal),
// so this does not send anything to a device -- it only regenerates the
// code server-side, which the UI can then show/copy for someone to key in
// on the device by hand. That is the real behavior "Sync Code" gets here,
// not a stubbed no-op.
managementRouter.post("/management/biller-app/:userId/sync-code", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  try {
    const outletId = req.auth!.outletId;
    const { userId } = req.params;

    const existing = await findOutletScopedUser(userId, outletId);
    if (!existing) {
      res.status(404).json({ error: "user not found" });
      return;
    }

    const userCode = await setUniqueUserCode(userId);
    res.status(200).json(serializeBillerUser(existing, userCode));
  } catch (err: any) {
    console.error("Error in POST /management/biller-app/:userId/sync-code:", err);
    res.status(500).json({ error: err.message });
  }
});
